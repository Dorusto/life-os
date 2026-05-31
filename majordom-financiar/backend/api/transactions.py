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
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core.actual_client import ActualBudgetClient
from backend.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


# --- Models ---

class Transaction(BaseModel):
    id: str
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
    limit: int = Query(default=20, ge=1, le=100),
    current_user: str = Depends(get_current_user),
):
    """
    Return the most recent transactions from Actual Budget.
    Used by the Home screen to show the last 5-20 transactions.
    """
    client = ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )

    try:
        raw = await client.get_recent_transactions(limit=limit)
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
    return [CategoryItem(id=cat.id, name=cat.name) for cat in cats]


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


class CategoryStat(BaseModel):
    name: str
    total: float
    count: int
    percentage: float  # share of total monthly spend (0-100)


class MonthlyStats(BaseModel):
    month: int
    year: int
    total: float        # total expenses this month
    income: float       # total income this month
    count: int          # number of expense transactions
    categories: list[CategoryStat]  # sorted by total descending


@router.get("/stats", response_model=MonthlyStats)
async def monthly_stats(
    month: Optional[int] = None,
    year: Optional[int] = None,
    current_user: str = Depends(get_current_user),
):
    """
    Return spending summary for the given month (defaults to current month).
    Used by the Home screen spending chart.
    """
    client = ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )

    try:
        data = await client.get_monthly_stats(month=month, year=year)
    except Exception as e:
        logger.error("Failed to fetch monthly stats: %s", e)
        raise HTTPException(status_code=500, detail="Could not fetch statistics")

    total = data.get("total", 0.0)

    cats = []
    for cat_data in data.get("categories", {}).values():
        cats.append(CategoryStat(
            name=cat_data["name"],
            total=round(cat_data["total"], 2),
            count=cat_data["count"],
            percentage=round(cat_data["total"] / total * 100, 1) if total > 0 else 0,
        ))

    cats.sort(key=lambda c: c.total, reverse=True)

    return MonthlyStats(
        month=data["month"],
        year=data["year"],
        total=round(total, 2),
        income=round(data.get("income", 0.0), 2),
        count=data.get("count", 0),
        categories=cats,
    )


class Goal(BaseModel):
    id: str
    name: str
    balance: float
    target: float
    percentage: float
    deadline: str | None = None
    monthly_needed: float | None = None
    months_remaining: int | None = None


@router.get("/accounts/goals", response_model=list[Goal])
async def list_goals(current_user: str = Depends(get_current_user)):
    """
    Return accounts that have a savings goal (TARGET: <amount> in their AB note field).
    """
    client = ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )
    try:
        data = await client.get_goals()
    except Exception as e:
        logger.error("Failed to fetch goals: %s", e)
        raise HTTPException(status_code=500, detail="Could not fetch goals")
    return [Goal(**item) for item in data]


class BudgetCategory(BaseModel):
    category_id: str
    category_name: str
    group_name: str = "Unexpected"
    budgeted: float
    spent: float
    percentage: float


@router.get("/budget", response_model=list[BudgetCategory])
async def budget_status(
    month: Optional[int] = None,
    year: Optional[int] = None,
    current_user: str = Depends(get_current_user),
):
    """
    Return budget vs spent per category for the given month.
    Over-budget categories appear first, then by percentage descending.
    """
    client = ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )

    try:
        data = await client.get_budget_status(month=month, year=year)
    except Exception as e:
        logger.error("Failed to fetch budget status: %s", e)
        raise HTTPException(status_code=500, detail="Could not fetch budget data")

    return [BudgetCategory(**item) for item in data]
