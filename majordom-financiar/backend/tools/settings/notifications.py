import json
import re
import uuid

async def set_notification_time(time: str) -> str:
    """
    Propose changing the daily notification time.
    Returns a confirmation card — does NOT write yet.
    """
    from backend.tools import notification_actions as action_store

    if not re.match(r"^\d{2}:\d{2}$", time):
        return "Invalid time format. Use HH:MM, e.g. '21:30'."

    hour, minute = map(int, time.split(":"))
    valid_hour = 0 <= hour <= 23
    valid_minute = 0 <= minute <= 59
    if not (valid_hour and valid_minute):
        return "Invalid time. Hour must be 0-23, minute 0-59."

    action_id = uuid.uuid4().hex[:8]
    action_store.store(action_id, {"time": time})

    return json.dumps({
        "type": "notification_time",
        "id": action_id,
        "time": time,
    })
