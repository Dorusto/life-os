"""
Chat history API — persistent server-side message storage.

All endpoints require authentication via get_current_user.
The user_id is the username string from the JWT token.
"""
import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core.config import settings
from backend.core.memory.database import MemoryDB

logger = logging.getLogger(__name__)
router = APIRouter()


class ChatHistoryMessage(BaseModel):
    role: str
    content: str


def _get_db() -> MemoryDB:
    return MemoryDB(settings.memory.db_path)


@router.get("/chat/history")
async def get_chat_history(
    current_user: str = Depends(get_current_user),
):
    """Return last 100 messages for the current user, oldest first."""
    db = _get_db()
    rows = db.get_chat_history(current_user, limit=100)
    return [
        {"role": r["role"], "content": r["content"], "ts": r["ts"]}
        for r in rows
    ]


@router.post("/chat/history")
async def save_chat_history(
    messages: list[ChatHistoryMessage],
    current_user: str = Depends(get_current_user),
):
    """Append one or more messages for the current user and trim to last 500."""
    db = _get_db()
    saved = db.save_chat_messages(
        current_user,
        [{"role": m.role, "content": m.content} for m in messages],
    )
    return {"saved": saved}


@router.delete("/chat/history")
async def clear_chat_history(
    current_user: str = Depends(get_current_user),
):
    """Delete all chat messages for the current user."""
    db = _get_db()
    db.clear_chat_history(current_user)
    return {"cleared": True}
