"""
Transactions and accounts endpoints.

GET /api/transactions  → recent transactions from Actual Budget (for Home screen)
GET /api/accounts      → all accounts (for the account selector in receipt flow)

Why pull directly from Actual Budget instead of from SQLite (memory.db)?
Actual Budget is the single source of truth for financial data. SQLite is only
used for the categorization memory (merchant → category mappings). Reading
transactions from Actual Budget ensures what you see in the app matches what
Actual Budget shows — there's no risk of them getting out of sync.
"""
import logging
import re
from datetime import date
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core.actual_client import ActualBudgetClient
from backend.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


def _parse_date(value: str) -> date:
    """Parse a YYYY-MM-DD query param into a date, or raise HTTP 400 for a bad value."""
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(
            status_code=400, detail=f"Invalid date: {value!r} (expected YYYY-MM-DD)"
        )


# --- Models ---

class Transaction(BaseModel):
    id: str
    financial_id: Optional[str]  # Actual Budget financial_id (None for rows entered directly in the AB UI)
    date: str           # YYYY-MM-DD
    merchant: str
    amount: float       # always positive; check is_expense for direction
    is_expense: bool    # True = money out, False = income or refund
    category: Optional[str]   # display name, e.g. "Alimente & Băuturi"
    category_id: Optional[str]  # internal id, e.g. "groceries"
    account: str
    notes: Optional[str]


class Account(BaseModel):
    id: str
    name: str
    balance: float


# --- Routes ---

@router.get("/transactions", response_model=list[Transaction])
async def list_transactions(
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    account_id: Optional[str] = Query(default=None),
    category_id: Optional[str] = Query(default=None),
    payee: Optional[str] = Query(default=None),
    uncategorized_only: bool = Query(default=False),
    amount_min: Optional[float] = Query(default=None),
    amount_max: Optional[float] = Query(default=None),
    is_expense: Optional[bool] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    current_user: str = Depends(get_current_user),
):
    """
    Return transactions from Actual Budget, newest-first.

    Used by the Home screen (last 5-20) and the Transactions table (#184), which
    passes the full set of optional filters. `limit`'s cap was raised to 200 rows
    so a full table page can request more than the Home/widget callers ever needed.
    """
    client = ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )

    start = _parse_date(start_date) if start_date else None
    end = _parse_date(end_date) if end_date else None

    try:
        raw = await client.get_recent_transactions(
            limit=limit,
            offset=offset,
            account_id=account_id,
            category_id=category_id,
            payee=payee,
            uncategorized_only=uncategorized_only,
            amount_min=amount_min,
            amount_max=amount_max,
            is_expense=is_expense,
            start_date=start,
            end_date=end,
        )
    except Exception as e:
        logger.error("Failed to fetch transactions from Actual Budget: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Could not connect to Actual Budget. Is it running?",
        )

    result = []
    for tx in raw:
        result.append(Transaction(
            id=str(tx["id"]),
            financial_id=tx.get("financial_id"),
            date=str(tx["date"]),
            merchant=tx["merchant"] or "Unknown",
            amount=abs(tx["amount_cents"]) / 100,
            is_expense=tx["amount_cents"] < 0,
            category=tx.get("category_name"),
            category_id=tx.get("category_id"),
            account=tx.get("account_name") or "",
            notes=tx.get("notes"),
        ))

    return result


class BulkCategoryRequest(BaseModel):
    financial_ids: list[str]
    category_id: str


@router.post("/transactions/bulk-category")
async def bulk_update_category(
    body: BulkCategoryRequest,
    current_user: str = Depends(get_current_user),
):
    """Set the same category on many transactions in one batch (#184).

    No-AI bulk edit from the Transactions table — selects a set of rows by
    financial_id and assigns one category to all of them in a single
    download/commit cycle (not N per-row round trips).
    """
    if not body.financial_ids:
        raise HTTPException(status_code=400, detail="financial_ids must not be empty")

    client = ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )

    try:
        updated = await client.bulk_update_category(
            body.financial_ids, body.category_id
        )
    except Exception as e:
        logger.error("Failed to bulk-update categories: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Could not connect to Actual Budget. Is it running?",
        )

    return {"updated": updated}


@router.get("/accounts", response_model=list[Account])
async def list_accounts(current_user: str = Depends(get_current_user)):
    """
    Return all open accounts from Actual Budget.
    Used to populate the account selector when confirming a receipt.
    """
    client = ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )

    try:
        accounts = await client.get_accounts()
    except Exception as e:
        logger.error("Failed to fetch accounts from Actual Budget: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Could not connect to Actual Budget. Is it running?",
        )

    return [
        Account(id=acc.id, name=acc.name, balance=acc.balance)
        for acc in accounts
    ]


class CategoryItem(BaseModel):
    id: str
    name: str
    group_name: str = ""
    is_income: bool = False


@router.get("/categories", response_model=list[CategoryItem])
async def list_categories(current_user: str = Depends(get_current_user)):
    client = ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )
    try:
        cats = await client.get_categories()
    except Exception as e:
        logger.error("Failed to fetch categories: %s", e)
        raise HTTPException(status_code=500, detail="Could not fetch categories")
    return [CategoryItem(id=cat.id, name=cat.name, group_name=cat.group_name, is_income=cat.is_income) for cat in cats]


class SplitLine(BaseModel):
    category_id: str
    amount: float


class SplitTransactionRequest(BaseModel):
    splits: list[SplitLine]


@router.post("/transactions/{transaction_id}/split")
async def split_transaction(
    transaction_id: str,
    body: SplitTransactionRequest,
    current_user: str = Depends(get_current_user),
):
    """Split an existing transaction into 2+ category lines (#115).

    The transaction becomes a parent (no category) with one child per line,
    each carrying its own category and amount. The split amounts must sum to
    the original transaction's total.

    `transaction_id` is the row's own primary key — the same "transaction_id"
    value returned by POST /receipts/{id}/confirm and POST /transactions —
    NOT financial_id (see client.py::split_transaction's docstring / rule 21).
    """
    if len(body.splits) < 2:
        raise HTTPException(status_code=400, detail="A split needs at least 2 lines")

    client = ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )
    try:
        result = await client.split_transaction(
            transaction_id, [s.model_dump() for s in body.splits]
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to split transaction %s: %s", transaction_id, e)
        raise HTTPException(status_code=500, detail="Could not connect to Actual Budget. Is it running?")

    return result


@router.get("/category-groups", response_model=list[str])
async def list_category_groups(current_user: str = Depends(get_current_user)):
    client = ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )
    try:
        return await client.get_category_groups()
    except Exception as e:
        logger.error("Failed to fetch category groups: %s", e)
        raise HTTPException(status_code=500, detail="Could not fetch category groups")


class PayeeItem(BaseModel):
    id: str
    name: str
    transaction_count: int


class ScheduleItem(BaseModel):
    id: str
    name: str
    active: bool


@router.get("/payees", response_model=list[PayeeItem])
async def list_payees(current_user: str = Depends(get_current_user)):
    """Return all payees with their transaction counts (settings screen)."""
    client = ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )
    try:
        return await client.get_payees()
    except Exception as e:
        logger.error("Failed to fetch payees: %s", e)
        raise HTTPException(status_code=500, detail="Could not fetch payees")


@router.get("/schedules", response_model=list[ScheduleItem])
async def list_schedules(current_user: str = Depends(get_current_user)):
    """Return all scheduled transactions (settings screen)."""
    client = ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )
    try:
        return await client.get_schedules()
    except Exception as e:
        logger.error("Failed to fetch schedules: %s", e)
        raise HTTPException(status_code=500, detail="Could not fetch schedules")


class BackupStatus(BaseModel):
    last_backup: Optional[str] = None


@router.get("/backup-status", response_model=BackupStatus)
async def backup_status(current_user: str = Depends(get_current_user)):
    """Return the timestamp of the last successful backup, or null if unknown.

    Reads the last line of backups/backup.log (the same ./backups/ directory the
    daily backup cron writes to, mounted read-only into the container — see
    settings.backup_dir). Never crashes: any read/parse error returns null.
    """
    try:
        log_path = Path(settings.backup_dir) / "backup.log"
        if not log_path.is_file():
            return BackupStatus(last_backup=None)
        lines = log_path.read_text(encoding="utf-8", errors="replace").strip().splitlines()
        if not lines:
            return BackupStatus(last_backup=None)
        match = re.search(r"\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]", lines[-1])
        if not match:
            return BackupStatus(last_backup=None)
        return BackupStatus(last_backup=match.group(1))
    except Exception as e:
        logger.warning("Could not read backup status: %s", e)
        return BackupStatus(last_backup=None)


