"""
Onboarding API — conversational budget setup flow.

POST /api/onboarding/message
    Body: {"message": str, "user_id": str = "default"}
    Auth: JWT (same as chat)
    Returns: StreamingResponse (text/plain)

The response is a plain text stream. JSON messages are emitted as single lines:
    {"type": "onboarding_question", "question_num": 1, "total": 15, "text": "..."}
    {"type": "onboarding_complete", "summary": "..."}
    {"type": "onboarding_cancelled", "message": "..."}
    {"type": "onboarding_parse_error", "text": "..."}
"""
import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core.config import settings
from backend.core.memory.database import MemoryDB
from backend.services.onboarding_service import OnboardingService

logger = logging.getLogger(__name__)
router = APIRouter()


# --- MemoryDB singleton (same pattern as other modules) ---

_memory_db: MemoryDB | None = None


def _get_memory_db() -> MemoryDB:
    global _memory_db
    if _memory_db is None:
        _memory_db = MemoryDB(settings.memory.db_path)
    return _memory_db


def _get_onboarding_service() -> OnboardingService:
    return OnboardingService(_get_memory_db())


# --- Request model ---

class OnboardingMessage(BaseModel):
    message: str
    user_id: str = "default"


# --- Streaming helpers ---

async def _stream_response(
    service_result: dict,
) -> AsyncGenerator[str, None]:
    """Convert the onboarding service result into a streamed response."""
    result_type = service_result.get("type", "error")

    if result_type == "question":
        payload: dict = {
            "type": "onboarding_question",
            "question_num": service_result["question_num"],
            "total": service_result["total"],
            "text": service_result["text"],
        }
        if service_result.get("options"):
            payload["options"] = service_result["options"]
        yield json.dumps(payload)
    elif result_type == "complete":
        yield json.dumps({
            "type": "onboarding_complete",
            "summary": service_result.get("summary", "Setup complete!"),
        })
    elif result_type == "cancelled":
        yield json.dumps({
            "type": "onboarding_cancelled",
            "message": service_result.get("text", "Onboarding cancelled."),
        })
    elif result_type == "parse_error":
        # Send the question again (same question_num)
        yield json.dumps({
            "type": "onboarding_question",
            "question_num": service_result.get("question_num", 1),
            "total": service_result.get("total", 15),
            "text": service_result["text"],
        })
    elif result_type == "error":
        yield json.dumps({
            "type": "onboarding_cancelled",
            "message": service_result.get("text", "An error occurred. Please restart onboarding."),
        })


# --- Endpoint ---

@router.get("/onboarding/status")
async def onboarding_status(
    current_user: str = Depends(get_current_user),
):
    """Return whether the current user has an active onboarding session."""
    service = _get_onboarding_service()
    user_id = current_user or "default"
    state = service.get_state(user_id)
    return {"active": state is not None and state.get("completed_at") is None}


@router.post("/onboarding/message")
async def onboarding_message(
    req: OnboardingMessage,
    current_user: str = Depends(get_current_user),
):
    """
    Process a message during the onboarding flow.
    
    The response is streamed as text/plain with JSON strings on single lines.
    The frontend detects `{"type": "onboarding_*"}` patterns to render accordingly.
    """
    service = _get_onboarding_service()
    
    # Use the authenticated user's ID if available, else the provided one
    user_id = current_user or req.user_id

    try:
        result = await service.process_message(user_id, req.message)
    except Exception as e:
        logger.exception("Onboarding error for user %s: %s", user_id, e)
        result = {"type": "error", "text": f"Internal error: {e}"}

    streaming_headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }

    return StreamingResponse(
        _stream_response(result),
        media_type="text/plain",
        headers=streaming_headers,
    )
