"""
GET /api/home — all Home screen data in one AB session.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException

from backend.api.auth import get_current_user
from backend.core.actual_client import ActualBudgetClient
from backend.core.actual_client.client import _calc_fire
from backend.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_client() -> ActualBudgetClient:
    return ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )


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
        "account_count": len(accounts_raw),
    }


@router.get("/home/pending")
async def get_home_pending(current_user: str = Depends(get_current_user)):
    """Live 'needs resolving' list for the Home widget dropdown."""
    from backend.services.notification_service import get_pending_items
    return {"items": await get_pending_items()}


@router.post("/home/sync")
async def sync_accounts(current_user: str = Depends(get_current_user)):
    """
    Re-sync every bank-linked account in one pass — the header sync icon's
    entry point. Same underlying action as the `finance__sync_accounts`
    chat tool (backend/tools/finance/actual_budget.py).
    """
    client = _get_client()
    try:
        return await client.run_bank_resync_all()
    except Exception as e:
        logger.error("Bank resync-all failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Sync failed")


_PERIOD_MONTHS = {"3m": 3, "6m": 6, "12m": 12}
_MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


@router.get("/home/budget-period")
async def get_budget_period(
    period: str,
    month: int | None = None,
    year: int | None = None,
    current_user: str = Depends(get_current_user),
):
    """
    Single endpoint for the Budget card's 1M/3M/6M/12M segmented control (#165).
    period="month" returns the same category breakdown BudgetDashboard already
    renders (reuses get_budget_status — no new calculation, per architecture.md
    rule 20). period="3m"/"6m"/"12m" returns a Chart.tsx-compatible line-chart
    payload of total spend per month, `month`/`year` is the window's last month.
    """
    from datetime import date as _date

    client = _get_client()
    today = _date.today()
    ref_month = month or today.month
    ref_year = year or today.year

    if period == "month":
        try:
            categories = await client.get_budget_status(month=ref_month, year=ref_year)
        except Exception as e:
            logger.error("Failed to fetch budget-period (month): %s", e, exc_info=True)
            raise HTTPException(status_code=500, detail="Could not fetch budget data")
        return {"mode": "month", "month": ref_month, "year": ref_year, "categories": categories}

    n = _PERIOD_MONTHS.get(period)
    if n is None:
        raise HTTPException(status_code=400, detail=f"Invalid period: {period!r}")

    months_list = []
    m, y = ref_month, ref_year
    for _ in range(n):
        months_list.append((m, y))
        m -= 1
        if m < 1:
            m, y = 12, y - 1
    months_list.reverse()

    try:
        totals = await client.get_monthly_totals_batch(months_list)
    except Exception as e:
        logger.error("Failed to fetch budget-period (%s): %s", period, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Could not fetch spending trend")
    points = [{"x": f"{_MONTH_ABBR[t['month'] - 1]} {t['year']}", "y": t["total"]} for t in totals]

    first_m, first_y = months_list[0]
    last_m, last_y = months_list[-1]
    range_label = (
        f"{_MONTH_ABBR[first_m - 1]} {first_y}"
        if (first_y, first_m) == (last_y, last_m)
        else f"{_MONTH_ABBR[first_m - 1]} {first_y} – {_MONTH_ABBR[last_m - 1]} {last_y}"
    )

    return {
        "mode": "trend",
        "month": ref_month,
        "year": ref_year,
        "range_label": range_label,
        "title": "Total spend / month",
        "data": {
            "series": [{"label": "Total spend", "color": "#4F8EF7", "points": points}],
        },
    }
