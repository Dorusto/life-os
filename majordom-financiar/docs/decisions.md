# Majordom — Decisions Log

> Append-only. Each entry explains what was decided, why, and what was rejected.
> Read this before refactoring or contradicting existing patterns.

---

## Architecture decisions

### No financial data in SQLite
**Date:** 2026-05-14 (architecture audit)
**Decision:** SQLite (`memory.db`) stores only: merchant mappings, CSV profiles, push subscriptions, user preferences, conversation history, vehicle log. Never financial data.
**Why:** Actual Budget is the source of truth. Duplicating financial data in SQLite creates sync problems, stale data, and violates the design principle.
**Rejected:** Caching balances/transactions in SQLite for performance — rejected because data goes stale and creates silent inconsistencies.

### Confirmation card for all write tools (mandatory)
**Date:** 2026-05-31
**Decision:** Every tool that modifies data (financial or configuration) MUST go through a proposal → editable card → confirm → execute flow. No exceptions.
**Why:** Prevents accidental writes. The user can correct LLM misinterpretations (wrong account, wrong amount) before execution.
**Rejected:** Direct execution tools — they are bugs, not features.

### bank2ynab for CSV format detection
**Date:** 2026-05-29
**Decision:** Use `bank2ynab` (MIT, pip) for CSV format conversion instead of Ollama-based profile detection.
**Why:** bank2ynab covers 100+ European banks (ING NL, BUNQ, Revolut, etc.) via community profiles. Single fixed output format — Majordom needs one parser. Ollama-based detection was saving corrupt profiles (col_merchant="Counterparty") due to malformed delimiters.
**Rejected:** Firefly III data-importer (PHP, not usable as Python library), Ollama-only detection (fragile, produced corrupt SQLite profiles).

### LLM provider — OpenRouter over local Ollama
**Date:** 2026-06-01
**Decision:** Default to OpenRouter (cloud) for chat and vision. Ollama still supported via env vars.
**Why:** Ollama on CPU-only LXC takes 4+ minutes per chat response. `/v1/chat/completions` endpoint ignores `options.num_ctx` — context overflow with 20+ tool schemas. OpenRouter: ~12s for chat, instant for vision.
**Current config:** `LLM_CHAT_MODEL=deepseek/deepseek-chat`, `LLM_VISION_MODEL=google/gemini-2.5-flash-lite`

### Telegram removed
**Date:** ~2026-05-25
**Decision:** Telegram bot completely removed. Web PWA is the primary interface.
**Why:** PWA supports inline charts (the main differentiator). Telegram bots cannot render native charts. Also: MCP endpoint (planned) covers external agents.
**Kept:** `--profile telegram` in docker-compose for backward compat, but no active development.

### Onboarding wizard cancelled
**Date:** 2026-05-31 (M2 cancelled → replaced by M2-NEW)
**Decision:** The 15-question wizard was wrong. Replaced with M2-NEW: Majordom deduces context from real data and initiates proactively.
**Why:** Users don't know what they want until they see real data. Abstract questions produce inaccurate answers and unnecessary friction on day 1.
**Removed code:** `onboarding_service.py`, `api/onboarding.py`, `onboarding_state` table, `ONBOARDING_TRIGGERS` in `chat.py`, progress bar in `Chat.tsx`.
**Kept:** `ClarificationCard` and `SetupBalancesCard` — used in other flows.

### One push per day
**Date:** 2026-05-31
**Decision:** All daily notifications bundled into one `run_daily_digest()` job. No separate push per alert type.
**Why:** Multiple pushes from the same app at the same time = user disables notifications.
**Pattern:** Checker functions return `str | None` (no side effects). Orchestrator collects, concatenates with ` · `, sends one push.

---

## Product decisions (confirmed 2026-05-29)

### 2 tabs only — Home + Majordom
No Import tab, no Settings screen. Import via `+` button in chat input. Settings are conversational.

### 7 universal category groups
| Group | Covers |
|-------|--------|
| 🏠 Housing | rent, mortgage, utilities, repairs, cleaning |
| 🛒 Daily Living | food, hygiene, clothing, children, pets |
| 🚗 Transport | car, fuel, public transport, moto, parking |
| 💊 Health | medicine, doctor, gym, therapist, insurance |
| 🎯 Lifestyle | restaurants, vacations, subscriptions, hobbies, gifts |
| 💰 Finance | investments, savings |
| ⚡ Unexpected | safety net — everything that doesn't fit |

- These 7 are the starting point — user can add/modify/delete categories freely
- AI decides the main category; never creates subcategories automatically
- Home shows main categories; tap → expand subcategories

### Urgent alerts — red dot, never banners on Home
Red dot on Majordom tab icon only. Never notification banners overlaid on Home screen.

### set_account_goal executes directly (no card)
**Exception to confirmation card rule:** `set_account_goal` is a preference setting, not a financial transaction. Confirmed 2026-05-31.

---

## Pending decisions (do not implement without explicit decision)

### FIRE % on Home
**v1 proxy** (AB off-budget accounts) or wait for Ghostfolio (M3+)? Discuss with user first.

### Obligations section on Home (mortgage, loan payments)
AB does not natively store remaining balance + due date. Two approaches debated:
1. Note pattern `LOAN_TERM:`, `MONTHLY:` in AB account — more complex than `TARGET:`
2. Majordom answers in chat on demand — no dedicated UI

**No implementation without explicit decision.**

### Charts in chat (issue #30)
Complex. Not a priority for M1/M2. Confirm before implementing.

---

## Technical patterns (confirmed)

### `TARGET:` and `DEADLINE:` in AB account notes
Storing goal metadata in AB account `notes` field. Format: `TARGET: 25000\nDEADLINE: 2031-05`
Reading: regex `r'TARGET:\s*([\d]+(?:\.\d+)?)'`. Updating: `re.sub()` to replace existing value, not append.

### Transfer detection in ING CSV
Use `Code=GT` column (Geldtransfer), not IBAN regex on description. IBAN appears in descriptions for ALL transactions (including iDEAL), not just own-account transfers.

### VAPID keys — file, not JSON string
Store `vapid_private.pem` as a file in `/app/data/`. Pass file path to `pywebpush`, not PEM string. Any string conversion risks silent corruption.

### vehicle_proposals — in-memory dict, not SQLite
Pending refuel proposals live in process memory (dict in `vehicle_proposals.py`). They expire on restart. Acceptable for a ~30s confirmation flow.

### Broadcast vs per-user push
- Daily digest → `PushService.broadcast()` — sends to all subscriptions without user_id filter
- Per-user alerts → `PushService.send_to_all(user_id=X)` — filters by user
- Never hardcode `user_id="default"` — always use `current_user` from auth
