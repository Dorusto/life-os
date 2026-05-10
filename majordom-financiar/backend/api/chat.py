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
from backend.tools.registry import TOOLS, execute_tool

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
    """Fetch all financial context from Actual Budget in a single session."""
    client = ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )
    try:
        return await client.get_full_context()
    except Exception as e:
        logger.warning("Could not fetch financial context: %s", e)
        return {}


def _build_system_prompt(context: dict) -> str:
    """Format financial context into a readable system prompt."""
    lines = []

    accounts = context.get("accounts", [])
    if accounts:
        lines.append("### Accounts (use account_id when adding transactions)")
        for acc in accounts:
            lines.append(f"- {acc['name']} (account_id: {acc['id']}): €{acc['balance']:.2f}")

    categories = context.get("categories", [])
    if categories:
        lines.append("\n### Available categories (use exact name when adding transactions)")
        for cat in categories:
            lines.append(f"- {cat['name']}")

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

    system_prompt = f"""/no_think
You are Majordom, a concise and practical personal finance assistant.

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


async def _call_ollama_non_streaming(
    messages: list[dict], ollama_url: str, model: str
) -> dict:
    """Call Ollama without streaming, with tools. Returns full response dict."""
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "tools": TOOLS,
        "options": {
            "temperature": 0.3,
            "num_predict": 512,
        },
    }
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
        try:
            response = await client.post(f"{ollama_url}/api/chat", json=payload)
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="Cannot connect to Ollama. Is Ollama running?")
        if response.status_code != 200:
            raise HTTPException(status_code=503, detail=f"Ollama error {response.status_code}")
        return response.json()


@router.post("/chat")
async def chat_stream(
    req: ChatRequest,
    current_user: str = Depends(get_current_user),
):
    """
    Send messages to the financial assistant and get a streaming reply.

    Flow:
      1. First Ollama call (non-streaming) with tools — detects tool_calls
      2a. If tool_calls: execute tools → second Ollama call (streaming) for confirmation
      2b. If no tool_calls: yield the text response directly
    """
    context = await _fetch_financial_context()
    system_prompt = _build_system_prompt(context)

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend([{"role": m.role, "content": m.content} for m in req.messages])

    ollama_url = settings.ollama.url
    model = settings.ollama.chat_model or "qwen2.5:7b"

    streaming_headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }

    # Step 1: non-streaming call with tools
    try:
        first_response = await _call_ollama_non_streaming(messages, ollama_url, model)
    except HTTPException as e:
        async def error_gen():
            yield f"Error: {e.detail}"
        return StreamingResponse(error_gen(), media_type="text/plain", headers=streaming_headers)

    assistant_message = first_response.get("message", {})
    tool_calls = assistant_message.get("tool_calls") or []

    if tool_calls:
        messages.append({
            "role": "assistant",
            "content": assistant_message.get("content", ""),
            "tool_calls": tool_calls,
        })

        for tc in tool_calls:
            name = tc.get("function", {}).get("name", "")
            args = tc.get("function", {}).get("arguments", {})
            try:
                result = await execute_tool(name, args)
            except Exception as exc:
                logger.error("Tool execution failed: %s — %s", name, exc)
                result = f"Tool error: {exc}"
            messages.append({"role": "tool", "content": result})

        # Second call: streaming confirmation
        async def stream_after_tools():
            try:
                async for chunk in _stream_ollama_response(messages, ollama_url, model):
                    yield chunk
            except HTTPException as e:
                yield f"\n\nError: {e.detail}"
            except Exception as e:
                logger.error("Streaming error after tool execution: %s", e)
                yield "\n\nError: Internal server error"

        return StreamingResponse(stream_after_tools(), media_type="text/plain", headers=streaming_headers)

    # No tool calls — yield text directly
    text = assistant_message.get("content", "")

    async def yield_text():
        yield text

    return StreamingResponse(yield_text(), media_type="text/plain", headers=streaming_headers)
