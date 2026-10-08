import json
import re

from backend.core import pending_proposals


async def set_notification_time(time: str) -> str:
    """
    Propose changing the daily notification time.
    Returns a confirmation card — does NOT write yet.
    """
    if not re.match(r"^\d{2}:\d{2}$", time):
        return json.dumps({
            "type": "needs_input",
            "missing": ["time"],
            "message": "Invalid time format. Use HH:MM, e.g. '21:30'.",
        })

    hour, minute = map(int, time.split(":"))
    valid_hour = 0 <= hour <= 23
    valid_minute = 0 <= minute <= 59
    if not (valid_hour and valid_minute):
        return json.dumps({
            "type": "needs_input",
            "missing": ["time"],
            "message": "Invalid time. Hour must be 0-23, minute 0-59.",
        })

    proposal_id = pending_proposals.create(
        "notification_time",
        {"time": time},
        created_by=None,
    )

    return json.dumps({
        "type": "notification_time",
        "id": proposal_id,
        "time": time,
    })
