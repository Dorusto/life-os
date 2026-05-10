# System Prompt for Cline / other AI agents

> Paste the text below into the "Custom Instructions" section of Cline or any other AI agent (Cursor, Aider, etc.).
> Keep this file up to date — it is the fallback when Claude Code is not available.

---

You are working on **Majordom** — a unified personal AI assistant (finance, wellness, digital) built as a self-hosted PWA.

**Read `ARCHITECTURE.md` before making any changes. It contains the full architecture, principles, and migration roadmap.**

## What Majordom is

One app, one deployment, one LLM with pluggable tool integrations per domain:
- Finance → Actual Budget + Ghostfolio
- Wellness → future integrations
- Digital → future integrations

The LLM receives tool descriptions and decides which tool to call based on context. SQLite is for conversational memory only — financial data belongs in Actual Budget.

## How tasks are assigned

Complex tasks come as prompt files from `scripts/prompts/`. Each `.md` file is a self-contained spec — read it fully before starting. Do not improvise architecture decisions; if something is unclear, stop and ask.

## Non-negotiable rules

1. **Async only** — all handlers are async. Sync code (actualpy) must run via `ThreadPoolExecutor` as shown in `backend/core/actual_client/client.py`.

2. **Config via settings** — never use `os.getenv()` directly. Always `from backend.core.config import settings`.

3. **Auth on every endpoint** — web API endpoints use `get_current_user` dependency from `backend/api/auth.py`.

4. **actualpy order** — always: `download_budget()` first, then queries, then `actual.commit()` for writes.

5. **No new dependencies** — do not add libraries to `requirements*.txt` without explicit user approval.

6. **Don't touch what works** — do not refactor working features unless explicitly asked.

7. **No financial data in SQLite** — transactions, balances, budgets belong in Actual Budget. SQLite is for merchant mappings, CSV profiles, and conversation context only.

8. **English only** — all code, comments, docstrings, and log messages in English.

## When in doubt

Stop and ask. Do not make architecture decisions. For anything beyond the spec, the user will consult Claude Code first.

## Stack

- **Backend:** FastAPI + Python 3.11, uvicorn, JWT auth (python-jose + passlib + bcrypt==3.2.2)
- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS (dark theme), TanStack Query v5, Framer Motion
- **AI/OCR:** Ollama (qwen2.5vl:3b for vision, qwen2.5:7b for chat)
- **Budget:** Actual Budget via actualpy
- **Memory:** SQLite (`/app/data/memory.db`) — memory namespaces: finance/, wellness/, digital/
- **Deploy:** Docker Compose (actual-budget, ollama, majordom-api, majordom-web)
- **Bot:** python-telegram-bot 21 (maintenance mode — no new features)

## Key files

```
backend/
  main.py                        — FastAPI entry point
  api/auth.py                    — JWT login + get_current_user dependency
  api/chat.py                    — streaming chat endpoint + financial context fetch
  api/receipts.py                — POST /api/receipts, POST /api/receipts/{id}/confirm
  api/transactions.py            — GET /api/transactions, /accounts, /stats
  api/csv_import.py              — CSV import flow
  services/receipt_service.py    — OCR + confirm logic
  core/actual_client/client.py   — ActualBudgetClient (get_full_context for chat)
  core/ocr/vision_engine.py      — VisionEngine (Ollama vision)
  core/memory/categorizer.py     — merchant → category (HISTORY + KEYWORDS only, no TF-IDF)
  core/memory/database.py        — SQLite interface (transactions/budget_limits = LEGACY)
  core/config/settings.py        — all config from .env

frontend/src/
  App.tsx                        — routes + BottomNav
  pages/Home.tsx                 — spending chart + recent transactions
  pages/ReceiptFlow.tsx          — receipt upload → review → confirm
  pages/ImportPage.tsx           — CSV import wizard
  pages/Chat.tsx                 — AI chat assistant
  components/BottomNav.tsx       — Home / Import / Chat
  lib/api.ts                     — all fetch calls to backend
  lib/auth.ts                    — JWT localStorage helpers

scripts/prompts/                 — DeepSeek task specs (one .md per task)
ARCHITECTURE.md                  — source of truth for architecture and migration order
ROADMAP.md                       — full feature list with implementation details
```

## Implemented features (do not reimplement)

- Receipt photo flow: upload → OCR → category suggestion → account selection → confirm → Actual Budget
- Chat UI + streaming backend: `Chat.tsx` → `/api/chat` → Ollama (single session, no 429)
- CSV import wizard UI: `ImportPage.tsx` (4-step wizard)
- Bottom navigation bar: Home / Import / Chat
- JWT auth: login page, token in localStorage
- Monthly spending chart on Home page

## Current migration status (2026-05-10)

- [x] Step 0 — Architecture documented (ARCHITECTURE.md)
- [x] Step 1 — Audit: TF-IDF removed, legacy tables marked
- [x] Step 2 — Bug #27 fixed: chat context fetched in single AB session
- [ ] Step 3 — Account selection on web PWA
- [ ] Step 4 — Budget status dashboard
- [ ] Step 5 — Tool registry migration

## Up next

See `ROADMAP.md` and `scripts/prompts/` for detailed specs.

1. **Account selection on web PWA** — when saving a transaction (receipt, manual, CSV), ask which account if multiple exist
2. **Budget status dashboard** — progress bars per category via ActualQL + conversational rebalancing
3. **Connect CSV import to real backend** — wire `ImportPage.tsx` to `/api/import/csv`
4. **Chat with tool calling** — AI executes actions (add transaction, set budget) not just answers questions
