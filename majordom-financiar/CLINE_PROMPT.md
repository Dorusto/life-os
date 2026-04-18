# System Prompt pentru Cline / alt agent AI

> Copiază textul de mai jos în secțiunea "Custom Instructions" din Cline sau orice alt agent AI (Cursor, Aider, etc.).
> Ține acest fișier actualizat — e fallback-ul pentru când nu ai acces la Claude Code.

---

You are working on **Majordom Financiar**, a self-hosted personal finance assistant.

**Read `CLAUDE.md` before making any changes. It contains the full architecture, stack, and roadmap.**

## Non-negotiable rules

1. **Async only** — all handlers are async. Never call sync code directly in async functions. Sync code (actualpy) must run via `ThreadPoolExecutor` as shown in `backend/core/actual_client/client.py`.

2. **Config via settings** — never use `os.getenv()` directly in modules. Always import from `backend.core.config import settings`.

3. **Auth decorator** — every new Telegram command handler must be decorated with `@auth_required`. Web API endpoints use the `get_current_user` FastAPI dependency from `backend/api/auth.py`.

4. **actualpy order** — always: `download_budget()` first, then queries, then `actual.commit()` for any write.

5. **No new dependencies** — do not add libraries to any `requirements*.txt` without explicit user approval.

6. **Don't touch what works** — if a feature is working, don't refactor it unless explicitly asked.

7. **Backend imports** — all imports use `from backend.core.xxx import ...` (PYTHONPATH=/app). Never use relative imports.

## When in doubt

Stop and ask the user. Do not make assumptions about architecture decisions.
For complex changes (new modules, schema changes, async patterns), the user will consult Claude Code first.

## Stack summary

- **Backend:** FastAPI + Python 3.11, uvicorn, JWT auth (python-jose + passlib + bcrypt==3.2.2)
- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS (dark theme), TanStack Query v5, Framer Motion
- **AI/OCR:** Ollama (qwen2.5vl:7b for vision, qwen2.5:7b for chat/tools)
- **Budget:** Actual Budget via actualpy
- **Memory:** SQLite (`/app/data/memory.db`)
- **Deploy:** Docker Compose (actual-budget, ollama, majordom-api, majordom-web)
- **Bot:** python-telegram-bot 21 (optional, Docker profile "telegram")

## Key file locations

```
backend/
  main.py                    — FastAPI app entry point
  api/auth.py                — JWT login + get_current_user dependency
  api/receipts.py            — POST /api/receipts, POST /api/receipts/{id}/confirm
  api/transactions.py        — GET /api/transactions, /accounts, /stats
  services/receipt_service.py — OCR + confirm logic (transport-agnostic)
  core/actual_client/client.py — ActualBudgetClient
  core/ocr/vision_engine.py  — VisionEngine (Ollama vision)
  core/memory/categorizer.py — merchant → category memory (SQLite)
  core/config/settings.py    — all config from .env

frontend/src/
  App.tsx                    — routes + BottomNav (hidden on /login, /receipt)
  pages/Home.tsx             — receipt scan + spending chart + recent transactions
  pages/ReceiptFlow.tsx      — multi-step receipt flow (upload → review → confirm)
  pages/ImportPage.tsx       — CSV import (placeholder)
  pages/ChatPage.tsx         — AI chat assistant (placeholder)
  components/BottomNav.tsx   — fixed bottom nav: Home / Import / Chat
  components/SpendingChart.tsx — SVG donut chart (no library)
  lib/api.ts                 — all fetch calls to backend
  lib/auth.ts                — JWT localStorage helpers
```

---

## Implemented features (do not reimplement)

- Receipt photo flow: upload → OCR → category suggestion → account selection → confirm → Actual Budget
- Chat UI + backend: `ChatPage.tsx` → `/api/chat` → `chat_service.py` → Ollama streaming
- CSV Import wizard UI: `ImportPage.tsx` (4-step wizard — currently wired to mock data)
- Bottom navigation bar: Home / Import / Chat
- JWT auth: login page, token in localStorage, `get_current_user` dependency on all endpoints
- Monthly spending chart on Home page

## Up next (implementation order)

See `ROADMAP.md` for full details on each item.

1. **⚠️ Architecture audit** — align existing code with AB principle; remove `transactions` and `budget_limits` SQLite tables; verify `merchant_mappings` sync to AB rules
2. **Account selection on web PWA** — when saving a transaction, ask which account (receipt, manual, CSV)
3. **Budget status dashboard** — progress bars per category via ActualQL + conversational rebalancing via `setBudgetAmount()`
4. **Connect CSV import to real backend** — wire `ImportPage.tsx` to `POST /api/import/csv` and `POST /api/import/csv/confirm`; reuse logic from `backend/core/csv_importer/`
5. **Chat AI with real AB data** — ActualQL queries in `chat_service.py`, structured action blocks in responses
6. **Document Management System** — photo/PDF → Ollama type detection → SQLite `documents` table
7. **Conversational onboarding** — 15-question flow → automatic Actual Budget configuration
