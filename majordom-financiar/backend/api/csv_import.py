"""
CSV import endpoints.

POST /api/import/csv         — parse CSV, flag duplicates, return preview
POST /api/import/csv/confirm — save confirmed rows to Actual Budget

Two-step design (same reason as receipts):
  1. Preview lets the user see what will be imported and fix categories.
  2. Confirm does the actual write — no silent auto-imports.

Profile detection order:
  SQLite (instant, by header signature MD5) → LLM fallback (unknown formats).
  Once LLM detects a format it is saved to SQLite for future imports.

Deduplication:
  SHA256(date+merchant+amount)[:16] — same hash as add_transaction and
  add_transactions_batch, so duplicates are caught regardless of which
  transport (bot / web / CSV) originally imported the transaction.

Categories:
  Actual Budget is the single source of truth.  The preview fetches the real AB
  category list and fuzzy-maps SmartCategorizer predictions onto it.  No
  category names are hardcoded here — the frontend receives the AB list and
  shows it directly in the dropdown.  Confirm only assigns existing categories;
  it never creates new ones.
"""
import asyncio
import hashlib
import json
import logging
from datetime import datetime as dt

import aiohttp
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core.actual_client import ActualBudgetClient
from backend.core.config import settings
from backend.core.csv_importer import CsvNormalizer, CsvProfileDetector
from backend.core.memory import MemoryDB, SmartCategorizer

logger = logging.getLogger(__name__)
router = APIRouter()


def _financial_id(date_str: str, merchant: str, amount: float) -> str:
    """
    SHA256(date+merchant+amount)[:16] — cross-transport deduplication key.
    Identical algorithm to ActualBudgetClient.add_transaction and
    add_transactions_batch, ensuring a transaction imported via CSV is never
    re-imported via receipt scan or /add command.
    """
    sig = f"{date_str}{merchant}{amount:.4f}"
    return hashlib.sha256(sig.encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ImportRowPreview(BaseModel):
    id: str           # financial_id hash — stable row key for the frontend
    date: str         # YYYY-MM-DD
    merchant: str
    amount: float     # always positive; is_expense determines sign in Actual Budget
    is_expense: bool
    currency: str
    category_name: str       # actual AB category name, or "" if unknown
    category_confirmed: bool  # True = from confirmed merchant history
    duplicate: bool
    is_transfer_candidate: bool = False
    possible_duplicate: bool = False  # same date+merchant already in AB, different amount — needs verification
    existing_amount: float | None = None  # the amount already in AB, if possible_duplicate


class ImportPreview(BaseModel):
    source_name: str
    rows: list[ImportRowPreview]
    total_rows: int       # raw CSV rows (includes income-only rows skipped by normalizer)
    accounts: list[dict]  # [{id, name}] — for the account selector in the UI
    ab_categories: list[str]  # all AB category names for the frontend dropdown


class ImportRowConfirm(BaseModel):
    date: str
    merchant: str
    amount: float
    is_expense: bool
    category_name: str  # actual AB category name, or "" = leave uncategorized
    category_confirmed: bool = False  # True = from history; False = LLM suggestion
    duplicate: bool
    is_transfer_candidate: bool = False
    transfer_to_account_id: str = ""  # non-empty → create AB transfer to this account
    notes: str = ""


class ImportConfirmRequest(BaseModel):
    account_id: str
    rows: list[ImportRowConfirm]


class UnknownIncomeRow(BaseModel):
    payee: str
    amount: float   # always positive
    date: str       # "YYYY-MM-DD"


class ImportResult(BaseModel):
    imported: int
    skipped: int
    merged: int = 0
    retroactively_updated: int = 0
    unknown_income_rows: list[UnknownIncomeRow] = []
    account_balance: float | None = None
    account_name: str | None = None

# ---------------------------------------------------------------------------
# Sync helpers — run in thread executor via ActualBudgetClient._run()
# ---------------------------------------------------------------------------

def _fetch_preview_data(
    actual_client: ActualBudgetClient,
) -> tuple[set[str], list[str], dict[tuple[str, str], list[float]]]:
    """
    Single AB session that returns:
      - set of financial_ids already in AB (for exact duplicate detection)
      - list of non-hidden AB category names (for the frontend dropdown)
      - (date, payee name lower) -> list of existing amounts, for near-duplicate
        detection (same date+merchant already in AB, but a different amount —
        e.g. a transaction imported once with a wrong amount, later corrected
        in the CSV source; catches it instead of silently creating a second one)
    """
    from actual.queries import get_categories, get_transactions
    with actual_client._get_actual() as actual:
        actual.download_budget()
        existing_ids = {
            tx.financial_id
            for tx in get_transactions(actual.session)
            if tx.financial_id and not tx.tombstone
        }
        ab_categories = [
            c.name for c in get_categories(actual.session)
            if c.name and not c.hidden and not c.tombstone
        ]
        near_dup_index: dict[tuple[str, str], list[float]] = {}
        for tx in get_transactions(actual.session):
            if tx.tombstone or not tx.payee or not tx.payee.name:
                continue
            key = (tx.get_date().isoformat(), tx.payee.name.strip().lower())
            near_dup_index.setdefault(key, []).append(abs(float(tx.amount or 0)) / 100)
        return existing_ids, ab_categories, near_dup_index


def _map_to_ab_category(cat_id: str, ab_categories: list[str]) -> str | None:
    """
    Map a SmartCategorizer internal ID (e.g. "restaurants") to the best-matching
    real AB category name (e.g. "Restaurants").

    Strategy:
      1. Check if cat_id is already a valid AB category name (stored by a
         previous confirm — new format stores AB names directly in SQLite).
      2. Prefix match: "home" → "Home & Maintenance".
      3. Fuzzy match (cutoff 0.5) for the rest.

    Returns None if no reasonable match is found — the row stays uncategorized
    and the user must pick manually.
    """
    from difflib import get_close_matches

    # 1. Already an AB category name (from history stored by new confirm)
    if cat_id in ab_categories:
        return cat_id

    cat_id_lower = cat_id.lower()
    name_lower_map = {n.lower(): n for n in ab_categories}

    # 2. Prefix match
    for lower, original in name_lower_map.items():
        if lower.startswith(cat_id_lower):
            return original

    # 3. Fuzzy
    matches = get_close_matches(cat_id_lower, list(name_lower_map.keys()), n=1, cutoff=0.5)
    return name_lower_map[matches[0]] if matches else None


def _do_import(
    actual_client: ActualBudgetClient,
    account_id: str,
    rows: list[ImportRowConfirm],
) -> tuple[int, int, int, int]:
    """
    Write confirmed rows to Actual Budget in a single session.

    Categories are resolved by name against the existing AB category list.
    No new categories are ever created — if a name is not found the transaction
    is imported without a category.

    Merge logic: if a duplicate already exists in AB without a category, and
    the CSV row has a confirmed category, assign the category instead of skipping.

    Retroactive categorization: after import, any existing uncategorized transaction
    whose payee name matches a confirmed merchant in this import gets the same category.

    Returns (imported, skipped, merged, retroactively_updated).
    """
    from actual.database import Transactions
    from actual.queries import (
        create_transaction,
        get_categories,
        get_or_create_payee,
        get_transactions,
    )

    with actual_client._get_actual() as actual:
        actual.download_budget()

        # Build dedup map: financial_id → transaction (for merge checks)
        existing_tx_map = {
            tx.financial_id: tx
            for tx in get_transactions(actual.session)
            if tx.financial_id and not tx.tombstone
        }
        existing_ids = set(existing_tx_map.keys())

        # Category lookup by name — never create new categories
        all_cats = {
            c.name: c
            for c in get_categories(actual.session)
            if not c.tombstone
        }

        imported = 0
        skipped = 0
        merged = 0

        for row in rows:
            try:
                tx_date = dt.strptime(row.date, "%Y-%m-%d").date()
            except ValueError:
                tx_date = dt.now().date()

            fid = _financial_id(tx_date.isoformat(), row.merchant, row.amount)

            if row.duplicate or fid in existing_ids:
                existing = existing_tx_map.get(fid)
                if existing and not existing.category_id and row.category_name:
                    cat_obj = all_cats.get(row.category_name)
                    if cat_obj:
                        existing.category = cat_obj
                        merged += 1
                    else:
                        skipped += 1
                else:
                    skipped += 1
                continue

            # User-confirmed transfer → create proper AB transfer (two linked transactions).
            # For expense rows: money leaves account_id → transfer_to_account_id.
            # For income rows: money arrives from transfer_to_account_id → account_id.
            if row.transfer_to_account_id:
                from actual.queries import create_transfer as ab_create_transfer
                from decimal import Decimal
                tx_notes = f"[import CSV] {row.notes}".strip() if row.notes else "[import CSV]"
                src = account_id if row.is_expense else row.transfer_to_account_id
                dst = row.transfer_to_account_id if row.is_expense else account_id
                src_tx, dst_tx = ab_create_transfer(
                    actual.session,
                    date=tx_date,
                    source_account=src,
                    dest_account=dst,
                    amount=Decimal(str(row.amount)),
                    notes=tx_notes,
                )
                # create_transfer() takes no imported_id/cleared params — set them
                # directly on both legs so dedup (existing_tx_map) and reconciliation
                # see this transfer on future imports. See issue #102.
                src_tx.financial_id = fid
                src_tx.cleared = True
                dst_tx.financial_id = _financial_id(tx_date.isoformat(), row.merchant, -row.amount)
                dst_tx.cleared = True
                existing_ids.add(fid)
                imported += 1
                continue

            # Skip auto-detected transfer candidates that have no user-confirmed destination
            if row.is_transfer_candidate:
                skipped += 1
                continue

            payee = get_or_create_payee(actual.session, row.merchant)
            cat_obj = all_cats.get(row.category_name) if row.category_name else None

            actual_amount = -abs(row.amount) if row.is_expense else abs(row.amount)
            tx_notes = f"[import CSV] {row.notes}".strip() if row.notes else "[import CSV]"
            create_transaction(
                actual.session,
                date=tx_date,
                account=account_id,
                payee=payee,
                notes=tx_notes,
                amount=actual_amount,
                category=cat_obj,
                imported_id=fid,
                cleared=True,
            )
            existing_ids.add(fid)
            imported += 1

        # --- Retroactive categorization ---
        # For each confirmed merchant→category in this import, find all existing
        # uncategorized transactions with the same payee and assign the category.
        merchant_category_map: dict[str, str] = {
            row.merchant.lower(): row.category_name
            for row in rows
            if not row.duplicate and not row.is_transfer_candidate and row.category_name
        }

        retroactively_updated = 0
        if merchant_category_map:
            uncategorized = actual.session.query(Transactions).filter(
                Transactions.tombstone == 0,
                Transactions.category_id == None,
            ).all()
            for tx in uncategorized:
                if not tx.payee or not tx.payee.name:
                    continue
                cat_name = merchant_category_map.get(tx.payee.name.lower())
                if cat_name:
                    cat_obj = all_cats.get(cat_name)
                    if cat_obj:
                        tx.category_id = cat_obj.id
                        retroactively_updated += 1

        if imported > 0 or merged > 0 or retroactively_updated > 0:
            actual.commit()
            logger.info(
                "CSV import committed: %d rows, %d merged, %d retroactively categorized",
                imported, merged, retroactively_updated,
            )

    return imported, skipped, merged, retroactively_updated


# ---------------------------------------------------------------------------
# LLM category suggestion helper
# ---------------------------------------------------------------------------

async def _suggest_categories_llm(
    merchants: list[str],
    ab_categories: list[str],
    llm_url: str,
    model: str,
    api_key: str = "",
) -> dict[str, str]:
    """
    One batch LLM call: list of merchant names → {merchant: AB category name}.

    Returns only entries where the suggested category exists in ab_categories.
    Returns empty dict on any error — caller falls back to no suggestion.
    """
    if not merchants or not ab_categories:
        return {}

    # Deduplicate — send each unique merchant only once
    unique_merchants = sorted(set(merchants))

    prompt = (
        "You are a personal finance assistant. Assign each merchant to the most appropriate "
        "budget category from the list below. Return ONLY a JSON object: "
        '{"merchant": "category"}. Use null if no category fits. Do not explain.\n\n'
        f"Categories: {', '.join(ab_categories)}\n\n"
        "Merchants:\n" + "\n".join(f"- {m}" for m in unique_merchants)
    )

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {"temperature": 0.0, "num_predict": 400},
    }

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        timeout = aiohttp.ClientTimeout(total=180)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(f"{llm_url}/v1/chat/completions", json=payload, headers=headers) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    logger.warning("LLM category suggestion returned %d: %s", resp.status, text[:200])
                    return {}
                data = await resp.json()

        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        if not content:
            logger.warning("LLM category suggestion returned empty content")
            return {}

        suggestions = json.loads(content)

        # Ensure suggestions is a dict
        if not isinstance(suggestions, dict):
            logger.warning("LLM category suggestion did not return a dict: %r", type(suggestions))
            return {}

        # Filter: keep only entries where value is a known category.
        # Exclude "Other" — it's a fallback, not a real suggestion. If the LLM
        # doesn't know, the row stays blank and the user must decide.
        ab_set = set(ab_categories)
        filtered = {}
        for merchant_name, cat in suggestions.items():
            if isinstance(cat, str) and cat in ab_set and cat != "Other":
                filtered[merchant_name] = cat

        if filtered:
            logger.info("LLM suggested categories for %d/%d merchants", len(filtered), len(unique_merchants))

        return filtered

    except json.JSONDecodeError as e:
        logger.warning("LLM category suggestion JSON parse error: %s", e)
        return {}
    except aiohttp.ClientError as e:
        logger.warning("LLM category suggestion HTTP error: %s", e)
        return {}
    except asyncio.TimeoutError:
        logger.warning("LLM category suggestion timed out")
        return {}
    except Exception as e:
        logger.warning("LLM category suggestion unexpected error: %s", e, exc_info=True)
        return {}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/import/csv", response_model=ImportPreview)
async def preview_csv(
    file: UploadFile = File(...),
    current_user: str = Depends(get_current_user),
):
    """
    Upload a CSV bank export and get a preview with duplicate detection.

    Profile detection:
      - Known format (by header signature): instant, no LLM call needed.
      - Unknown format: sent to LLM for analysis, saved for future imports.
    """
    filename = file.filename or ""
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are supported")

    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="CSV file too large (max 5 MB)")

    normalizer = CsvNormalizer()
    try:
        enc = normalizer.detect_encoding(raw)
        text_content = raw.decode(enc)
        auto_delimiter = normalizer.detect_delimiter(text_content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot parse CSV: {e}")

    db = MemoryDB(db_path=settings.memory.db_path)
    detector = CsvProfileDetector(
        settings.ollama.base_url,
        settings.ollama.model,
        api_key=settings.ollama.api_key,
    )

    # Try multiple delimiters — auto-detected first, then common alternatives.
    # This handles cases where the delimiter detector picks the wrong one
    # (e.g. semicolon CSVs with European amounts like "26,00" that have more
    # commas than semicolons in the first few lines).
    headers, rows, delimiter, profile = None, None, auto_delimiter, None
    for try_delim in dict.fromkeys([auto_delimiter, ";", ",", "\t"]):
        try:
            h, r = normalizer.parse_csv(raw, delimiter=try_delim, encoding=enc)
        except Exception:
            continue
        if headers is None:
            headers, rows = h, r  # keep first parse as fallback
        sig = detector.header_signature(h)
        p = db.get_csv_profile_by_sig(sig)
        if p:
            headers, rows, delimiter, profile = h, r, try_delim, p
            logger.info("CSV profile matched: %s (delimiter=%r)", p.source_name, try_delim)
            break

    if not rows:
        raise HTTPException(status_code=400, detail="CSV is empty or has no data rows")

    if profile is None:
        # LLM call — may take 30-60s on first import of a new bank format
        profile = await detector.detect_with_llm(headers, rows[:3], delimiter)
        if profile is None:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Could not identify the CSV format. "
                    "Try a fresh export from your bank app."
                ),
            )
        # Don't overwrite confirmed built-in profiles with LLM guesses.
        # If a confirmed profile already exists for this bank (different header
        # variant), LLM's detection is used for this import but not saved —
        # this prevents bad LLM mappings from polluting the profile store.
        confirmed_banks = {p.source_name for p in db.get_all_csv_profiles() if p.confirmed}
        if profile.source_name not in confirmed_banks:
            db.save_csv_profile(profile)
            logger.info("New CSV profile saved: %s", profile.source_name)
        else:
            logger.warning(
                "LLM detected %s but a confirmed profile already exists — "
                "using LLM result for this import without saving",
                profile.source_name,
            )

    # normalize() keeps only expenses + refunds, drops pure income rows
    transactions = normalizer.normalize(rows, profile)

    actual = ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )

    # One AB session: existing IDs + real category list + near-duplicate index
    existing_ids, ab_categories, near_dup_index = await actual._run(lambda: _fetch_preview_data(actual))
    accounts = await actual.get_accounts()

    categorizer = SmartCategorizer(db=db)

    preview_rows: list[ImportRowPreview] = []
    for tx in transactions:
        fid = _financial_id(tx.date.isoformat(), tx.merchant, tx.amount)
        duplicate = fid in existing_ids

        # Near-duplicate check: same date+merchant already in AB, but the exact
        # hash doesn't match — likely the same real-world transaction. Flag
        # regardless of whether the existing amount matches: financial_id is
        # fixed at creation time and never recomputed, so a transaction that
        # was originally imported with a wrong amount and later hand-corrected
        # in Actual Budget keeps its old (mismatching) financial_id even
        # though the displayed amount now equals the CSV's. Relying on "amount
        # differs" alone would miss exactly that case.
        possible_duplicate = False
        existing_amount: float | None = None
        if not duplicate:
            near_dup_key = (tx.date.isoformat(), tx.merchant.strip().lower())
            candidates = near_dup_index.get(near_dup_key, [])
            if candidates:
                possible_duplicate = True
                existing_amount = candidates[0]

        # For refunds, strip common prefixes so "Refund: Vpn*..." matches "Vpn*..." in history
        lookup_merchant = tx.merchant
        if not tx.is_expense:
            for prefix in ("Refund: ", "Refund ", "REFUND: ", "REFUND "):
                if lookup_merchant.startswith(prefix):
                    lookup_merchant = lookup_merchant[len(prefix):]
                    break

        pred = categorizer.predict(merchant=lookup_merchant)

        # Map internal prediction to a real AB category name.
        # Exclude "Other" — if SmartCategorizer only knows "Other" for this merchant,
        # treat it as unknown so the user is forced to categorize manually.
        ab_name = ""
        if pred.category_id and pred.category_id != "other":
            mapped = _map_to_ab_category(pred.category_id, ab_categories) or ""
            ab_name = mapped if mapped != "Other" else ""

        preview_rows.append(ImportRowPreview(
            id=fid,
            date=tx.date.isoformat(),
            merchant=tx.merchant,
            amount=tx.amount,
            is_expense=tx.is_expense,
            currency=tx.currency,
            category_name=ab_name,
            # "Other" is a fallback, not a real categorization — never treat as confirmed.
            # Amounts above €50 always require re-verification regardless of history.
            category_confirmed=(
                bool(ab_name)
                and pred.from_history
                and ab_name != "Other"
                and tx.amount <= 50
            ),
            duplicate=duplicate,
            is_transfer_candidate=tx.is_transfer_candidate,
            possible_duplicate=possible_duplicate,
            existing_amount=existing_amount,
        ))

    # LLM category suggestions for rows with no confirmed category
    uncategorized_merchants = list({
        r.merchant
        for r in preview_rows
        if not r.category_name and not r.duplicate and not r.is_transfer_candidate
    })
    if uncategorized_merchants:
        llm_suggestions = await _suggest_categories_llm(
            merchants=uncategorized_merchants,
            ab_categories=ab_categories,
            llm_url=settings.ollama.base_url,
            model=settings.ollama.categorize_model,
            api_key=settings.ollama.api_key,
        )
        if llm_suggestions:
            # Apply suggestions — create new objects (Pydantic models are immutable)
            updated = []
            for r in preview_rows:
                suggested = llm_suggestions.get(r.merchant)
                if suggested and suggested.startswith("__transfer__:"):
                    r = r.model_copy(update={"is_transfer_candidate": True, "category_name": ""})
                elif suggested and not r.category_name and not r.duplicate:
                    r = r.model_copy(update={"category_name": suggested, "category_confirmed": False})
                updated.append(r)
            preview_rows = updated

    dup_count = sum(1 for r in preview_rows if r.duplicate)
    logger.info(
        "CSV preview [%s, %s]: %d rows, %d duplicates",
        current_user, profile.source_name, len(preview_rows), dup_count,
    )

    return ImportPreview(
        source_name=profile.source_name,
        rows=preview_rows,
        total_rows=len(rows),
        accounts=[{"id": acc.id, "name": acc.name} for acc in accounts],
        ab_categories=ab_categories,
    )


@router.post("/import/csv/confirm", response_model=ImportResult)
async def confirm_csv(
    body: ImportConfirmRequest,
    current_user: str = Depends(get_current_user),
):
    """
    Save confirmed CSV rows to Actual Budget.
    Rows flagged as duplicate in the preview are skipped.
    Deduplication is re-checked server-side as a safety net.
    """
    actual = ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )

    imported, skipped, merged, retroactively_updated = await actual._run(
        lambda: _do_import(actual, body.account_id, body.rows)
    )

    # Fetch current balance for the reconciliation message
    accounts_after = await actual.get_accounts()
    matched_account = next((a for a in accounts_after if a.id == body.account_id), None)

    # Teach SmartCategorizer from confirmed categories so future imports remember
    # merchant → AB category name mappings without any LLM call.
    db = MemoryDB(db_path=settings.memory.db_path)
    categorizer = SmartCategorizer(db=db)
    for row in body.rows:
        if not row.duplicate and row.category_name and row.category_name != "Other":
            categorizer.learn(row.merchant.lower(), row.category_name)

    # Collect unknown income rows — income rows (is_expense=False) that have no
    # category_name set. These will be shown to the user as IncomeSourceCard cards
    # so they can name the income source and have Majordom auto-categorize it.
    seen_payees: set[str] = set()
    unknown_income_rows: list[UnknownIncomeRow] = []
    for row in body.rows:
        if not row.is_expense and not row.duplicate and not row.category_name and not row.transfer_to_account_id:
            if row.merchant not in seen_payees:
                seen_payees.add(row.merchant)
                unknown_income_rows.append(UnknownIncomeRow(
                    payee=row.merchant,
                    amount=row.amount,
                    date=row.date,
                ))

    if imported > 0:
        db.log_notification("csv_import", {
            "imported": imported,
            "account": matched_account.name if matched_account else "",
        })

    # Track low-confidence categorizations (LLM-suggested, not from history)
    # for the pending_review nudge (M2.3).
    low_confidence = [
        _financial_id(row.date, row.merchant, row.amount)
        for row in body.rows
        if row.category_name
        and not row.category_confirmed
        and not row.duplicate
        and not row.transfer_to_account_id
        and not row.is_transfer_candidate
    ]
    if low_confidence:
        db.add_pending_reviews(low_confidence)

    logger.info(
        "CSV confirmed [%s]: %d imported, %d skipped, %d merged, %d retroactively updated, %d unknown income rows",
        current_user, imported, skipped, merged, retroactively_updated, len(unknown_income_rows),
    )
    return ImportResult(
        imported=imported,
        skipped=skipped,
        merged=merged,
        retroactively_updated=retroactively_updated,
        unknown_income_rows=unknown_income_rows,
        account_balance=matched_account.balance if matched_account else None,
        account_name=matched_account.name if matched_account else None,
    )
