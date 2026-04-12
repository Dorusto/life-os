"""
Chat endpoint — financial assistant powered by local Ollama.

POST /api/chat  →  sends a message + history, returns assistant reply.

The backend fetches real financial context (accounts, monthly stats,
recent transactions) and injects it into the system prompt so the
model can answer questions about actual data without hallucinating.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core.actual_client import ActualBudgetClient
from backend.core.config import settings
from backend.services.chat_service import ChatService

logger = logging.getLogger(__name__)
router = APIRouter()


class ChatMessage(BaseModel):
    role: str     # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    reply: str


async def _fetch_financial_context() -> dict:
    """Fetch accounts + stats + recent transactions from Actual Budget."""
    client = ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )
    context: dict = {}
    try:
        accounts = await client.get_accounts()
        context["accounts"] = [
            {"name": acc.name, "balance": acc.balance} for acc in accounts
        ]
    except Exception as e:
        logger.warning("Could not fetch accounts for chat context: %s", e)

    try:
        stats = await client.get_monthly_stats()
        context["stats"] = stats
    except Exception as e:
        logger.warning("Could not fetch stats for chat context: %s", e)

    try:
        txs = await client.get_recent_transactions(limit=10)
        context["recent_transactions"] = [
            {
                "date": tx["date"],
                "merchant": tx["merchant"] or "Unknown",
                "amount": abs(tx["amount_cents"]) / 100,
                "category": tx.get("category_name"),
            }
            for tx in txs
        ]
    except Exception as e:
        logger.warning("Could not fetch transactions for chat context: %s", e)

    return context


@router.post("/chat", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    current_user: str = Depends(get_current_user),
):
    """Send a message to the financial assistant and get a reply."""
    context = await _fetch_financial_context()

    service = ChatService()
    history = [{"role": m.role, "content": m.content} for m in req.history]

    try:
        reply = await service.chat(
            message=req.message,
            history=history,
            context=context,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error("Unexpected chat error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get response from assistant")

    return ChatResponse(reply=reply)
