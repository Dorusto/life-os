"""
NotificationSettingsService — the write logic for a confirmed notification-time proposal.

Moved out of the FastAPI handler in backend/api/notification_actions.py so the
same code runs whether the confirmation came from the PWA card, a plain HTTP
call, or an MCP tool. Registered as the "notification_time" handler on the
shared pending-proposal store at import time.
"""
import logging
import re

from backend.core import pending_proposals
from backend.core.config import settings
from backend.core.memory.database import MemoryDB
from backend.core.scheduler import scheduler

logger = logging.getLogger(__name__)


async def confirm_notification_time(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Set the daily digest notification time and reschedule the job."""
    time = overrides.get("time")
    if time is None:
        time = payload["time"]

    if not re.match(r"^\d{2}:\d{2}$", time):
        raise ValueError("Invalid time format. Use HH:MM, e.g. '21:30'.")
    hour, minute = map(int, time.split(":"))
    valid_hour = 0 <= hour <= 23
    valid_minute = 0 <= minute <= 59
    if not (valid_hour and valid_minute):
        raise ValueError("Invalid time. Hour must be 0-23, minute 0-59.")

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

    return {"message": f"Notification time updated to {time}. Daily digest rescheduled."}


pending_proposals.register_handler("notification_time", confirm_notification_time)
