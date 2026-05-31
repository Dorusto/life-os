# Majordom — Architecture & Developer Guide

> Source of truth for any AI agent or developer working on this project.
> Read this file before making any changes.

---

## What Majordom is

Majordom is a **unified personal AI assistant** — one application, one deployment, one LLM — with pluggable tool integrations per domain.

The user talks to Majordom in natural language. Majordom understands the context, decides which tool to call, executes the action, and confirms the result. The user never interacts directly with the underlying tools (Actual Budget, Ghostfolio, etc.).

**Three domains, one assistant:**
- **Finance** — budget tracking, transactions, investments (Actual Budget + Ghostfolio)
- **Digital** — to be defined
- **Wellness** — to be defined

The LLM is domain-agnostic. Domain routing happens through the tool registry: the LLM reads tool descriptions and decides which one to call based on the user's message.

**Fundamental principles:**
- Zero financial data in the cloud. Everything runs on your own server.
- Majordom does not reinvent anything that a specialist tool already does well. If Actual Budget handles it, Majordom calls Actual Budget — it does not reimplement the logic.
- SQLite exists only for conversational context, user preferences, and domain memory — not for financial or health data.
- When in doubt, solve it in chat before building a screen. A new UI page is a last resort.

---

## Platform Architecture

### Single deployment

One Docker Compose stack. One backend. One frontend. One LLM.

```
User (browser / PWA)
        │
        ▼
  React Frontend
        │
        ▼
  FastAPI Backend  ──────────────────────────────────────────────
        │                                                        │
        ├── Tool Registry                                        │
        │     ├── tools/finance/    ← Actual Budget, Ghostfolio │
        │     ├── tools/wellness/   ← future integrations       │
        │     └── tools/digital/   ← future integrations       │
        │                                                        │
        ├── Memory (SQLite, namespaced)                         │
        │     ├── memory/finance/   ← merchant mappings, etc.  │
        │     ├── memory/wellness/  ← future                   │
        │     └── memory/digital/  ← future                    │
        │                                                        │
        └── LLM (Ollama — local)  ◄──────────────────────────── │
```

### Tool Registry

Each domain exposes a set of tools — Python functions with a plain-text description that the LLM uses to decide when to call them.

**Target structure (to be migrated to):**
```
tools/
  finance/
    actual_budget.py    ← add_transaction(), get_accounts(), set_budget_amount(), ...
    ghostfolio.py       ← get_portfolio(), get_performance(), ...
  wellness/
    (future)
  digital/
    (future)
  registry.py           ← loads all tools, exposes them to the LLM
```

**How to add a new tool:**
1. Create a Python class in the appropriate domain folder
2. Decorate each callable function with `@tool(description="...")` 
3. Register the class in `tools/registry.py`
4. The LLM discovers it automatically — no changes to core code

**How to replace a tool:**
Write a new class with the same function signatures. The LLM does not care which class implements the tool — only that the function and description exist.

### Domain-separated memory

The LLM shares one conversation thread but writes to and reads from separate memory namespaces. Finance history does not mix with wellness history.

```
memory/
  finance/
    merchant_mappings   ← merchant → confirmed category (temp until synced to AB rules)
    csv_profiles        ← saved CSV import profiles
    conversation        ← finance-related conversation history
  wellness/
    (future)
  digital/
    (future)
  shared/
    user_preferences    ← onboarding state, user profile, cross-domain preferences
    conversation        ← general conversation history (non-domain-specific)
```

When the LLM processes a message, it determines the domain from context and reads/writes to the matching namespace. A message about budget and a message about health do not share the same memory context.

---

## Current State vs Target State

The codebase was built before the unified architecture was established. The current state is `majordom-financiar` as a standalone finance application. The target state is a unified platform.

**Migration happens in this order — do not skip steps:**

### Step 0 — Document (this file) ✅
Establish the target architecture before touching any code.

### Step 1 — Architecture audit ✅ (complete 2026-05-31)
The existing code violations have been resolved. SQLite is now strictly context/preference storage only.

Resolved:
- `transactions` table — dropped from SQLite (was empty; no code references remain)
- `budget_limits` table — dropped from SQLite (was empty; no code references remain)
- `SmartCategorizer` TF-IDF — replaced with `merchant_mappings` confirmed by user (history-based only)
- Deduplication — uses SHA256 hash(date+merchant+amount) stored in `merchant_mappings.financial_id`

Remaining (low priority, non-blocking):
- `merchant_mappings` not yet synced to AB rules — category changes confirmed in Majordom are invisible to AB's own rule engine. Fix in a future session alongside M2 rules sync.
- IBAN storage for auto-transfer detection — store `IBAN: NLxx...` in AB account `note` field; match against CSV Counterparty column to auto-select transfer destination. Tracked as M2.9.

### Step 2 — Fix bug #27 (429 too-many-requests)
Chat context fetch opens 3 parallel connections to Actual Budget. Fix: fetch all context in one session (sequential calls, single `with actual:` block). See `backend/api/chat.py` → `_fetch_financial_context()`.

### Step 3 — Account selection on web PWA
Port the account selection flow to the browser. Required for correct transaction routing in receipt flow, manual entry, and CSV import.

### Step 4 — Budget status dashboard (home page)
First user-visible feature: budget overview per category with progress bars. Data from Actual Budget via ActualQL. Conversational rebalancing from chat when a category goes over budget.

### Step 5 — Tool registry migration
Refactor `ActualBudgetClient` into the tool registry structure. This is when `majordom-financiar` becomes a module of the unified platform rather than a standalone app.

---

## Technical Stack

| Component | Technology | Notes |
|---|---|---|
| Web frontend | React + TypeScript | Installable PWA |
| Web backend | FastAPI (Python 3.11) | REST API + streaming chat |
| LLM vision / chat | Ollama + local models | qwen2.5vl:3b (vision), qwen3:14b (chat) |
| Finance tool | Actual Budget | Self-hosted Docker |
| Finance client | actualpy | Python wrapper over AB API |
| Investment tool | Ghostfolio | Self-hosted Docker (planned) |
| Domain memory | SQLite | Namespaced per domain |
| Deploy | Docker Compose | Single stack |

---

## Project Structure (current)

```
majordom-financiar/
├── frontend/                ← React PWA
│   └── src/
│       ├── pages/           ← Home, Chat, Import, Login
│       ├── components/      ← BottomNav, SpendingChart, TransactionItem
│       └── lib/             ← api.ts, auth.ts
│
├── backend/
│   ├── main.py              ← FastAPI entry point
│   ├── api/
│   │   ├── auth.py              ← JWT authentication
│   │   ├── chat.py              ← Chat endpoint + Ollama streaming + _PROPOSAL_TOOLS
│   │   ├── transactions.py      ← GET /transactions, /accounts, /stats
│   │   ├── receipts.py              ← Receipt photo flow (grocery + fuel dual-write)
│   │   ├── vehicle_proposals.py     ← POST /vehicle/proposals/{id}/confirm (text refuel)
│   │   ├── vehicle_log_actions.py   ← POST /vehicle-log-actions/{id}/confirm|cancel
│   │   ├── vehicle_reminder_actions.py ← POST /vehicle-reminder-actions/{id}/confirm|cancel
│   │   └── csv_import.py            ← CSV import flow
│   ├── tools/
│   │   ├── registry.py              ← TOOLS list + execute_tool dispatcher
│   │   ├── vehicle_proposals.py     ← In-memory store for pending refuel proposals
│   │   ├── vehicle_log_actions.py   ← In-memory store for pending log delete proposals
│   │   ├── vehicle_reminder_actions.py ← In-memory store for pending reminder proposals
│   │   ├── category_actions.py      ← In-memory store for pending category proposals
│   │   └── finance/
│   │       ├── actual_budget.py ← AB client wrapper (add_transaction etc.)
│   │       └── vehicle.py       ← log_refuel, get_vehicle_stats, set_vehicle_reminder, set_service_interval, get_vehicle_log, delete_vehicle_log_entry
│   ├── services/
│   │   ├── chat_service.py      ← ChatService (Ollama wrapper)
│   │   └── receipt_service.py
│   └── core/
│       ├── ocr/             ← VisionEngine, parser
│       ├── csv_importer/    ← profiles, normalizer, detector
│       ├── memory/          ← SQLite (database.py, categorizer.py) — vehicles + vehicle_log
│       └── config/          ← settings.py
│
├── scripts/
│   ├── ai_helper.py         ← DeepSeek API wrapper for development
│   └── prompts/             ← DeepSeek task prompts (one .md per task)
│
├── ARCHITECTURE.md          ← this file
├── ROADMAP.md               ← features, implementation details, priorities
└── CLAUDE.md                ← Claude Code instructions (gitignored, private)
```

---

## How we work with code

**Before any code:** read ARCHITECTURE.md and ROADMAP.md. Explain in Romanian what will be done, which files will be touched, and what the expected result is.

**Implementation workflow:**
- Claude (senior/architect) — reads the code, understands context, writes the spec and DeepSeek prompt
- DeepSeek (engineer) — receives the prompt, implements
- Prompts saved in `scripts/prompts/deepseek/` — one `.md` file per task; usable independently without Claude

**One feature at a time.** Do not implement two things simultaneously.

**Short functions with clear names.** If a function does more than one thing, split it.

**Test after each feature.** Commit after each functional state. Git is the safety net.

**Rebuild Docker after backend changes:**
```bash
docker compose build majordom && docker compose up -d majordom
```

---

## Critical technical rules — do NOT break these

### 1. Async vs Sync — CRITICAL
The entire backend is **async** (FastAPI + asyncio). `ActualBudgetClient` runs sync code (`actualpy`) in a `ThreadPoolExecutor`.

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

### 3. actualpy — naming quirk
`imported_id` in `create_transaction()` is saved internally as `financial_id`.
When reading existing transactions, use `tx.financial_id`, not `tx.imported_id`.

### 4. Config — always from settings singleton
```python
# CORRECT:
from backend.core.config import settings
url = settings.ollama.url

# WRONG:
import os
url = os.getenv("OLLAMA_URL")
```

### 5. Transaction deduplication
Majordom generates `SHA256(date + merchant + amount)[:16]` and passes it to Actual Budget as `imported_id`. Actual Budget owns the deduplication check — Majordom does not query or verify duplicates itself.

### 6. Transfers between accounts
A transfer between two on-budget accounts must be recorded as a transfer in Actual Budget, not as two separate transactions. Detection: equal absolute amount, opposite signs, within 3-day window.

### 7. No financial data in SQLite
SQLite is for conversational context and user preferences only. Transactions, balances, categories, and budgets live in Actual Budget. Any SQLite table that stores financial data is a violation — remove it.

---

## Main flows

### Receipt photo (web)
```
User uploads photo
  → POST /api/receipts (multipart)
  → VisionEngine.extract_from_bytes() — Ollama vision model
  → SmartCategorizer.suggest() — check merchant_mappings (SQLite)
  → if multiple accounts: ask user
  → on confirm: ActualBudgetClient.add_transaction()
```

### CSV import
```
User uploads CSV
  → POST /api/import/csv
  → bank2ynab converts to standard format (Date/Payee/Outflow/Inflow)
  → account selection
  → transfer pair detection (amount match, opposite sign, ±3 days)
  → on confirm: ActualBudgetClient.add_transactions_batch()
      → SHA256 deduplication, single actual.commit()
```

**Decision (2026-05-29):** CSV format detection via Ollama replaced by `bank2ynab` (MIT, pip).
bank2ynab covers 100+ European banks (ING NL, BUNQ, Revolut, etc.) via community-maintained
profiles. Output is always the same fixed format — Majordom needs one parser, not per-bank logic.
Firefly III data-importer was evaluated and rejected (PHP, not usable as a Python library).
Romanian banks (BRD, BCR, Raiffeisen RO) need manual profiles added to bank2ynab — contribute upstream.
Tracked in issue #67.

### Chat (current — read-only)
```
User sends message
  → POST /api/chat
  → _fetch_financial_context() — accounts + stats + recent transactions from AB
  → system prompt built with financial snapshot
  → Ollama chat model generates response
  → streamed back to frontend
```

### Chat (target — with tool calling)
```
User sends message
  → POST /api/chat
  → LLM receives message + tool registry descriptions
  → LLM decides which tool(s) to call (if any)
  → backend executes tool calls
  → if tool in _PROPOSAL_TOOLS → yield JSON card to frontend (no LLM response)
  → else → append tool result to messages, LLM generates text response
  → streamed back to frontend
```

### Fuel receipt (photo)
```
User uploads photo
  → POST /api/receipts (multipart)
  → VisionEngine detects receipt_type="fuel"
  → receipt_service overrides category to transport
  → returns ReceiptDraft with liters, price_per_liter, vehicles list, suggested_vehicle_id
  → frontend renders FuelReceiptCard (tabbed: Fuel / Grocery)
  → user confirms → POST /api/receipts/{id}/confirm-fuel
  → dual-write: AB transaction + vehicle_log INSERT
  → returns FuelConfirmResponse with km_since_last, L/100km, €/km
```

### Fuel refuel (text — log_refuel tool)
```
User: "I refueled 40L at Shell for €90, odo 51500"
  → LLM calls log_refuel(liters, total_eur, location, odo_km)
  → tool resolves vehicle by name or ODO proximity
  → fetches accounts + categories from AB
  → creates pending proposal in vehicle_proposals (in-memory dict)
  → returns ReceiptDraft-compatible JSON with type="fuel_log"
  → chat.py: "log_refuel" in _PROPOSAL_TOOLS → yield JSON to frontend
  → frontend renders FuelReceiptCard (no image, no Grocery tab swap)
  → user confirms → POST /api/vehicle/proposals/{id}/confirm
  → reads last_odo BEFORE insert → AB transaction → vehicle_log INSERT → stats
  → returns FuelConfirmResponse identical to photo flow
```

**Key rule:** last ODO must be read BEFORE inserting the new entry, otherwise km_since_last = 0.

---

## Authentication

- 2 users defined in `.env` (username + bcrypt password)
- JWT tokens, 7-day expiry
- No OAuth, no role-based access, no server-side sessions
- Both users share the same data — no per-user isolation yet

---

## Environment variables

| Variable | Description |
|---|---|
| `ACTUAL_BUDGET_URL` | Internal Docker URL (http://actual-budget:5006) |
| `ACTUAL_BUDGET_PASSWORD` | Actual Budget password |
| `ACTUAL_BUDGET_SYNC_ID` | Sync ID from Actual Budget settings |
| `OLLAMA_URL` | Ollama URL |
| `OLLAMA_VISION_MODEL` | Vision model (qwen2.5vl:3b) |
| `OLLAMA_CHAT_MODEL` | Chat model (qwen3:14b) |
| `MEMORY_DB_PATH` | SQLite path (/app/data/memory.db) |
| `JWT_SECRET` | Secret for JWT tokens |
| `USER1_USERNAME` / `USER1_PASSWORD` | Web UI credentials |

Development secrets (DeepSeek API key etc.) → `~/Proiecte-AI/.dev-secrets` (outside the project repo).

---

## Docker services

```yaml
actual-budget  ← port 5006, data in ./data/actual
ollama         ← port 11434, models in ollama_data volume
majordom       ← FastAPI backend (port 8000) + React frontend via Nginx (port 3000)
```

---

## Implemented features

- [x] Receipt photo processing with AI vision (Ollama)
- [x] CSV import with automatic format detection and saved profiles
- [x] Auto-categorization from confirmed merchant history
- [x] Universal deduplication (SHA256 → Actual Budget imported_id)
- [x] Web PWA: FastAPI + React, JWT auth, receipt flow, spending chart
- [x] Streaming chat with financial context (read-only — no tool calling yet)
- [x] Account selection on receipt confirm
- [x] Home screen: Cashflow (income − expenses) + Net Worth metrics, Goals progress bars
- [x] Savings goals: `TARGET: <amount>` in AB account note field → `set_account_goal` chat tool + `/api/accounts/goals` endpoint
- [x] Vehicle reminders: APK/insurance/service — `set_vehicle_reminder` + `set_service_interval` chat tools; daily digest bundles all alerts into one Web Push
- [x] Daily digest: single APScheduler job at configured time — financial summary + vehicle alerts + import nudge + pending review → one push
- [x] Vehicle log management: `get_vehicle_log` + `delete_vehicle_log_entry` chat tools

## MCP Server

Majordom exposes its tool registry through the MCP (Model Context Protocol) standard. Any MCP-compatible agent — OpenClaw, Hermes, Claude, or any future agent — can call Majordom's tools directly.

**Exposed tools (from `backend/tools/registry.py`):**
- `get_accounts` — list all accounts with balances
- `get_monthly_stats` — spending by category for a given month
- `get_budget_status` — current month budget vs actual per category
- `get_transactions` — recent transactions with filters
- `get_spending_history` — multi-month spending trend
- `propose_transaction` — propose a new transaction (requires user confirmation)
- `propose_budget_rebalance` — propose moving funds between categories

**Design principle:** the LLM inside the PWA uses these same tools via the tool registry. An external agent via MCP is just another caller — the tools and their behavior are identical.

**Status:** planned — implementation scheduled after M2 (dedicated milestone TBD). Tracked in issue #58.

---

*Last updated: 2026-05-30 — Telegram bot removed; MCP server section added*
