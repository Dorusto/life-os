"""
FIRE (Financial Independence, Retire Early) progress endpoint.

GET /api/stats/fire  → returns current FIRE portfolio status vs 2035 target

Architecture note: this is a lightweight stat endpoint. It reads accounts from
Actual Budget, filters for investable assets (off-budget, non-real-estate), and
computes a future-value projection. Hardcoded v1 targets — configurable later.
"""
import logging
from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core.actual_client import ActualBudgetClient
from backend.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# Accounts to exclude from the FIRE portfolio — real estate, mortgage, cars
EXCLUDE_PATTERNS = ["house", "mortgage", "hypotheek", "hypotheken", "cory", "wabi sabi"]

# Hardcoded v1 targets
FIRE_TARGET = 190_000.0          # EUR — portfolio target by 2035
MONTHLY_CONTRIBUTION = 820.0     # EUR/month — current investment rate
ANNUAL_RETURN = 0.07             # 7% annual return assumption
FIRE_YEAR = 2035


class FireResponse(BaseModel):
    fire_portfolio: float
    fire_target: float
    fire_pct: float
    months_remaining: int
    projected_2035: float
    on_track: bool
    monthly_contribution: float


def _get_client() -> ActualBudgetClient:
    return ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )


@router.get("/stats/fire", response_model=FireResponse)
async def fire_progress(current_user: str = Depends(get_current_user)):
    """Return FIRE 2035 progress: current portfolio, projection, on-track status."""
    client = _get_client()
    accounts = await client.get_accounts()

    # FIRE portfolio = off-budget accounts, excluding real estate / mortgage / cars
    portfolio_accounts = [
        a for a in accounts
        if a.off_budget
        and a.balance > 0
        and not any(p in a.name.lower() for p in EXCLUDE_PATTERNS)
    ]
    fire_portfolio = sum(a.balance for a in portfolio_accounts)  # already in EUR

    # Calculate months remaining until 2035
    now = date.today()
    months_remaining = (FIRE_YEAR - now.year) * 12 - now.month + 1

    # Future value projection
    r = ANNUAL_RETURN / 12  # monthly rate
    fv = (
        fire_portfolio * (1 + r) ** months_remaining
        + MONTHLY_CONTRIBUTION * ((1 + r) ** months_remaining - 1) / r
    )
    on_track = fv >= FIRE_TARGET
    fire_pct = min(fire_portfolio / FIRE_TARGET * 100, 100) if FIRE_TARGET > 0 else 0

    return FireResponse(
        fire_portfolio=round(fire_portfolio, 2),
        fire_target=FIRE_TARGET,
        fire_pct=round(fire_pct, 1),
        months_remaining=months_remaining,
        projected_2035=round(fv, 0),
        on_track=on_track,
        monthly_contribution=MONTHLY_CONTRIBUTION,
    )
