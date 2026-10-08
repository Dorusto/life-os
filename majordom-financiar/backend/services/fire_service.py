"""
FireService — the write logic for a confirmed set_fire_model proposal.

Moved out of the FastAPI handler in backend/api/category_actions.py so the same
code runs whether the confirmation came from the PWA card, a plain HTTP call, or
an MCP tool. Registered as the "set_fire_model" handler on the shared
pending-proposal store at import time.
"""
import json
import logging

from backend.core import pending_proposals
from backend.core.config import settings
from backend.core.memory.database import MemoryDB

logger = logging.getLogger(__name__)

_FIRE_FIELDS = (
    "years_to_transition",
    "years_in_retirement",
    "monthly_contribution",
    "accumulation_return",
    "decumulation_return",
    "desired_monthly_spend",
)


async def confirm_set_fire_model(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed set_fire_model proposal.

    `overrides` (the PWA card's edited fields) win over `payload` (what
    propose_set_fire_model stored). Each field is only replaced when it is not
    None — never on truthiness.

    Returns {"message": <result text>, "errors": []}.
    """
    merged = dict(payload["new"])
    for field in _FIRE_FIELDS:
        if overrides.get(field) is not None:
            merged[field] = overrides[field]

    MemoryDB(settings.memory.db_path).set_preference("fire_model", json.dumps(merged))

    # Build a summary of what changed
    current = payload["current"]
    changed_parts = []
    for key in _FIRE_FIELDS:
        old_val = current.get(key)
        new_val = merged[key]
        if old_val != new_val:
            if key in ("accumulation_return", "decumulation_return"):
                changed_parts.append(f"{key.replace('_', ' ')} {old_val*100:.0f}% → {new_val*100:.0f}%")
            elif key == "desired_monthly_spend":
                changed_parts.append(f"desired monthly spend €{old_val:.0f} → €{new_val:.0f}")
            elif key == "monthly_contribution":
                changed_parts.append(f"monthly contribution €{old_val:.0f} → €{new_val:.0f}")
            elif key == "years_to_transition":
                changed_parts.append(f"horizon {old_val:.0f}y → {new_val:.0f}y")
            elif key == "years_in_retirement":
                changed_parts.append(f"retirement {old_val:.0f}y → {new_val:.0f}y")

    if changed_parts:
        message = "FIRE assumptions updated: " + ", ".join(changed_parts) + "."
    else:
        message = "No changes made."
    return {"message": message, "errors": []}


pending_proposals.register_handler("set_fire_model", confirm_set_fire_model)
