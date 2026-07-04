"""
Vehicle reminder action endpoints — confirm or cancel a pending set-reminder proposal.

POST /api/vehicle-reminder-actions/{id}/confirm
POST /api/vehicle-reminder-actions/{id}/cancel
"""
import logging
from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException

from backend.api.auth import get_current_user
from backend.tools import vehicle_reminder_actions as action_store
from backend.core.config import settings
from backend.core.vehicle_client import VehicleClient

logger = logging.getLogger(__name__)
router = APIRouter()


class ReminderOverride(BaseModel):
    due_date: str | None = None
    vehicle_id: int | None = None
    interval_km: int | None = None
    interval_months: int | None = None
    last_service_km: float | None = None
    last_service_date: str | None = None
    required: bool | None = None


@router.post("/vehicle-reminder-actions/{action_id}/confirm")
async def confirm_vehicle_reminder(
    action_id: str,
    override: ReminderOverride = ReminderOverride(),
    current_user: str = Depends(get_current_user),
):
    action = action_store.get(action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found or already completed")

    vehicle_id = override.vehicle_id if override.vehicle_id is not None else action["vehicle_id"]
    client = VehicleClient(base_url=settings.vehicle_manager.url)

    try:
        # Look up vehicle name
        vehicle = await client.get_vehicle(vehicle_id)
        vehicle_name = vehicle["name"] if vehicle else f"vehicle #{vehicle_id}"

        if action.get("action") == "set_service":
            # Patch service fields via vehicle-manager
            patch_fields = {}
            if override.interval_km is not None:
                patch_fields["service_interval_km"] = override.interval_km
            elif action.get("interval_km") is not None:
                patch_fields["service_interval_km"] = action["interval_km"]

            if override.interval_months is not None:
                patch_fields["service_interval_months"] = override.interval_months
            elif action.get("interval_months") is not None:
                patch_fields["service_interval_months"] = action["interval_months"]

            if override.last_service_km is not None:
                patch_fields["last_service_km"] = override.last_service_km
            elif action.get("last_service_km") is not None:
                patch_fields["last_service_km"] = action["last_service_km"]

            if override.last_service_date is not None:
                patch_fields["last_service_date"] = override.last_service_date
            elif action.get("last_service_date") is not None:
                patch_fields["last_service_date"] = action["last_service_date"]

            if patch_fields:
                await client.patch_vehicle(vehicle_id, **patch_fields)
            return {"message": f"{vehicle_name} service interval saved."}

        if action.get("action") == "set_apk_required":
            required = override.required if override.required is not None else action["required"]
            await client.patch_vehicle(vehicle_id, apk_required=required)
            state = "required" if required else "not required"
            return {"message": f"{vehicle_name} APK/ITP marked as {state}."}

        due_date = override.due_date or action["due_date"]
        field = action["field"]
        patch_kwargs = {field: due_date}
        await client.patch_vehicle(vehicle_id, **patch_kwargs)
        label = "APK/ITP" if field == "apk_due" else "Insurance"
        return {"message": f"{vehicle_name} {label} reminder set to {due_date}."}

    except Exception as e:
        logger.error("Failed to set vehicle reminder %s: %s", action_id, e)
        raise HTTPException(status_code=500, detail="Failed to save reminder date")
    finally:
        action_store.delete(action_id)


@router.post("/vehicle-reminder-actions/{action_id}/cancel")
async def cancel_vehicle_reminder(
    action_id: str,
    current_user: str = Depends(get_current_user),
):
    action_store.delete(action_id)
    return {"cancelled": True}