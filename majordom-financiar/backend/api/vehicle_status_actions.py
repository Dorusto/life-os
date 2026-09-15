"""
Vehicle status action endpoints — confirm or cancel a pending activate/deactivate proposal.

POST /api/vehicle-status-actions/{id}/confirm
POST /api/vehicle-status-actions/{id}/cancel
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.tools import vehicle_status_actions as action_store
from backend.core.config import settings
from backend.core.vehicle_client import VehicleClient

logger = logging.getLogger(__name__)
router = APIRouter()


class VehicleStatusOverride(BaseModel):
    vehicle_id: int | None = None


@router.post("/vehicle-status-actions/{action_id}/confirm")
async def confirm_vehicle_status_action(
    action_id: str,
    override: VehicleStatusOverride = VehicleStatusOverride(),
    current_user: str = Depends(get_current_user),
):
    action = action_store.get(action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found or already completed")

    # Card fields are editable (rule 5) — the confirm body may carry a
    # user-corrected vehicle; resolve its current name for the reply.
    vehicle_id = override.vehicle_id if override.vehicle_id is not None else action["vehicle_id"]

    client = VehicleClient(base_url=settings.vehicle_manager.url)
    try:
        vehicle_name = action["vehicle_name"]
        if vehicle_id != action["vehicle_id"]:
            vehicle = await client.get_vehicle(vehicle_id)
            if not vehicle:
                raise HTTPException(status_code=404, detail="Vehicle not found")
            vehicle_name = vehicle["name"]
        ok = await client.patch_vehicle(vehicle_id, active=1 if action["active"] else 0)
        if not ok:
            raise HTTPException(status_code=404, detail="Vehicle not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update vehicle status %s: %s", action_id, e)
        raise HTTPException(status_code=500, detail="Failed to update vehicle status")

    action_store.delete(action_id)

    status_label = "active" if action["active"] else "inactive"
    return {"message": f"{vehicle_name} marked as {status_label}."}


@router.post("/vehicle-status-actions/{action_id}/cancel")
async def cancel_vehicle_status_action(
    action_id: str,
    current_user: str = Depends(get_current_user),
):
    action_store.delete(action_id)
    return {"cancelled": True}
