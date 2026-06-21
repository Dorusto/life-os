# Majordom — Decisions Log

> Append-only. Each entry explains what was decided, why, and what was rejected.
> Read this before refactoring or contradicting existing patterns.

---

## Architecture decisions

### No financial data in SQLite

**Date:** 2026-05-14 (architecture audit)

**Decision:** SQLite (`memory.db`) stores only: merchant mappings, CSV profiles, push subscriptions, user preferences, conversation history, vehicle log. Never financial data.

**Why:** Actual Budget is the source of truth. Duplicating financial data in SQLite creates sync problems, stale data, and violates the design principle.

**Rejected:** Caching balances/transactions in SQLite for performance — data goes stale and creates silent inconsistencies.

---

### Confirmation card for all write tools (mandatory)

**Date:** 2026-05-31

**Decision:** Every tool that modifies data (financial or configuration) MUST go through a proposal → editable card → confirm → execute flow. No exceptions.

**Why:** Prevents accidental writes. The user can correct LLM misinterpretations (wrong account, wrong amount) before execution.

**Rejected:** Direct execution tools — they are bugs, not features.

---

### bank2ynab for CSV format detection

**Date:** 2026-05-29

**Decision:** Use `bank2ynab` (MIT, pip) for CSV format conversion instead of Ollama-based profile detection.

**Why:** bank2ynab covers 100+ European banks (ING NL, BUNQ, Revolut, etc.) via community profiles. Single fixed output format — Majordom needs one parser. Ollama-based detection was saving corrupt profiles (`col_merchant="Counterparty"`) due to malformed delimiters.

**Rejected:** Firefly III data-importer (PHP, not usable as Python library). Ollama-only detection (fragile, produced corrupt SQLite profiles).

---

### LLM provider — OpenRouter over local Ollama

**Date:** 2026-06-01

**Decision:** Default to OpenRouter (cloud) for chat and vision. Ollama still supported via env vars.

**Why:** Ollama on CPU-only LXC takes 4+ minutes per chat response. `/v1/chat/completions` endpoint ignores `options.num_ctx` — context overflow with 20+ tool schemas. OpenRouter: ~12s for chat, instant for vision.

**Current config:** `LLM_CHAT_MODEL=deepseek/deepseek-chat`, `LLM_VISION_MODEL=google/gemini-2.5-flash-lite`

---

### Telegram removed

**Date:** 2026-05-25

**Decision:** Telegram bot completely removed. Web PWA is the primary interface.

**Why:** PWA supports inline charts (the main differentiator). Telegram bots cannot render native charts. MCP endpoint (planned) covers external agents.

**Rejected:** Keeping Telegram as a secondary interface — double maintenance, charts impossible.

**Note:** Telegram profile removed from docker-compose. No code remains.

---

### Onboarding wizard cancelled

**Date:** 2026-05-31 (M2 cancelled → replaced by M2-NEW)

**Decision:** The 15-question wizard was wrong. Replaced with M2-NEW: Majordom deduces context from real data and initiates proactively.

**Why:** Users don't know what they want until they see real data. Abstract questions produce inaccurate answers and unnecessary friction on day 1.

**Rejected:** Guided setup wizard — creates false precision from hypothetical answers.

**Removed:** `onboarding_service.py`, `api/onboarding.py`, `onboarding_state` table, `ONBOARDING_TRIGGERS` in `chat.py`, progress bar in `Chat.tsx`.

**Kept:** `ClarificationCard` and `SetupBalancesCard` — used in other flows.

---

### One push per day

**Date:** 2026-05-31

**Decision:** All daily notifications bundled into one `run_daily_digest()` job. No separate push per alert type.

**Why:** Multiple pushes from the same app at the same time = user disables notifications.

**Rejected:** Per-alert push jobs — notification fatigue kills engagement.

**Pattern:** Checker functions return `str | None` (no side effects). Orchestrator collects, concatenates with `\n`, sends one push.

---

### Sure adoption + AB coexistence strategy

**Date:** 2026-06-03 · **Updated:** 2026-06-21

**Decision:** AB remains the source of truth indefinitely — no active Sure migration until the Ghostfolio vs Sure evaluation. The evaluation happens naturally when portfolio tracking becomes a real need. At that point:
- If Sure wins (unifies AB + Ghostfolio in one platform) → migrate Majordom to Sure
- If Ghostfolio proves superior → Sure stays as test platform; document the gap and revisit when closed

Sure checklist (budget allocation parity, MCP server) is deferred until the evaluation moment.

**Why:** Premature migration adds risk with no current benefit. AB is stable and working. M5.2 FinanceProvider abstraction makes future migration cheap — do that first, then migrate when there's a real reason to.

**Migration trigger conditions (for future reference):**
- Portfolio tracking becomes an active need
- Sure closes the Enable Banking token-expiry bug
- Sure reaches budget allocation parity with AB
- Sure MCP server is production-ready

**Rejected:** Proactive migration on a schedule — migrating a working system before the value is clear.

**Previously decided (2026-06-03):** Sure replaces Ghostfolio immediately (Ghostfolio now off roadmap). Sure will eventually replace AB. This still holds — the update above clarifies the trigger and defers the active work.

---

### FinanceProvider abstraction — REST API, not direct library calls

**Date:** 2026-06-03

**Decision:** Majordom's tool registry (`registry.py`) calls a `FinanceProvider` abstract interface, not AB or Sure clients directly. Two concrete implementations: `ActualBudgetProvider` (wraps actualpy) and `SureProvider` (calls Sure REST API). Switching backends = one env var change (`FINANCE_BACKEND=actual_budget|sure`).

**Why:** Avoids building M4/M2.5 tools twice. All features built against the interface work with both AB and Sure. REST API chosen over MCP client for internal service calls — simpler, fully debuggable, complete control over retries and error handling.

**Rejected:** Direct MCP client calls from Majordom to Sure's `/mcp` endpoint — protocol overhead for operations that are simple HTTP calls. MCP belongs on the inbound side (agents calling Majordom), not the outbound side (Majordom calling services).

---

### Majordom as MCP server — not MCP client

**Date:** 2026-06-03

**Decision:** Majordom exposes its tool registry as an MCP server (issue #58). External agents (OpenClaw, Claude API, Hermes) call Majordom via MCP standard. Majordom communicates with all downstream services (Sure, AB, Home Assistant, Immich, Nextcloud) via their REST APIs.

**Why:** Clean separation — one standard interface inward (MCP for agents), pragmatic direct calls outward (REST per service). Majordom becomes the single integration point: agents don't need to know about Sure or AB at all.

**Rejected:** Per-agent direct integration with each service — defeats the orchestrator purpose and creates N×M integrations instead of N+M.

---

### Tool domain routing — prefixed flat tools, structured system prompt

**Date:** 2026-06-12

**Decision:** Tools are prefixed by domain (`finance__*`, `vehicle__*`, `home__*`, `media__*`). The system prompt is structured in domain sections, each with explicit trigger rules. A single LLM sees all tools and routes based on prefixes + system prompt guidance (Option A). Designed so Option B (hierarchical router LLM → domain sub-agent) can be added later without changing tool definitions.

**Why:** Flat unnamespaced tools don't scale past ~15 tools — LLM picks wrong tool when descriptions overlap (confirmed bug: `propose_set_category_budget` vs `rename_category`). Domain prefixes give the LLM a structural signal before reading the description. Option B (hierarchical) adds latency and complexity not justified while cloud LLM is primary. Prefixes make Option B a non-destructive add-on when local hardware (AMD iGPU mini PC) becomes primary.

**Domains:** `finance` (AB + Sure — budget, transactions, investments, bank sync), `vehicle` (vehicle log, reminders), `home` (Home Assistant), `media` (Immich, Nextcloud).

**Rejected:**
- Flat tools without prefix — already causing disambiguation bugs, doesn't scale
- Immediate hierarchical routing (Option B) — premature, adds 2× LLM calls, current hardware doesn't justify it
- Per-domain separate system prompts — unnecessary complexity while single LLM handles all

**Migration to Option B:** Add a router LLM layer on top of `chat_service.py`. Tool definitions unchanged. Triggered when local inference becomes primary and tool count exceeds ~30 per domain.

---

## Product decisions

### UI — 2 tabs only (Home + Majordom)

**Date:** 2026-05-29

**Decision:** No Import tab, no Settings screen. Import via `+` button in chat input. Settings are conversational.

**Why:** Every extra tab adds navigation overhead. The `+` button and chat cover all operations. New UI page = last resort.

**Rejected:** Dedicated Import tab, Settings screen — redundant when chat handles both.

---

### Category system — 7 universal groups

**Date:** 2026-05-29

**Decision:** 7 fixed top-level groups as starting point. User can add/modify/delete freely. AI assigns top-level only — never auto-creates subcategories.

| Group | Covers |
|-------|--------|
| 🏠 Housing | rent, mortgage, utilities, repairs, cleaning |
| 🛒 Daily Living | food, hygiene, clothing, children, pets |
| 🚗 Transport | car, fuel, public transport, moto, parking |
| 💊 Health | medicine, doctor, gym, therapist, insurance |
| 🎯 Lifestyle | restaurants, vacations, subscriptions, hobbies, gifts |
| 💰 Finance | investments, savings |
| ⚡ Unexpected | safety net — everything that doesn't fit |

**Why:** 7 groups cover 95%+ of personal finance without overwhelming the user at setup. Home shows top-level; tap to expand subcategories.

**Rejected:** Auto-generated subcategories — creates noise and inconsistency across users.

---

### Notifications — red dot only, no banners on Home

**Date:** 2026-05-29

**Decision:** Urgent alerts shown as red dot on Majordom tab icon only. Never notification banners overlaid on Home screen.

**Why:** Banners interrupt and overlay content. Red dot is discoverable but non-intrusive — user chooses when to act.

**Rejected:** Banner overlays on Home — intrusive, especially during dashboard review.

---

## Pending decisions (do not implement without explicit decision)

### FIRE % on Home

**Decision (implemented):** v1 via AB off-budget accounts — sum of off-budget accounts excluding real estate/mortgage. Hardcoded target and contribution for now. Revisit when Sure investment data is available (M5).

---

### Obligations section on Home (mortgage, loan payments)

**Question:** AB does not natively store remaining balance + due date. Two approaches:
1. Note pattern `LOAN_TERM:`, `MONTHLY:` in AB account — consistent with `TARGET:` pattern but complex
2. Majordom answers in chat on demand — no dedicated UI

**No implementation without explicit decision.**

---

### M2.5 goal proposal — reframed as budget calibration

**Date:** 2026-06-21

**Decision:** M2.5 "first goal proposal" is reframed. Original idea (propose savings goals after 2 months of data) is superseded by a more useful flow: Majordom shows real spending per category vs current budget allocations and proposes corrections. Includes creating sinking fund categories (e.g. "Vacations" at €417/month = €5000/year). This is more valuable than abstract goal proposals because AB budgets were set by estimation, not calibrated to real spending.

**Why:** After 2 months of AB data, it's clear budgets don't reflect reality (Transport budgeted €50, spent €282; Groceries budgeted €600, spent €80; no Vacations category exists). Showing "you could save X" is meaningless when monthly allocations are wrong.

**Implementation:** Conversational tool — `propose_budget_calibration` — compares last 3 months' real spending vs current budget per category, returns a proposal card with suggested corrections. User confirms per category.

**Rejected:** Abstract ML-style goal proposal based on surplus detection — too early, data too sparse.

---

### Charts inline in chat (issue #30)

**Question:** Library choice (SVG/div vs Recharts), tool architecture (one tool per type vs generic dispatcher).

**Decision (2026-06-21):** Pure SVG/div for current chart types. One tool per chart type. No external library.

**Library trade-off:**
- `GoalsChart` (progress bars) and `BudgetChart` (horizontal bars + text) → pure div forever; a library adds nothing here.
- `TrendChart` (grouped vertical bars) → pure div works but is limited: no Y-axis labels, no hover tooltips.
- **Threshold:** when the first chart with a continuous axis is needed (net worth trend 12 months, vehicle consumption line chart) → add Recharts for that component only. Not a global migration.

**Tool architecture trade-off:**
- Separate tools (`get_spending_chart`, `get_budget_chart`, etc.) are better up to ~6 types: LLM has explicit per-tool descriptions, registry is clear.
- Beyond 6 chart types → refactor to a single `get_chart_data(type, params)` dispatcher to avoid bloating the tool list in LLM context.
- Alternative considered: generic `get_chart_data(type, months?)` from the start — rejected because at 4 types the LLM benefits more from explicit tool descriptions than from a smaller tool list.

**Tools + components implemented:**
- `get_spending_chart` → `SpendingChart.tsx` (donut SVG, category breakdown)
- `get_budget_chart` → `BudgetChart.tsx` (horizontal bars, budget vs actual, red for over-budget)
- `get_spending_trend` → `TrendChart.tsx` (grouped vertical bars, spending + income per month)
- `get_goals_chart` → `GoalsChart.tsx` (progress bars, deadline, monthly needed)

**Pattern:** Each tool returns `{"type": "chart_name", ...data}` → must be in `_PROPOSAL_TOOLS` → frontend parser matches `type` → renders component.

---

## Technical patterns (confirmed)

### `TARGET:` and `DEADLINE:` in AB account notes

**Decision:** Store goal metadata in AB account `notes` field. Format: `TARGET: 25000\nDEADLINE: 2031-05`

**Why:** AB has no native goal fields. The `notes` field is freeform text accessible via actualpy — avoids a separate SQLite table for financial data.

**Pattern:** Read with `r'TARGET:\s*([\d]+(?:\.\d+)?)'`. Update with `re.sub()` to replace in-place, never append.

---

### Transfer detection in ING CSV

**Decision:** Use `Code=GT` column (Geldtransfer), not IBAN regex on description.

**Why:** IBAN appears in ALL ING transaction descriptions (including iDEAL payments), not just own-account transfers. `Code=GT` is the only reliable distinguisher.

**Rejected:** IBAN regex on description — produces false positives on every iDEAL transaction.

---

### VAPID keys — file, not JSON string

**Decision:** Store `vapid_private.pem` as a file in `/app/data/`. Pass file path to `pywebpush`, not PEM string.

**Why:** Any string serialization of PEM content risks silent whitespace corruption. File path is unambiguous.

**Rejected:** PEM string in env var — breaks pywebpush silently with no clear error.

---

### vehicle_proposals — in-memory dict, not SQLite

**Decision:** Pending refuel proposals live in process memory (`dict` in `vehicle_proposals.py`). They expire on restart.

**Why:** Proposal lifecycle is ~30 seconds. SQLite persistence adds schema, migrations, and cleanup logic for state that is inherently transient.

**Rejected:** SQLite-backed proposals — unnecessary complexity for a 30s confirmation window.

---

### Broadcast vs per-user push

**Decision:**
- Daily digest → `PushService.broadcast()` — sends to all subscriptions without user_id filter
- Per-user alerts → `PushService.send_to_all(user_id=X)` — filters by user

**Why:** Digest is system-wide; personal alerts must be isolated per user.

**Rule:** Never hardcode `user_id="default"` — always use `current_user` from auth.

---

### Vehicle manager — future independent service

**Date:** 2026-06-03 (external conversation) · **Documented:** 2026-06-21

**Decision:** `vehicle-manager` will eventually become an independent HTTP service with its own database, separate from Majordom's `memory.db`. Majordom calls it via HTTP like any other external service. Extraction happens **incrementally** — when working on a vehicle feature anyway, not as a standalone refactor exercise.

**Current state:** vehicle logic lives in `tools/finance/vehicle.py` + `vehicles`/`vehicle_log` tables in `memory.db`. This is acceptable now.

**Target state:**
```
life-os/
├── majordom/          ← orchestrator; vehicle tools become HTTP calls
└── tools/
    └── vehicle-manager/   ← FastAPI + own SQLite (or other storage)
                               own documented API
```

**Why:** Follows the life-os modular monorepo vision — each service independent and potentially open-source. Vehicle data has no business living in Majordom's memory.db alongside push subscriptions and CSV profiles.

**Trigger for extraction:** next time a significant vehicle feature is added (new schema, new endpoint). Not worth extracting as a standalone task with no new functionality.

**Why NOT now:** No active vehicle feature in progress. Extracting without adding value = pure overhead.
