"""
Direct REST access to finance chart data, for the frontend's in-card month
navigation (prev/next arrows) — bypasses the chat/LLM tool-calling flow
entirely, since moving to an adjacent month is a deterministic parameter
change, not something that needs an LLM round-trip.

GET /api/finance/spending-chart
GET /api/finance/budget-chart
GET /api/finance/spending-trend
GET /api/finance/savings-rate
GET /api/finance/net-worth-history
"""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException

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


@router.get("/finance/savings-rate")
async def savings_rate(
    months: int = 6,
    start_month: int | None = None,
    start_year: int | None = None,
    end_month: int | None = None,
    end_year: int | None = None,
    current_user: str = Depends(get_current_user),
):
    from backend.tools.finance.actual_budget import get_savings_rate_chart

    result = await get_savings_rate_chart(
        months=months,
        start_month=start_month,
        start_year=start_year,
        end_month=end_month,
        end_year=end_year,
    )
    return json.loads(result)


@router.get("/finance/net-worth-history")
async def net_worth_history(
    granularity: str = "month",
    include: str | None = None,
    current_user: str = Depends(get_current_user),
):
    """
    Assets vs liabilities per period end, for the Analytics Net Worth section.

    Deliberately does NOT delegate to a `backend.tools.finance.actual_budget`
    function like the four chart endpoints above: those exist as LLM tools too,
    while this series has no chat view (the section composes its own two bar
    charts from the raw points), so a tool wrapper would only widen the LLM's
    tool surface with a payload it can't render. It returns the raw point list,
    not the `{chart_type, title, data, refetch}` chart envelope.

    `include` is a comma-separated list of ACCOUNT_TYPES values; empty or absent
    means every account. An account's type is the *current* `TYPE:` note tag
    (decisions.md#account-type-note-tag) and has no history, so this filter
    selects which accounts the snapshots are summed over — it does not decide how
    a snapshot splits into assets and liabilities, which follows the balance's
    sign.
    """
    from backend.core.actual_client.client import ACCOUNT_TYPES
    from backend.core.finance.provider import get_provider

    if granularity not in ("month", "week"):
        raise HTTPException(status_code=400, detail="granularity must be 'month' or 'week'")

    include_types = [t.strip() for t in (include or "").split(",") if t.strip()]
    unknown = [t for t in include_types if t not in ACCOUNT_TYPES]
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unknown account type(s): {', '.join(unknown)}. "
                f"Allowed: {', '.join(ACCOUNT_TYPES)}"
            ),
        )

    provider = get_provider()
    return await provider.get_net_worth_history(
        granularity=granularity,
        include_types=include_types,
    )
