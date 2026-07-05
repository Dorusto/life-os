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
