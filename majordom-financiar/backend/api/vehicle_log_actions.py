"""
Vehicle log action endpoints — confirm or cancel a pending delete proposal.

POST /api/vehicle-log-actions/{id}/confirm
POST /api/vehicle-log-actions/{id}/cancel
"""
import logging

from fastapi import APIRouter, Depends, HTTPException

from backend.api.auth import get_current_user
from backend.tools import vehicle_log_actions as action_store
from backend.core.config import settings
from backend.core.actual_client import ActualBudgetClient
from backend.core.vehicle_client import VehicleClient, VehicleClientError

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/vehicle-log-actions/{action_id}/confirm")
async def confirm_vehicle_log_action(
    action_id: str,
    current_user: str = Depends(get_current_user),
):
    action = action_store.get(action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found or already completed")

    entry_id = action["entry_id"]
    financial_id = action.get("financial_id")
    client = VehicleClient(base_url=settings.vehicle_manager.url)

    try:
        # Verify the entry exists via vehicle-manager
        entry = await client.get_log_entry(entry_id)
        if not entry:
            raise HTTPException(status_code=404, detail=f"Entry #{entry_id} not found")

        # Delete via vehicle-manager
        ok = await client.delete_log_entry(entry_id)
        if not ok:
            raise HTTPException(status_code=404, detail=f"Entry #{entry_id} not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete vehicle log entry %s: %s", entry_id, e)
        raise HTTPException(status_code=500, detail="Failed to delete vehicle log entry")
    finally:
        action_store.delete(action_id)

    # Fuelio historical imports have no financial_id — only refuels logged
    # from photo/text (today onward) are linked to an AB transaction (#83).
    ab_deleted = False
    if financial_id:
        client_ab = ActualBudgetClient(
            url=settings.actual.url,
            password=settings.actual.password,
            sync_id=settings.actual.sync_id,
        )
        try:
            ab_deleted = await client_ab.delete_transaction(financial_id)
        except Exception as e:
            logger.error("Failed to delete AB transaction %s for vehicle log entry %s: %s", financial_id, entry_id, e)

    message = f"Vehicle log entry #{entry_id} deleted."
    if financial_id:
        message += " AB transaction also removed." if ab_deleted else " (AB transaction could not be removed — check manually.)"

    return {"message": message}


@router.post("/vehicle-log-actions/{action_id}/cancel")
async def cancel_vehicle_log_action(
    action_id: str,
    current_user: str = Depends(get_current_user),
):
    action_store.delete(action_id)
    return {"cancelled": True}