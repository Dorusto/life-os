"""
CSV import endpoints.

POST /api/import/csv         — parse CSV, flag duplicates, return preview
POST /api/import/csv/confirm — save confirmed rows to Actual Budget

Two-step design (same reason as receipts):
  1. Preview lets the user see what will be imported and fix categories.
  2. Confirm does the actual write — no silent auto-imports.

Profile detection order:
  SQLite (instant, by header signature MD5) → Ollama fallback (unknown formats).
  Once Ollama detects a format it is saved to SQLite for future imports.

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
import hashlib
import logging
from datetime import datetime as dt

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
    duplicate: bool
    notes: str = ""


class ImportConfirmRequest(BaseModel):
    account_id: str
    rows: list[ImportRowConfirm]


class ImportResult(BaseModel):
    imported: int
    skipped: int
    merged: int = 0


# ---------------------------------------------------------------------------
# Sync helpers — run in thread executor via ActualBudgetClient._run()
# ---------------------------------------------------------------------------

def _fetch_preview_data(actual_client: ActualBudgetClient) -> tuple[set[str], list[str]]:
    """
    Single AB session that returns:
      - set of financial_ids already in AB (for duplicate detection)
      - list of non-hidden AB category names (for the frontend dropdown)
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
        return existing_ids, ab_categories


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
) -> tuple[int, int, int]:
    """
    Write confirmed rows to Actual Budget in a single session.

    Categories are resolved by name against the existing AB category list.
    No new categories are ever created — if a name is not found the transaction
    is imported without a category.

    Merge logic: if a duplicate already exists in AB without a category, and
    the CSV row has a confirmed category, assign the category instead of skipping.

    Returns (imported, skipped, merged).
    """
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
            )
            existing_ids.add(fid)
            imported += 1

        if imported > 0 or merged > 0:
            actual.commit()
            logger.info("CSV import committed: %d rows, %d merged", imported, merged)

    return imported, skipped, merged


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
      - Known format (by header signature): instant, no Ollama call needed.
      - Unknown format: sent to Ollama for analysis, saved for future imports.
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
    detector = CsvProfileDetector(settings.ollama.url, settings.ollama.model)

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
        # Ollama call — may take 30-60s on first import of a new bank format
        profile = await detector.detect_with_ollama(headers, rows[:3], delimiter)
        if profile is None:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Could not identify the CSV format. "
                    "Try a fresh export from your bank app."
                ),
            )
        db.save_csv_profile(profile)
        logger.info("New CSV profile saved: %s", profile.source_name)

    # normalize() keeps only expenses + refunds, drops pure income rows
    transactions = normalizer.normalize(rows, profile)

    actual = ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )

    # One AB session: existing IDs + real category list
    existing_ids, ab_categories = await actual._run(lambda: _fetch_preview_data(actual))
    accounts = await actual.get_accounts()

    categorizer = SmartCategorizer(db=db)

    preview_rows: list[ImportRowPreview] = []
    for tx in transactions:
        fid = _financial_id(tx.date.isoformat(), tx.merchant, tx.amount)

        # For refunds, strip common prefixes so "Refund: Vpn*..." matches "Vpn*..." in history
        lookup_merchant = tx.merchant
        if not tx.is_expense:
            for prefix in ("Refund: ", "Refund ", "REFUND: ", "REFUND "):
                if lookup_merchant.startswith(prefix):
                    lookup_merchant = lookup_merchant[len(prefix):]
                    break

        pred = categorizer.predict(merchant=lookup_merchant)

        # Map internal prediction to a real AB category name
        ab_name = ""
        if pred.category_id and pred.category_id != "other":
            ab_name = _map_to_ab_category(pred.category_id, ab_categories) or ""

        preview_rows.append(ImportRowPreview(
            id=fid,
            date=tx.date.isoformat(),
            merchant=tx.merchant,
            amount=tx.amount,
            is_expense=tx.is_expense,
            currency=tx.currency,
            category_name=ab_name,
            category_confirmed=(bool(ab_name) and pred.from_history),
            duplicate=(fid in existing_ids),
        ))

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

    imported, skipped, merged = await actual._run(
        lambda: _do_import(actual, body.account_id, body.rows)
    )

    # Teach SmartCategorizer from confirmed categories so future imports remember
    # merchant → AB category name mappings without any Ollama call.
    if imported > 0:
        db = MemoryDB(db_path=settings.memory.db_path)
        categorizer = SmartCategorizer(db=db)
        for row in body.rows:
            if not row.duplicate and row.category_name:
                categorizer.learn(row.merchant.lower(), row.category_name)

    logger.info(
        "CSV confirmed [%s]: %d imported, %d skipped, %d merged",
        current_user, imported, skipped, merged,
    )
    return ImportResult(imported=imported, skipped=skipped, merged=merged)
