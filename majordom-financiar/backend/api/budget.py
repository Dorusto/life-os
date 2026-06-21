"""
Budget management endpoints.
POST /api/budget/rebalance — apply a confirmed budget rebalance.
"""
import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core.actual_client import ActualBudgetClient
from backend.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


class RebalanceRequest(BaseModel):
    source_category: str
    destination_category: str
    amount: float
    month: str = ""       # "YYYY-MM" or empty for current month
    new_source_budget: float
    new_destination_budget: float


def _get_client() -> ActualBudgetClient:
    return ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )


@router.post("/budget/rebalance")
async def apply_rebalance(
    req: RebalanceRequest,
    current_user: str = Depends(get_current_user),
):
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    if req.month:
        try:
            year, m = int(req.month[:4]), int(req.month[5:7])
            target_month = date(year, m, 1)
        except (ValueError, IndexError):
            target_month = date.today().replace(day=1)
    else:
        target_month = date.today().replace(day=1)

    client = _get_client()

    try:
        await client.set_budget_amount(req.source_category, req.new_source_budget, target_month)
        await client.set_budget_amount(req.destination_category, req.new_destination_budget, target_month)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error("Budget rebalance failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to apply rebalance")

    return {
        "message": (
            f"Moved €{req.amount:.2f} from {req.source_category} to {req.destination_category}. "
            f"New allocations: {req.source_category} €{req.new_source_budget:.2f}, "
            f"{req.destination_category} €{req.new_destination_budget:.2f}."
        )
    }
