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

### Step 1 — Architecture audit (prerequisite for everything)
The existing code violates the architectural principle in several places. These must be fixed before adding any new features — otherwise new code is built on the wrong foundation.

Known violations:
- `transactions` table in SQLite — local copy of transactions; data belongs in Actual Budget
- `budget_limits` table in SQLite — local copy of budget limits; limits belong in Actual Budget
- `SmartCategorizer` uses TF-IDF on local SQLite data — should migrate to Actual Budget rules
- Deduplication code may query local SQLite instead of relying on AB's `imported_id` check

What to do:
1. Audit all SQLite reads/writes in `memory/database.py` and `memory/categorizer.py`
2. For each piece of data: does it belong in Actual Budget? If yes, remove from SQLite and query AB instead
3. Verify that `merchant_mappings` confirmed by the user are synced to AB rules
4. Remove `transactions` and `budget_limits` tables once their usages are migrated
5. After cleanup: re-test receipt photo flow, CSV import, and auto-categorization end-to-end

### Step 2 — Fix bug #27 (429 too-many-requests)
Chat context fetch opens 3 parallel connections to Actual Budget. Fix: fetch all context in one session (sequential calls, single `with actual:` block). See `backend/api/chat.py` → `_fetch_financial_context()`.

### Step 3 — Account selection on web PWA
Port the Telegram account selection flow to the browser. Required for correct transaction routing in receipt flow, manual entry, and CSV import.

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
| Telegram bot | python-telegram-bot 21.6 | Maintenance mode — no new features |
| LLM vision / chat | Ollama + local models | qwen2.5vl:3b (vision), qwen2.5:7b (chat) |
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
│   │   ├── auth.py          ← JWT authentication
│   │   ├── chat.py          ← Chat endpoint + Ollama streaming
│   │   ├── transactions.py  ← GET /transactions, /accounts, /stats
│   │   ├── receipts.py      ← Receipt photo flow
│   │   └── csv_import.py    ← CSV import flow
│   ├── services/
│   │   ├── chat_service.py  ← ChatService (Ollama wrapper)
│   │   └── receipt_service.py
│   └── core/
│       ├── actual_client/   ← ActualBudgetClient (to become tools/finance/)
│       ├── ocr/             ← VisionEngine, parser
│       ├── csv_importer/    ← profiles, normalizer, detector
│       ├── memory/          ← SQLite (database.py, categorizer.py)
│       └── config/          ← settings.py
│
├── bot/                     ← Telegram (maintenance mode)
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
  → CsvNormalizer.parse_csv()
  → CsvProfileDetector — MD5 fingerprint, check saved profiles (SQLite)
  → if unknown: Ollama detects format → user confirms → save profile
  → account selection
  → transfer pair detection (amount match, opposite sign, ±3 days)
  → on confirm: ActualBudgetClient.add_transactions_batch()
      → SHA256 deduplication, single actual.commit()
```

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
  → LLM generates response based on tool results
  → streamed back to frontend
```

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
| `OLLAMA_CHAT_MODEL` | Chat model (qwen2.5:7b) |
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

## Telegram bot (maintenance mode)

Functional but no new features. Used as a fallback and notification channel. All new development happens on the web PWA.

---

*Last updated: 2026-05-10 — unified platform architecture established*
