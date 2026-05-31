"""
Vehicle log action endpoints — confirm or cancel a pending delete proposal.

POST /api/vehicle-log-actions/{id}/confirm
POST /api/vehicle-log-actions/{id}/cancel
"""
import logging
import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from backend.api.auth import get_current_user
from backend.tools import vehicle_log_actions as action_store
from backend.core.config import settings

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
    conn = sqlite3.connect(settings.memory.db_path)
    try:
        row = conn.execute("SELECT id FROM vehicle_log WHERE id = ?", (entry_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Entry #{entry_id} not found")
        conn.execute("DELETE FROM vehicle_log WHERE id = ?", (entry_id,))
        conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete vehicle log entry %s: %s", entry_id, e)
        raise HTTPException(status_code=500, detail="Failed to delete vehicle log entry")
    finally:
        conn.close()
        action_store.delete(action_id)

    return {"message": f"Vehicle log entry #{entry_id} deleted."}


@router.post("/vehicle-log-actions/{action_id}/cancel")
async def cancel_vehicle_log_action(
    action_id: str,
    current_user: str = Depends(get_current_user),
):
    action_store.delete(action_id)
    return {"cancelled": True}
