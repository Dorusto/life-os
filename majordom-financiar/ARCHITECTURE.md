# Majordom — Architecture & Developer Guide

> Source of truth for any AI agent or developer working on this project.
> Read this file before making any changes.

---

## What the application does

Majordom is a conversational interface over Actual Budget — not a standalone financial application. The user interacts via chat (web PWA or Telegram), and Majordom executes actions in Actual Budget via API.

**Fundamental principles:**
- Zero financial data in the cloud. Everything runs on your own server.
- Majordom does not reinvent anything that Actual Budget does. If AB has a tool for something, Majordom uses that one.
- The local SQLite exists only for conversational context and user preferences — not for financial data.

---

## Architectural Principle

| Responsibility | Where it lives |
|-----------------|---------------|
| Transactions, accounts, balances | **Actual Budget** |
| Categories, groups, budgets | **Actual Budget** |
| Goals, schedules, rules, transfers | **Actual Budget** |
| Reports, net worth, cash flow | **Actual Budget** |
| User preferences, onboarding state | **SQLite (Majordom)** |
| Conversation history | **SQLite (Majordom)** |
| Merchant→category mappings (until sync to AB rules) | **SQLite (Majordom) — temporary** |

---

## Platform Strategy

- **Web PWA** — the main interface; all new features are implemented here
- **Telegram bot** — maintenance mode; no new features are added; kept functional as a fallback and notification channel

---

## Technical Stack

| Component | Technology | Notes |
|---|---|---|
| Web frontend | React + TypeScript | Installable PWA |
| Web backend | FastAPI (Python 3.11) | REST API + WebSocket for chat |
| Telegram Bot | python-telegram-bot 21.6 | async, maintenance mode |
| AI vision / chat | Ollama + qwen2.5vl:3b | local, GPU RTX 4070 Mobile |
| Speech-to-text | Whisper (via Ollama) | planned — voice input PWA |
| Budget app | Actual Budget | self-hosted Docker |
| Actual client | actualpy | Python wrapper over AB API |
| Memory/context | SQLite | via sqlite3 stdlib |
| Deploy | Docker Compose | 3 services: actual-budget, ollama, majordom |

---

## Project Structure

```
majordom-financiar/
├── frontend/                ← React PWA
│   ├── src/
│   │   ├── pages/           ← Home, Chat, Import, Documents
│   │   ├── components/      ← reusable components
│   │   └── api/             ← calls to FastAPI backend
│   └── public/
│       └── manifest.json    ← PWA manifest
│
├── backend/                 ← FastAPI
│   ├── main.py              ← FastAPI entry point, main routes
│   ├── auth.py              ← JWT authentication
│   ├── chat.py              ← Chat endpoint, Ollama integration
│   ├── actual_client/
│   │   └── client.py        ← Async wrapper over actualpy:
│   │                            add_transaction(), get_accounts(),
│   │                            get_categories(), set_budget_amount()
│   ├── ocr/
│   │   ├── vision_engine.py ← Sends image to Ollama, receives JSON
│   │   └── parser.py        ← Dataclasses: ReceiptData, ReceiptItem
│   ├── csv_importer/
│   │   ├── profiles.py      ← CsvProfile, NormalizedTransaction
│   │   ├── normalizer.py    ← CSV bytes → NormalizedTransaction[]
│   │   └── detector.py      ← Format detection: header signature + Ollama
│   ├── memory/
│   │   ├── database.py      ← SQLite: merchant_mappings, csv_profiles, etc.
│   │   └── categorizer.py   ← Category suggestions from confirmed history
│   └── config/
│       └── settings.py      ← Singleton Settings from .env
│
├── bot/                     ← Telegram (maintenance mode)
│   ├── main.py              ← Telegram bot entry point
│   ├── handlers.py          ← Commands and flows
│   ├── keyboards.py         ← InlineKeyboardMarkup
│   └── csv_wizard.py        ← CSV import via Telegram
│
├── docker-compose.yml       ← 3 services: actual-budget, ollama, majordom
├── Dockerfile
├── requirements.txt
└── .env.example
```

---

## How we work with code

These rules apply in any implementation session:

**Before any code:** explain in Romanian what will be done, which files will be touched, and what the expected result is. If it's not clear, clarify before writing anything.

**One feature at a time.** Do not implement two things simultaneously.

**Short functions with clear names.** `get_accounts_from_actual()` instead of `fetch()`. If a function does more than one thing, split it into two.

**One file = one subject.** `accounts.py` contains everything related to accounts. Files remain small and focused.

**Test after each feature.** We test together that it works, then we commit. Git is the safety net — any functional commit is a rollback point.

**When something breaks:** errors have a location. Useful commands:
```bash
docker logs majordom-bot          # errors from backend/bot
docker logs majordom-frontend     # errors from frontend (if any)
docker compose ps                 # service status
```

---

## Main flow — receipt photo processing (web)

```
User uploads photo in browser (PWA)
        │
frontend → POST /api/receipt (multipart)
        │
backend/chat.py or receipt endpoint
        │
        ├── 1. VisionEngine.extract_from_bytes()
        │       └── resize to 512px (Pillow)
        │       └── encode base64
        │       └── POST to Ollama /api/chat with image
        │       └── parse JSON → ReceiptData
        │
        ├── 2. SmartCategorizer.suggest()
        │       └── search in merchant_mappings (SQLite)
        │       └── returns previously confirmed category
        │
        ├── 3. If multiple accounts exist → ask user which account
        │
        └── 4. On confirmation: ActualBudgetClient.add_transaction()
                └── actualpy in ThreadPoolExecutor
                └── download_budget() → create_transaction() → commit()
```

---

## CSV flow — bank transaction import

```
User uploads CSV/OFX file in browser
        │
frontend → POST /api/import/csv
        │
        ├── 1. CsvNormalizer.parse_csv(bytes)
        │       └── detect encoding and delimiter
        │       └── return headers + rows
        │
        ├── 2. CsvProfileDetector.header_signature(headers)
        │       └── MD5 on sorted columns → fingerprint
        │
        ├── 3a. Profile found in SQLite → apply directly
        ├── 3b. Profile not found → Ollama detects → user confirms → saved
        │
        ├── 4. Destination account selection
        │
        ├── 5. Transfer pair detection (equal amount, opposite sign, ±3 days)
        │       └── present to user for confirmation
        │
        └── 6. On confirmation: ActualBudgetClient.add_transactions_batch()
                └── SHA256(data+merchant+amount) → deduplication
                └── confirmed transfers → create_transfer()
                └── the rest → create_transaction() with auto category
                └── a single actual.commit() at the end
```

---

## Critical modules — what NOT to break

### 1. Async vs Sync — CRITICAL
The entire backend is **async** (FastAPI + asyncio).
`ActualBudgetClient` runs sync code (`actualpy`) in a `ThreadPoolExecutor`.

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
    with self._get_actual() as actual:  # sync in async!
        ...
```

### 2. actualpy — operation order is mandatory
```python
with self._get_actual() as actual:
    actual.download_budget()   # first download
    # ... operations ...
    actual.commit()            # at the end for any write
```

### 3. actualpy — naming quirk
The `imported_id` parameter in `create_transaction()` is saved internally as `financial_id`.
When reading existing transactions for deduplication, use `tx.financial_id`:
```python
existing_ids = {tx.financial_id for tx in existing_txs if tx.financial_id}
```

### 4. Config — everything comes from settings
```python
# CORRECT:
from config import settings
url = settings.ollama.url

# WRONG:
import os
url = os.getenv("OLLAMA_URL")  # never directly in modules
```

### 5. Transaction deduplication
All transactions receive a deterministic ID: `SHA256(date + merchant + amount)[:16]`.
If the same ID already exists in Actual Budget, the transaction is skipped (no duplicate created).

### 6. Rebuild Docker after code changes
`docker compose restart majordom` does NOT apply changes — only restarts the old container.
```bash
docker compose build majordom && docker compose up -d majordom
```

### 7. Transfers between accounts
A transfer ING → Revolut appears in the ING CSV as an expense. It must be detected and recorded
as a transfer in Actual Budget, not as two separate transactions. Detection logic:
equal amount, opposite sign, in two different accounts, within a 3-day interval.

---

## Environment variables (.env)

| Variable | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather |
| `TELEGRAM_ALLOWED_USER_IDS` | Telegram IDs separated by comma |
| `ACTUAL_BUDGET_URL` | Internal Docker URL (http://actual-budget:5006) |
| `ACTUAL_BUDGET_PASSWORD` | Actual Budget password |
| `ACTUAL_BUDGET_SYNC_ID` | Sync ID from Actual Budget settings |
| `OLLAMA_URL` | Ollama URL (can be on another machine on the network) |
| `OLLAMA_MODEL` | Vision model (qwen2.5vl:3b) |
| `MEMORY_DB_PATH` | SQLite path (/app/data/memory.db) |
| `DEFAULT_CURRENCY` | Default currency (EUR) |
| `JWT_SECRET` | Secret for JWT tokens (web auth) |

---

## Docker — services

```yaml
actual-budget  ← port 5006, data in ./data/actual
ollama         ← port 11434, models in ollama_data volume
majordom       ← FastAPI backend + serving frontend build
```

Ollama can be external (on another machine on the network) — set `OLLAMA_URL` accordingly.

---

## SQLite — schema

```sql
transactions        ← photo receipts + manual transactions (local context)
merchant_mappings   ← merchant → confirmed category (SmartCategorizer)
category_keywords   ← keywords → category
budget_limits       ← monthly limits per category
csv_profiles        ← saved CSV profiles (ING, crypto.com, etc.)
```

---

## Code conventions

- **Type hints** on all public functions
- **snake_case** for Python variables and functions; **camelCase** in TypeScript/React
- **logging** instead of print (`logger = logging.getLogger(__name__)`)
- **Do not duplicate logic** between bot and backend
- **Any write** to Actual Budget → `actual.commit()` at the end
- **No comments** explaining what the code does — function and variable names do that; comments only for non-obvious behaviors

---

## Implemented features

- [x] Receipt photo processing with AI vision (Ollama)
- [x] Manual transaction (/add on Telegram)
- [x] Balance and statistics (/balance, /stats on Telegram)
- [x] CSV import with automatic format detection (ING, crypto.com, Revolut, etc.)
- [x] Auto-categorization from confirmed history (merchant_mappings)
- [x] Confirmed categories propagated to Actual Budget
- [x] Deduplication on re-import (SHA256 on date+merchant+amount)
- [x] Account selection on save (if multiple accounts exist) — Telegram
- [x] Web UI (PWA) v2: FastAPI + React, JWT auth, receipt photo, monthly chart

## Up next (implementation order)

1. **Account selection on web PWA** — prerequisite for everything that follows
2. **Budget status dashboard** — chart per category + conversational rebalancing
3. **Bottom navigation bar** — Home / Import / Chat
4. **Chat AI assistant** — ActualQL + Ollama, executes actions from chat
5. **CSV import UI web** — port from Telegram
6. **Interactive messages in chat** — buttons, transaction confirmation
7. **Document Management System** — photo/PDF → data extraction → storage
8. **Conversational onboarding** — Q1-Q15, complete Actual Budget configuration

**Complete details for each feature** → see `ROADMAP.md`

---

*Last updated: 2026-04-18 (session — AB architecture, onboarding, PWA platform)*
