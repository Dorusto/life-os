"""
Chat endpoint — financial assistant powered by local/cloud LLM.

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

**CRITICAL — never lie about actions:**
NEVER say "I've logged", "I've added", "I've saved", "Done", or any confirmation of an action in plain text.
If an action requires writing data (transaction, refuel, transfer, budget change), you MUST call the appropriate tool.
The tool opens a confirmation card — the user confirms before anything is saved.
A text response claiming an action was done WITHOUT calling a tool = wrong behavior.

- Answer only financial questions. Decline off-topic requests politely.
- Be concise — 2-4 sentences unless detail is requested.
- Respond in the same language the user writes in.
- Use € for all amounts.
- When the user asks about a vehicle (plate, profile, stats, consumption, costs, APK/insurance dates) — call get_vehicle_stats immediately. Never say you don't have access to vehicle info.
- When the user mentions APK, ITP, MOT, or car/moto insurance expiry date — call set_vehicle_reminder immediately.
- When the user mentions service interval (every N km or N months) or last service info — call set_service_interval immediately.
  - "Cora service every 15000 km or 12 months, last service at 48000 km" → set_service_interval(vehicle_name="Cora", interval_km=15000, interval_months=12, last_service_km=48000)
  - "APK Cora expires September 2026" → set_vehicle_reminder(vehicle_name="Cora", reminder_type="apk", due_date="2026-09-01")
  - "insurance for Wabi Sabi until March 15" → set_vehicle_reminder(vehicle_name="Wabi Sabi", reminder_type="insurance", due_date="2026-03-15")
- When the user mentions refueling / filling up / tanking fuel — call log_refuel immediately. Never use propose_transaction for fuel. Never describe it as text.
  - "I refueled 31L at Shell for €70, odo 51000" → log_refuel(liters=31, total_eur=70, location="Shell", odo_km=51000)
  - "am alimentat 40L cu €80 din Tango" → log_refuel(liters=40, total_eur=80, location="Tango")
  - "tanked up Wabi Sabi, 12L €22" → log_refuel(liters=12, total_eur=22, vehicle_name="Wabi Sabi")
- To record ANY other transaction — expense or income — call propose_transaction immediately. Never describe it as text, never say "Added:", never ask for confirmation first.
  - "spent 50 euro at Lidl" → propose_transaction(payee="Lidl", amount=50)
  - "received 330 euro from Ana for photo services" → propose_transaction(payee="Ana", amount=330, is_expense=false)
  - "paid electricity bill 120 euro" → propose_transaction(payee="Electricity", amount=120)
- If the amount is missing from the user's message, call propose_clarification immediately — NEVER guess or invent an amount.
- To move budget between categories: call propose_budget_rebalance. Never describe it as text.
- To set a category budget to a specific euro amount: call propose_set_category_budget. Use this when the user mentions a number + category (e.g. "set Transport to €110", "put €300 in Groceries"). NEVER call rename_category for this — rename is only for changing a category's name, not its amount.
- To transfer money between accounts: call propose_account_transfer. Never describe it as text. Pass account names EXACTLY as the user stated them — do NOT substitute with known accounts. If an account is not in Actual Budget, the backend will ask for clarification.
- To answer questions about spending, balances, or budget: call the appropriate get_* tool first, then answer based on the result.
- Never invent financial data — always fetch it with a tool.

Today's date: {date.today().isoformat()}
"""


def _build_headers() -> dict[str, str]:
    """Build HTTP headers with optional Authorization for cloud APIs."""
    headers = {"Content-Type": "application/json"}
    if settings.ollama.api_key:
        headers["Authorization"] = f"Bearer {settings.ollama.api_key}"
    return headers


_PROPOSAL_TOOLS = {"propose_transaction", "propose_budget_rebalance", "propose_account_transfer", "propose_clarification", "propose_balance_adjustment", "rename_category", "delete_category", "set_account_goal", "create_category", "setup_default_groups", "log_refuel", "delete_vehicle_log_entry", "set_vehicle_reminder", "set_service_interval", "propose_set_category_budget"}


async def _stream_with_tools(
    messages: list[dict],
    llm_url: str,
    model: str,
) -> AsyncGenerator[str, None]:
    """
    Stream LLM response while transparently handling tool calls.

    Text chunks are yielded immediately as they arrive (real-time streaming).
    Tool call deltas are accumulated in the background. When the stream ends:
    - no tools → done (text was already streamed)
    - query tools → execute, append results, loop up to 3 rounds
    - proposal tools → yield the JSON card and return
    """
    current_messages = list(messages)

    for _ in range(3):
        accumulated_content = ""
        tool_calls_partial: dict[int, dict] = {}

        payload = {
            "model": model,
            "messages": current_messages,
            "stream": True,
            "tools": TOOLS,
            "tool_choice": "auto",
        }
        headers = _build_headers()

        async with httpx.AsyncClient(timeout=httpx.Timeout(300.0)) as client:
            try:
                async with client.stream(
                    "POST", f"{llm_url}/v1/chat/completions",
                    json=payload, headers=headers,
                ) as response:
                    if response.status_code != 200:
                        err = await response.aread()
                        raise HTTPException(
                            status_code=503,
                            detail=f"LLM error {response.status_code}: {err.decode()}",
                        )

                    async for line in response.aiter_lines():
                        if not line.strip():
                            continue
                        if line.startswith("data: "):
                            line = line[6:]
                        if line == "[DONE]":
                            break
                        try:
                            data = json.loads(line)
                        except json.JSONDecodeError:
                            continue

                        delta = data.get("choices", [{}])[0].get("delta", {})

                        content = delta.get("content") or ""
                        if content:
                            accumulated_content += content
                            yield content

                        for tc_delta in delta.get("tool_calls") or []:
                            idx = tc_delta.get("index", 0)
                            if idx not in tool_calls_partial:
                                tool_calls_partial[idx] = {
                                    "id": "",
                                    "type": "function",
                                    "function": {"name": "", "arguments": ""},
                                }
                            tc = tool_calls_partial[idx]
                            if tc_delta.get("id"):
                                tc["id"] = tc_delta["id"]
                            fn = tc_delta.get("function", {})
                            if fn.get("name"):
                                tc["function"]["name"] += fn["name"]
                            if fn.get("arguments"):
                                tc["function"]["arguments"] += fn["arguments"]

            except HTTPException:
                raise
            except httpx.ConnectError:
                raise HTTPException(status_code=503, detail="Cannot connect to LLM. Is the provider running?")
            except Exception as e:
                logger.error("Streaming error: %s", e)
                raise HTTPException(status_code=500, detail="Failed to stream response from assistant")

        if not tool_calls_partial:
            return

        tool_calls = [tool_calls_partial[i] for i in sorted(tool_calls_partial.keys())]
        logger.info("LLM — tools=%s", [tc["function"]["name"] for tc in tool_calls])

        current_messages.append({
            "role": "assistant",
            "content": accumulated_content or None,
            "tool_calls": tool_calls,
        })

        for tc in tool_calls:
            name = tc["function"]["name"]
            args_raw = tc["function"]["arguments"]
            try:
                args = json.loads(args_raw) if isinstance(args_raw, str) else args_raw
            except (json.JSONDecodeError, ValueError):
                args = {}

            try:
                result = await execute_tool(name, args)
            except Exception as exc:
                logger.error("Tool execution failed: %s — %s", name, exc)
                result = f"Tool error: {exc}"

            if name in _PROPOSAL_TOOLS:
                yield result
                return

            current_messages.append({
                "role": "tool",
                "content": result,
                "tool_call_id": tc["id"],
            })


@router.post("/chat")
async def chat_stream(
    req: ChatRequest,
    current_user: str = Depends(get_current_user),
):
    MAX_CONTEXT = 10
    history = req.messages[-MAX_CONTEXT:] if len(req.messages) > MAX_CONTEXT else req.messages

    messages = [{"role": "system", "content": _build_system_prompt()}]
    messages.extend([{"role": m.role, "content": m.content} for m in history])

    llm_url = settings.ollama.base_url
    model = settings.ollama.chat_model or "qwen2.5:7b"

    streaming_headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }

    async def response_generator():
        try:
            async for chunk in _stream_with_tools(messages, llm_url, model):
                yield chunk
        except HTTPException as e:
            yield f"Error: {e.detail}"
        except Exception as e:
            logger.error("Chat error: %s", e)
            yield "Error: Internal server error"

    return StreamingResponse(response_generator(), media_type="text/plain", headers=streaming_headers)
