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
  SHA256(date+merchant+amount)[:16] — same hash as add_transaction,
  so duplicates are caught regardless of which transport (bot / web / CSV)
  originally imported the transaction.

Categories:
  Actual Budget is the single source of truth.  The preview fetches the real AB
  category list and fuzzy-maps SmartCategorizer predictions onto it.  No
  category names are hardcoded here — the frontend receives the AB list and
  shows it directly in the dropdown.  Confirm only assigns existing categories;
  it never creates new ones.
"""
import asyncio
import json
import logging

import aiohttp
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core.actual_client import _financial_id
from backend.core.config import settings, build_llm_headers
from backend.core.csv_importer import CsvNormalizer, CsvProfileDetector
from backend.core.finance.provider import get_provider
from backend.core.memory import MemoryDB, SmartCategorizer

logger = logging.getLogger(__name__)
router = APIRouter()


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
    category_confirmed: bool  # True = matched an existing Actual Budget rule
    duplicate: bool
    is_transfer_candidate: bool = False
    transfer_to_account_id: str | None = None  # set when an existing AB rule already resolves this to a known transfer target (#99)
    possible_duplicate: bool = False  # same date+merchant already in AB, different amount — needs verification
    existing_amount: float | None = None  # the amount already in AB, if possible_duplicate


class ImportPreview(BaseModel):
    source_name: str
    rows: list[ImportRowPreview]
    total_rows: int       # raw CSV rows (includes income-only rows skipped by normalizer)
    accounts: list[dict]  # [{id, name}] — for the account selector in the UI
    ab_categories: list[str]  # all AB category names for the frontend dropdown
    category_groups: list[str]  # all AB category group names, for "create new category"


class ImportRowConfirm(BaseModel):
    date: str
    merchant: str
    amount: float
    is_expense: bool
    category_name: str  # actual AB category name, or "" = leave uncategorized
    category_confirmed: bool = False  # True = matched an existing AB rule; False = keyword/LLM guess
    duplicate: bool
    is_transfer_candidate: bool = False
    transfer_to_account_id: str = ""  # non-empty → create AB transfer to this account
    notes: str = ""
    create_rule: bool = False  # user checked "save as rule" for this row (#99)
    new_category_group: str | None = None  # set → category_name is new, create it in this group first (#99)


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

# ---------------------------------------------------------------------------
# Category mapping helper
# ---------------------------------------------------------------------------

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

    headers = build_llm_headers(api_key)

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
        logger.error("Failed to parse CSV %s: %s", filename, e)
        raise HTTPException(status_code=400, detail="Could not parse CSV file — check the encoding and delimiter")

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

    provider = get_provider()

    # One AB session: existing IDs + real category list + near-duplicate index
    existing_ids, ab_categories, near_dup_index, category_groups = await provider.get_csv_import_context()
    accounts = await provider.get_accounts()

    categorizer = SmartCategorizer(db=db)

    # For refunds, strip common prefixes so "Refund: Vpn*..." matches "Vpn*..." in history
    def _lookup_merchant(tx) -> str:
        m = tx.merchant
        if not tx.is_expense:
            for prefix in ("Refund: ", "Refund ", "REFUND: ", "REFUND "):
                if m.startswith(prefix):
                    return m[len(prefix):]
        return m

    # Check Actual Budget's existing rules once for the whole import — a single
    # fetch of the ruleset regardless of row count, not a per-row query (#99).
    rule_matches = await provider.match_existing_rules([
        {"payee": _lookup_merchant(tx), "notes": tx.description}
        for tx in transactions
    ])

    preview_rows: list[ImportRowPreview] = []
    for tx, rule_match in zip(transactions, rule_matches):
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

        lookup_merchant = _lookup_merchant(tx)

        ab_name = ""
        category_confirmed = False
        is_transfer = tx.is_transfer_candidate
        known_transfer_account_id = None

        if rule_match and rule_match.get("is_transfer"):
            # An existing AB rule already treats this payee as a transfer —
            # and already tells us exactly which account, so the row doesn't
            # need to ask the user again (#99).
            is_transfer = True
            known_transfer_account_id = rule_match.get("account_id")
        elif rule_match and rule_match.get("category_name"):
            # An existing AB rule already matched — highest-confidence source,
            # takes priority over the local keyword categorizer.
            ab_name = rule_match["category_name"]
            # Amounts above €50 always require re-verification regardless of the match.
            category_confirmed = tx.amount <= 50
        else:
            pred = categorizer.predict(merchant=lookup_merchant, ocr_text=tx.description)
            # Map internal prediction to a real AB category name.
            # Exclude "Other" — if SmartCategorizer only knows "Other" for this
            # merchant, treat it as unknown so the user categorizes manually.
            if pred.category_id and pred.category_id != "other":
                mapped = _map_to_ab_category(pred.category_id, ab_categories) or ""
                ab_name = mapped if mapped != "Other" else ""
            # Keyword-only guess — never auto-confirmed, always needs a look.

        preview_rows.append(ImportRowPreview(
            id=fid,
            date=tx.date.isoformat(),
            merchant=tx.merchant,
            amount=tx.amount,
            is_expense=tx.is_expense,
            currency=tx.currency,
            category_name=ab_name,
            category_confirmed=category_confirmed,
            duplicate=duplicate,
            is_transfer_candidate=is_transfer,
            transfer_to_account_id=known_transfer_account_id,
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
        category_groups=category_groups,
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
    provider = get_provider()

    # Create any new categories the user picked "+ Create new category" for,
    # before execute_csv_import() runs — it only assigns *existing* categories by
    # name, never creates one (#99).
    new_categories = {
        (row.category_name, row.new_category_group)
        for row in body.rows
        if row.new_category_group and row.category_name and not row.duplicate
    }
    if new_categories:
        existing_names = {c.name.lower() for c in await provider.get_categories()}
        for name, group in new_categories:
            if name.lower() in existing_names:
                continue  # already exists — execute_csv_import()'s own name lookup will find it
            try:
                await provider.create_category(name=name, group_name=group)
            except Exception as e:
                logger.warning("Failed to create category '%s' in group '%s': %s", name, group, e)

    imported, skipped, merged, retroactively_updated = await provider.execute_csv_import(
        body.account_id, [row.model_dump() for row in body.rows]
    )

    # Fetch current balance for the reconciliation message
    accounts_after = await provider.get_accounts()
    matched_account = next((a for a in accounts_after if a.id == body.account_id), None)

    db = MemoryDB(db_path=settings.memory.db_path)

    # Create AB rules for rows where the user explicitly checked "save as
    # rule" — never automatic (#99). Replaces the old silent per-row
    # categorizer.learn() SQLite mapping.
    rule_rows = [r for r in body.rows if r.create_rule and not r.duplicate]
    if rule_rows:
        cats = await provider.get_categories()
        cats_by_name = {c.name.lower(): c for c in cats}
        # Check existing rules once for the whole batch — skip creating a rule
        # that's already covered by one (avoids exact duplicates when the user
        # checks "save as rule" more than once for the same merchant) (#99).
        existing_matches = await provider.match_existing_rules(
            [{"payee": row.merchant, "notes": row.notes} for row in rule_rows]
        )
        for row, existing in zip(rule_rows, existing_matches):
            # row.merchant is verbatim what the user left in the (editable)
            # Merchant field — no server-side "smart prefix" guess (#99).
            try:
                if row.transfer_to_account_id:
                    if existing and existing.get("is_transfer") and existing.get("account_id") == row.transfer_to_account_id:
                        continue
                    await provider.create_payee_transfer_rule(
                        payee_name_prefix=row.merchant,
                        target_account_id=row.transfer_to_account_id,
                    )
                elif row.category_name and row.category_name != "Other":
                    if existing and existing.get("category_name", "").lower() == row.category_name.lower():
                        continue
                    cat = cats_by_name.get(row.category_name.lower())
                    if cat:
                        await provider.create_payee_rule(
                            payee_name_prefix=row.merchant,
                            category_id=cat.id,
                        )
            except Exception as e:
                logger.warning("Failed to create AB rule for CSV row '%s': %s", row.merchant, e)

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
    )
