# Majordom v2 — Architecture Decisions

> Decisions made before implementation. Reference this before writing any code.
> Session date: 2026-04-12

> **Cleanup:** `ARCHITECTURE.md` (v1 Telegram bot) must be deleted as soon as v2 is fully implemented.
> It is kept during development as reference for `core/` module quirks (actualpy, async/sync patterns, etc.).

---

## Context

Migrating from Telegram bot to a self-hosted Web UI (PWA).  
The business logic stays intact — only the presentation layer changes.

---

## Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend | FastAPI (Python) | Already in Python; async; business logic unchanged |
| Frontend | React + Tailwind + shadcn/ui | Mobile-first PWA; good for content/open-source visibility |
| AI vision | Ollama + qwen2.5vl (unchanged) | Local inference, no cloud |
| Budget | Actual Budget (unchanged) | Self-hosted |
| Database | SQLite (unchanged) | Zero config; perfect for 2 users; migrate to PostgreSQL later if needed |
| Deploy | Docker Compose (Coolify-compatible) | One-click deployment |

---

## Auth Strategy

- 2 users defined in `.env` (username + bcrypt password hash)
- JWT tokens, 7-day expiry
- No OAuth, no role-based access, no server-side sessions
- Both users share the same Actual Budget instance — same data, no isolation
- **Future (PostgreSQL migration):** add `user_id` to tables for per-user isolation

---

## Multi-user Data Model

- **Shared data** — no `user_id` on tables in v1
- Both users see all transactions, all categories, all imports
- Mirrors current Telegram behavior (2 allowed Telegram IDs, same Actual Budget)
- Per-user isolation deferred to PostgreSQL migration

---

## Database

- **Stay on SQLite** for v1
- All existing tables unchanged: `transactions`, `merchant_mappings`, `category_keywords`, `budget_limits`, `csv_profiles`
- Add minimal new tables: `users` (id, username, password_hash)
- **PostgreSQL migration path:** swap SQLAlchemy dialect, run Alembic migration, optionally add `user_id` columns

---

## Folder Structure

```
majordom-financiar/
├── backend/
│   ├── api/                  ← route handlers (replace bot/)
│   │   ├── auth.py           ← login, JWT issue/verify
│   │   ├── receipts.py       ← photo upload, OCR processing
│   │   ├── transactions.py   ← list, categorize, manual add
│   │   └── csv.py            ← CSV import flow
│   ├── core/                 ← business logic — UNTOUCHED
│   │   ├── ocr/              ← moved from ocr/
│   │   ├── csv_importer/     ← moved from csv_importer/
│   │   ├── memory/           ← moved from memory/
│   │   └── actual_client/    ← moved from actual_client/
│   ├── config/               ← settings.py, categories.json
│   └── main.py               ← FastAPI app init
├── frontend/
│   ├── src/
│   │   ├── pages/            ← Dashboard, Receipts, Import, Settings
│   │   ├── components/       ← shadcn/ui + custom components
│   │   └── lib/              ← API client, hooks, utils
│   └── package.json
├── docker-compose.yml
├── .env
└── .env.example
```

---

## Docker Compose Services

```yaml
actual-budget      ← unchanged (port 5006)
ollama             ← unchanged (port 11434, GPU optional)
majordom-api       ← FastAPI backend (replaces majordom-bot)
majordom-web       ← Nginx serving React build (separate from API)
```

Frontend is a **separate service** (Nginx) — cleaner for Coolify deployment,
easier to update independently.

---

## What Stays vs What Gets Refactored

| Module | Status | Notes |
|--------|--------|-------|
| `ocr/` | ✅ unchanged | moved to `backend/core/ocr/` |
| `actual_client/` | ✅ unchanged | |
| `memory/` | ✅ unchanged | |
| `csv_importer/` | ✅ unchanged | |
| `config/` | ✅ unchanged | |
| `bot/main.py` | ❌ removed | replaced by `backend/main.py` (FastAPI) |
| `bot/handlers.py` | ❌ removed | replaced by `backend/api/*.py` |
| `bot/keyboards.py` | ❌ removed | logic moves to React components |
| `bot/csv_wizard.py` | ❌ removed | Telegram state machine → API endpoint + UI state |
| `bot/budget_wizard.py` | ❌ removed | → Settings page in UI |

**~70% of code stays untouched.** Only the presentation layer is rewritten.

---

## Photo Upload (Mobile PWA)

- Use two buttons in the UI: **Camera** and **Gallery**
- Camera button: `<input type="file" accept="image/*" capture="environment">`
  → opens rear camera directly
- Gallery button: `<input type="file" accept="image/*">`
  → opens photo library (no `capture` attribute = user chooses from gallery)
- Server-side image compression already in place (Pillow resize to 512px before Ollama)

### HTTPS Requirement

Camera and file access in browsers require HTTPS. Solutions:

| Scenario | HTTPS Solution |
|----------|----------------|
| Tailscale access | `tailscale cert device.tail-xxx.ts.net` (free, automatic Let's Encrypt) |
| Coolify with custom domain | Coolify handles Let's Encrypt automatically |
| Local development | `localhost` — browsers allow camera without HTTPS |

---

## Key Architectural Principle

> Replace the interface, not the brain.

The Telegram bot was the interface. FastAPI + React is the new interface.
The OCR engine, categorizer, CSV importer, and Actual Budget client
are the brain — they don't change.
