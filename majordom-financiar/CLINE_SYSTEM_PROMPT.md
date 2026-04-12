# System Prompt pentru Cline / alt agent AI

> Copiază textul de mai jos în secțiunea "Custom Instructions" din Cline.

---

You are working on **Majordom Financiar**, a self-hosted personal finance assistant.

**Read `CLAUDE.md` before making any changes. It contains the full architecture, stack, and roadmap.**

## Non-negotiable rules

1. **Async only** — all handlers are async. Never call sync code directly in async functions. Sync code (actualpy) must run via `ThreadPoolExecutor` as shown in `backend/core/actual_client/client.py`.

2. **Config via settings** — never use `os.getenv()` directly in modules. Always import from `backend.core.config import settings`.

3. **Auth decorator** — every new Telegram command handler must be decorated with `@auth_required`.

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

## Tasks ready to implement (prepared for async work)

✅ **Task 1** — Chat UI: implemented in `ChatPage.tsx` + wired to `/api/chat`
✅ **Task 2** — CSV Import wizard UI: implemented in `ImportPage.tsx` (4-step wizard, mock data)
✅ **Task 3** — ChatService + system prompt: implemented in `backend/services/chat_service.py`
✅ **Task 4** — Chat API endpoint: implemented in `backend/api/chat.py`

### Next task for Cline — Connect CSV import to real backend

**Goal:** wire the `ImportPage.tsx` wizard to real backend endpoints (replace mock data).

**Step 1 — Backend: two new endpoints in `backend/api/csv_import.py`**

```python
# POST /api/import/csv
# Body: multipart/form-data with file + account_id
# Returns: ImportPreview (list of parsed rows + duplicates flagged)

# POST /api/import/csv/confirm
# Body: { account_id, rows: [{date, merchant, amount, category_id, is_duplicate}] }
# Returns: { imported: int, skipped: int }
```

Reuse existing logic from `bot/csv_wizard.py` and `backend/core/csv_importer/`.
Use `ActualBudgetClient` to save confirmed transactions (same as receipt confirm flow).
Deduplication: use the same SHA256(date+merchant+amount) hash as receipts.

**Step 2 — Frontend: replace mock data in `ImportPage.tsx`**

In Step 1 (upload): on file select, call `POST /api/import/csv` with the file + selected account.
Replace `MOCK_ROWS` with real response. Replace `MOCK_ACCOUNTS` with `getAccounts()` from api.ts.
In Step 3 (confirm): call `POST /api/import/csv/confirm` and show real imported/skipped counts.

**New api.ts functions to add:**
```typescript
export async function previewCsvImport(file: File, accountId: string): Promise<ImportPreview> { ... }
export async function confirmCsvImport(data: ImportConfirm): Promise<ImportResult> { ... }
```
