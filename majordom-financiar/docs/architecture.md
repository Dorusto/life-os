# Majordom — Architecture & Technical Reference

> Stable technical facts. Read this before making any changes to core code.

---

## What Majordom is

A unified personal AI assistant — one app, one deployment, one LLM — with pluggable tool integrations per domain (finance, wellness, digital).

The user speaks to Majordom in natural language. Majordom calls the right tool, executes the action, and asks the user to confirm. The user never interacts directly with Actual Budget or other tools.

**Fundamental principles:**
- Zero financial data in the cloud — everything runs on your own server
- Majordom does not reinvent what specialist tools do — it calls them via REST API
- SQLite is only for conversational context, preferences, and domain memory — never financial data
- When in doubt, solve it in chat before building a new screen
- Majordom is an MCP server for external agents, not an MCP client — it calls services via REST

---

## Platform Architecture

```
User (browser / PWA)
        │
        ▼
  React Frontend
        │
        ▼
  FastAPI Backend  ────────────────────────────────────────
        │                                                  │
        ├── Tool Registry (backend/tools/)                 │
        │     ├── tools/finance/    ← Actual Budget       │
        │     └── tools/vehicle/   ← SQLite vehicle_log  │
        │                                                  │
        ├── Memory (SQLite, namespaced)                   │
        │     ├── merchant_mappings                       │
        │     ├── csv_profiles                            │
        │     ├── push_subscriptions                      │
        │     └── user_preferences                        │
        │                                                  │
        └── LLM (Ollama local / OpenRouter cloud) ◄───── │
```

---

## Technical Stack

| Component | Technology | Notes |
|-----------|-----------|-------|
| Web frontend | React + TypeScript | Installable PWA |
| Web backend | FastAPI (Python 3.11) | REST API + streaming chat |
| LLM chat | OpenRouter (deepseek/deepseek-chat) or Ollama | Configured via LLM_BASE_URL |
| LLM vision | OpenRouter (google/gemini-2.5-flash-lite) or Ollama | For receipt OCR |
| Finance tool | Actual Budget | Self-hosted Docker, port 5006 |
| Finance client | actualpy | Python wrapper over AB API |
| Domain memory | SQLite | `/app/data/memory.db` |
| Deploy | Docker Compose | Single stack |

---

## Project Structure

```
majordom-financiar/
├── frontend/                ← React PWA
│   └── src/
│       ├── pages/           ← Home, Chat, Login
│       ├── components/      ← BottomNav, cards, BudgetDashboard
│       └── lib/             ← api.ts, auth.ts
│
├── backend/
│   ├── main.py              ← FastAPI entry point + APScheduler lifespan
│   ├── api/
│   │   ├── auth.py                      ← JWT authentication
│   │   ├── chat.py                      ← Chat endpoint + Ollama streaming + _PROPOSAL_TOOLS
│   │   ├── transactions.py              ← GET /transactions, /accounts, /stats
│   │   ├── receipts.py                  ← Receipt photo flow (grocery + fuel)
│   │   ├── vehicle_proposals.py         ← POST /vehicle/proposals/{id}/confirm
│   │   ├── vehicle_log_actions.py       ← POST /vehicle-log-actions/{id}/confirm|cancel
│   │   ├── vehicle_reminder_actions.py  ← POST /vehicle-reminder-actions/{id}/confirm|cancel
│   │   └── csv_import.py                ← CSV import flow
│   ├── tools/
│   │   ├── registry.py                  ← TOOLS list + execute_tool dispatcher
│   │   ├── category_actions.py          ← In-memory store for pending category proposals
│   │   ├── vehicle_proposals.py         ← In-memory store for pending refuel proposals
│   │   ├── vehicle_log_actions.py       ← In-memory store for pending log deletes
│   │   ├── vehicle_reminder_actions.py  ← In-memory store for pending reminder proposals
│   │   └── finance/
│   │       ├── actual_budget.py         ← AB client wrapper
│   │       └── vehicle.py               ← log_refuel, get_vehicle_stats, etc.
│   ├── services/
│   │   ├── chat_service.py              ← ChatService (Ollama/OpenRouter wrapper)
│   │   ├── receipt_service.py           ← ReceiptService (OCR + confirm)
│   │   └── notifications.py             ← daily digest, import nudge, vehicle reminders
│   └── core/
│       ├── ocr/             ← VisionEngine
│       ├── csv_importer/    ← profiles, normalizer, detector
│       ├── memory/          ← SQLite (database.py, categorizer.py, scheduler.py)
│       └── config/          ← settings.py
│
├── scripts/prompts/         ← DeepSeek task prompts (one .md per task)
├── docs/                    ← This documentation
├── ARCHITECTURE.md          ← Redirect → docs/architecture.md
├── ROADMAP.md               ← Redirect → docs/roadmap.md
└── CLAUDE.md                ← Claude Code instructions (gitignored)
```

---

## Critical Technical Rules — DO NOT BREAK THESE

### 1. Async vs Sync — CRITICAL
The entire backend is **async** (FastAPI + asyncio). `ActualBudgetClient` runs sync `actualpy` code in a `ThreadPoolExecutor`.

```python
# CORRECT — sync in executor
async def get_accounts(self) -> list[Account]:
    def _get():
        with self._get_actual() as actual:
            actual.download_budget()
            return actual.get_accounts()
    return await self._run(_get)

# WRONG — blocks the entire event loop:
async def get_accounts(self):
    with self._get_actual() as actual:  # sync in async context!
        ...
```

### 2. actualpy — operation order is mandatory
```python
with self._get_actual() as actual:
    actual.download_budget()   # always first
    # ... operations ...
    actual.commit()            # always last, for any write
```

### 3. actualpy — naming quirks
- `imported_id` in `create_transaction()` is saved internally as `financial_id`. When reading: use `tx.financial_id`, not `tx.imported_id`.
- `create_transaction()` expects **EUR** (float), not cents. It converts internally via `decimal_to_cents()`.
- Queries pattern: `from actual.queries import get_transactions; get_transactions(actual.session, ...)` — there is no `actual.get_transactions()` method.

### 3b. actualpy — create_rule syntax (non-obvious, will fail silently with wrong values)
```python
from actual.rules import Rule, Condition, Action
from actual.queries import create_rule

rule = Rule(
    conditions=[Condition(field='imported_description', op='contains', value='PREFIX')],
    operation='and',
    actions=[Action(op='set', field='category', value=category_uuid)],
)
create_rule(actual.session, rule)  # takes session, NOT actual
actual.commit()
```
- `field='imported_description'` — matches the raw bank string. `field='description'` is the payee UUID (a different type — will reject string values).
- `Action(op='set', field='category', value=uuid)` — NOT `op='set-category'` (raises ValidationError).

### 4. Config — always from settings singleton
```python
# CORRECT:
from backend.core.config import settings
url = settings.ollama.url

# WRONG:
import os
url = os.environ["LLM_BASE_URL"]
```

### 5. No financial data in SQLite
SQLite (`memory.db`) is for conversational context and user preferences only. Transactions, balances, categories, budgets → Actual Budget. Any SQLite table storing financial data is a violation — remove it.

### 6. Confirmation card for all write tools
Every tool that modifies data MUST go through a proposal → confirmation card → execute flow. No direct execution.

```python
# Pattern:
_PROPOSAL_TOOLS = {"propose_transaction", "propose_budget_rebalance", ...}
# If tool name is in _PROPOSAL_TOOLS → yield JSON to frontend
# Frontend renders editable card → user confirms → POST /confirm endpoint
```

If a tool is missing from `_PROPOSAL_TOOLS` in `backend/api/chat.py`, the JSON goes to the LLM instead of the frontend — the card never appears.

### 7. Transaction deduplication
Majordom generates `SHA256(date + merchant + amount)[:16]` and passes it to Actual Budget as `imported_id`. Actual Budget owns deduplication — Majordom does not query duplicates itself.

### 8. Transfers
A transfer between two on-budget accounts = two linked transactions in Actual Budget, never two separate expense/income transactions. Use `actualpy.create_transfer()` or `set_transaction_payee()` with a payee that has `transfer_acct` set.

### 9. LLM context window
With 20+ tool schemas (~3500 tokens) + system prompt (~600), `num_ctx` must be at least 8192. On Ollama native `/api/chat`: set in `options.num_ctx`. On OpenAI-compatible `/v1/chat/completions`: `options` is ignored — use a provider that supports large context (OpenRouter).

### 10. OpenAI format vs Ollama format
`tool_calls[].function.arguments` is a **string** in OpenAI format, a **dict** in Ollama native. Always:
```python
if isinstance(args, str):
    args = json.loads(args)
```

### 11. `think: false` for qwen3 models
qwen3 and qwen3.5 have thinking mode enabled by default. Always send `"think": false` in the Ollama payload, otherwise the response is blocked for tens of seconds with no visible output.

---

## Main Flows

### Receipt photo (web)
```
User uploads photo
  → POST /api/receipts (multipart)
  → VisionEngine.extract_from_bytes() — LLM vision model
  → SmartCategorizer.suggest() — check merchant_mappings (SQLite)
  → if multiple accounts: ask user
  → on confirm: ActualBudgetClient.add_transaction()
```

### Fuel receipt (photo)
```
User uploads photo
  → VisionEngine detects receipt_type="fuel"
  → returns ReceiptDraft with liters, price_per_liter, vehicles, suggested_vehicle_id
  → FuelReceiptCard (tabbed: Fuel / Grocery)
  → confirm → POST /api/receipts/{id}/confirm-fuel
  → reads last_odo BEFORE insert → AB transaction + vehicle_log INSERT
```

**Key rule:** last ODO must be read BEFORE inserting the new entry — otherwise `km_since_last = 0`.

### Fuel refuel (text — log_refuel tool)
```
User: "I refueled 40L at Shell for €90, odo 51500"
  → LLM calls log_refuel(liters, total_eur, location, odo_km)
  → pending proposal in vehicle_proposals (in-memory dict)
  → "log_refuel" in _PROPOSAL_TOOLS → yield JSON to frontend
  → FuelReceiptCard (no image, no Grocery tab)
  → confirm → POST /api/vehicle/proposals/{id}/confirm
  → reads last_odo BEFORE insert → AB transaction + vehicle_log INSERT
```

### Chat with tool calling
```
User sends message
  → POST /api/chat
  → _fetch_financial_context() — accounts + stats + recent tx from AB (single session)
  → system prompt built with financial snapshot
  → LLM generates response with optional tool calls
  → if tool in _PROPOSAL_TOOLS → yield JSON card to frontend
  → else → append tool result, LLM generates text response
  → streamed back to frontend
```

### CSV import
```
User uploads CSV via + button in chat
  → POST /api/import/csv/preview
  → bank2ynab converts to standard format
  → CsvImportCard in chat
  → confirm → POST /api/import/csv/confirm
  → transfer detection (Code=GT for ING), unknown income → IncomeSourceCard
  → ActualBudgetClient.add_transactions_batch() with SHA256 deduplication
```

### Daily digest (APScheduler)
```
run_daily_digest() at configured time (default 20:00):
  _check_financial_summary()  → text or None
  _check_import_nudge()       → text or None
  _check_pending_review()     → text or None
  _check_vehicle_reminders()  → list[str] or []
  → concatenate with " · "
  → PushService.broadcast() — single Web Push to all subscribers
  → save to chat_history for all active users
```

---

## Authentication

- 2 users defined in `.env` (username + bcrypt password)
- JWT tokens, 7-day expiry
- No OAuth, no role-based access, no server-side sessions

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ACTUAL_BUDGET_URL` | Internal Docker URL (`http://actual-budget:5006`) |
| `ACTUAL_BUDGET_PASSWORD` | Actual Budget password |
| `ACTUAL_BUDGET_SYNC_ID` | Sync ID from AB Settings → Advanced |
| `LLM_BASE_URL` | LLM provider URL — no trailing `/v1` (code adds it) |
| `LLM_API_KEY` | API key (empty for local Ollama) |
| `LLM_CHAT_MODEL` | Chat model ID |
| `LLM_VISION_MODEL` | Vision model ID |
| `LLM_CATEGORIZE_MODEL` | Model for CSV categorization (optional, defaults to chat) |
| `MEMORY_DB_PATH` | SQLite path (`/app/data/memory.db`) |
| `JWT_SECRET` | Secret for JWT tokens (32-byte hex) |
| `USER1_USERNAME` / `USER1_PASSWORD` | Web UI credentials |

**Important:** `LLM_BASE_URL` must NOT end with `/v1` — the code appends `/v1/chat/completions` automatically. If set to `https://openrouter.ai/api/v1`, you get double `/v1`.

---

## Docker Services

```yaml
actual-budget  ← port 127.0.0.1:5006:5006, data in ./data/actual
ollama         ← port 11434, models in ollama_data volume (optional, local inference)
majordom       ← FastAPI backend (port 8000) + React frontend via Nginx (port 3000)
```

All services share `majordom-net` bridge network. Backend addresses AB as `http://actual-budget:5006`.

---

## MCP Server (planned)

Majordom will expose its tool registry through MCP standard. Any MCP-compatible agent (OpenClaw, Hermes, Claude) can call Majordom's tools directly. Implementation scheduled after M2 — tracked in issue #58.

---

---

## Target Architecture (incremental migration — June 2026+)

> This is the direction, not the current state. Each service is extracted when work happens on it anyway. No big-bang rewrites.

### Life-OS structure (target)

```
life-os/
├── majordom/              ← orchestrator + conversational UI + daily digest + MCP server
│
├── finance/
│   ├── sure/              ← budget + investments + bank sync (target platform)
│   ├── actual-budget/     ← current platform, stays until Sure reaches parity
│   └── portfolio-bridge/  ← Bitvavo/XTB → Sure (first M5 task)
│
├── tools/
│   ├── receipt-scanner/   ← OCR receipt → transaction (extracted from Majordom)
│   ├── csv-importer/      ← smart bank CSV import (extracted from Majordom)
│   └── vehicle-manager/   ← Fuelio replacement (extracted from Majordom)
│
├── home/
│   ├── home-assistant/
│   ├── immich/
│   └── nextcloud/
│
└── docker-compose.yml     ← single stack
```

### Majordom roles (target)
- Conversational UI with cards and charts
- Proactive daily digest
- MCP server — external agents (OpenClaw, Claude API, Hermes) call Majordom's tools
- REST client — Majordom calls each service via its REST API (no MCP client internally)

### FinanceProvider abstraction

Majordom's tool registry calls a `FinanceProvider` protocol, not AB/Sure directly:

```python
class FinanceProvider(Protocol):
    async def get_accounts(self) -> list[Account]: ...
    async def get_transactions(self, ...) -> list[Transaction]: ...
    async def create_transaction(self, ...) -> str: ...
    async def get_budget_status(self) -> BudgetStatus: ...

class ActualBudgetProvider:   # current — wraps actualpy
    ...

class SureProvider:           # future — Sure REST API
    ...
```

Config: `FINANCE_BACKEND=actual_budget` (default) or `sure`. Switching backends requires no code changes.

### Tool domain routing

Tools are prefixed by domain. A single LLM sees all tools and routes based on prefix + structured system prompt.

**Domains:**

| Prefix | Domain | Services |
|--------|--------|----------|
| `finance__` | Budget, transactions, investments, bank sync | Actual Budget, Sure |
| `vehicle__` | Vehicle log, fuel, reminders | SQLite vehicle_log |
| `home__` | Lights, climate, automations | Home Assistant |
| `media__` | Photos, documents, files | Immich, Nextcloud |

**Tool naming:** `{domain}__{action}` — e.g. `finance__propose_transaction`, `vehicle__log_refuel`

**System prompt structure:**
```
## Finance tools
Use finance__ tools when the user mentions money, budget, transactions, accounts, investments.
  - finance__propose_transaction: spending or receiving money
  - finance__propose_set_category_budget: set a budget amount for a category
  ...

## Vehicle tools
Use vehicle__ tools when the user mentions car, fuel, APK, insurance, mileage.
  ...
```

**Migration to Option B (hierarchical routing):**
When local inference becomes primary and tool count grows, add a router LLM layer on top of `chat_service.py`. Tool definitions stay unchanged — the router just picks the domain and delegates. Triggered by hardware upgrade (AMD iGPU mini PC) or >30 tools per domain.

### Incremental migration strategy

- **Never stop current development** for structural migration
- **Extract a service** when working on that feature anyway (e.g., extract `vehicle-manager/` during next vehicle feature sprint)
- **Each extracted service** gets its own repo, Docker image, REST API, and README
- **Audit after each migration step** — verify existing functionality before moving on
- `majordom-financiar/` → `majordom/` rename happens when folder restructure is triggered by other work

*Last updated: 2026-06-12*
