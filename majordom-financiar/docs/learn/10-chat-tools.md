# 10 — How chat and tool-calling work

## Two models, two roles (current setup)

- **deepseek/deepseek-chat** (via OpenRouter) → conversation + tool-calling
- **google/gemini-2.5-flash-lite** (via OpenRouter) → receipt photos (vision)

Both use the same OpenAI-compatible endpoint. Configurable via env vars.

## Message flow

```
User message
    ↓
Backend injects AB snapshot into system prompt
  (accounts, categories, stats, last 20 transactions)
    ↓
LLM decides: tool_call or text response
    ↓
if tool_call:
  execute_tool(name, args) → result
  if name in _PROPOSAL_TOOLS:
    → yield JSON card to frontend (NOT to LLM)
  else:
    → append tool result to messages → LLM generates text response
if text:
  → stream directly to frontend
```

## `_PROPOSAL_TOOLS` — the critical set

```python
# backend/api/chat.py
_PROPOSAL_TOOLS = {
    "propose_transaction",
    "propose_budget_rebalance",
    "propose_account_transfer",
    "propose_balance_adjustment",
    "rename_category",
    "delete_category",
    "create_category",
    "set_account_goal",
    "log_refuel",
    "delete_vehicle_log_entry",
    "set_vehicle_reminder",
    "set_service_interval",
    "setup_default_groups",
    # add any new write tool here
}
```

**If a write tool is NOT in `_PROPOSAL_TOOLS`:** the JSON goes back to the LLM as a tool result — the LLM reads it as text, the card never appears in the frontend. This is the most common bug when adding new tools.

## The proposal pattern

```
LLM calls propose_transaction(merchant="Kaufland", amount=45.99)
    ↓
Tool resolves details:
  - date = today
  - account = first from AB (or fuzzy match from message)
  - category = SmartCategorizer.suggest()
  - Stores proposal in memory: {id: uuid, merchant: ..., amount: ..., ...}
  - Returns JSON: {type: "transaction_proposal", id: uuid, ...}
    ↓
chat.py sees "propose_transaction" in _PROPOSAL_TOOLS
    ↓
Yields JSON directly to frontend (no LLM response)
    ↓
Frontend parses type → renders ProposalCard with editable fields
    ↓
User edits if needed → presses Confirm
    ↓
POST /api/transactions/proposals/{id}/confirm
  → backend reads proposal by id → executes with user's values
  → ActualBudgetClient.add_transaction()
```

## In-memory proposal stores

Each proposal type has its own in-memory store (dict in process):
- `backend/tools/category_actions.py` → category rename/delete/create proposals
- `backend/tools/vehicle_proposals.py` → refuel proposals
- `backend/tools/vehicle_log_actions.py` → log delete proposals
- `backend/tools/vehicle_reminder_actions.py` → reminder proposals

These expire on restart. The confirmation flow takes ~30s — acceptable.

## Tool arguments — OpenAI vs Ollama format

```python
# OpenAI format (OpenRouter, cloud): arguments is a JSON STRING
args = tool_call["function"]["arguments"]  # "{"month": 5}"
if isinstance(args, str):
    args = json.loads(args)  # ← always do this

# Ollama native /api/chat: arguments is already a dict
# args = {"month": 5}
```

## Financial context in system prompt

The system prompt includes a snapshot from Actual Budget:
- All account names with balances
- Current month spending by category
- Budget allocated vs spent per category
- Last 20 transactions
- Category list

This gives the LLM everything it needs to answer financial questions without additional tool calls. Query tools (`get_accounts`, `get_monthly_stats`, etc.) are available for deeper queries.

## The core principle

**LLM = translator from natural language to structured parameters. Logic = backend.**

State, calculations, and conditions live in code. The LLM does one thing per request: understands what the user said OR formulates a response. If it doesn't extract correctly after 2-3 tries → fallback to simple UI (form, buttons).

## Chat history

Persistent in SQLite (`chat_history` table), per user, max 500 messages. LLM context limited to last 10 messages (to keep token count manageable). Trash icon in UI clears history.

Chat reloads on `window focus` — so when user taps a push notification and returns to the tab, the daily digest message appears immediately without refresh.
