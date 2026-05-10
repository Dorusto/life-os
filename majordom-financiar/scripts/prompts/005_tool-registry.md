# Task: Tool Registry — add_transaction via native Ollama tool calling

## Context

Majordom is a personal finance assistant built on FastAPI + React PWA + Ollama (local LLM).

The chat endpoint (`backend/api/chat.py`) currently:
1. Fetches financial context from Actual Budget
2. Builds a system prompt with that context
3. Sends messages to Ollama with `stream: true`
4. Streams the text response to the client

**The problem:** The LLM can only READ data (from the system prompt snapshot). It cannot ADD transactions to Actual Budget. The user says "I spent €47 at Lidl" and gets a text reply — nothing actually happens.

**The goal:** Implement native Ollama tool calling so the LLM can call `add_transaction` and actually write data to Actual Budget.

The Ollama API supports native tool calling: you pass `tools: [...]` in the request body, and the model may return `tool_calls` in the response instead of (or in addition to) text. The backend executes the tool, appends the result, and calls Ollama again to get the final confirmation text.

We tested this and confirmed `qwen2.5:7b` supports native tool calling via Ollama.

---

## Files to create

### `backend/tools/__init__.py`
Empty file.

### `backend/tools/finance/__init__.py`
Empty file.

### `backend/tools/finance/actual_budget.py`

This file wraps the existing `ActualBudgetClient.add_transaction()` method into a callable tool function.

```python
"""
Finance tools — Actual Budget write operations.

These functions are called by execute_tool() in registry.py
after the LLM decides to use them.
"""
from datetime import date as _date

from backend.core.actual_client import ActualBudgetClient
from backend.core.config import settings


def _get_client() -> ActualBudgetClient:
    return ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )


async def add_transaction(
    merchant: str,
    amount: float,
    date: str,
    category_name: str,
    account_id: str,
    notes: str = "",
) -> str:
    """
    Add an expense to Actual Budget.
    Returns a human-readable result string (success or duplicate).
    """
    client = _get_client()
    try:
        tx_date = _date.fromisoformat(date)
    except ValueError:
        tx_date = _date.today()

    tx_id = await client.add_transaction(
        account_id=account_id,
        amount=amount,
        payee=merchant,
        category_name=category_name,
        tx_date=tx_date,
        notes=notes,
    )

    if tx_id:
        return (
            f"Transaction added successfully: {merchant} €{amount:.2f} "
            f"on {tx_date.isoformat()} (category: {category_name})"
        )
    return (
        f"Duplicate skipped — transaction already exists: "
        f"{merchant} €{amount:.2f} on {tx_date.isoformat()}"
    )
```

### `backend/tools/registry.py`

This file defines the TOOLS list in the Ollama API format and the `execute_tool()` dispatcher.

```python
"""
Tool registry — defines tools exposed to the LLM and dispatches their execution.

TOOLS: list of tool definitions in Ollama/OpenAI format.
       Passed directly in the Ollama API request body as `tools: TOOLS`.

execute_tool(): called by the chat endpoint when the LLM returns tool_calls.
"""
from typing import Any


TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "add_transaction",
            "description": (
                "Add a new expense or income to Actual Budget. "
                "Use this when the user says they spent money at a store or received money. "
                "Always confirm the details before calling if any field is ambiguous."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "merchant": {
                        "type": "string",
                        "description": "Store or merchant name, e.g. 'Lidl', 'Shell', 'Albert Heijn'",
                    },
                    "amount": {
                        "type": "number",
                        "description": "Amount in EUR, always positive, e.g. 47.50",
                    },
                    "date": {
                        "type": "string",
                        "description": (
                            "Transaction date in YYYY-MM-DD format. "
                            "Use today's date if the user did not specify one."
                        ),
                    },
                    "category_name": {
                        "type": "string",
                        "description": (
                            "Category name — must match exactly one of the available categories "
                            "listed in the system prompt."
                        ),
                    },
                    "account_id": {
                        "type": "string",
                        "description": (
                            "Account ID — must match exactly one of the available account IDs "
                            "listed in the system prompt."
                        ),
                    },
                    "notes": {
                        "type": "string",
                        "description": "Optional notes about the transaction.",
                    },
                },
                "required": ["merchant", "amount", "date", "category_name", "account_id"],
            },
        },
    }
]


async def execute_tool(name: str, arguments: dict[str, Any]) -> str:
    """
    Dispatch a tool call by name. Returns a human-readable result string
    that is appended to the conversation as a tool message before the
    LLM generates its final reply.
    """
    if name == "add_transaction":
        from backend.tools.finance.actual_budget import add_transaction
        return await add_transaction(**arguments)

    return f"Unknown tool: {name}"
```

---

## Files to modify

### `backend/core/actual_client/client.py` — modify `get_full_context()`

The `get_full_context()` method currently returns accounts without their IDs. The LLM needs account IDs to call `add_transaction`. It also needs the list of available categories.

**Change 1:** In the accounts loop inside `get_full_context()`, add `"id": str(acc.id)` to each account dict:

```python
# Before:
accounts_result.append({
    "name": acc.name,
    "balance": balance,
})

# After:
accounts_result.append({
    "id": str(acc.id),
    "name": acc.name,
    "balance": balance,
})
```

**Change 2:** After the accounts loop (still inside the `with self._get_actual() as actual:` block), fetch categories:

```python
# Add after the accounts loop, before the stats section:
from actual.queries import get_categories as _get_cats
cats = _get_cats(actual.session)
categories_result = [
    {"id": str(cat.id), "name": cat.name}
    for cat in cats
    if not cat.hidden
]
```

**Change 3:** Include `categories_result` in the returned dict:

```python
# The return dict at the end of get_full_context():
return {
    "accounts": accounts_result,
    "stats": stats_result,
    "recent_transactions": recent_result,
    "categories": categories_result,   # ← ADD THIS
}
```

### `backend/api/chat.py` — three changes

#### Change 1: Add imports at the top of the file

Add these imports after the existing imports:

```python
from backend.tools.registry import TOOLS, execute_tool
```

#### Change 2: Modify `_build_system_prompt()` to include account IDs and categories

Replace the Accounts section:

```python
# Before:
accounts = context.get("accounts", [])
if accounts:
    lines.append("### Accounts")
    for acc in accounts:
        lines.append(f"- {acc['name']}: €{acc['balance']:.2f}")

# After:
accounts = context.get("accounts", [])
if accounts:
    lines.append("### Accounts (use the account_id when adding transactions)")
    for acc in accounts:
        lines.append(f"- {acc['name']} (account_id: {acc['id']}): €{acc['balance']:.2f}")
```

Add a categories section after the accounts section:

```python
categories = context.get("categories", [])
if categories:
    lines.append("\n### Available categories (use exact name when adding transactions)")
    for cat in categories:
        lines.append(f"- {cat['name']}")
```

#### Change 3: Replace the entire `chat_stream()` endpoint

The current endpoint makes a single streaming Ollama call. Replace it with a two-step flow:
1. First call: non-streaming, with tools — to detect `tool_calls`
2. If `tool_calls` present: execute each tool, append result, make a second streaming call
3. If no `tool_calls`: yield the text from step 1 directly

**Add this new helper function** (after `_stream_ollama_response`, before the route):

```python
async def _call_ollama_non_streaming(
    messages: list[dict], ollama_url: str, model: str
) -> dict:
    """Call Ollama without streaming and with tools. Returns the full response dict."""
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
            raise HTTPException(
                status_code=503, detail="Cannot connect to Ollama. Is Ollama running?"
            )
        if response.status_code != 200:
            raise HTTPException(
                status_code=503, detail=f"Ollama error {response.status_code}"
            )
        return response.json()
```

**Replace `chat_stream()` with this implementation:**

```python
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
        # Append the assistant's tool_calls message to history
        messages.append({
            "role": "assistant",
            "content": assistant_message.get("content", ""),
            "tool_calls": tool_calls,
        })

        # Execute each tool and append results
        for tc in tool_calls:
            name = tc.get("function", {}).get("name", "")
            args = tc.get("function", {}).get("arguments", {})
            try:
                result = await execute_tool(name, args)
            except Exception as exc:
                logger.error("Tool execution failed: %s — %s", name, exc)
                result = f"Tool error: {exc}"

            messages.append({"role": "tool", "content": result})

        # Step 2a: stream the final confirmation from Ollama
        async def stream_after_tools():
            try:
                async for chunk in _stream_ollama_response(messages, ollama_url, model):
                    yield chunk
            except HTTPException as e:
                yield f"\n\nError: {e.detail}"
            except Exception as e:
                logger.error("Streaming error after tool execution: %s", e)
                yield "\n\nError: Internal server error"

        return StreamingResponse(
            stream_after_tools(),
            media_type="text/plain",
            headers=streaming_headers,
        )

    # Step 2b: no tool calls — yield the text directly
    text = assistant_message.get("content", "")

    async def yield_text():
        yield text

    return StreamingResponse(
        yield_text(),
        media_type="text/plain",
        headers=streaming_headers,
    )
```

---

## What NOT to change

- `_stream_ollama_response()` — keep as-is; used for the second streaming call
- `_fetch_financial_context()` — keep as-is
- The request/response format — the frontend (`sendChatMessageStreaming` in `api.ts`) is unchanged
- Any other files outside `backend/tools/` and `backend/api/chat.py` and `backend/core/actual_client/client.py`

---

## Verification

After implementing, test with:

```bash
# Get a token
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"doru","password":"YOUR_PASSWORD"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Test: no tool call (read-only question)
curl -s -X POST http://localhost:8000/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"how much did I spend this month?","history":[]}'

# Test: tool call (write transaction)
curl -s -X POST http://localhost:8000/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"I spent 47 euros at Lidl today","history":[]}'
```

Expected for the second test:
- Docker logs should show the tool being executed
- A new transaction should appear in Actual Budget
- The response text should confirm the transaction was added
