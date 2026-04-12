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

# Actual Budget category display names, keyed by our internal category_id.
# Must stay in sync with categories.json and the 12-category scheme in CLAUDE.md.
_CATEGORY_NAMES: dict[str, str] = {
    "groceries":     "Groceries & Drinks",
    "restaurants":   "Restaurants & Cafes",
    "transport":     "Transport",
    "utilities":     "Utilities",
    "health":        "Health",
    "clothing":      "Clothing",
    "home":          "Home & Maintenance",
    "entertainment": "Entertainment & Vacation",
    "children":      "Children",
    "personal":      "Personal",
    "investments":   "Investments & Savings",
    "income":        "Income",
    "other":         "Other",
}


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
    id: str          # financial_id hash — stable row key for the frontend
    date: str        # YYYY-MM-DD
    merchant: str
    amount: float    # always positive; is_expense determines sign in Actual Budget
    is_expense: bool
    currency: str
    category_id: str # suggested from merchant history, keywords, or "other"
    category_confirmed: bool  # True = from confirmed history; False = needs user review
    duplicate: bool


class ImportPreview(BaseModel):
    source_name: str
    rows: list[ImportRowPreview]
    total_rows: int      # raw CSV rows (includes income-only rows skipped by normalizer)
    accounts: list[dict] # [{id, name}] — for the account selector in the UI


class ImportRowConfirm(BaseModel):
    date: str
    merchant: str
    amount: float
    is_expense: bool
    category_id: str
    duplicate: bool
    notes: str = ""


class ImportConfirmRequest(BaseModel):
    account_id: str
    rows: list[ImportRowConfirm]


class ImportResult(BaseModel):
    imported: int
    skipped: int


# ---------------------------------------------------------------------------
# Sync helpers — run in thread executor via ActualBudgetClient._run()
# ---------------------------------------------------------------------------

def _fetch_existing_ids(actual_client: ActualBudgetClient) -> set[str]:
    """
    Return all financial_ids currently in Actual Budget.
    Called from the preview endpoint to flag duplicates before the user
    reviews the import — prevents surprises at confirm time.
    """
    from actual.queries import get_transactions
    with actual_client._get_actual() as actual:
        actual.download_budget()
        return {
            tx.financial_id
            for tx in get_transactions(actual.session)
            if tx.financial_id and not tx.tombstone
        }


def _do_import(
    actual_client: ActualBudgetClient,
    account_id: str,
    rows: list[ImportRowConfirm],
) -> tuple[int, int]:
    """
    Write confirmed rows to Actual Budget in a single session.

    Re-checks duplicates server-side (the user may have imported something
    between preview and confirm, or may have unchecked a duplicate in the UI).
    Returns (imported, skipped).
    """
    from actual.queries import (
        create_transaction,
        get_or_create_category,
        get_or_create_payee,
        get_transactions,
    )

    with actual_client._get_actual() as actual:
        actual.download_budget()

        # Build dedup set for this session
        existing_ids = {
            tx.financial_id
            for tx in get_transactions(actual.session)
            if tx.financial_id and not tx.tombstone
        }

        imported = 0
        skipped = 0

        for row in rows:
            if row.duplicate:
                skipped += 1
                continue

            try:
                tx_date = dt.strptime(row.date, "%Y-%m-%d").date()
            except ValueError:
                tx_date = dt.now().date()

            fid = _financial_id(tx_date.isoformat(), row.merchant, row.amount)
            if fid in existing_ids:
                skipped += 1
                continue

            payee = get_or_create_payee(actual.session, row.merchant)

            cat_obj = None
            if row.category_id in _CATEGORY_NAMES:
                cat_obj = get_or_create_category(
                    actual.session,
                    _CATEGORY_NAMES[row.category_id],
                    group_name="Majordom",
                )

            # Expenses are negative in Actual Budget (milliunits), refunds positive
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

        if imported > 0:
            actual.commit()
            logger.info("CSV import committed: %d rows", imported)

    return imported, skipped


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
        delimiter = normalizer.detect_delimiter(text_content)
        headers, rows = normalizer.parse_csv(raw, delimiter=delimiter, encoding=enc)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot parse CSV: {e}")

    if not rows:
        raise HTTPException(status_code=400, detail="CSV is empty or has no data rows")

    db = MemoryDB(db_path=settings.memory.db_path)
    detector = CsvProfileDetector(settings.ollama.url, settings.ollama.model)
    sig = detector.header_signature(headers)
    profile = db.get_csv_profile_by_sig(sig)

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

    # Fetch existing IDs and accounts concurrently via the shared executor
    existing_ids = await actual._run(lambda: _fetch_existing_ids(actual))
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
        # Use the best available prediction — user reviews everything in the preview
        # table and can change any category, so it's fine to show keyword/AI suggestions too
        cat_id = pred.category_id or "other"

        preview_rows.append(ImportRowPreview(
            id=fid,
            date=tx.date.isoformat(),
            merchant=tx.merchant,
            amount=tx.amount,
            is_expense=tx.is_expense,
            currency=tx.currency,
            category_id=cat_id,
            category_confirmed=pred.from_history,
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

    imported, skipped = await actual._run(
        lambda: _do_import(actual, body.account_id, body.rows)
    )

    logger.info(
        "CSV confirmed [%s]: %d imported, %d skipped",
        current_user, imported, skipped,
    )
    return ImportResult(imported=imported, skipped=skipped)
