"""
Chat endpoint — financial assistant powered by local Ollama.

POST /api/chat  →  sends a message + history, returns assistant reply.

The backend fetches real financial context (accounts, monthly stats,
recent transactions) and injects it into the system prompt so the
model can answer questions about actual data without hallucinating.
"""
import logging
import json
import re
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

    system_prompt = f"""You are Majordom, a concise personal finance assistant.

## Financial snapshot
{financial_context}

## Rules
- Answer only financial questions. Decline off-topic requests politely.
- Be concise — 2-4 sentences unless detail is requested.
- Respond in the same language as the user (Romanian, Dutch, or English).
- Use € for all amounts. Never invent data not in the snapshot above.
- To record a transaction: call propose_transaction. Never describe it as text.
- To move budget between categories: call propose_budget_rebalance. Never describe it as text.
- To transfer money between bank accounts: call propose_account_transfer. Never describe it as text.
- For all other questions: answer directly. Do not call any tool.

Today's date: {date.today().isoformat()}
"""
    return system_prompt


async def _stream_ollama_response(messages: list[dict], ollama_url: str, model: str) -> AsyncGenerator[str, None]:
    """Stream response from Ollama API."""
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "think": False,
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


_AMOUNT_RE = re.compile(r'\b\d+[\.,]?\d*\s*(de\s+)?(euro|eur|€|\$|lei|ron)\b', re.IGNORECASE)
# Keywords that indicate budget rebalance or account transfer — skip force_tool for these
_TRANSFER_RE = re.compile(
    r'\b(mut[ăa]|transfer[a]?|rebalans|din\s+\w+\s+(î?n|la|spre)\s+\w+|buget|categorie)\b',
    re.IGNORECASE
)
_TRANSACTION_ACTION_RE = re.compile(
    r'\b(cheltuit|platit|pl[ăa]tit|cump[ăa]rat|primit|spent|paid|bought|received|adaug[ăa]|înregistr)\b',
    re.IGNORECASE
)


def _detect_intent(text: str) -> str:
    """Returns 'transaction', 'action' (transfer/rebalance), or 'info'."""
    has_amount = bool(_AMOUNT_RE.search(text))
    has_transfer = bool(_TRANSFER_RE.search(text))
    has_tx_action = bool(_TRANSACTION_ACTION_RE.search(text))
    if has_transfer:
        return 'action'
    if has_amount and has_tx_action:
        return 'transaction'
    return 'info'


async def _call_ollama_non_streaming(
    messages: list[dict], ollama_url: str, model: str, intent: str = 'info'
) -> dict:
    """Call Ollama without streaming.
    intent: 'transaction' → only propose_transaction, required
            'action'      → all tools, auto
            'info'        → no tools
    """
    if intent == 'transaction':
        tools = [t for t in TOOLS if t["function"]["name"] == "propose_transaction"]
        tool_choice = "required"
    elif intent == 'action':
        tools = TOOLS
        tool_choice = "auto"
    else:
        tools = []
        tool_choice = "none"
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "think": False,
        "tools": tools,
        "tool_choice": tool_choice,
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

    user_text = req.messages[-1].content if req.messages else ""
    intent = _detect_intent(user_text)

    # Info queries don't need tool detection — stream directly for real-time output
    if intent == 'info':
        async def stream_info():
            try:
                async for chunk in _stream_ollama_response(messages, ollama_url, model):
                    yield chunk
            except HTTPException as e:
                yield f"Error: {e.detail}"
            except Exception as e:
                logger.error("Streaming error (info): %s", e)
                yield "Error: Internal server error"
        return StreamingResponse(stream_info(), media_type="text/plain", headers=streaming_headers)

    try:
        first_response = await _call_ollama_non_streaming(messages, ollama_url, model, intent=intent)
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

            # propose_transaction / propose_budget_rebalance returns JSON — send directly to frontend, skip second LLM call
            if name in ("propose_transaction", "propose_budget_rebalance", "propose_account_transfer", "propose_clarification"):
                async def yield_proposal(r=result):
                    yield r
                return StreamingResponse(yield_proposal(), media_type="text/plain", headers=streaming_headers)

            messages.append({"role": "tool", "content": result})

        # Second call: streaming confirmation (for future non-proposal tools)
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

    # No tool calls despite transaction/action intent — stream the text response
    async def stream_fallback():
        text = assistant_message.get("content", "")
        if text:
            yield text
        else:
            async for chunk in _stream_ollama_response(messages, ollama_url, model):
                yield chunk

    return StreamingResponse(stream_fallback(), media_type="text/plain", headers=streaming_headers)
