"""
Notification-settings action endpoints — confirm or cancel a pending set-notification-time proposal.

POST /api/notification-actions/{id}/confirm
POST /api/notification-actions/{id}/cancel
"""
import logging
import re
from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException

from backend.api.auth import get_current_user
from backend.tools import notification_actions as action_store
from backend.core.config import settings
from backend.core.memory.database import MemoryDB
from backend.core.scheduler import scheduler

logger = logging.getLogger(__name__)
router = APIRouter()


class NotificationTimeOverride(BaseModel):
    time: str | None = None


@router.post("/notification-actions/{action_id}/confirm")
async def confirm_notification_time(
    action_id: str,
    override: NotificationTimeOverride = NotificationTimeOverride(),
    current_user: str = Depends(get_current_user),
):
    action = action_store.get(action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found or already completed")

    time = override.time if override.time is not None else action["time"]
    if not re.match(r"^\d{2}:\d{2}$", time):
        raise HTTPException(status_code=400, detail="Invalid time format. Use HH:MM, e.g. '21:30'.")
    hour, minute = map(int, time.split(":"))
    valid_hour = 0 <= hour <= 23
    valid_minute = 0 <= minute <= 59
    if not (valid_hour and valid_minute):
        raise HTTPException(status_code=400, detail="Invalid time. Hour must be 0-23, minute 0-59.")

    try:
        db = MemoryDB(settings.memory.db_path)
        db.upsert_notification_rule(
            rule_type="daily_summary",
            enabled=True,
            config={"time": time},
        )
        scheduler.reschedule_job(
            "daily_digest",
            trigger="cron",
            hour=hour,
            minute=minute,
        )
    except Exception as e:
        logger.error("Failed to update notification time %s: %s", action_id, e)
        raise HTTPException(status_code=500, detail="Failed to update notification time")

    action_store.delete(action_id)

    return {"message": f"Notification time updated to {time}. Daily digest rescheduled."}


@router.post("/notification-actions/{action_id}/cancel")
async def cancel_notification_time(
    action_id: str,
    current_user: str = Depends(get_current_user),
):
    action_store.delete(action_id)
    return {"cancelled": True}
