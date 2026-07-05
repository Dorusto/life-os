"""
Direct REST access to finance chart data, for the frontend's in-card month
navigation (prev/next arrows) — bypasses the chat/LLM tool-calling flow
entirely, since moving to an adjacent month is a deterministic parameter
change, not something that needs an LLM round-trip.

GET /api/finance/spending-chart
GET /api/finance/budget-chart
GET /api/finance/spending-trend
"""
import json
import logging

from fastapi import APIRouter, Depends

from backend.api.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/finance/spending-chart")
async def spending_chart(
    month: int | None = None,
    year: int | None = None,
    current_user: str = Depends(get_current_user),
):
    from backend.tools.finance.actual_budget import get_spending_chart

    result = await get_spending_chart(month=month, year=year)
    return json.loads(result)


@router.get("/finance/budget-chart")
async def budget_chart(
    month: int | None = None,
    year: int | None = None,
    current_user: str = Depends(get_current_user),
):
    from backend.tools.finance.actual_budget import get_budget_chart

    result = await get_budget_chart(month=month, year=year)
    return json.loads(result)


@router.get("/finance/spending-trend")
async def spending_trend(
    months: int = 6,
    start_month: int | None = None,
    start_year: int | None = None,
    end_month: int | None = None,
    end_year: int | None = None,
    current_user: str = Depends(get_current_user),
):
    from backend.tools.finance.actual_budget import get_spending_trend

    result = await get_spending_trend(
        months=months,
        start_month=start_month,
        start_year=start_year,
        end_month=end_month,
        end_year=end_year,
    )
    return json.loads(result)
