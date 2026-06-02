# 09 — Web UI v2 architecture

## What changed from v1

The Telegram interface was replaced by a web app (PWA). Business logic didn't change — only the "transport" through which it reaches you.

**Before (v1):**
```
You → Telegram → bot/handlers.py → ocr/ + memory/ + actual_client/
```

**Now (v2):**
```
You → Browser → backend/api/ → backend/services/ → backend/core/
```

Telegram still works as an optional transport (`--profile telegram`), but all new development targets the web.

## v2 structure

```
majordom-financiar/
├── backend/
│   ├── core/               ← business logic
│   │   ├── ocr/            ← VisionEngine — extracts data from receipts
│   │   ├── memory/         ← MemoryDB + SmartCategorizer + scheduler
│   │   ├── actual_client/  ← ActualBudgetClient
│   │   ├── csv_importer/   ← CSV parsing
│   │   └── config/         ← settings.py, categories.json
│   ├── api/                ← route handlers FastAPI (replace bot/handlers.py)
│   │   ├── auth.py         ← POST /api/auth/login → JWT
│   │   ├── chat.py         ← streaming chat + tool calling
│   │   ├── receipts.py     ← receipt photo flow
│   │   ├── transactions.py ← GET /transactions, /accounts, /stats
│   │   └── ...
│   ├── tools/
│   │   ├── registry.py     ← TOOLS list + execute_tool dispatcher
│   │   └── finance/        ← actual_budget.py, vehicle.py
│   └── services/
│       ├── chat_service.py     ← ChatService (LLM wrapper)
│       └── receipt_service.py  ← pure business logic, no HTTP/Telegram deps
├── bot/                    ← Telegram (optional, unchanged)
└── frontend/               ← React PWA
    └── src/
        ├── pages/          ← Home, Chat, Login
        ├── components/     ← cards, BudgetDashboard, BottomNav
        └── lib/            ← api.ts (all fetches), auth.ts (JWT storage)
```

## The key concept: Service Layer

`backend/services/receipt_service.py` is the center of the app. It contains business logic without knowing whether it's called from web or Telegram.

```python
# receipt_service.py — called from both places:
service = ReceiptService()
result = await service.process_image(image_bytes)  # OCR + categorize
tx = await service.confirm(merchant, amount, ...)   # save to Actual Budget
```

```python
# backend/api/receipts.py (web) — formats result as JSON
return ReceiptDraft(merchant=result["merchant"], ...)

# bot/handlers.py (Telegram) — formats result as Telegram message
await update.message.reply_text(f"Merchant: {result['merchant']}")
```

Same service, two response formats. If you change the logic (e.g. add amount validation), you change it in one place.

## Receipt photo flow in v2

```
User selects photo in browser
        │
        ▼
handleReceiptFile(file) in chat — adds message role:'receipt' status:'loading'
        │
        ▼
uploadReceipt() in background
        │
        ▼
POST /api/receipts (backend/api/receipts.py)
  ├── saves photo to disk: /app/data/uploads/{uuid}.jpg
  └── calls ReceiptService.process_image()
              ├── VisionEngine.extract_from_bytes() → LLM (~instant on cloud)
              ├── SmartCategorizer.suggest() → category suggestion
              └── ActualBudgetClient.get_accounts() → account list
        │
        ▼
ReceiptDraft JSON → chat message updated → ReceiptCard renders inline
        │
        ▼
User edits + presses Confirm
        │
        ▼
POST /api/receipts/{id}/confirm
  └── ReceiptService.confirm()
              ├── ActualBudgetClient.add_transaction() → Actual Budget
              └── SmartCategorizer.learn() → updates memory
        │
        ▼
Checkmark animation → stays in chat history
```

**Key difference from old flow:** no navigation to `/receipt` page, no `sessionStorage`. The receipt lives inline in chat as a message.

## Docker Compose v2 — services

```
actual-budget   ← unchanged (port 5006)
ollama          ← optional local inference (port 11434)
majordom        ← FastAPI backend + React via Nginx (port 3000)
majordom-bot    ← optional Telegram: --profile telegram
```

**Why `majordom-api` isn't exposed directly?**
All traffic goes through Nginx (`majordom-web`). Nginx proxies `/api/` to `http://majordom-api:8000/api/`. Benefit: one port, one SSL certificate, API inaccessible directly from outside Docker.

## Auth — JWT tokens

Users defined in `.env`:
```
USER1_USERNAME=yourname
USER1_PASSWORD=<hash>
```

At login:
1. POST `/api/auth/login` with `{username, password}`
2. Backend verifies password (bcrypt), returns JWT token
3. Token saved in `localStorage` (`majordom_token` key) — 7 days
4. All subsequent requests send `Authorization: Bearer <token>`

**Always use `getToken()` from `frontend/src/lib/auth.ts`** — never `localStorage.getItem('token')` or any other key. The key is `majordom_token`.

## Camera and Gallery on mobile

```html
<!-- Camera: capture="environment" opens rear camera directly -->
<input type="file" accept="image/*" capture="environment">

<!-- Gallery: no capture → user chooses from library -->
<input type="file" accept="image/*">
```

**Requirement:** HTTPS for camera access in browser. Use Tailscale Serve for automatic Let's Encrypt cert.

## Troubleshooting reference

| Problem | Where to look |
|---------|---------------|
| Login doesn't work | `docker compose logs majordom` — check USER1_USERNAME/PASSWORD in .env |
| Photo not processing | `docker compose logs majordom` — check LLM connectivity |
| Transaction not appearing | Check ACTUAL_BUDGET_SYNC_ID and ACTUAL_BUDGET_PASSWORD |
| Frontend blank/JS errors | `docker compose logs majordom` — check React build |
| Telegram bot not working | `docker compose --profile telegram logs majordom-bot` |
