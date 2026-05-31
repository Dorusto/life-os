import re

from backend.core.config import settings
from backend.core.memory.database import MemoryDB
from backend.core.scheduler import scheduler
async def set_notification_time(time: str) -> str:
    """Change the daily notification time and reschedule APScheduler."""
    try:
        if not re.match(r"^\d{2}:\d{2}$", time):
            return "Invalid time format. Use HH:MM, e.g. '21:30'."

        hour, minute = map(int, time.split(":"))
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            return "Invalid time. Hour must be 0-23, minute 0-59."

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

        return f"Notification time updated to {time}. Daily digest rescheduled."

    except Exception as e:
        return f"Failed to update notification time: {e}"
