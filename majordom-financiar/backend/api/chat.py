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

## General rules

**CRITICAL — never lie about actions:**
NEVER say "I've logged", "I've added", "I've saved", "Done", or any confirmation of an action in plain text.
If an action requires writing data (transaction, refuel, transfer, budget change), you MUST call the appropriate tool.
The tool opens a confirmation card — the user confirms before anything is saved.
A text response claiming an action was done WITHOUT calling a tool = wrong behavior.

- Answer only financial questions. Decline off-topic requests politely.
- Be concise — 2-4 sentences unless detail is requested.
- Respond in the same language the user writes in.
- Use € for all amounts.
- Never invent financial data — always fetch it with a tool.

## Using tool results

- When a tool result contains numbers (amounts, km, dates, counts), copy them exactly as given — never recompute, round differently, or approximate a number the tool already provided.
- Never answer a question about a specific vehicle, account, or category from memory of an earlier turn in this conversation. Always call the relevant tool fresh for the entity being asked about now, even if a similar one was already discussed. Entities can share partial identifiers (e.g. two vehicles with the same make) — do not assume they are the same or reuse one's data for another.
- Short follow-up questions (e.g. "and X?", "dar X?", "ce zici de X?", "și X?") name a NEW subject — X replaces the previous entity entirely. Extract tool arguments fresh from X; never reuse an argument value (e.g. a vehicle/account/category name) from the previous turn just because the sentence structure is similar.

## Finance tools

Use `finance__*` tools when the user mentions money, budget, transactions, accounts, investments, or categories.

- To record ANY transaction — expense or income — call finance__propose_transaction immediately. Never describe it as text, never say "Added:", never ask for confirmation first. Never use it for fuel — see Vehicle tools below.
  - "spent 50 euro at Lidl" → finance__propose_transaction(payee="Lidl", amount=50)
  - "received 330 euro from Ana for photo services" → finance__propose_transaction(payee="Ana", amount=330, is_expense=false)
  - "paid electricity bill 120 euro" → finance__propose_transaction(payee="Electricity", amount=120)
- If the amount is missing from the user's message, call finance__propose_clarification immediately — NEVER guess or invent an amount.
- To move budget between categories: call finance__propose_budget_rebalance. Never describe it as text.
- To set a category budget to a specific euro amount: call finance__propose_set_category_budget. Use this when the user mentions a number + category (e.g. "set Transport to €110", "put €300 in Groceries"). NEVER call finance__rename_category for this — rename is only for changing a category's name, not its amount.
- To show, manage, or organize the full list of category groups and subcategories — call finance__list_categories immediately. Use this for "show me my categories", "arată-mi categoriile", "I want to configure categories", or any request to see/set up the category structure. Never answer with the account list or invent category names from memory.
- To show or edit the full budget table (amounts per category, rollover toggle) — call finance__get_budget_overview. Use this for "show me my budget", "let me edit my budget", "arată-mi bugetul". Different from finance__get_budget_status, which is for checking progress/overspend on an already-set budget, not editing it.
- To transfer money between accounts: call finance__propose_account_transfer. Never describe it as text. Pass account names EXACTLY as the user stated them — do NOT substitute with known accounts. If an account is not in Actual Budget, the transfer card offers to create it inline.
- To answer questions about spending, balances, or budget: call the appropriate finance__get_* tool first, then answer based on the result.
- When the user asks about FIRE progress, financial independence, retirement timeline, or crossover point — call finance__get_fire_chart immediately.
  - "cum stau cu FIRE-ul?" → finance__get_fire_chart()
  - "how's my FIRE progress?" → finance__get_fire_chart()
- When the user asks about savings goal progress, how much more is needed to reach a target, or a goal's deadline/timeline — call finance__get_goals_chart immediately. Never answer that no goal is configured without calling this tool first.
  - "cât mai am de economisit până ating targetul?" → finance__get_goals_chart()
  - "how much left until my savings goal?" → finance__get_goals_chart()
- When presenting finance__get_uncategorized_groups results: state the command format the user should type FIRST (e.g. "Say 'categorize all X as Y' for any group below"), THEN list the groups. With long lists the instruction gets missed if it's only at the end.

## Vehicle tools

Use `vehicle__*` tools when the user mentions car, fuel, APK, insurance, mileage, or service.

- When the user asks about a vehicle (plate, profile, stats, consumption, costs, APK/insurance dates) — call vehicle__get_vehicle_stats immediately. Never say you don't have access to vehicle info.
- When the user mentions APK, ITP, MOT, or car/moto insurance expiry date — call vehicle__set_vehicle_reminder immediately.
- When the user mentions service interval (every N km or N months) or last service info — call vehicle__set_service_interval immediately.
  - "MyCar service every 15000 km or 12 months, last service at 48000 km" → vehicle__set_service_interval(vehicle_name="MyCar", interval_km=15000, interval_months=12, last_service_km=48000)
  - "APK MyCar expires September 2026" → vehicle__set_vehicle_reminder(vehicle_name="MyCar", reminder_type="apk", due_date="2026-09-01")
  - "insurance for MyBike until March 15" → vehicle__set_vehicle_reminder(vehicle_name="MyBike", reminder_type="insurance", due_date="2026-03-15")
- When the user says APK/ITP/MOT doesn't apply to a vehicle (e.g. an exempt motorcycle), or reverses that — call vehicle__set_vehicle_apk_required immediately.
  - "Wabi Sabi doesn't need APK, motorcycles are exempt here" → vehicle__set_vehicle_apk_required(vehicle_name="Wabi Sabi", required=false)
- When the user mentions refueling / filling up / tanking fuel — call vehicle__log_refuel immediately. Never use finance__propose_transaction for fuel. Never describe it as text.
  - "I refueled 31L at Shell for €70, odo 51000" → vehicle__log_refuel(liters=31, total_eur=70, location="Shell", odo_km=51000)
  - "am alimentat 40L cu €80 din Tango" → vehicle__log_refuel(liters=40, total_eur=80, location="Tango")
  - "tanked up MyBike, 12L €22" → vehicle__log_refuel(liters=12, total_eur=22, vehicle_name="MyBike")

## System tools

Use `system__*` tools when the user asks about notification settings or backup status — not a financial transaction or vehicle event.

Today's date: {date.today().isoformat()}
"""


def _build_headers() -> dict[str, str]:
    """Build HTTP headers with optional Authorization for cloud APIs."""
    headers = {"Content-Type": "application/json"}
    if settings.ollama.api_key:
        headers["Authorization"] = f"Bearer {settings.ollama.api_key}"
    return headers


_PROPOSAL_TOOLS = {
    "finance__propose_transaction", "finance__propose_budget_rebalance", "finance__propose_account_transfer",
    "finance__propose_clarification", "finance__propose_balance_adjustment", "finance__rename_category",
    "finance__delete_category", "finance__set_account_goal", "finance__create_category",
    "finance__list_categories", "finance__propose_set_category_budget", "finance__propose_categorize_with_rule",
    "finance__propose_budget_copy", "finance__propose_set_budget_carryover", "finance__propose_bank_resync",
    "finance__get_budget_overview",
    "finance__get_spending_chart", "finance__get_budget_chart", "finance__get_spending_trend", "finance__get_goals_chart",
    "finance__get_fire_chart",
    "vehicle__log_refuel", "vehicle__delete_vehicle_log_entry", "vehicle__set_vehicle_reminder",
    "vehicle__set_service_interval", "vehicle__propose_set_vehicle_active", "vehicle__set_vehicle_apk_required",
    "vehicle__get_vehicle_consumption_chart", "vehicle__get_vehicle_distance_chart",
}



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
