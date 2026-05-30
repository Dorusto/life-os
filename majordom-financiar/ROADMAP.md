# Majordom — Roadmap

---

## Core Philosophy

> **Majordom acts. The user approves.**

Every product, UI, or architectural decision is filtered through two questions:
1. Can Majordom deduce this from data?
2. If not — can it ask conversationally, without a form?

If both answers are no → only then is a dedicated UI built.

**Principles:**
- **Zero configuration at setup** — one question on first launch
- **Proactive AI, not reactive** — Majordom initiates, not the user
- **Everything through chat** — import, settings, preferences, goals — all through conversation
- **The user approves, AI executes** — no action without confirmation
- **At most one message per day** — quality, not quantity
- **Everything is adjustable through chat** — no default is permanent

*Added: 2026-05-30*

---

## Milestones at a glance

Progress overview. Each milestone is a coherent, shippable unit — do not start the next until the current one is complete. Details for every item are further down in this document.

---

### ✅ Milestone 0 — MVP (complete)

The foundation. All three items were prerequisites for everything else.

| # | Feature | Status |
|---|---------|--------|
| 0.1 | Architecture audit — remove `transactions` + `budget_limits` from SQLite | ✅ done |
| 0.2 | Account selection on web PWA (receipt, chat, CSV import) | ✅ done |
| 0.3 | Budget status dashboard — spending vs budget per category, home page | ✅ done |

Supporting work also shipped: Chat AI with propose_transaction tool, receipt photo flow on web, CSV import on web, bottom nav bar, proposal card with category + account selector, account balance in dashboard header.

---

### ✅ Validate: tool_choice=auto without intent routing (complete)

Validated 2026-05-20. qwen3:8b was inconsistent — failed on complex sentences, wrote tool calls as text. Tested granite3.2:8b, hermes3:8b (same Ollama template bug). **qwen3:14b passes all 5 scenarios** (expense, income, rebalance, query, off-topic). `OLLAMA_CHAT_MODEL=qwen3:14b` set in production.

Also shipped as part of this validation:
- Pre-M2 query tools implemented: `get_accounts`, `get_monthly_stats`, `get_budget_status`, `get_transactions`, `get_spending_history` — LLM fetches data on demand, system prompt is now minimal.
- `merchant` → `payee` rename across all files (issue #54 closed).
- Chat history pollution fix: confirmed proposals use `status` role, excluded from LLM history.
- DNS fix for Ollama container (model downloads from inside Docker).
- Transfer and income-category transactions correctly excluded from spending stats.
- Budget rebalance card: editable dropdowns for source/destination with fuzzy category matching.
- Chat layout: `h-dvh` container, autofocus, arrow-key history navigation.

---

### 🔲 Milestone 1 — Daily Driver

Makes Majordom genuinely useful every day without needing to open Actual Budget.

| # | Feature | Notes |
|---|---------|-------|
| ✅ 1.1 | Budget conversational rebalancing | Shipped 2026-05-19. `propose_budget_rebalance` tool + `BudgetRebalanceCard` + `POST /api/budget/rebalance`. Fix: proposal JSON detected in `onChunk` (not `onComplete`) to avoid React state race condition. |
| ✅ 1.2 | Interactive messages in chat (rich actions) | Shipped 2026-05-20. ProposalCard, BudgetRebalanceCard (editable dropdowns), AccountTransferCard, ClarificationCard. All cards parsed from streaming JSON and rendered inline in chat. |
| ⏸️ 1.3 | OFX/QFX import support | On hold — no OFX/QFX files available to test. Revisit when needed. |
| ✅ 1.4 | Duplicate merge instead of silent delete | Shipped 2026-05-20. On CSV import: if duplicate exists in AB with no category AND CSV row has a confirmed category → update the existing transaction's category instead of skipping. Result shown in Step 4: "X categories updated". Also fixed: notes field always visible in preview; "Other" uncategorized rows show yellow warning in Step 3; auto-suggested non-Other categories show soft advisory only. |
| ✅ 1.5 | Dashboard correct numbers + CSV categories from AB | Shipped 2026-05-21. Tombstone remap in `get_budget_status`: spending from deleted categories fuzzy-matched to living equivalents (cutoff 0.4). CSV import: categories fetched from AB (single session), never created from hardcoded list. Dropped `transactions` + `budget_limits` tables from SQLite (architecture audit complete). BudgetDashboard: only budgeted categories shown, useful remaining/overspent indicator. |

---

### ✅ Pre-M2 — Chat Architecture: Query Tools (complete)

Shipped 2026-05-20 as part of the tool_choice=auto validation. All 5 query tools live in production.

---

### ~~🔲 Milestone 2 — Onboarding Flow~~ ❌ CANCELLED — replaced by M2-NEW

The 15-question wizard was the wrong approach. The user doesn't know what they want until they see real data. Abstract questions produce inaccurate answers and unnecessary friction on day 1. All onboarding code (`onboarding_service.py`, `onboarding.py`, `onboarding_state` table, chat.py triggers, progress bar in UI) is to be removed as part of M2-NEW cleanup. `ClarificationCard` is **kept** — it is a generic chat mechanism used outside onboarding.

---

### 🔲 M2-NEW — Proactive Majordom

Replaces M2 Onboarding and reprioritises M4 Smart Alerts as the immediate next milestone after M1. Majordom deduces context from real data and initiates — the user never fills a setup form.

**Philosophy:** Day 1 is one question. Weeks 1–4 are observation. Month 2+ is the first proactive insight.

| # | Feature | Notes |
|---|---------|-------|
| 2.1 | Daily message at configurable time | Default 20:00, adjustable through chat. APScheduler in FastAPI + Web Push (Telegram fallback). Uses `notification_rules` table (JSON config per type) + `notification_log` (anti-spam). |
| 2.2 | Income detection from recurring credits | Detect salary from same-payee same-approximate-amount monthly credits. No setup question. |
| 2.3 | Unexpected transaction reminder | SmartCategorizer assigns best-guess category to every transaction — nothing sits uncategorised in AB. Reminder fires for low-confidence assignments (< threshold) after 48h: *"You have X transactions I wasn't sure about. Want to review them?"* Threshold adjustable through chat. |
| 2.4 | Import nudge | If no transaction imported in N days → proactive message: *"It's been a while since your last import. Want to add recent transactions?"* N adjustable through chat. |
| 2.5 | First goal proposal after 2 months of data | Conversational, not a form. Majordom proposes based on observed spending patterns. |
| 2.6 | FIRE calculation | Available on demand at any time. After 6+ months of data, Majordom proactively opens the conversation. Before 6 months: calculation shown with explicit "preliminary estimate" caveat. |
| 2.7 | Charts inline in chat | Chart type adapted to message context. See table below. |

**Chart type by message context:**

| Majordom message | Chart type |
|------------------|-----------|
| Category budget exceeded | Bar — category vs budget |
| FIRE progress | Projection with milestone marker |
| Consistent savings | Trend line 3–6 months |
| Duplicate subscriptions | Pie breakdown of Lifestyle |
| Unusual transaction | Simple card with details |

**Cleanup actions (do first, in order):**
1. Delete onboarding code: `onboarding_service.py`, `api/onboarding.py`, `onboarding_state` table in `database.py`, all references in `chat.py` and frontend
2. Update `categories.json` to reflect the actual AB structure (7 top-level category groups, SmartCategorizer suggests at subcategory level)
3. Home UI redesign (see layout below)
4. Implement APScheduler + `notification_rules` + `notification_log` (foundation for all 2.x features)
5. Implement M2-NEW features in order: 2.1 → 2.3 → 2.4 → 2.2 → 2.5 → 2.6 → 2.7

**Navigation:** Home / Majordom (2 tabs). Import tab removed — entry point is the **+** button in the chat input field. Receipt and CSV flows unchanged technically. Urgent alerts: red dot on the Majordom tab icon, never banners on Home.

**Home screen layout:**

```
┌─────────────────────────────────────┐
│  [€ 1,240]   [€ 280,000]   [3.2%]  │  ← 3 large numbers, glanceable
│  Cashflow    Net Worth      FIRE    │
│  this month  total          progress│
├─────────────────────────────────────┤
│  Obligations                        │  ← scroll starts here
│  ING Mortgage  €890/mo  €186k left  │
│  Next payment: Jun 1                │
├─────────────────────────────────────┤
│  Budget — May                       │
│  🏠 Housing     ████░░  €920/€1100  │
│  🛒 Daily Living ██░░░░  €340/€600  │
│  🚗 Transport    ███░░░  €180/€250  │
│  ...            (tap for subcats)   │
├─────────────────────────────────────┤
│  Goals                              │
│  Emergency fund  ██████░  €8k/€10k │
│  Vacation        ███░░░░  €600/€1.5k│
└─────────────────────────────────────┘
```

- **Cashflow** — most actionable daily: am I on track this month? (+/- vs budget total)
- **Net Worth** — slow-moving, changes monthly; second position
- **FIRE %** — long-term perspective metric; third position. Shows "est." until 6+ months of data
- **Obligations** — mortgage balance, monthly payment, next due date (from AB scheduled transactions)
- **Categories** — 7 top-level with progress bars; tap to drill into subcategories
- **Goals** — per-goal progress bar; data from AB
- No FIRE projection chart on Home — projection lives in chat or goal detail view

---

### 🔲 Milestone 3 — Vehicle Management

Complete replacement for Fuelio. **Architecture:** AB holds all costs as transactions under Transport category (general budget). SQLite `vehicle_log` holds vehicle-specific operational data (odometer, liters, per-vehicle breakdown). When user logs a refuel, Majordom does two things: `propose_transaction` → AB (financial) + INSERT → `vehicle_log` (operational). Financial questions ("how much did I spend on transport?") → AB. Efficiency questions ("what's my average consumption?") → SQLite.

| # | Feature | Notes |
|---|---------|-------|
| 3.1 | Vehicle profiles + log (SQLite schema) | `vehicles` + `vehicle_log` tables; car + motorcycle |
| 3.2 | Fuelio CSV import | Parse the 4-section Fuelio CSV; map CostTypeID → entry_type; deduplicate via `fuelio_unique_id` |
| 3.3 | Refuel recording from photos | Upload gas station receipt → extract liters/price/odometer; Majordom writes to both AB (cost) and vehicle_log (operational) |
| 3.4 | Consumption + cost calculations | L/100km per fill-up, moving average (last 5), cost/km, monthly charts |
| 3.5 | Reminders | APK/ITP + insurance renewal (30 days before); service by km or date |

---

### 🔲 Milestone 4 — Smart Alerts

Proactive notifications so Majordom finds problems before the user does.

| # | Feature | Notes |
|---|---------|-------|
| 4.1 | Extensible notification system | `notification_rules` (JSON config) + `notification_log` (anti-spam); APScheduler daily 08:00; Web Push primary, Telegram fallback |
| 4.2 | Budget alert | After each transaction: notify when category exceeds X% of monthly limit |
| 4.3 | Income variance alert | When received salary differs from scheduled → notify + offer category reallocation |
| 4.4 | Goal risk alert | Weekly: is contribution pace on track to meet goal date? |
| 4.5 | Recurring expense audit | Monthly: surface all recurring transactions + forgotten subscriptions |
| 4.6 | Vehicle reminders | Daily: APK/ITP, insurance, service by km |
| 4.7 | Market correction alert | Daily: ETF price API → notify on dip beyond threshold → "Buy from opportunity fund?" |
| 4.8 | Savings goals progress | Emergency fund, vacation, large purchases — progress bars in PWA |
| 4.9 | FIRE / Crossover Point Report | Use AB's native experimental report; Chat AI explains conversationally |

---

### 🔲 Milestone 5 — Integrations

External services and advanced tracking.

| # | Feature | Notes |
|---|---------|-------|
| 5.1 | Ghostfolio — investment monitoring | Self-hosted; ETF portfolio tracking; sync with AB off-budget accounts |
| 5.2 | Crypto tracker with sell alert | Average acquisition cost (manual or Bitvavo import); alert on return threshold; configurable sell strategy |
| 5.3 | Child portfolio dashboard | Off-budget AB account per child; conversational queries about growth |
| 5.4 | Freelance / ZZP dashboard | Separate deductible tracking via `#deductible` tag; year-end tax filter |
| 5.5 | Joint / couple budget | Shared AB file (Strategy A) or joint account in personal budget (Strategy B); contribution split by income |

---

### 🗄️ Backlog (low priority / on hold)

| Feature | Notes |
|---------|-------|
| User data export | Triggered by *"Export all my data"* in chat. Generates `majordom-export-YYYY-MM-DD.zip` on demand: `transactions.csv` + `budgets.csv` + `goals.json` from AB; `csv_profiles.json` + `merchant_mappings.json` + `preferences.json` from SQLite. Endpoint `GET /api/export` streams ZIP directly — no server-side storage. GDPR Art. 20 compliant. |
| Voice input in PWA | Whisper (Ollama local) → text; privacy-first |
| Automatic bank sync | GoCardless/Nordigen — on hold; EU individual developer access restricted; monitor PSD2/PSD3 |
| GPU inference for Ollama | Currently CPU (~60s/image); revisit with smaller quantized models |
| Async receipt processing queue | Upload multiple receipts → they go into a queue (pending → processing → done). User comes back later, clicks each processed receipt to review and confirm. No more waiting in real-time for OCR. Essential for CPU-only setups where each receipt takes 1-2 minutes. Implementation: `receipt_queue` table in SQLite + FastAPI BackgroundTasks + polling on frontend. Medium complexity (~1-2 days). |
| Cloud API support (Claude / Gemini / OpenAI) | Alternative to local Ollama for users without sufficient hardware. Hybrid mode: if `OLLAMA_URL` is absent, use configured cloud provider. Enables onboarding without any local server — relevant for non-homelab audience. |
| Caddy + custom domain for HTTPS | Alternative to Tailscale for users who want a memorable domain (e.g. majordom.home.ro). Caddy handles automatic HTTPS via Let's Encrypt. Requires a public domain pointed at the server. Better long-term than Tailscale for self-hosters with a domain. |
| Actual Budget mobile access via HTTPS | AB requires HTTPS (SharedArrayBuffer). Currently only accessible via SSH tunnel from PC. When Majordom is mature enough, expose AB behind a proper reverse proxy with HTTPS so power users can access it directly from mobile when needed. Low priority — Majordom is the intended interface, not AB directly. |
| Ollama model management from chat | User can type "install llava-phi3" or "what models do I have?" — Majordom queries and manages Ollama directly. Eliminates terminal access for model management. |
| Editable amount on proposal cards | `BudgetRebalanceCard` and `AccountTransferCard` should have an editable amount field so the user can correct the amount directly on the card without restarting the conversation. |
| Budget rebalancing by percentage / income | "Move 10% of my income to Restaurants" or "take 20% from Personal and add to Groceries". Requires knowing monthly income from AB (scheduled transactions). Enhancement on top of M1.1. |
| Document Management System | Full DMS: photo/PDF upload, AI type detection, field extraction, versioning, document storage. Cross-domain infrastructure — implement as foundation for Majordom Digital, not here. Financial-specific vehicle documents (tenaamstellingsverslag, insurance, APK) → handled in M3 as vehicle-scoped feature, not generic DMS. |
| RON / multi-currency | Via Rule Action Templating workaround; covered in onboarding Q8 |
| Automatic monthly report | Summary push / Telegram on 1st of month; Telegram version already implemented in `bot/handlers.py:_monthly_summary_job` (APScheduler, sends previous month stats) — port to backend as part of Milestone 4.1 notification system (web push primary, Telegram fallback) |

---

## Recommended Hardware

Majordom is designed to run entirely locally on a dedicated mini PC — no cloud, no GPU server, no monthly subscription.

**Target hardware: mini PC with modern AMD APU**

AMD APUs (Ryzen 7 8845HS, Ryzen AI 9 HX) include an integrated Radeon GPU (780M or better) that can accelerate Ollama inference via Vulkan — 3–5× faster than CPU-only, without requiring a discrete GPU. The CPU and iGPU share unified RAM, so 32GB is usable by both.

| Spec | Minimum | Recommended |
|------|---------|-------------|
| RAM | 16GB | 32GB |
| CPU | Any modern x86 (4+ cores) | AMD Ryzen 7 8845HS or equivalent |
| iGPU | None (CPU inference) | AMD Radeon 780M (Vulkan-accelerated Ollama) |
| Storage | 64GB NVMe | 128GB NVMe |
| Power consumption | — | ~15W idle, ~35W under load |
| Estimated cost | ~€150 (N100-based) | €350–500 |

**Why mini PC over other options:**
- Runs 24/7 silently at low power
- Fully self-contained — no dependency on a desktop PC being on
- Accessible price point for anyone who wants to self-host
- Models tested: `qwen2.5:7b` (chat), `qwen2.5vl:7b` (vision)

Brands to consider: Minisforum (UM890 Pro, UM773 Lite), Beelink (SEi series), GMKtec.

---

## Architectural Principle

**Majordom is a conversational interface over Actual Budget — not a financial application in its own right.**

Every financial action goes through Actual Budget's API. Majordom never stores financial data (amounts, balances, categories, dates, transactions) in SQLite or anywhere else. If Actual Budget has a tool for it, Majordom uses that tool — it does not reinvent it.

| Responsibility | Where it lives |
|----------------|---------------|
| Transactions, accounts, balances | **Actual Budget** |
| Categories, groups, budgets | **Actual Budget** |
| Goals, schedules, rules, transfers | **Actual Budget** |
| Reports, net worth, cash flow | **Actual Budget** |
| User preferences, onboarding state | **SQLite (Majordom)** |
| Conversation history | **SQLite (Majordom)** |
| Merchant→category mappings (until synced to AB rules) | **SQLite (Majordom) — temporary** |

SQLite in Majordom exists solely to understand the user and maintain conversation context. Once a merchant mapping is confirmed by the user, it is synced to an Actual Budget rule and the SQLite entry becomes a cache, not the source of truth.

When the Chat AI needs financial data to answer a question, it queries Actual Budget via ActualQL — it does not read from SQLite.

**UI principle:** When in doubt, solve it in chat before building a screen. If the user can say it, Majordom should understand it — a new UI page is a last resort, not a default.

---

## MVP — In This Order

Three things, in this sequence, before any new feature is added.

**Step 1 — Architecture audit** *(prerequisite)*
Clean up the existing codebase to match the architectural principle. The `transactions` and `budget_limits` tables in SQLite must be removed; data must flow through Actual Budget. Without this, every new feature is built on the wrong foundation. Details in `Up Next` below.

**Step 2 — Account selection on web PWA** *(prerequisite)*
Port the Telegram account selection flow to the browser. Required for correct transaction routing in all web flows (chat, receipt photo, CSV import). Details in `Up Next` below.

**Step 3 — Budget status dashboard (home page)** *(first user-visible MVP feature)*
The home page: budget overview for the current month, one row per category with a progress bar, data from Actual Budget via ActualQL. When a category goes over budget, Majordom initiates a conversational rebalancing in chat. This is the feature that makes Majordom feel like a product. Details in `Up Next` below.

---

## High Priority

### ✅ Implemented

- **Import CSV bank transactions** — upload CSV, format detection with Ollama, saved profiles, deduplication, refunds handled correctly
- **Categories on CSV import** — `actual_budget_id` saved in SQLite on import; category confirmation/change in Telegram automatically propagates to Actual Budget via `update_transaction_category(financial_id)`
- **Intelligent auto-categorization** — only from `merchant_mappings` confirmed by user (`from_history`), not from AI threshold; new merchant → always asked with suggestion
- **Standardized fields** — payee = merchant, notes = `[receipt photo]` / `[/add manual]` / `[import CSV]`
- **Universal anti-duplicate** — receipt photo + /add + CSV use the same SHA256 hash(date+merchant+amount)
- **Account selection on receipt photo (Telegram)** — if multiple accounts exist, the bot asks before saving
- **12 clean categories** — Food, Restaurants, Transport, Utilities, Health, Clothing, Home & Maintenance, Entertainment & Vacation, Children, Personal Money, Investments & Savings, Other
- **Web UI (PWA) v2** — FastAPI backend + React frontend, JWT authentication, receipt photo flow in browser, monthly spending chart

---

### 🔲 Up Next

#### ✅ Architecture audit — complete (2026-05-14)

Audit done. Original violations fixed: `transactions` and `budget_limits` tables removed from SQLite, TF-IDF removed from `SmartCategorizer`, async/sync pattern correct throughout, no financial data leaks into SQLite.

**Remaining issues found during audit — to be fixed before or alongside Milestone 1:**

- **Bug (active) — `bot/csv_wizard.py:33-34`** — import paths use pre-refactor module names (`from config import settings`, `from csv_importer import ...`). Must be `from backend.core.config import settings` and `from backend.core.csv_importer import ...`. Telegram CSV import is currently broken in production.

- ~~**Dead code — `backend/services/chat_service.py`**~~ ✅ Deleted 2026-05-19.

- ~~**Stale comment — `backend/services/receipt_service.py:95-96`**~~ ✅ Fixed 2026-05-19.

- **Performance — `ActualBudgetClient` instantiated per-request** — every API endpoint creates a fresh client with its own `ThreadPoolExecutor(max_workers=1)`. Should be a singleton (FastAPI dependency) to avoid thread churn under concurrent requests.

- **`SmartCategorizer` uses local `categories.json`** — category suggestions are based on a static local file, not the actual categories in Actual Budget. If the user adds or renames categories in AB, `SmartCategorizer` cannot suggest them. Long-term resolution: Milestone 2.4 (rules sync) and Step 5 (tool registry migration).

- ~~**Bug — receipt OCR JSON truncation**~~ ✅ Fixed 2026-05-19 — prompt already minimal (merchant, total, currency, date only; no items list); `num_predict: 512` set.

- ~~**Bug — nginx proxy timeout too short for receipt upload**~~ ✅ Fixed 2026-05-19 — `proxy_read_timeout 300s; proxy_send_timeout 300s;` set in `nginx.conf`; aiohttp timeout in `vision_engine.py` also increased to 300s.

- ~~**Bug — Ollama models not unloaded between uses**~~ — Closed 2026-05-19. 16GB RAM is sufficient for both models in cache simultaneously; no swap observed in practice. **Enhancement (CPU power users):** proactive model eviction before chat — check `GET /api/ps` on Ollama; if vision model is loaded, send `keep_alive: 0` before loading chat model. Low priority.

- **Bug — „Choose from gallery" pe mobile** — raportat ca nefuncțional în sesiunea 2026-05-15 (Tailscale subnet, HTTP). Retestat ulterior — pare funcțional. De verificat în condiții identice înainte de a închide.

- ~~**Bug — Chat AI asks for account name instead of querying all accounts**~~ ✅ Fixed 2026-05-21 — `get_accounts` tool called without arguments; AI lists all accounts with balances.

- **Bug — CSV multi-currency columns ignored** — some bank exports (e.g. Revolut, N26) include both the original currency amount and a converted EUR amount in separate columns (`Amount`, `Currency`, `Local amount`, `Local currency`). The CSV importer picks only `col_amount` and ignores the conversion columns. Result: a transaction of 19.739 RON is imported as 19739 EUR instead of the correct ~39 EUR equivalent. Fix: detect `to_amount`/`to_currency` column pairs in the profile and use the EUR column as the primary amount when the transaction currency differs from the account currency. Related to the general multi-currency backlog item.

- ~~**Bug — Text typed in chat input is hidden behind the input bar**~~ ✅ Fixed 2026-05-21 — CSS padding/z-index resolved in chat input component.

- **UX — Receipt and CSV import on separate tabs** — the web UI has separate tabs for receipt photo and CSV import. For daily use, a unified "Add transactions" flow would be more natural: one entry point, then choose method. Low priority cosmetic improvement.

- **Feature — Unified + menu in chat for media input** — replace the standalone receipt and CSV tabs with a `+` button in the chat bar that opens a menu with three options: 📷 Take photo, 🖼️ Choose from gallery, 📄 Upload CSV. All inputs flow through chat. Combines with the async upload UX below.

- **Feature — Async upload with non-blocking confirmation** — currently the UI blocks while the AI processes a receipt or CSV. New behavior: file uploads immediately → user sees "Processing…" indicator → confirmation window appears after AI finishes, without blocking the chat. Allows the user to continue chatting while waiting for the result.

- **Security — AI exposes internal account UUIDs in responses** — the system prompt injects raw Actual Budget account UUIDs so the model can call tools like `propose_transaction`. The model occasionally echoes these UUIDs back in its visible response (e.g. "Account ID: 8d1dc2dc-..."). Fix: the model should receive and use only human-readable account names; UUID resolution must happen server-side in the tool handler, never passed back to the user-visible response. Review the full system prompt for any other internal identifiers that should not be surfaced.

---

#### ~~DEPLOY.md improvements~~ ✅ Resolved 2026-05-17

Issues found during a complete installation dry-run on a fresh Proxmox LXC (2026-05-15). All fixed and pushed to main.

- **Missing dedicated user step** — DEPLOY.md assumes root. Ubuntu 24.04 disables root SSH by default. Add Step 0: `adduser <name>` + `usermod -aG sudo,docker <name>`. Clone the repo in the user's home directory, not `/root/` — otherwise the user cannot access files and `docker compose` fails with `no configuration file provided`.
- **`.env` fields not explained** — required fields lack explanation of what they are, why needed, and how to generate. Especially `JWT_SECRET` (explain: random 32-byte hex, generate with `python3 -c "import secrets; print(secrets.token_hex(32))"` in the LXC) and `ACTUAL_BUDGET_SYNC_ID` (leave empty on first start; fill after Step 6).
- **GPU block hardcoded in `docker-compose.yml`** — the Ollama service has an NVIDIA `deploy:` block that causes `could not select device driver "nvidia"` on any machine without a GPU. CPU is the common case for LXC. Fix: remove the GPU block from `docker-compose.yml` (CPU by default); create `docker-compose.gpu.yml` override for GPU users. Commands: CPU: `docker compose --profile ollama-local up -d`; GPU: `docker compose -f docker-compose.yml -f docker-compose.gpu.yml --profile ollama-local up -d`.
- **Ollama Option A vs B not clearly mutual exclusive** — `.env.example` does not make clear that only one option should be active. Add explicit comments: Option A (external Ollama server) and Option B (local Docker Ollama) — comment out the unused one. Also clarify: models must be pre-pulled on the external server (Option A) and will auto-pull on first request for Option B.
- **RAM recommendation too low** — minimum must be updated to 16GB. qwen2.5:7b (chat) needs ~5GB + qwen2.5vl:7b (vision) needs ~6GB + compute graph overhead = both models cannot coexist in 8GB without heavy swap. qwen2.5vl:3b is not a solution — its compute graph alone needs 6.7GB (10GB total). 16GB is the practical minimum for CPU-only with both chat and vision active. Add model selection table: 16GB → qwen2.5:7b chat / qwen2.5vl:7b vision ✅; 32GB+ → qwen2.5:14b chat.
- **Step order wrong — Tailscale must come before Actual Budget setup** — Actual Budget requires HTTPS (SharedArrayBuffer). Without it, the browser shows `Fatal Error: SharedArrayBuffer`. Tailscale (Step 8) must be moved before Actual Budget setup (Step 6). Workaround for development: SSH tunnel `ssh -L 5007:localhost:5006 <user>@<IP>` then access `http://localhost:5007`.
- **Personal usernames in `.env.example`** — `USER1_USERNAME=doru` and `USER2_USERNAME=sotie` are personal data in a public repo. Replace with generic placeholders.
- **`docker compose restart` does not re-read `.env`** — add troubleshooting note: to apply `.env` changes, use `docker compose up -d <service>` (recreates the container), not `docker compose restart` (keeps old environment variables).
- **`OLLAMA_KEEP_ALIVE` not set** — without this, all loaded models stay in RAM indefinitely. With 8GB LXC and both chat + vision models loaded, the system enters heavy swap. Add to `.env.example`: `OLLAMA_KEEP_ALIVE=5m`.
- **Models not auto-pulled on first request** — when `OLLAMA_VISION_MODEL` is changed to a model not yet downloaded, the first request fails with "Failed to process image" instead of pulling automatically. Either fix the pull-on-demand behavior or document that users must run `docker exec majordom-ollama ollama pull <model>` manually after changing the model.

---

#### Account selection on web PWA

Port the Telegram account selection flow to the web interface. When the user adds a transaction (receipt photo, manual entry, or CSV import) and has multiple accounts configured, the PWA must ask which account to use — same behavior as the Telegram bot.

Applies to:
- Receipt photo flow in browser
- Manual transaction entry via chat
- CSV import (select target account before processing)

This must be implemented **before** the Actual Budget alignment work below, as it is a prerequisite for correct transaction routing.

---

#### Budget status dashboard (home page)

The home page shows a budget overview for the current month — one row per category, with allocated vs spent visualized as a progress bar. Data comes directly from Actual Budget via ActualQL, nothing stored separately.

**Visual states per category:**
- 🟢 Green — within budget
- 🟡 Yellow — above 80% of allocation
- 🔴 Red — over budget

**Conversational rebalancing:**
When a category goes over budget (detected after each new transaction), Majordom initiates in chat:

*"You've gone over budget on Restaurants by €23. Which category would you like to move money from to cover it?"*

User replies: *"from Personal"* → Majordom moves the funds between categories in Actual Budget via `setBudgetAmount()`. No manual intervention in Actual Budget needed.

This makes active budget management conversational — the user rebalances directly from chat without opening Actual Budget.

**Implementation notes:**
- Query: `q('budgets').filter({month: currentMonth}).select(['category', 'budgeted', 'spent'])` via ActualQL
- Overspend detection: triggered after each transaction import or manual entry
- Rebalancing: `setBudgetAmount(month, categoryId, newAmount)` for both source and destination categories
- `budget_alert` notification rule (from the notification system) feeds into this flow

---

#### Bottom navigation bar
Home / Import / Chat tabs for quick navigation in the PWA.

---

#### Chat AI assistant (web)
Dedicated page with a conversational financial assistant. Has access to real data (accounts, statistics, transactions). Can answer financial questions and execute actions (create account, add expense).

---

#### Interactive messages in chat (rich actions)
Equivalent of Telegram buttons, but richer. AI includes structured blocks in the response (e.g., `<action type="category_select" options="..."/>`). The React frontend parses and renders interactive components: category buttons, date picker, transaction confirmation. After the user's action, the result is sent back as a user message.

Requires:
- Extend `Message` interface with optional `actions` field
- Parser for structured blocks from stream
- React components per action type
- Updated Ollama prompt to generate structured blocks when appropriate

---

#### CSV import UI (web)
Dedicated page for uploading and processing bank CSV. Port the wizard from Telegram to the web interface.

---

#### Document Management System
Upload file (photo/PDF) → Ollama detects the type → user confirms → extracts type-specific fields → saves to SQLite. Storage of original files: deferred (phase 2, when deciding between local storage vs. encrypted DB).

**UI Flow:** upload button → image/PDF preview → card with type detected by AI + extracted fields → user confirms or corrects the type → save.

**Supported document types:**

| Type | Extracted Fields | Action after saving |
|-----|-----------------|----------------------|
| `receipt` | merchant, amount, date, VAT | transaction in Actual Budget |
| `invoice` | merchant, amount, date, invoice number, due date | transaction in Actual Budget |
| `vehicle_document` | VIN, license plate, make, model, year, first registration date, transfer date | populates vehicle profile |
| `vehicle_insurance` | company, policy number, start date, expiration date, premium value | renewal reminder for RCA/insurance |
| `vehicle_inspection` | inspection date, expiration date, km at inspection | inspection due date reminder (ITP/APK) |
| `warranty` | product, serial number, purchase date, warranty expiration date, merchant | warranty expiration reminder |
| `insurance_policy` | type (home/health), company, policy number, expiration date | renewal reminder |
| `medical` | date, doctor, summary (no clear medical data) | archived without financial action |
| `contract` | type, parties, subject, start date, expiration date | expiration reminder |
| `other` | title, date, amount (if present) | archived |

**Security note:** Self-hosted Majordom is more secure than Google Drive for sensitive documents (tenaamstellingsverslag, insurance policies). Data stays local, no third-party cloud.

**SQLite `documents` schema:**
```sql
CREATE TABLE documents (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    doc_type TEXT,           -- receipt, invoice, vehicle_document, etc.
    detected_type TEXT,      -- what AI detected (before user confirmation)
    title TEXT,
    date TEXT,
    amount REAL,
    currency TEXT DEFAULT 'EUR',
    extracted_data TEXT,     -- JSON with all type-specific fields
    vehicle_id INTEGER,      -- FK if it's a vehicle document
    financial_id TEXT,       -- actual_budget transaction id if created
    file_path TEXT,          -- NULL until file storage implementation
    created_at TEXT DEFAULT (datetime('now')),
    notes TEXT
);
```

---

### Actual Budget integration — supporting features

The following sections describe how Majordom handles specific Actual Budget behaviors. These are implementation requirements, not separate tasks.

---

#### Transfers between accounts

When money moves between two on-budget accounts (e.g. ING → Revolut), it must be recorded as a transfer in Actual Budget — not as an expense + income. Transfers between on-budget accounts have no category and don't affect the budget.

Majordom handles this in three places:
- **Onboarding (Q6)** — explain that moving money between own accounts must be marked as a transfer
- **CSV import** — auto-detect transfer pairs (matching amount, close dates, different accounts) and ask for confirmation: *"This looks like a transfer ING → Revolut. Confirm?"*
- **Manual chat entry** — if user says "I moved 500 EUR from ING to Revolut", create a transfer, not two separate transactions

Special case: transfer between an off-budget and an on-budget account → requires a category on the on-budget side.

**Reference:** [transfers](https://actualbudget.org/docs/transactions/transfers)

---

#### Split transactions

One transaction split across multiple categories — e.g. a Jumbo receipt with groceries (€45) + cleaning products (€12).

Majordom handles this in two places:
- **Receipt photo** — Ollama detects items from different categories → Majordom proposes a split and asks for confirmation before saving
- **Manual chat entry** — if user says "I spent €60 at Jumbo, €45 groceries and €15 household", Majordom creates a split transaction in Actual Budget

**Implementation note (receipt photo path):** Currently the vision prompt requests only essential fields (merchant, total, currency, date) with `num_predict: 512` to avoid JSON truncation. To support split transactions, two changes are needed: (1) restore `items` to the prompt and increase `num_predict` to 2048 in `vision_engine.py`; (2) add a second AI pass that groups items by category using `SmartCategorizer` or a chat model call; (3) call `createTransaction` with the `subtransactions` field in the AB API for each category group. The per-item approach requires a UI review step — show the proposed split before saving, allow the user to merge or reassign items.

**Distribute:** Actual Budget can distribute the unallocated remainder across empty splits (even) or proportionally across all splits (useful for VAT distribution). Majordom uses proportional distribution for receipts that include taxes.

**Unsplit:** Actual Budget supports "Unsplit transaction" per split or for all at once.

Note: bulk editing does not work on split transactions.

---

#### Returns and reimbursements

A return from a shop is not income — money must go back to the original spending category.

Two cases:
- **Return/refund** — "I got a €30 refund from H&M" → transaction in the same category (Clothing), not in Income; Majordom asks which category if unsure
- **Work reimbursement** — "My employer will reimburse this €120 expense" → two strategies:
  - Pre-fund: allocate money to a "Reimbursements" category before spending → fills to zero when refund arrives
  - Post-fund: let the spending category go negative → fill it when the reimbursement arrives; enable rollover if the reimbursement spans months

Majordom asks the user which approach they prefer during onboarding.

---

#### Rollover and overspending

Actual Budget handles month-to-month carry-over automatically:
- **Overspending** — deficit is automatically deducted from next month's "To Budget"
- **Surplus** — unspent money stays in the category and rolls over
- **Copy last month's budget** — copies all allocated amounts from the previous month; useful for stable monthly budgets

Majordom should:
- Explain rollover during onboarding (Q1)
- At the start of each new month: offer to copy last month's budget as a starting point
- When a category goes negative: notify via the notification system

---

#### Credit card accounts — two strategies

**Strategy A — Paying in full (recommended):**
- Every purchase categorized immediately to spending categories
- Month-end: pay full statement balance → recorded as transfer, no budget impact

**Strategy B — Carrying debt:**
- Dedicated "Credit Card Debt" category group, one category per card
- "Rollover Overspending" enabled to avoid double-counting
- Opening debt balance entered as a transaction in the Payment column
- Monthly: budget at minimum payment; allocate extra toward highest-rate card first
- Interest charges → categorized to the CC Debt category, not a spending category

**Reference:** [paying in full](https://actualbudget.org/docs/budgeting/credit-cards/paying-in-full), [carrying debt](https://actualbudget.org/docs/budgeting/credit-cards/carrying-debt)

---

#### Rules sync with Actual Budget

Actual Budget creates rules automatically when the user renames a payee or categorizes a transaction. Majordom also manages `merchant_mappings` in SQLite.

These two systems must not conflict:
- When Majordom saves a merchant→category mapping confirmed by the user, also create/update the rule in Actual Budget → categorization works even outside Majordom
- When importing CSV, Actual Budget rules fire first; Majordom does not overwrite the result unless the user explicitly changes the category
- Do not disable Actual Budget's auto-rule learning — it is complementary to Majordom's mappings

**Audit 2026-05-14:** `merchant_mappings` currently stored only in SQLite with local string IDs (`"groceries"`, `"transport"`) — not synced to Actual Budget. `categorizer.learn()` in `receipt_service.py` and `bot/handlers.py` must be extended to also create or update the corresponding AB rule. Until this is done, category mappings confirmed by the user are invisible to Actual Budget's own rule engine.

**Reference:** [rules](https://actualbudget.org/docs/budgeting/rules)

---

#### Rule Action Templating (dynamic rules)

Experimental feature. Rules can set fields dynamically using Handlebars templates.

Available operations:
- **Math:** `add`, `sub`, `mul`, `div`
- **Text:** `regex`, `replace`, `replaceAll`
- **Dates:** `addDays`, `subMonths`, `format`
- **Variables:** `{{account}}`, `{{payee_name}}`, `{{imported_payee}}`, `{{amount}}`

Use cases for Majordom:
- **Multi-currency (RON workaround):** rule detects RON account → template calculates EUR equivalent → writes converted amount + rate to notes
- **Payee normalization:** "ALBERT HEIJN 1234 AMSTERDAM" → regex strips store number → "Albert Heijn"
- **Auto-tagging:** rule matches category "Transport" + amount above threshold → appends `#large-expense` to notes

Majordom creates Rule Action Templating rules during onboarding for known cleanup patterns (bank-specific payee name noise, currency conversion).

**Reference:** [rule templating](https://actualbudget.org/docs/experimental/rule-templating)

---

#### Multi-currency support (RON workaround)

Actual Budget has no native multi-currency support. The documented workaround uses Rule Action Templating:
1. Create a separate account for the foreign currency (e.g. "Cash RON")
2. Create two rules: detect the account, convert amount to EUR using a stored rate
3. Rate stored in transaction notes; must be updated when the rate changes significantly

Majordom should:
- During onboarding (Q8): if RON or other currency mentioned → set up conversion rules automatically
- In chat: "Update EUR/RON rate" → Majordom updates the rule template with the new rate

**Reference:** [multi-currency](https://actualbudget.org/docs/budgeting/multi-currency)

---

#### OFX/QFX import (better than CSV)

OFX and QFX formats include unique transaction identifiers → native deduplication in Actual Budget, no SHA256 hashing needed.

Majordom should:
- After onboarding, inform the user: "Check if your bank offers OFX/QFX export — it is more reliable than CSV for deduplication"
- Support OFX/QFX upload in the import UI alongside CSV
- Prefer OFX/QFX over CSV when both are available for the same bank

---

#### Merging duplicate transactions

When two transactions are duplicates from different sources, Actual Budget can merge them instead of deleting — preserving richer data from both.

How it works: select exactly two transactions with matching amounts → press **G** → keeps the "better" one (bank sync > file import > manual) and fills empty fields from the other.

Majordom should use merge instead of silent delete when a duplicate is detected during CSV import.

**Reference:** [merging](https://actualbudget.org/docs/transactions/merging)

---

#### Migrate historical transfers

When importing historical data from multiple accounts, past transfers appear as unlinked pairs (debit in one account, credit in another). Actual Budget provides a `modify-transfers` SQL script to retroactively link them.

Conditions for auto-detection: same absolute amount, opposite signs, within 3-day window, unique match.

Majordom should:
- After bulk historical import, run transfer detection and present matches: *"Found X likely transfers between your accounts. Review and confirm?"*
- Apply the detection logic via the Actual Budget API rather than raw SQL

**Reference:** [modify-transfers](https://actualbudget.org/docs/advanced/scripts/modify-transfers)

---

#### Bulk recategorization via chat

Actual Budget supports bulk editing (select multiple transactions → change category/payee/notes).

Majordom exposes this through chat:
- "Move all Netflix transactions to Entertainment" → query by payee + bulk category update in Actual Budget
- "Recategorize all Albert Heijn transactions last month as Groceries" → same flow

Note: bulk edit does not work on split transactions.

---

#### Reconciliation after CSV import

After importing, Actual Budget allows reconciliation — the user confirms transactions against the bank statement and locks them.

How it works: click the 🔒 icon on the account → enter current bank balance → mark each transaction as verified (grey → green) → when difference reaches zero → click "Lock transactions".

Majordom should prompt after each import: *"Import complete. Do you want to reconcile the account now? Open Actual Budget, click 🔒 on the account, and confirm your transactions against your bank statement."*

Locked transactions cannot be accidentally modified.

---

#### End of Month Cleanup

Experimental feature. Automates surplus redistribution at end of month via notes on categories:
- `#cleanup source` — this category's surplus is returned to "To Budget" first
- `#cleanup sink [weight]` — this category receives leftover funds (default weight: 1)

Execution order: local group surpluses → global sources returned to "To Budget" → deficits covered → remaining funds distributed to sinks by weight.

Majordom should:
- During onboarding (Q12): if user chooses automatic redistribution → add `#cleanup sink` notes with correct weights during Phase 2
- In chat at end of month: *"It's end of month. Run cleanup to redistribute surplus funds?"* → triggers End of Month Cleanup in Actual Budget

Requires goal templates experimental feature to be enabled.

**Reference:** [end of month cleanup](https://actualbudget.org/docs/experimental/monthly-cleanup)

---

#### ActualQL for Chat AI queries

When the Chat AI needs financial data, it must use `runQuery()` with ActualQL — not SQLite, not cached values.

Examples:
- "How much did I spend on groceries last month?" → `q('transactions').filter({category: ..., date: ...}).calculate({$sum: '$amount'})`
- "What's my balance across all accounts?" → `q('accounts').select(['name', 'balance'])`
- "Show me all transactions over €100 this week" → `q('transactions').filter({amount: {$gt: 10000}, date: ...}).select('*')`

Supported operators: `$eq`, `$lt`, `$lte`, `$gt`, `$gte`, `$ne`, `$oneof`, `$regex`, `$like`, `$and`, `$or`. Amounts are integers (value × 100). Dot notation for joins: `category.name`.

The ChatService system prompt must instruct the AI to always call the ActualQL tool for financial data — never rely on memory or conversation context for figures.

**Reference:** [ActualQL](https://actualbudget.org/docs/api/actual-ql/)

---

#### Transaction tags

Tags are stored in the Notes field with `#` prefix.

Syntax:
- Format: `#tag` — no spaces (use `#camelCase`, `#dashed-tag`, or `#under_scored`)
- Case-sensitive: `#food` ≠ `#Food`
- Multiple tags per transaction allowed
- Use `##` to include a literal `#` without creating a tag
- Managed via sidebar → More → Tags (color, description, delete)

Use cases for Majordom:
- "Tag this as #deductible" → ZZP expense tracking; filter at year-end for tax purposes
- "Tag as #vacation-2025" → group trip expenses across categories
- "Tag as #shared" → expenses to be split with partner
- Chat AI filters by tag: `q('transactions').filter({'notes': {$like: '%#deductible%'}})`

**Reference:** [tags](https://actualbudget.org/docs/transactions/tags)

---

#### Hold budget for next month

`holdBudgetForNextMonth()` reserves money from the current month's "To Budget" for next month — implements the "live on last month's income" strategy.

Introduced during onboarding (Q13) as an advanced option. If the user opts in, Majordom guides them through holding the full monthly income until the buffer is built.

---

#### Joint budget / couple budget

Two strategies:

**Strategy A — Shared budget file:** both partners use the same Actual Budget file (already supported via Majordom multi-user). Contributions split proportionally to income.

**Strategy B — Joint account in personal budget:** one partner manages the joint account in their own file; partner contributions recorded as income in a dedicated category; split transactions used to fund shared categories.

Majordom guides the couple during onboarding (Q5):
- "Do you manage finances together or separately?" → if together: recommend Strategy A, explain how to add the second user
- Contribution calculation: partner A earns 60% of total income → contributes 60% to shared expenses

**Multi-user (technical):** Actual Budget multi-user requires an OpenID Provider. Two roles:
- **Basic** — create new budgets, collaborate on others'
- **Admin** — all Basic + manage users directory, transfer budget ownership, enable universal file access

Majordom's current multi-user (via `TELEGRAM_ALLOWED_USER_IDS`) must eventually integrate with Actual Budget's multi-user model.

**Reference:** [multi-user config](https://actualbudget.org/docs/config/multi-user)

---

#### Edge cases

- **Variable income** → budget on minimum reliable monthly income (Q3)
- **Mid-month start** → initial balance adjusted, partial month allocation
- **Reimbursements spanning months** → enable rollover on the affected category
- **CSV import after onboarding** → separate flow, triggered from chat or import page

**Reference:** [Starting Fresh](https://actualbudget.org/docs/getting-started/starting-fresh), [goal templates](https://actualbudget.org/docs/experimental/goal-templates), [schedules](https://actualbudget.org/docs/schedules), [tracking vs envelope](https://actualbudget.org/docs/getting-started/tracking-budget)

---

#### Installation README
Step-by-step guide: Docker, Telegram bot token, Actual Budget, `.env` configuration, first start.

---

#### Automatic bank sync
GoCardless/Nordigen (NL open banking) — **on hold**: access for individual developers in the EU is restricted; monitor PSD2/PSD3 regulation evolution.

---

## Medium Priority

#### FIRE calculator / Crossover Point Report

Actual Budget has a native experimental report for this: **Crossover Point Report** — calculates when passive investment income covers projected expenses, based on the "Your Money or Your Life" methodology.

Parameters: expense categories to include post-retirement, investment accounts, safe withdrawal rate (default 4%), projection type (linear trend or Hampel filtered median).

Majordom should use the native Crossover Point Report rather than building a custom FIRE calculator. The Chat AI explains the result conversationally.

**Reference:** [crossover point report](https://actualbudget.org/docs/experimental/crossover-point-report)

---

#### Savings goals
Progress tracking: emergency fund, vacation, large purchases. Progress visualization in the PWA dashboard.

---

#### Monthly budgets in Actual Budget
Setting limits per category (native Actual Budget feature).

---

#### Extensible notification system

Generic architecture based on `notification_rules` (SQLite, JSON config per type) + `notification_log` (anti-spam). APScheduler runs daily at 08:00 in FastAPI. Delivery: **Web Push primary** (PWA), Telegram secondary/fallback.

Rule types:

**`budget_alert`** — triggered after each new transaction and daily. Alerts when a category exceeds X% of its configured monthly limit.

**`goal_risk`** — weekly check. Calculates whether the current contribution pace will meet the target (emergency fund, savings goals) on time. Alerts if the target date risks being delayed.

**`vehicle_reminder`** — daily check. Two subtypes: by date (ITP/APK, insurance renewal — X days before) and by km (oil change every N km, based on `vehicle_log`).

**`income_variance`** — triggered when a recurring income transaction (matched via schedule) differs from the expected amount. Actual Budget schedules use "approximately" matching (±7.5%). The actual received amount (not the scheduled amount) enters "To Budget" — Majordom notifies: *"Salary received: [actual] EUR (expected [scheduled] EUR, [diff] EUR). Your available budget this month is affected — do you want to adjust any category allocations?"*

**`recurring_expense_audit`** — monthly trigger (1st of month). Majordom identifies all recurring transactions in Actual Budget (matched via schedules or same-payee monthly patterns) and sends a push notification: *"You have recurring expenses this month — subscriptions, insurance, utilities. Want to review them?"* Goal: surface forgotten subscriptions and prompt conscious review of fixed costs.

**`market_correction_alert`** — daily check via public ETF price API (e.g. Yahoo Finance). Triggers when a tracked index drops beyond a configured threshold from its recent high. Notifies: *"All World has corrected [X]%. Your opportunity fund has available balance. Buy?"* Threshold and opportunity fund category both configurable per user. Designed for users who keep a dedicated allocation for buying on dips.

---

#### Vehicle Management — complete Fuelio replacement

**Goal:** completely replace Fuelio, including import of existing history.

**Existing vehicles:**
- Car — recently purchased
- Motorcycle — history from 2023 available for import

**SQLite schema:**
```sql
CREATE TABLE vehicles (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    name TEXT,               -- "Motorcycle", "Car"
    make TEXT,               -- "Toyota", "Suzuki", etc.
    model TEXT,              -- "Yaris", "VZ 800", etc.
    year INTEGER,
    vin TEXT,
    plate TEXT,              -- license plate number
    fuel_type TEXT,          -- "petrol", "diesel", "electric"
    tank_capacity REAL,      -- liters
    km_initial INTEGER,      -- km at the time of adding to Majordom
    apk_due TEXT,            -- APK/ITP expiration date (YYYY-MM-DD)
    insurance_due TEXT,      -- RCA expiration date
    active INTEGER DEFAULT 1,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE vehicle_log (
    id INTEGER PRIMARY KEY,
    vehicle_id INTEGER REFERENCES vehicles(id),
    date TEXT,               -- YYYY-MM-DD HH:MM
    odo_km REAL,             -- odometer km at the time of recording
    entry_type TEXT,         -- "fuel", "service", "maintenance", "inspection", "insurance", "other"
    -- fields for fuel:
    fuel_liters REAL,
    fuel_price_per_liter REAL,
    fuel_full_tank INTEGER,  -- 1 = full tank, 0 = partial
    fuel_missed INTEGER,     -- 1 = refueled in between (exclude from consumption calculation)
    -- fields for cost:
    cost_total REAL,
    cost_currency TEXT DEFAULT 'EUR',
    -- fields for reminder:
    remind_odo REAL,         -- km at which to send reminder (e.g., odo+15000)
    remind_date TEXT,        -- date at which to send reminder
    repeat_odo REAL,         -- km interval for recurring reminder
    repeat_months INTEGER,   -- month interval for recurring reminder
    -- general:
    location TEXT,           -- "Oostzaan - Esso" (optional, from receipt or GPS)
    notes TEXT,
    financial_id TEXT,       -- actual_budget transaction id (if the expense was recorded)
    source TEXT,             -- "manual", "photo", "fuelio_import"
    fuelio_unique_id TEXT,   -- original id from Fuelio (for deduplication on import)
    created_at TEXT DEFAULT (datetime('now'))
);
```

**Import Fuelio history:**

Fuelio CSV format (from `sync/vehicle-N-sync.csv`) has 4 sections:
```
## Vehicle     → vehicle profile
## Log         → refuels (Date, Odo, Fuel litres, Full, Price, l/100km, City, Missed)
## CostCategories → expense types (Service=1, Maintenance=2, Insurance=31, etc.)
## Costs       → extra expenses (title, date, Odo, CostTypeID, Cost, RemindOdo, RemindDate, RepeatOdo, RepeatMonths)
```

Mapping `CostTypeID` → `entry_type`:
- 1 (Service) → `service`
- 2 (Maintenance) → `maintenance`
- 4 (Registration) → `other`
- 5 (Parking) → `other`
- 31 (Insurance) → `insurance`

Import sets `source = "fuelio_import"` and `fuelio_unique_id` to prevent duplicates on re-import.

**Automatic calculations:**
- L/100km per refuel: `(liters / (current_odo - previous_odo)) * 100` — only if `full_tank=1` and `missed=0`
- Cost per km: `cost_total / (current_odo - previous_odo)`
- Moving average consumption: last 5 valid refuels

**Charts in PWA (Recharts):**
- Fuel consumption over time — L/100km per refuel + moving average line
- Monthly costs — fuel + other costs per month, stacked bar; filter by cost type
- Monthly distance — km traveled per month
- Cost per km — evolution over time (EUR/km total and fuel only)

**Stats dashboard per vehicle:**
- Fill-ups this year / this month vs. previous year/month
- Total liters this year / this month
- Average consumption / best / worst L/100km
- Average cost per km (fuel only + total)

**Refuel recording flow from photos:**
1. User uploads gas station receipt photo → Ollama extracts: liters, price/liter, total, location (if on receipt)
2. User uploads dashboard photo → Ollama extracts: ODO km
3. User selects the vehicle (if they have multiple)
4. User confirms extracted data → save to `vehicle_log` + transaction in Actual Budget category `transport`

**Reminders (integrated with notification system):**
- APK/ITP annual — 30 days before `apk_due`
- RCA renewal — 30 days before `insurance_due`
- Service/maintenance — when `current_odo >= remind_odo` OR 7 days before `remind_date`
- Calculation of `remind_odo` on save: `current_odo + repeat_odo` (if `repeat_odo > 0`)

**Conversational calculations via AI chat** (not a dedicated calculator):
- "How much does a 200km trip cost me?" → AI uses average consumption + distance + current fuel price
- "When do I need to change the oil?" → AI checks last service + current km
- "What is the monthly cost of the motorcycle?" → AI aggregates from vehicle_log

---

#### Investment monitoring
Integration with [Ghostfolio](https://ghostfol.io) (self-hosted, open source) for ETF portfolio tracking.

**Crypto tracker with sell alert:** Majordom tracks the average acquisition cost for BTC/ETH (entered manually or via Bitvavo import) and alerts via push notification when the return exceeds a user-configured threshold. *"BTC has reached your target return. Your strategy: sell 50% → All World. Confirm?"* The sell strategy (percentage to sell, destination) is configured per asset. Crypto is treated as a speculative allocation with a defined exit plan, not as a core portfolio holding.

**Child portfolio dashboard:** Off-budget account in Actual Budget representing the value of ETF units earmarked for a child. Majordom answers conversational queries: *"How much does [child] have now?"*, *"How much has it grown since last month?"* Value updated manually or via Ghostfolio sync. Primary purpose: financial education for the child.

---

#### Freelance income dashboard
ZZP (Netherlands) for YouTube clips/paid activity. Separate deductible expenses tracked via `#deductible` tag.

---

## Low Priority

- **Voice input in PWA** — microphone button in chat; audio transcribed locally via Whisper (Ollama) → sent as text message; consistent with privacy-first stack and cross-browser
- **GPU inference Ollama** — currently CPU (~60s/image); revisit with smaller models or quantization optimizations
- **RON support** — enabled via multi-currency workaround (Rule Action Templating); see onboarding Q8
- **Automatic monthly report** — summary sent via Telegram/web on the 1st of the month
- **Setup wizard via Telegram** — `/setup` command that guides the new user: creates first account, configures preferred categories, tests connection with Actual Budget
