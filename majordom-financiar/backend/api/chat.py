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


def _build_system_prompt() -> str:
    from datetime import date
    return f"""You are Majordom, a concise personal finance assistant.

## Rules
- Answer only financial questions. Decline off-topic requests politely.
- Be concise — 2-4 sentences unless detail is requested.
- Respond in the same language the user writes in.
- Use € for all amounts.
- To record ANY transaction — expense or income — call propose_transaction immediately. Never describe it as text, never say "Added:", never ask for confirmation first.
  - "spent 50 euro at Lidl" → propose_transaction(payee="Lidl", amount=50)
  - "received 330 euro from Ana for photo services" → propose_transaction(payee="Ana", amount=330, is_expense=false)
  - "paid electricity bill 120 euro" → propose_transaction(payee="Electricity", amount=120)
- If the amount is missing from the user's message, call propose_clarification immediately — NEVER guess or invent an amount.
- To move budget between categories: call propose_budget_rebalance. Never describe it as text.
- To transfer money between accounts: call propose_account_transfer. Never describe it as text. Pass account names EXACTLY as the user stated them — do NOT substitute with known accounts. If an account is not in Actual Budget, the backend will ask for clarification.
- To answer questions about spending, balances, or budget: call the appropriate get_* tool first, then answer based on the result.
- Never invent financial data — always fetch it with a tool.

Today's date: {date.today().isoformat()}
"""


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


async def _call_ollama_non_streaming(messages: list[dict], ollama_url: str, model: str) -> dict:
    """Call Ollama without streaming. All tools available, tool_choice=auto."""
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "think": False,
        "tools": TOOLS,
        "tool_choice": "auto",
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


_PROPOSAL_TOOLS = {"propose_transaction", "propose_budget_rebalance", "propose_account_transfer", "propose_clarification", "propose_balance_adjustment"}


@router.post("/chat")
async def chat_stream(
    req: ChatRequest,
    current_user: str = Depends(get_current_user),
):
    """
    Flow:
      1. Ollama call (non-streaming) with all tools, tool_choice=auto
      2a. proposal tool called → return JSON card to frontend immediately
      2b. query tool(s) called → execute, append results, repeat up to 3 rounds
      2c. no tool calls → stream text response
    """
    messages = [{"role": "system", "content": _build_system_prompt()}]
    messages.extend([{"role": m.role, "content": m.content} for m in req.messages])

    ollama_url = settings.ollama.url
    model = settings.ollama.chat_model or "qwen2.5:7b"

    streaming_headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }

    # Up to 3 rounds of query tool calls before streaming the final answer
    for _ in range(3):
        try:
            response = await _call_ollama_non_streaming(messages, ollama_url, model)
        except HTTPException as e:
            detail = e.detail
            async def error_gen():
                yield f"Error: {detail}"
            return StreamingResponse(error_gen(), media_type="text/plain", headers=streaming_headers)

        assistant_message = response.get("message", {})
        tool_calls = assistant_message.get("tool_calls") or []
        logger.info("LLM — tools=%s", [tc.get("function", {}).get("name") for tc in tool_calls])

        if not tool_calls:
            break

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

            if name in _PROPOSAL_TOOLS:
                async def yield_proposal(r=result):
                    yield r
                return StreamingResponse(yield_proposal(), media_type="text/plain", headers=streaming_headers)

            messages.append({"role": "tool", "content": result})

    # Stream the final text response (either direct answer or after query tools)
    async def stream_response():
        text = assistant_message.get("content", "")
        if text:
            yield text
        else:
            try:
                async for chunk in _stream_ollama_response(messages, ollama_url, model):
                    yield chunk
            except HTTPException as e:
                yield f"Error: {e.detail}"
            except Exception as e:
                logger.error("Streaming error: %s", e)
                yield "Error: Internal server error"

    return StreamingResponse(stream_response(), media_type="text/plain", headers=streaming_headers)
