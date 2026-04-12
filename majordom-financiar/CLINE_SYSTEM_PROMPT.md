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

These tasks are self-contained and can be implemented without backend changes.
When done, the user will review and integrate with Claude Code.

---

### Task 1 — Chat page UI (frontend only, no backend)

**File to replace:** `frontend/src/pages/ChatPage.tsx`

Replace the current placeholder with a full chat UI:

- Scrollable message list: user messages right (indigo bubble), assistant messages left (surface bubble)
- Auto-scroll to latest message on new message
- Fixed input bar at `bottom-16` (above bottom nav), with send button (disabled when empty)
- Welcome message from Majordom on first load: *"Hello! I'm Majordom, your financial assistant. Ask me anything about your spending."*
- Loading indicator: 3 animated dots (pulse) while waiting for reply
- Message type: `{ id: string, role: 'user' | 'assistant', content: string, timestamp: Date }`
- `handleSend(message: string)` — adds user message, then after 1s adds a mock assistant reply: *"Chat backend coming soon. I'll be able to answer questions about your finances shortly."*
- No real API calls — just local state with mock response
- Style: matches existing dark theme (background `#0F0F0F`, surface `#1A1A1A`, accent `#6366F1`)

---

### Task 2 — CSV Import wizard UI (frontend only, no backend)

**File to replace:** `frontend/src/pages/ImportPage.tsx`

Multi-step wizard with 4 steps and a progress indicator at top:

**Step 1 — Upload**
- Drag & drop zone + file picker button (`accept=".csv"`)
- On file select: show filename + size, enable "Next" button
- Mock: clicking Next goes to Step 2

**Step 2 — Preview**
- Table with columns: Date | Merchant | Amount | Category
- 8 hardcoded mock rows (mix of dates, merchants, amounts)
- 2 rows marked as duplicate: grey row + badge "already imported"
- Category column: `<select>` dropdown with hardcoded categories matching `backend/core/config/categories.json` names
- Account selector at top: `<select>` with 2 mock accounts
- "Back" + "Confirm Import" buttons

**Step 3 — Confirm**
- Summary card: "6 transactions to import · 2 duplicates skipped · Total: €234.50"
- "Back" + "Import" buttons
- Clicking Import goes to Step 4

**Step 4 — Done**
- Same success animation as `ReceiptFlow.SuccessScreen` (reuse the component or copy the pattern)
- "Back to Home" button → navigate('/')

Types to use (same as existing api.ts):
```typescript
interface Category { id: string; name: string; emoji: string }
interface AccountOption { id: string; name: string }
```

---

### Task 3 — Financial assistant system prompt

**New file:** `backend/services/chat_service.py`

Create a `ChatService` class with:

```python
class ChatService:
    def build_system_prompt(self, context: dict) -> str:
        """
        context keys:
          accounts: list[dict]  — [{name, balance}]
          stats: dict           — {month, year, total, count, categories: [{name, total, percentage}]}
          recent_transactions: list[dict]  — [{date, merchant, amount, category}] last 10
          user_profile: dict | None  — {income, fixed_costs, goals} if onboarding complete
        """
        ...

    async def chat(self, message: str, history: list[dict]) -> str:
        """
        Calls Ollama /api/chat with qwen2.5:7b.
        history format: [{"role": "user"|"assistant", "content": str}]
        Returns assistant reply as string.
        """
        ...
```

System prompt requirements:
- Inject real financial data from context (formatted as readable text, not JSON)
- Personality: concise, practical, friendly — not a generic chatbot
- Language: auto-detect from user message (respond in same language: RO/EN/NL)
- Scope: only financial topics — politely redirect off-topic questions
- Tool support: include Ollama function calling schema for:
  - `get_balance()` — returns current account balances
  - `get_monthly_stats(month, year)` — returns spending breakdown
  - `add_transaction(merchant, amount, date, category_id, account_id)` — adds expense

Use `aiohttp` (already in requirements) for Ollama HTTP calls. Base URL: `settings.ollama.url` (already in config).

---

### Task 4 — Chat API endpoint

**New file:** `backend/api/chat.py`

```python
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from backend.api.auth import get_current_user
from backend.services.chat_service import ChatService

router = APIRouter()

class ChatMessage(BaseModel):
    role: str   # "user" or "assistant"
    content: str

class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []

class ChatResponse(BaseModel):
    reply: str

@router.post("/chat", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    current_user: str = Depends(get_current_user),
):
    ...
```

Implementation:
- Instantiate `ChatService`
- Fetch context: call `ActualBudgetClient` for accounts + monthly stats + last 10 transactions
- Call `chat_service.chat(req.message, req.history)`
- Return `ChatResponse(reply=...)`
- Wrap in try/except — return 503 if Ollama is unreachable

Also add to `backend/main.py`:
```python
from backend.api import chat
app.include_router(chat.router, prefix="/api")
```

And add to `frontend/src/lib/api.ts`:
```typescript
export async function sendChatMessage(
  message: string,
  history: { role: string; content: string }[]
): Promise<{ reply: string }> {
  return request('/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history }),
  })
}
```
