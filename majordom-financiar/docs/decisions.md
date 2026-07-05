# Majordom — Decisions Log

> Append-only. Each entry explains what was decided, why, and what was rejected.
> Read this before refactoring or contradicting existing patterns.
>
> **Immutable entries (ADR-style, added 2026-07-04):** once written, an entry is never edited to reflect a later change of mind. A changed decision gets a NEW entry instead — the old one only ever gets a one-line `**Superseded by:** [new entry name/link]` marker added at its top, nothing else. This keeps the history of what was believed *at the time* intact instead of blurring it with retroactive rewrites. See the "Category system" entry below for the pattern. (Doesn't apply to genuine typo fixes.)

---

## Architecture decisions

### `majordom-web` proxies to `majordom-api` via nginx

**Date:** 2026-04-12 (v2 web UI release, commit `f27515a`) — retroactively documented 2026-07-03, no entry existed until now.

**Decision:** `majordom-web` is a built Nginx + static-React image; `location /api/` proxies to `http://majordom-api:8000/api/` over the internal Docker network. `majordom-api` has no host port mapping.

**Why:** Single exposed port for both frontend and API (simpler for Coolify/Tailscale), backend never reachable directly from the host network, one HTTPS certificate covers both.

**Gotcha:** nginx resolves the `majordom-api` hostname once and holds the connection — recreating `majordom-api` alone (`docker compose up -d --build majordom-api`, scoped to one service) leaves nginx pointing at the old container's now-dead IP, causing 502 "Bad Gateway" on every `/api/*` call until `majordom-web` is also restarted. The documented deploy flow (`DEPLOY.md` — `docker compose up -d --build`, no service name) rebuilds everything together and never hits this; it only surfaces when rebuilding `majordom-api` in isolation for local testing. See `docs/architecture.md` rule 19's corollary.

---

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

<a id="llm-provider"></a>
### LLM provider — OpenRouter over local Ollama

**Date:** 2026-06-01

**Decision:** Default to OpenRouter (cloud) for chat and vision. Ollama still supported via env vars.

**Why:** Ollama on CPU-only LXC takes 4+ minutes per chat response. `/v1/chat/completions` endpoint ignores `options.num_ctx` — context overflow with 20+ tool schemas. OpenRouter: ~12s for chat, instant for vision.

**Current config:** `LLM_CHAT_MODEL=deepseek/deepseek-chat`, `LLM_VISION_MODEL=google/gemini-2.5-flash-lite`

**Local-first is still the target (2026-07-03):** cloud is a development-speed shortcut, not the destination — Majordom's whole premise is self-hosted, zero financial data in the cloud (`architecture.md`). Preferred local model going forward is `qwen3.5:9b` (better quality than `qwen3:14b`, but slower — needs the latency work below regardless). Revisit trigger: when the app is ready for anyone to use and/or better local hardware (AMD iGPU mini PC) is in place. At that point, re-open as high priority:
- [#75](https://github.com/Dorusto/life-os/issues/75) — chat latency, reframed around `qwen3.5:9b` specifically, not `qwen3:14b`. The #98 tool-domain-routing work (shorter, structured system prompt) is a relevant head start here — worth re-measuring before assuming more trimming is needed.
- [#65](https://github.com/Dorusto/life-os/issues/65) — LLM hallucinating account creation; not reproducible on the cloud model, unverified whether it still happens locally.

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

<a id="sure-adoption"></a>
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

<a id="tool-domain-routing"></a>
### Tool domain routing — prefixed flat tools, structured system prompt

**Date:** 2026-06-12

**Decision:** Tools are prefixed by domain (`finance__*`, `vehicle__*`, `system__*`, `home__*`, `media__*`). The system prompt is structured in domain sections, each with explicit trigger rules. A single LLM sees all tools and routes based on prefixes + system prompt guidance (Option A). Designed so Option B (hierarchical router LLM → domain sub-agent) can be added later without changing tool definitions.

**Why:** Flat unnamespaced tools don't scale past ~15 tools — LLM picks wrong tool when descriptions overlap (confirmed bug: `propose_set_category_budget` vs `rename_category`). Domain prefixes give the LLM a structural signal before reading the description. Option B (hierarchical) adds latency and complexity not justified while cloud LLM is primary. Prefixes make Option B a non-destructive add-on when local hardware (AMD iGPU mini PC) becomes primary.

**Domains:** `finance` (AB + Sure — budget, transactions, investments, bank sync), `vehicle` (vehicle log, reminders), `system` (cross-cutting app settings/ops — notification time, backup status; added during #98 implementation since these tools fit neither finance nor vehicle), `home` (Home Assistant), `media` (Immich, Nextcloud).

**Rejected:**
- Flat tools without prefix — already causing disambiguation bugs, doesn't scale
- Immediate hierarchical routing (Option B) — premature, adds 2× LLM calls, current hardware doesn't justify it
- Per-domain separate system prompts — unnecessary complexity while single LLM handles all

**Migration to Option B:** Add a router LLM layer on top of `chat_service.py`. Tool definitions unchanged. Triggered when local inference becomes primary and tool count exceeds ~30 per domain.

---

<a id="93-code-audit"></a>
### #93 code audit — dead endpoints removed, duplicated finance-calc logic unified

**Date:** 2026-07-03

**Decision:** Removed 4 dead PWA endpoints — `/api/stats`, `/api/budget`, `/api/accounts/goals`, `/api/stats/fire` (the last one meant deleting `backend/api/fire.py` entirely, since the dead route was its only content) — plus their frontend wrapper functions in `lib/api.ts`. All four were fully superseded by `/api/home`, with zero remaining callers in the frontend or tests. Extracted the finance-calc logic duplicated across `get_monthly_stats`, `get_budget_status`, and `get_home_data` into 3 shared helpers in `client.py` (see `architecture.md` rule 20). Standardized error handling in `home.py` and `vehicle_proposals.py` — both caught broad `Exception` and returned the raw message to the client; changed to log the full exception server-side and return a fixed friendly message, matching the pattern already used by `transactions.py`/`receipts.py`.

**Why:** `get_home_data` had silently drifted ahead of `get_budget_status`, gaining a rollover-aware budget-balance fix (`get_accumulated_budgeted_balance`) that the other copy never received — same category could show different numbers in chat vs. the Home screen, with no error to reveal the mismatch. Confirmed live after the fix: both paths now return the identical 11 categories for the same month.

**Rejected:** aligning the tombstoned-category fallback behavior between `get_monthly_stats` (keeps a deleted category visible under its original name if no fuzzy-match is found) and `get_budget_status`/`get_home_data` (silently drops it in that case) — looked like a second divergence bug at first glance, but Actual Budget doesn't allow deleting a category without moving its balance out first, so a deleted category with genuinely unmatched spending doesn't occur in practice. No code change needed; left as-is.

**Left unchanged:** `accounts.py`, `category_actions.py`, `budget.py` also had `detail=str(e)` patterns, but all three catch `ValueError` specifically, raised deliberately in business logic with safe, user-facing messages (e.g. `"Account not found: {id}"`) — not a leak risk, so not touched.

**Process takeaway:** see `CLAUDE.md`'s "Duplication & dead-code prevention" section for the rules adopted to catch this earlier next time.

---

### #99 direction — `merchant_mappings` replaced by AB native Rules, not a history query

**Date:** 2026-07-03

**Decision:** Original issue text proposed `ActualBudgetClient.get_category_for_payee()` querying AB transaction history. Superseded during planning: `actualpy` exposes AB's native Rules engine directly (`create_rule`, `get_rules`, `get_ruleset`, `run_rules` — see `actual/rules.py`, `actual/queries.py`). Confirmation cards (CSV import, receipt OCR, `propose_transaction`) will get a "save as rule" checkbox; checking it calls `create_rule()` to write a real AB rule (condition on payee or `notes CONTAINS`, action `SET category`). `SmartCategorizer.predict()`'s HISTORY level is replaced by checking AB's existing ruleset instead of querying a private SQLite copy or re-deriving from raw transaction history.

Confirmed AB also has a native transfer mechanism usable the same way: every account gets an auto-created hidden payee with `transfer_acct` pointing to that account (`create_account`, `queries.py:784-798`). Setting a transaction's payee to that special payee (`set_transaction_payee`, `queries.py:348-390`) auto-creates the linked mirror transaction. A rule's action can set that payee directly — so `income_sources.py`'s transfer branch (today: `__transfer__:{account_id}` sentinel in `merchant_mappings`) becomes a real AB rule too, with zero new SQLite storage.

**Why:** User's own example exposed the flaw in a payee-keyed SQLite mapping (mine, "transfer_payee_hints" table, proposed and then rejected): the same real-world payee can mean different things on different transactions (e.g. a person paying sometimes for a side-business order, sometimes for something unrelated) — a payee-keyed table can't express that, but an AB rule keyed on `notes CONTAINS <word>` can, and it's the same mechanism AB already offers natively in its own Rules UI. Stated goal: minimize what lives in Majordom, prefer anything AB already does natively.

**Left unchanged (for now):** `category_keywords` (SQLite) — the OCR-derived keyword-learning level of `SmartCategorizer` (level 2). Not simply "duplicated AB data" like `merchant_mappings` was (AB has no concept of receipt OCR text), and it works on accumulating statistical weight across many confirmations rather than a crisp condition — doesn't map cleanly onto a single AB rule. Whether this should *also* eventually become AB rules (e.g. `notes CONTAINS <keyword>`) is a separate, not-yet-decided question — deliberately kept out of #99's scope to avoid scope creep.

**Rejected: migrating existing `merchant_mappings` rows into AB rules.** Considered, then explicitly declined by the user: writing rules against a live AB instance with real transaction history is a hard-to-reverse action, the user already has a number of manually-created rules in AB, and diffing/deduping against them (via `get_rules()`) before a bulk migration was judged not worth the risk for data that isn't load-bearing. Decision: drop `merchant_mappings` with no migration once the rule-based flow ships; whatever mappings existed are lost, and the "save as rule" checkbox simply rebuilds rules going forward, one confirmation at a time, same as any new user starting fresh. Explicitly fine as long as it doesn't touch anything already correct/functional in AB itself — only Majordom's own SQLite copy is discarded.

**Mid-implementation discovery — don't rebuild what already exists.** Before writing any new code, found that the AB-native rule mechanism this decision calls for was already half-built: `client.py` already has `create_payee_rule()`, `create_payee_notes_rule()`, and the transfer-payee mechanism (`create_transfer()`, using `Payees.transfer_acct`), already wired into two of the five `predict()`/`learn()` call sites (`propose_transaction` via `proposals.py`'s `create_rule` checkbox, and `propose_categorize_with_rule` via `category_actions.py`). The actual remaining gap for #99 is narrower than the issue text suggested: (1) none of the 5 call sites check for an *existing* matching rule before falling back to `SmartCategorizer.predict()`'s SQLite history level, (2) `income_sources.py`'s transfer branch has no rule-creation equivalent yet (needs a new `create_payee_transfer_rule()`, reusing the transfer-payee lookup already in `create_transfer()`), (3) CSV import silently auto-learned via SQLite on every confirmed row with no opt-out — removing `merchant_mappings` with no replacement would silently regress that. Recorded here specifically so a future session/agent doesn't re-discover this the hard way mid-implementation — see the matching gotcha in `CLAUDE.md`.

**Decision — CSV import gets an explicit "save as rule" checkbox (not silent auto-learn).** The old behavior (auto-`learn()` on every confirmed row, no opt-out, invisible to the user) is exactly the kind of hidden state #99 is removing. Chosen instead: same explicit-checkbox pattern already used by `propose_transaction` and `propose_categorize_with_rule`, applied per-row in `CsvImportCard.tsx` — consistent UX across all three confirm flows, and every rule that gets created was one the user explicitly asked for.

**Noted, not fixed here:** `category_actions.py`'s `categorize_with_rule` confirm handler always calls `create_payee_rule()` (payee-only), never `create_payee_notes_rule()`, even when `notes_contains` was set on the action — meaning a notes-scoped bulk categorization can still create an over-broad payee-only rule. Adjacent to this work but out of scope for #99; flagged for a separate fix.

---

<a id="143-code-audit"></a>
### #143 code audit — goal-parsing logic unified, error handling deviation fixed, UI duplication flagged for later

**Date:** 2026-07-05

**Decision:** Second full sweep since #93 (2026-07-03), triggered by #99's `rule_match_prefix` extraction and the scheduled-check issue #149. Found and fixed 3 items directly:
1. `get_goals()` and `get_home_data()` (`backend/core/actual_client/client.py`) had copy-pasted the same ~35-line goal-parsing loop (regex on account `notes` for `TARGET:`/`DEADLINE:`, balance/percentage/monthly_needed math). Extracted into `_compute_goal_progress(session, accounts)`, added to the shared-helper list in `architecture.md` rule 20. Verified live: both call sites return byte-identical output for the same account.
2. `receipts.py`'s two "confirm transaction" error handlers (lines ~290 and ~383) leaked raw exception text (`detail=f"Failed to save transaction: {str(e)}"`) instead of the generic-message pattern established in #93. Unified to a fixed friendly message, matching `transactions.py`/`home.py`/`vehicle_proposals.py`.
3. Found live during testing (not part of the original sweep): `receipt_service.py`'s category list for the receipt-confirm draft (`process_image()`) never carried `group_name`, so `ReceiptCard.tsx` and `FuelReceiptCard.tsx` both rendered a flat, ungrouped category dropdown — same root cause in both, i.e. the same "2+ occurrences" pattern this audit exists to catch. `Category` (backend `receipts.py` + frontend `api.ts`) gained an optional `group_name` field, `receipt_service.py` now passes `cat.group_name` through, and both components render `<optgroup>` per group — same pattern already used by `ProposalCard.tsx`. `BudgetRebalanceCard.tsx` has a visually similar but structurally different category picker (rebalance source/destination, no `group_name` in its data shape at all) — not touched, flagged as a separate, smaller possible follow-up if it turns out to matter in practice.

**Flagged, not fixed here (needs discussion or belongs to another queued session):**
- `frontend/src/components/BudgetChart.tsx` / `GoalsChart.tsx` — confirmed near-identical progress-list rendering (same wrapper, empty-state, progress-bar row, formatting), differing only in props/fields (month/year+index-color vs. deadline/monthly_needed+threshold-color). Already the explicit trigger for the queued #134 "generic charting system" session (`scripts/prompts/claude/008_134-generic-charting-system.md`) — left untouched here on purpose so #143 and #134 don't do the same work twice or fight over the architecture call.
- Confirm/Cancel button row duplicated structurally across ~10 chat action-card components (`BalanceAdjustmentCard`, `VehicleStatusCard`, `GoalProposalCard`, `AccountTransferCard`, `BudgetRebalanceCard`, `BudgetCopyCard`, `CategoryActionCard`, `ProposalCard`, `VehicleLogActionCard`, `VehicleReminderCard`). Broader than a quick fix — styling varies per card (colors, opacity) and needs an architecture discussion on the shared component's API before touching 10 files. Opened as new issue #159, prompt saved as `scripts/prompts/claude/010_159-confirm-cancel-button-unification.md`.

**Verified NOT duplicated:** `rule_match_prefix()` (extracted during #99) is still called correctly from all 3 original sites with no new reimplementations found elsewhere.

**Separately found during live testing, not a duplication issue:** chat answers about a named goal's remaining progress are unreliable — DeepSeek correctly answered a plain balance question but then claimed no goal was configured for the same account on a follow-up, despite `get_goals()` returning correct data (confirmed by calling it directly). Root cause not yet identified — no dedicated single-goal chat tool exists, only `finance__get_goals_chart` (chart-payload, not scoped to one account). Opened as **#160**, investigation-first (no fix without reproducing first, per this repo's "ask, don't assume" rule for bugs of unclear cause).

**Why:** Same reasoning as `#93-code-audit` — duplicated logic drifts silently (one copy gets a fix, the others don't) with no error revealing the mismatch. Caught here at the 2nd occurrence, per the "extract at the second occurrence" rule in `CLAUDE.md`.

---

## Product decisions

### UI — 2 tabs only (Home + Majordom)

**Date:** 2026-05-29

**Decision:** No Import tab, no Settings screen. Import via `+` button in chat input. Settings are conversational.

**Why:** Every extra tab adds navigation overhead. The `+` button and chat cover all operations. New UI page = last resort.

**Rejected:** Dedicated Import tab, Settings screen — redundant when chat handles both.

---

### Category system — 7 universal groups (superseded 2026-07-04)

**Date:** 2026-05-29 — **superseded 2026-07-04**, see #78 in `docs/sessions/2026-W27.md`.

**Original decision:** 7 fixed top-level groups as a one-shot `setup_default_groups` chat tool, creating whatever was missing from a hardcoded template (Housing, Daily Living, Transport, Health, Lifestyle, Finance, Unexpected). User can add/modify/delete freely afterward; AI assigns top-level only — never auto-creates subcategories.

**Why it was superseded:** the one-shot template tool had no visibility into what already existed — a user with a differently-named group ("Food") would end up with a duplicate ("Daily Living") instead of a rename. Discussion on 2026-07-04 reframed the actual need as ongoing management, not one-time templated creation: a single card (`list_categories` tool → `CategoryOverviewCard`) that shows every group/category currently in Actual Budget and lets the user rename or add inline — no hardcoded template, no assumption about what "standard" categories should be.

**Removed:** `setup_default_groups()`, its `_GROUPS` constant, and the whole "propose the 7 standard groups" flow.

**Still open (deferred, not filed as an issue yet):**
- Deploy-time category baseline seeding, so a fresh install doesn't start with zero categories (the original motivation for having *some* starting template) — needs its own decision on where that seed lives (install script vs. first-run tool).
- A "smart suggestions" layer (a few onboarding questions — kids, a savings goal — feeding suggested categories into the overview card) — explicitly deferred, intelligence intentionally left out of the 2026-07-04 implementation.

**Rejected (still holds):** Auto-generated subcategories with no user visibility into what's being created — the AI-assigns-top-level-only constraint on the *categorization* logic is unaffected by this change and still applies.

---

### Card pattern — single-action confirm cards vs. overview/management cards (2026-07-04, not fully settled)

**Date:** 2026-07-04, alongside #78 and the new budget overview card.

**Decision (as implemented, working but not confidently final):** two card shapes now coexist by design, chosen per request type, not per domain:
- **Single-action confirm card** (`CategoryActionCard` and friends) — for a point ask the LLM already parsed ("set Transport to €150", "rename Food to Groceries"). One field or a few, one confirm.
- **Overview/management card** (`CategoryOverviewCard`, `BudgetOverviewCard`) — for "show me everything and let me edit it," when the user wants to browse and reorganize a whole collection at once, not name one specific change.

Both exist for categories today (structure via `CategoryOverviewCard`, amounts via `BudgetOverviewCard`) and both exist for budgets (`propose_set_category_budget`'s single card vs. `get_budget_overview`'s full table) — asking for one thing still gets the small card; asking to see/manage everything gets the big one.

**Why this shape:** discussed explicitly before building (see `docs/sessions/2026-W27.md`, 2026-07-04 entries) — budget is month-scoped and category structure isn't, so merging both into one mega-card was rejected as ambiguous. Reusing the single-action pattern for "show me everything" requests would mean one card per category, which doesn't answer "let me see it all."

**Not fully settled:** after using it, the user's own assessment was "it works, but I don't know if it's the best solution" — not a rejection, but not a confident endorsement either. Concretely unresolved:
- Whether every future "manage a whole collection" need (accounts? vehicles? rules?) should get its own bespoke overview card each time, or whether a more generic reusable "collection manager" component should be extracted once a second/third case shows the same shape repeating (per the root `CLAUDE.md` "extract at the second occurrence" rule — categories + budget is arguably already two, worth watching for a third before abstracting).
- Whether having *two different card families answer to the same domain* (category structure card + budget card, both about "categories" broadly) is confusing from the user's side, versus feeling natural once they're used to it.

**Revisit when:** a third domain asks for the same "show me everything, let me edit" treatment, or if the user reports the two-card-shapes-per-domain split feels wrong in daily use — don't treat this entry as closed just because it's implemented and working.

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

<a id="vehicle-manager"></a>
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

**Why NOT now (superseded 2026-07-03, see below):** No active vehicle feature in progress. Extracting without adding value = pure overhead.

**Trigger activated (2026-07-03):** #79 (vehicle list/deactivate) and #134 (fuel/vehicle charts) are both real, open, wanted features that this extraction directly unblocks — tracked as [#138](https://github.com/Dorusto/life-os/issues/138). Scope explicitly limited to internal modularity: own FastAPI service + own DB, REST API Majordom consumes like any other external service, MCP-friendly tool definitions from day one (reusable pattern for #58). No dedicated UI, no public product, no multi-user auth — those stay a separate, undecided future question, not bundled into this extraction. Suggested sequencing: #93 (code audit) first or alongside, then the extraction, then #79/#134 as thin consumers of the new API.

**Done (2026-07-03):** Extraction complete — `tools/vehicle-manager/` (own SQLite, REST API, Fuelio CSV parser, migration script) is the source of truth for `vehicles`/`vehicle_log`; `MemoryDB`'s vehicle tables/methods and `fuelio_import.py`'s local CSV parsing are deleted. `backend/tools/finance/vehicle.py` is now a thin HTTP client (`backend/core/vehicle_client/`). Delegated to DeepSeek in two prompts (`scripts/prompts/deepseek/138_001_*.md`, `138_002_*.md`); 4 real bugs found and fixed during audit + live testing against a real Fuelio export (missing `VehicleClientError` export crashing app startup, a deleted-method call left in `receipt_service.py`'s photo-receipt flow, "km remaining until service" computed from the wrong distance figure, and a Fuelio `Active="0"` parsing bug making imported vehicles invisible) — see `docs/sessions/2026-W27.md` for the full list. #79 and #134 are now unblocked as thin consumers of the new API. Server (LXC) deployment/migration pending as a separate operational step.

**#79 follow-up (2026-07-03):** the extraction's `VehiclePatchRequest`/`patch_vehicle()` allowed-fields whitelist never carried over the ability to set `active` — no endpoint could (de)activate a vehicle at all, an unnoticed gap since #138's own testing never exercised it. Added `active` to both (`tools/vehicle-manager/app/models.py`, `app/database.py`) as part of implementing #79's list/deactivate chat tool.

---

### Dev branch / deploy-only-from-main workflow (#96) — deprioritized

**Date:** 2026-07-03

**Decision:** Issue #96 (work on a `dev` branch, merge to `main` only when verified — since every push to `main` deploys instantly to production) is deprioritized. Left open, not scheduled.

**Why:** Doru is currently the only user of Majordom. A broken commit reaching production instantly only affects him, in the same session where he'd notice and fix it — the risk #96 protects against doesn't really exist yet with a single user.

**Trigger to revisit:** the moment a second person starts actually using Majordom (partner, family member, anyone besides Doru). Claude should proactively bring this back up if that comes up in a future conversation, rather than waiting to be asked.

---

### vehicle-manager as opt-in Docker Compose profile (stopgap ahead of #150)

**Date:** 2026-07-05

**Decision:** `vehicle-manager` (+ its `vehicle-manager-sqlite-web` viewer) moved behind an opt-in `vehicle-manager` Compose profile, same mechanism already used for `ollama-local`. `majordom-api`'s hard `depends_on: vehicle-manager: condition: service_healthy` removed — verified no code path actually needs it at startup (all vehicle-manager calls in `backend/api/vehicle_*.py`/`backend/tools/finance/vehicle.py` are lazy, user-triggered; `lifespan()` in `main.py` never pings it).

**Why:** Found while cold-testing the README install flow (#154) — anyone installing Majordom who doesn't care about vehicle tracking got an unexplained extra container building/running, with no way to opt out, contradicting the "package Majordom for others" direction (root `CLAUDE.md`, "Open fork").

**Rejected:** Full split into fully independent, separately-installable services (checkbox-style installer choosing majordom-finance and/or vehicle-manager, either without requiring the other) — that's the real shape of the "life-os as modular platform" direction (#150), which is explicitly undecided and needs its own planning session. This decision is a stopgap that unblocks #154 without pre-empting #150.

**Trigger to revisit:** when #150 (naming/architecture) gets its dedicated planning session — fold this decision into whatever the full modular-service split ends up looking like.
