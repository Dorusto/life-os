"""
GET /api/home — all Home screen data in one AB session.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from datetime import date

from backend.api.auth import get_current_user
from backend.core.actual_client import ActualBudgetClient
from backend.core.config import settings

logger = logging.getLogger(__name__)

FIRE_TARGET = 190_000.0
MONTHLY_CONTRIBUTION = 820.0
ANNUAL_RETURN = 0.07
FIRE_YEAR = 2035
FIRE_EXCLUDE = ["house", "mortgage", "hypotheek", "hypotheken", "cory", "wabi sabi"]

router = APIRouter()


def _get_client() -> ActualBudgetClient:
    return ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )


def _fire_portfolio(accounts: list, balance_attr: str = "balance") -> float:
    return sum(
        getattr(a, balance_attr) for a in accounts
        if a.off_budget
        and not any(p in a.name.lower() for p in FIRE_EXCLUDE)
    )


def _calc_fire(accounts: list) -> dict:
    """Calculate FIRE progress from an account list (current + previous-month-end balances)."""
    portfolio = _fire_portfolio(accounts)
    pct = round(portfolio / FIRE_TARGET * 100, 1) if FIRE_TARGET else 0
    # Previous month's % (#77 trend) — same accounts, balance as of end of last month.
    portfolio_prev = _fire_portfolio(accounts, "balance_prev_month_end")
    pct_prev = round(portfolio_prev / FIRE_TARGET * 100, 1) if FIRE_TARGET else 0
    months_left = (FIRE_YEAR - date.today().year) * 12 - date.today().month + 1
    fv = portfolio * (1 + ANNUAL_RETURN) ** (months_left / 12)
    fv += MONTHLY_CONTRIBUTION * (((1 + ANNUAL_RETURN / 12) ** months_left - 1) / (ANNUAL_RETURN / 12))
    return {
        "fire_portfolio": round(portfolio, 2),
        "fire_target": FIRE_TARGET,
        "fire_pct": pct,
        "fire_pct_prev": pct_prev,
        "months_remaining": max(months_left, 0),
        "projected_2035": round(fv, 2),
        "on_track": fv >= FIRE_TARGET,
        "monthly_contribution": MONTHLY_CONTRIBUTION,
    }


@router.get("/home")
async def get_home(
    month: int | None = None,
    year: int | None = None,
    current_user: str = Depends(get_current_user),
):
    client = _get_client()
    try:
        data = await client.get_home_data(month=month, year=year)
    except Exception as e:
        logger.error("Failed to fetch home data: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Could not fetch home data")

    # FIRE uses already-fetched accounts — no extra AB call
    accounts_raw = data.pop("accounts")

    # Reconstruct namespace objects for FIRE (need .off_budget and .name and .balance)
    from types import SimpleNamespace
    accounts = [SimpleNamespace(**a) for a in accounts_raw]

    return {
        **data,
        "fire": _calc_fire(accounts),
    }


@router.get("/home/pending")
async def get_home_pending(current_user: str = Depends(get_current_user)):
    """Live 'needs resolving' list for the Home widget dropdown."""
    from backend.services.notification_service import get_pending_items
    return {"items": await get_pending_items()}
