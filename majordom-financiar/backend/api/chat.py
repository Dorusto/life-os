"""
Chat endpoint — financial assistant powered by local Ollama.

POST /api/chat  →  sends a message + history, returns assistant reply.

The backend fetches real financial context (accounts, monthly stats,
recent transactions) and injects it into the system prompt so the
model can answer questions about actual data without hallucinating.
"""
import logging
import json
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import httpx

from backend.api.auth import get_current_user
from backend.core.actual_client import ActualBudgetClient
from backend.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


class ChatMessage(BaseModel):
    role: str     # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = []
    message: str = ""
    history: list[ChatMessage] = []
    
    from pydantic import model_validator
    
    @model_validator(mode='before')
    @classmethod
    def normalize_messages(cls, data):
        """Accept both {messages: [...]} and {message: "...", history: [...]} formats."""
        if isinstance(data, dict):
            # If 'messages' is present, use it directly
            if 'messages' in data:
                return data
            # If 'message' is present, convert to messages format
            if 'message' in data:
                messages = []
                # Add history first
                history = data.get('history', [])
                for msg in history:
                    if isinstance(msg, dict):
                        messages.append(ChatMessage(**msg))
                    else:
                        messages.append(msg)
                # Add current user message
                messages.append(ChatMessage(role='user', content=data['message']))
                return {'messages': messages}
        return data
    
    @model_validator(mode='after')
    def validate_messages(self):
        """Ensure we have at least one user message."""
        if not self.messages:
            raise ValueError('No messages provided')
        # Ensure all messages are ChatMessage instances
        for i, msg in enumerate(self.messages):
            if not isinstance(msg, ChatMessage):
                if isinstance(msg, dict):
                    self.messages[i] = ChatMessage(**msg)
                else:
                    raise ValueError(f'Invalid message format at index {i}')
        return self


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
        txs = await client.get_recent_transactions(limit=20)  # last 20 transactions as requested
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


def _build_system_prompt(context: dict) -> str:
    """Format financial context into a readable system prompt."""
    lines = []

    accounts = context.get("accounts", [])
    if accounts:
        lines.append("### Accounts")
        for acc in accounts:
            lines.append(f"- {acc['name']}: €{acc['balance']:.2f}")

    stats = context.get("stats")
    if stats:
        lines.append(f"\n### Spending this month ({stats['month']}/{stats['year']})")
        lines.append(f"- Total: €{stats['total']:.2f} across {stats['count']} transactions")
        # Include all categories, not just top 5
        for cat_key, cat_data in stats.get("categories", {}).items():
            cat_name = cat_data.get("name", "Unknown")
            total = cat_data.get("total", 0.0)
            percentage = (total / stats['total'] * 100) if stats['total'] > 0 else 0
            lines.append(f"  - {cat_name}: €{total:.2f} ({percentage:.0f}%)")

    recent = context.get("recent_transactions", [])
    if recent:
        lines.append("\n### Last 20 transactions")
        for tx in recent[:20]:
            lines.append(f"- {tx['date']} · {tx['merchant']} · €{tx['amount']:.2f} ({tx.get('category') or 'uncategorized'})")

    from datetime import date
    financial_context = "\n".join(lines) if lines else "No financial data available yet."
    
    system_prompt = f"""You are Majordom, a concise and practical personal finance assistant.

## Your user's current financial snapshot
{financial_context}

## Rules
- Answer only financial questions. Politely decline off-topic requests.
- Be concise — 2-4 sentences unless detail is explicitly requested.
- Detect the user's language from their message and respond in the same language (Romanian, Dutch, or English).
- When referencing amounts, always use the € symbol.
- Never invent data — only use the snapshot above.

Today's date: {date.today().isoformat()}
"""
    return system_prompt


async def _stream_ollama_response(messages: list[dict], ollama_url: str, model: str) -> AsyncGenerator[str, None]:
    """Stream response from Ollama API."""
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "options": {
            "temperature": 0.3,
            "num_predict": 512,
        },
    }
    
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
        try:
            async with client.stream("POST", f"{ollama_url}/api/chat", json=payload) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    raise HTTPException(status_code=503, detail=f"Ollama error {response.status_code}: {error_text.decode()}")
                
                async for chunk in response.aiter_lines():
                    if chunk.strip():
                        try:
                            data = json.loads(chunk)
                            if "message" in data and "content" in data["message"]:
                                yield data["message"]["content"]
                            elif "response" in data:
                                yield data["response"]
                        except json.JSONDecodeError:
                            # Skip invalid JSON chunks
                            continue
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="Cannot connect to Ollama. Is Ollama running?")
        except Exception as e:
            logger.error("Streaming error: %s", e)
            raise HTTPException(status_code=500, detail="Failed to stream response from assistant")


@router.post("/chat")
async def chat_stream(
    req: ChatRequest,
    current_user: str = Depends(get_current_user),
):
    """
    Send messages to the financial assistant and get a streaming reply.
    
    Request body: { messages: [{role, content}] }  (full conversation history)
    Response: streaming text (text/plain)
    """
    # 1. Fetch financial context
    context = await _fetch_financial_context()
    
    # 2. Build system prompt
    system_prompt = _build_system_prompt(context)
    
    # 3. Prepend system message to messages
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend([{"role": m.role, "content": m.content} for m in req.messages])
    
    # 4. Stream from Ollama
    ollama_url = settings.ollama.url
    model = settings.ollama.chat_model or "qwen2.5:7b"
    
    async def stream_generator():
        try:
            async for chunk in _stream_ollama_response(messages, ollama_url, model):
                yield chunk
        except HTTPException as e:
            # Convert HTTPException to plain text error in stream
            yield f"\n\nError: {e.detail}"
        except Exception as e:
            logger.error("Unexpected streaming error: %s", e)
            yield "\n\nError: Internal server error"
    
    return StreamingResponse(
        stream_generator(),
        media_type='text/plain',
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        }
    )
