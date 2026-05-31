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
from backend.core.memory.database import MemoryDB
from backend.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


class ReminderOverride(BaseModel):
    due_date: str | None = None
    vehicle_id: int | None = None
    interval_km: int | None = None
    interval_months: int | None = None
    last_service_km: float | None = None
    last_service_date: str | None = None


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

    try:
        db = MemoryDB(settings.memory.db_path)
        vehicles = db.get_vehicles()
        vehicle_name = next((v["name"] for v in vehicles if v["id"] == vehicle_id), f"vehicle #{vehicle_id}")

        if action.get("action") == "set_service":
            db.update_vehicle_service(
                vehicle_id,
                override.interval_km if override.interval_km is not None else action.get("interval_km"),
                override.interval_months if override.interval_months is not None else action.get("interval_months"),
                override.last_service_km if override.last_service_km is not None else action.get("last_service_km"),
                override.last_service_date if override.last_service_date is not None else action.get("last_service_date"),
            )
            return {"message": f"{vehicle_name} service interval saved."}

        due_date = override.due_date or action["due_date"]
        field = action["field"]
        db.update_vehicle_due_date(vehicle_id, field, due_date)
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
