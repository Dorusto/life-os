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

<a id="sure-mcp-evaluation"></a>
### Sure MCP server evaluation — no integration value

**Date:** 2026-07-05

**Decision:** `sure-mcp-server` (`github.com/we-promise/sure-mcp-server`) is not worth consuming or building on. Checklist item closed with a negative result — this does not change the migration trigger status in `docs/decisions.md#sure-adoption`.

**What it actually is:** a thin, third-party, Claude-Desktop-oriented wrapper around Sure's own REST API. 17 tools total: auth/connection checks, `get/create/update/delete_transaction`, `get_accounts`, `get_categories`, `sync_accounts`, `get_usage`, and a proxy to Sure's internal AI chat (`list/create/get/send_message/delete_chat`). No portfolio-specific tool exists — no holdings, positions, securities, or market data. Last commit 2026-03-06 (an auth-header fix), 10 stars, 4 forks — small, not actively developed.

**Why no benefit for Majordom specifically:** the prior `FinanceProvider abstraction` entry above already rejected MCP-client calls for Majordom's outbound integrations in favor of direct REST, specifically because MCP adds protocol overhead for what are simple HTTP calls. This evaluation doesn't change that calculus — it confirms there was never a hidden capability in the MCP layer that REST couldn't reach anyway. A future `SureProvider` would call Sure's REST API directly, same as `ActualBudgetProvider` calls actualpy directly.

**New information found (relevant to a future `SureProvider`, not to this MCP server):** Sure's own REST API does expose a read-only `GET /v1/holdings` endpoint (qty, price, amount, cost basis, avg_cost, gain/loss) — so portfolio data is reachable via Sure's REST API even though this MCP wrapper never implemented it. The gap is the third-party wrapper being stale, not a platform limitation.

**Ghostfolio comparison (requested alongside this evaluation, since the user is testing both in parallel):** Ghostfolio also has a third-party MCP server (`mhajder/ghostfolio-mcp`, 15 stars, last pushed 2026-06-22 — more recently maintained than Sure's). Unlike Sure's, it has genuine portfolio-first tools: `get_portfolio_performance`, `get_portfolio_holdings`, `get_position`, `get_investments`, `get_dividends`, plus market-data tools (`get_historical_data`, `get_asset_profile`, `lookup_symbols`). This is a weak signal that Ghostfolio's own data model treats portfolio/holdings as a first-class concept more maturely than Sure's, though it isn't proof by itself (Sure's holdings endpoint may simply be newer than this MCP wrapper). Since Majordom won't consume either MCP server directly (REST-only outbound, per the decision above), this doesn't directly change Majordom's integration plan — it's a data point for the ongoing Sure vs. Ghostfolio evaluation itself, not for the MCP question.

**Conclusion for the M5 checklist:** both MCP-related checklist items are now resolved with actionable answers — this one is closed negative (no integration value); "Test budget allocation parity" remains open and unrelated to this finding.

**Rejected:** Building a Majordom integration on top of `sure-mcp-server` — would add an extra hop (Majordom → third-party MCP wrapper → Sure REST API) with no capability gain over calling Sure's REST API directly, and the wrapper is unmaintained enough to lag behind Sure's own API surface.

---

<a id="sure-budget-parity-evaluation"></a>
### Sure budget allocation parity — tested live, partial parity only

**Date:** 2026-07-05

**Decision:** "Sure reaches budget allocation parity with AB" (migration trigger in `docs/decisions.md#sure-adoption`) is **not met**. Tested live against real AB category/budget data (read-only, via `actualpy` on the production server) and Sure's real REST API on a separate test instance (using a Sure API key, read + reversible test writes — categories created and deleted, no real Sure data existed to risk).

**What matches:**
- **Category structure:** full parity. Sure supports the same 2-level nesting as AB (group→category). Confirmed empirically: created a category, then a subcategory under it, then a third level — Sure rejected it ("Parent can't have more than 2 levels of subcategories"), matching AB's own two-tier model exactly. Creatable via Sure's public API (`POST /api/v1/categories`).

**What doesn't:**
- **Per-category budget amount via API — read-only.** Sure's `budget_categories` resource (`config/routes.rb`) exposes only `index`/`show` at the API level; `create`/`update` exist only in the web controller, not the public API. A human can set a category's budget from Sure's UI; a `SureProvider` integration could not do it programmatically today.
- **Rollover/carryover — no equivalent found.** AB's real budget (read from production) has multiple categories with `carryover=True` — unspent amounts genuinely roll into the next month, actively used. Sure has a feature called "rollover" (PR #1100, `we-promise/sure`), but it's a different mechanic: it copies the *budgeted amount* from the previous month into an uninitialized budget — it does not carry forward unspent balance. No carryover-equivalent field exists on Sure's `budget_categories` schema.
- **Goals (target amount + date, used on AB's own Savings-group categories) — UI-only.** Sure has a `goals` feature (`resources :goals` + `goal_pledges` in `config/routes.rb`) but no `goals_controller.rb` exists under `app/controllers/api/v1/` — not reachable via the public API at all.

**Why this matters:** category *structure* migrates cleanly, but budget *behavior* does not — specifically the rollover semantics AB is actively relied on for, and the inability to automate budget/goal writes via Sure's current API. Both are blockers for any future `SureProvider` implementation, independent of the category-structure question.

**Rejected:** Treating "categories are structurally compatible" as sufficient evidence of parity — the checklist item is about *budget allocation* behavior, not just category shape, and the two diverge here.

---

<a id="ghostfolio-vs-sure-portfolio-comparison"></a>
### Ghostfolio vs Sure — portfolio feature comparison + concrete migration criteria

**Superseded by:** [Ghostfolio dropped — portfolio data source now open](#ghostfolio-dropped) (2026-08-28) — the "AB + Ghostfolio" half of this decision no longer holds; the Sure-vs-AB budgeting comparison and migration criteria below are unaffected.

**Date:** 2026-07-05

**Decision:** Stay on **AB + Ghostfolio** for now (AB for budgeting, Ghostfolio for portfolio) rather than moving toward unified Sure. Not a final/permanent decision — Sure's migration trigger conditions in `docs/decisions.md#sure-adoption` are tracked going forward with concrete, checkable criteria (below) instead of re-evaluated ad hoc.

**Portfolio comparison (Ghostfolio vs Sure's own API, tested live against real synced XTB/ING/Revolut data on the Sure test instance):**
- **Activity/maturity:** comparable — Sure 8,883 GitHub stars, Ghostfolio 8,901, both pushed same-day, similar community size. Not a differentiator.
- **Investment data model:** both solid. Sure's `trades` API is full CRUD (buy/sell/dividend/deposit/withdrawal/interest — confirmed via `trades_controller.rb`), `holdings` are read-only computed snapshots (qty, price, cost basis, avg_cost), `securities`/`security_prices` read-only. Ghostfolio's equivalent additionally allows *writing* market data / asset profiles via API (`add_market_data_points`, `upsert_asset_profile` per its MCP tool list) — useful for manually-tracked/illiquid assets, a small edge over Sure.
- **Performance metrics — the clearest gap.** Ghostfolio natively computes and exposes return metrics (Today/WTD/MTD/YTD/1Y/5Y/Max, normalized performance). Sure's API has no equivalent — only `balance_sheet` (net worth/assets/liabilities) and raw holdings a consumer would have to derive returns from manually. If "seeing your investments" means performance over time (not just current value), Ghostfolio delivers this out of the box today; Sure does not yet.
- **Budgeting:** Ghostfolio has none at all — it only ever replaces the portfolio side, AB stays regardless if Ghostfolio is kept. Sure's pitch is the opposite: one platform for both, which is exactly why its budget-parity gap (see `#sure-budget-parity-evaluation` above) matters so much to the overall decision.

**Concrete migration trigger criteria (replaces the vague bullets in `#sure-adoption` with checkable, scriptable conditions found during this evaluation):**
1. `we-promise/sure` `config/routes.rb`: `resources :budget_categories` includes `:create`/`:update` (currently `index, show` only)
2. `we-promise/sure` exposes a `goals` (or equivalent) controller under `app/controllers/api/v1/` (currently absent — goals exist in the web UI only)
3. Sure's `budget_categories` data model gains a true carryover/rollover field (unspent balance rolls to next month — distinct from the existing "copy previous month's budgeted amount" feature, PR #1100)
4. (Nice-to-have, not blocking) Sure's API exposes a performance/returns endpoint comparable to Ghostfolio's ROAI metrics

**Why criteria instead of a vague trigger:** "Sure reaches budget allocation parity with AB" and "Sure MCP server is production-ready" (original bullets) aren't checkable without redoing this whole research session. Criteria 1-3 are single `gh api` calls against Sure's own public repo — cheap to automate. Criterion 4 (MCP server) is dropped as a trigger entirely per `#sure-mcp-evaluation` — Majordom will never consume Sure via MCP regardless of the wrapper's maturity, so it was never actually a meaningful gate.

**Rejected:** Manually re-checking Sure's changelog periodically — error-prone and easy to let slip for months (same failure mode as the "architecture audits triggered by symptom, not schedule" process gap fixed 2026-07-04 for a different area). A scheduled automated check against the criteria above is the follow-up (see session notes).

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

<a id="174-code-audit"></a>
### #174 code audit — dead/broken `FinanceProvider` method removed, CSV error-handling leak fixed

**Date:** 2026-08-28

**Decision:** Third full sweep, triggered by the monthly scheduled-check issue (15+ issues closed since #143 by the time it fired, more by the time it was picked up). Same 5 checkpoints as #93/#143. Found and fixed 2 items directly:
1. `ActualBudgetProvider.get_spending_history()` (`backend/core/finance/actual_budget_provider.py`) and its matching entry on the `FinanceProvider` Protocol (`backend/core/finance/provider.py`) called `self._client().get_spending_history(months=months)` — but `ActualBudgetClient` never had a `get_spending_history` method. Dead (grep found zero callers of the provider method anywhere) and broken at the same time (would have raised `AttributeError` if ever invoked — the same failure class as #126, just never triggered because nothing calls it). The real `finance__get_spending_history` chat tool (`backend/tools/finance/actual_budget.py`) computes independently via a loop over `get_monthly_stats()` and bypasses the provider entirely — unaffected. Removed the dead method from both files rather than implementing it for real, since nothing needs it.
2. `csv_import.py`'s CSV encoding/delimiter-detection handler caught a broad `except Exception as e` and leaked the raw message via `detail=f"Cannot parse CSV: {e}"` — inconsistent with the fixed-friendly-message pattern #93 established for every other broad-`Exception` handler in the codebase (`home.py`, `receipts.py`, `transactions.py`, `vehicle_proposals.py`). Changed to log the full exception server-side and return a generic message.

**Rest of the sweep — checked, no findings:**
- All 4 shared finance-calc helpers (`_compute_monthly_totals`, `_compute_budget_vs_spent`, `_tombstoned_category_remap`, `_compute_goal_progress`) remain the only copies — no new inline reimplementation since #143.
- FIRE calc (`get_fire_status`) has one implementation despite being rewritten twice historically (#156/#166) — both call sites reuse it.
- The `BudgetChart`/`GoalsChart` duplication flagged at #143 is resolved — unified into one generic `Chart.tsx`.
- The #159 Confirm/Cancel unification (`ActionCardButtons`) is adopted by 13/18 chat action-card components; the 5 that don't use it (`SetupBalancesCard`, `FuelReceiptCard`, `ReceiptCard`, `CsvImportCard`, `IncomeSourceCard`) have genuinely different interaction shapes (multi-branch confirm, per-row bulk actions, a wizard step with no cancel) — not an oversight.
- All 44 registered chat tools have a dispatch branch in `registry.py` — no dead tool entries. The one route with no frontend caller, `POST /push/test`, is an intentional auth-gated diagnostic endpoint, not dead code.
- The two longest tool descriptions (`finance__propose_budget_copy`, `vehicle__get_vehicle_log`, ~590 chars) carry non-obvious behavioral guidance for the LLM (what a copy replicates, when not to suggest deletion) — inspected and judged not bloat.
- 11 `ActualBudgetClient` methods (`create_account`, `create_transfer`, `get_home_data`, etc.) have no matching entry on the `FinanceProvider` Protocol, but every call site reaches them via the direct `_get_client()` helper, never `get_provider()` — not a live bug. Already tracked by the existing #148 ("csv_import.py and receipt_service.py bypass FinanceProvider, hardcode ActualBudgetClient") — no new issue opened for this.

**Why:** Same reasoning as `#93-code-audit`/`#143-code-audit`. Notable this time: the finding was a genuine `AttributeError`-in-waiting on the third sweep of a codebase already audited twice — the scheduled-check mechanism (#149) catches real issues even absent a triggering incident.

---

## Product decisions

### UI — 2 tabs only (Home + Majordom)

**Partially superseded by:** [Universal transaction UI — sheet vs. full-screen split](#universal-transaction-ui) (2026-08-28) — the bulk transaction table (#184) is a full-screen page, reached by button rather than persistent nav, not a strict reading of "last resort." Also by [Navigation — 5 tabs, not 2](#nav-five-tabs) (2026-08-28) — nav is no longer 2 tabs at all. And the "Settings are conversational" line specifically: a dedicated Settings screen was added the same day (gear icon, present in the header throughout), once the header itself needed a real target for it — Doru asked for it directly, judged necessary now rather than deferred.

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

<a id="universal-transaction-ui"></a>
### Universal transaction UI — sheet vs. full-screen split (#184, #185)

**Superseded (part 2 only) by:** [Navigation — 5 tabs, not 2](#nav-five-tabs) (2026-08-28, same session) — #184 became a persistent nav tab, not a button-launched full-screen page. Part 1 (#185 stays a sheet) is unaffected.

**Date:** 2026-08-28

**Context:** chat-based per-type action cards (fuel receipt, groceries receipt, etc.) don't scale — every new transaction shape needs its own card, and bulk cleanup of uncategorized transactions in chat breaks at scale (#178). Design inspiration gathered from two third-party apps (UI/UX only, no code — see `docs/design/inspiration/README.md`): Chompass (calorie tracker, MIT) and MoneyMatter (AGPL, already evaluated and rejected as a finance engine per `#ab-stays-not-moneymatter-not-firefly` — this time strictly UI reference, no engine/code involvement).

**Decision, two parts:**

1. **#185 (single-transaction add/review) stays a bottom sheet over Home** — no change from the existing draft spec (`docs/specs/add-review-transaction.md`), confirmed against Chompass's "Edit Food" sheet pattern (drag handle, pinned Save, per-line editable list, "+ Add line"). Every AI-proposed transaction opens the full sheet for v1 — no lightweight inline-confirm tier (Chompass has one for unambiguous cases; deferred as a future optimization, not needed for v1 and adds design/testing surface without which v1 still works).
2. **#184 (bulk transaction table) is a full-screen page, opened by button from Home — not added to persistent nav.** MoneyMatter's transaction table (checkbox multi-select, Filters/date-range/account/category, sortable columns) confirmed a dense filterable grid doesn't fit a bottom sheet. This is read as consistent with the *spirit* of the 2026-05-29 "2 tabs only" decision (nav stays 2 tabs, no third persistent tab) rather than a literal reading of "last resort" — the table is real, needed complexity, not a redundant screen.

**Also confirmed from MoneyMatter's "Add Transaction" modal:** a dedicated "Split" button next to Category, validating #115 (backend split-across-categories) as a proven, non-over-engineered pattern rather than speculative scope.

**Rejected:** two-tier confirm (native lightweight dialog + full sheet) for #185 v1 — more to design and test upfront, revisit once the single sheet ships; #184 as a persistent third nav tab — would contradict the 2-tabs decision more directly than a button-launched full-screen page.

---

<a id="nav-five-tabs"></a>
### Navigation — 5 tabs, not 2

**Date:** 2026-08-28 (same session as the universal transaction UI mockup, later in the same day)

**Decision:** Bottom nav is Dashboard / Accounts / Transactions / Majordom / Analytics — 5 persistent tabs, mirroring MoneyMatter's own bar (Dashboard/Accounts/Transactions/Planned/Analytics, with Majordom taking the "Planned" slot since chat stays the app's core differentiator). Home is renamed Dashboard and becomes widget-based with a MoneyMatter-style Customize mode (add/remove/resize widgets).

**Why the reversal:** while mocking #184 as a button-launched full-screen page (the compromise from the entry above), it became clear a dense filterable transaction table and a real account-detail drill-down both want to be reached directly, not routed through Home every time — the "2 tabs, last resort" framing was optimizing for a much simpler app than what Majordom's own feature set (bulk transaction cleanup, multi-account tracking, analytics) actually needs. Explicit request from Doru: could the app replicate MoneyMatter fully — full navigational parity, not just the two original card patterns.

**Accounts and Analytics tabs are UI shells only** — built to make the 5-tab bar feel real during design review, not yet scoped features. Accounts ties into real data already (AB accounts + vehicle-manager). Analytics is deliberately more built out than a stub (see below) but several of its reports have no confirmed data source yet — see `#ghostfolio-dropped`.

**Rejected:** keeping 2 tabs and routing everything through Home buttons — reasonable for the original #184/#185 scope, wrong once the redesign expanded to match MoneyMatter's information architecture.

---

<a id="ghostfolio-dropped"></a>
### Ghostfolio dropped — portfolio data source now open

**Date:** 2026-08-28

**Decision:** Ghostfolio is off the plan. No client code, no deployment, no dependency — there was never any to remove. `#ab-stays-not-moneymatter-not-firefly` and AB itself are unaffected; this only concerns the portfolio/investment side that Ghostfolio was meant to cover.

**Why now:** raised by Doru mid-UI-session, initially as general frustration with "AB gets in the way," corrected after review into two separate, much sharper points:
1. **AB's real pain is setup friction, not the engine.** Already spec'd and unbuilt: `docs/specs/ab-setup-wizard.md` (live "Test connection," budget-file listing, encrypted storage, reconnect banner). AB itself stays — its rollover/carryover budgeting model is genuinely hard to replace (confirmed by the M5 Sure evaluation rejecting Sure specifically for lacking it, `#budget-calibration`).
2. **Ghostfolio has no case left.** Confirmed already in `docs/sessions/2026-W28.md`: "Ghostfolio doesn't support live sync anyway, only CSV import" (Doru's own words, months ago) — and it was never actually deployed or integrated (`#4`, reopened once already in `docs/sessions/2026-W27.md` with the exact same unease, never given the "dedicated conversation" that session said it needed). If Majordom is rendering all the investment charts itself anyway, a CSV-only, unintegrated engine contributes nothing a live API would.

**Portfolio data source: deliberately left open, not re-decided today.** Options for later (manual entry, CSV import into majordom's own storage, a different API-first portfolio engine, or building return/cost-basis calculation in-house) are not evaluated here — this entry only removes Ghostfolio as the assumed answer.

**UI built ahead of the data decision, on purpose (Doru's explicit call):** the Analytics investment reports (Net Worth Drivers, Investment Contributions, Investment Projection, portfolio holdings) are mocked with realistic layout and copy now, each visually flagged as pending a data source, so wiring them up later is a backend task, not a redesign.

**Follow-up, not done here:** the monthly `sure-migration` cloud routine's criteria (`#ghostfolio-vs-sure-portfolio-comparison`) were framed partly around Ghostfolio; worth a quick check that its automated check still makes sense now that Ghostfolio is out of the comparison, but that's an ops task, not a redesign decision.

---

<a id="dashboard-goals-budget-kept-as-widgets"></a>
### Dashboard widgets — Financial Goals and Budget kept, not dropped (#192)

**Date:** 2026-08-28

**Context:** implementing #192 from the Universal Transaction UI mockup, the mockup's own widget list (Balance trend, Latest Transactions, Cash Flow, Expenses Structure, Vehicle costs) turned out not to include Financial Goals (Portfolio Independence/FIRE + goal cards) or Budget at all — both existing, real, actively-used features from the old Home screen. Nothing in this mockup session's own record (`#universal-transaction-ui`, `#nav-five-tabs`) flags this as a deliberate removal; it reads as an omission, not a decision.

**Decision:** kept both as widgets in the new Dashboard widget registry, alongside the mockup's own five — confirmed with Doru mid-implementation rather than silently dropped or silently kept. Both default ON, both removable/re-addable through Customize mode like every other widget.

**Why:** a widget-based redesign is not the place to lose two shipped, real features by omission. The mockup is UI/UX reference for the *new* widgets it introduces, not a literal spec of the complete Dashboard content — a feature list built during a mockup session can undercount what the screen it's replacing already does.

**Also decided the same pass — which widgets get real data vs. an honest placeholder, so #192 didn't balloon into a full backend-aggregation project:**
- **Real, no new backend needed:** Financial Goals, Budget (both carried over unchanged), Latest Transactions (`getTransactions()` already existed), Expenses Structure (reuses the `BudgetCategory[]` data the Budget widget already fetches — no new endpoint).
- **Real snapshot, placeholder trend:** Balance trend shows a real current total (summed from `getAccountList()`), but the historical chart and the Portfolio/Vehicles scopes are marked "coming soon" — no time-series balance endpoint and no portfolio/vehicle-manager cost aggregation exist yet.
- **Full placeholder, off by default:** Cash Flow, Vehicle costs — no data source at all yet, matches the mockup's own off-by-default choice for these two.

**Rejected:** implementing #192 strictly literally against the mockup's widget list (would have silently removed Goals/Budget from the app); building real backend aggregation for all 5 mockup widgets in the same pass (would have turned a nav/shell issue into an open-ended backend project, against the session's own explicit scope-narrowing decision).

---

## Pending decisions (do not implement without explicit decision)

### FIRE % on Home

**Superseded by:** "FIRE / Portfolio Independence — yield source" and the 2026-07-07 Home redesign issues (#163/#164, formula-rewrite issue tracked separately).

**Decision (implemented):** v1 via AB off-budget accounts — sum of off-budget accounts excluding real estate/mortgage. Hardcoded target and contribution for now. Revisit when Sure investment data is available (M5).

---

### FIRE / Portfolio Independence — yield source

**Date:** 2026-07-07

**Question:** should the return rate used in the FIRE/Portfolio Independence projection be (1) a pure user-set hypothetical, (2) derived from the user's own historical realized portfolio performance, or (3) a forward-looking projection per ETF/asset class the way brokers/robo-advisors do it (published Capital Market Assumptions)?

**Decision:** hybrid of (1) and (2). The rate used in any projection is always a user-editable input — never silently substituted. The *default/suggested* starting value is seeded from the user's own historical realized performance via Ghostfolio (which already computes portfolio performance natively, per the M5 Ghostfolio decision) once that data is wired in; until then, a generic illustrative default is used and clearly presented as such.

**Rejected:** option (3), forward-looking per-ETF/asset-class projections. Predicting specific securities' future returns crosses into regulated investment-advice territory and contradicts the "coach, not consultant" principle (see that entry above) — also requires an external Capital Market Assumptions data source that goes stale and needs continuous upkeep, disproportionate for a personal tool.

**Applies to:** the FIRE formula rewrite (2-phase accumulation/decumulation, glide path) issue, and the existing `_calc_fire()` in `backend/core/actual_client/client.py`.

---

### Income classification (passive/semi-passive/active) — granularity

**Date:** 2026-07-07

**Decision:** classified per **income category** (e.g. "Rental Income"), stored the same way as goal metadata — a parsed tag in Actual Budget's `Categories.notes` field (`actualpy`'s `Categories` model has a native `notes` field; `Payees` does not, ruling out a per-payee approach without a new mechanism). No SQLite table, no per-payee granularity for now — matches the existing `TARGET:`/`DEADLINE:` note-parsing pattern used for goals (`_compute_goal_progress()`).

**Why not per-payee:** `Payees` has no `notes` field in `actualpy`, and per-payee granularity isn't needed yet — confirmed with Doru. Revisit only if a real case appears where one category mixes clearly passive and clearly active income sources.

**Applies to:** the Expense Coverage (Coast/Barista FIRE) issue.

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

**Superseded by:** "Generic chart system + refetch (#134)" (below) — the "one tool per chart type" decision below was reversed once `BudgetChart`/`GoalsChart` duplication (flagged by the #143 audit) made the cost of *not* generalizing concrete rather than hypothetical.

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

---

### Generic chart system + refetch (#134)

**Date:** 2026-07-05

**Supersedes:** "Charts inline in chat (issue #30)" — specifically its "one tool per chart type" call.

**Question:** Keep one bespoke tool + one bespoke React component per chart type (as #30 decided), or move to a generic `{"type": "chart", "chart_type": ..., "data": {...}}` contract with one dispatcher component?

**Decision:** Generic contract, 4 `chart_type`s (`pie`, `bar`, `line`, `progress_list`). All 4 existing chart tools migrated (not left on the old format) — `SpendingChart`/`BudgetChart`/`GoalsChart`/`TrendChart` deleted, replaced by one `frontend/src/components/Chart.tsx`. The *tool* (backend) decides `chart_type`, never the LLM — confirmed with Doru before implementation, since letting the LLM pick a chart type for data it doesn't structurally understand risks a mismatched visual with no error to reveal it.

**Why now, not when #30 was written:** #30's "beyond 6 chart types → refactor" threshold hadn't been hit, but the #143 audit (2026-07-05) found `BudgetChart`/`GoalsChart` were already ~90% duplicate code — the real trigger was duplication, not type count. Building a 5th bespoke component (vehicle consumption chart, this session's original ask) on top of already-duplicated ones would have made a future migration only more expensive, not less.

**Full migration vs. generic-for-new-only:** chose full migration. Trade-off discussed with Doru upfront — more short-term risk (4 tools + 4 components retested in one session) vs. leaving the real `BudgetChart`/`GoalsChart` duplication unresolved. Doru chose full migration.

**In-card period refetch (added mid-session, not in original scope):** once the vehicle consumption chart shipped with fixed preset buttons (3M/1Y/5Y/All), Doru asked to change the period *from the chart itself* rather than by typing a new chat message, and then to extend the same idea to the other charts (budget/spending: prev/next month; spending trend: custom month range; vehicle charts: custom date range, additive to the existing buttons). Implemented as a `refetch` block or REST GET endpoint that bypasses the chat/LLM round-trip entirely — a period change is a deterministic parameter, not a new question. Three modes (`period_buttons`/`month_nav`/`month_range`) because "period" genuinely means different things per chart: budget/spending are bound to one Actual Budget calendar month (can't take an arbitrary range), spending trend is already multi-month (range makes sense), vehicle logs are day-granular (free date range makes sense in addition to presets). See `docs/architecture.md` rule 23 for the technical shape.

**Rejected:** having period-switcher buttons re-send a synthetic chat message (e.g. "last 5 years") instead of a dedicated REST endpoint — would've needed zero new backend routes, but costs an LLM call and a visible new chat bubble for what the user experiences as a simple in-place UI control.

**Not done this session:** distance/consumption custom range is day-level for vehicle charts specifically because fill-ups are logged at arbitrary dates; budget/spending intentionally stayed month-level rather than being generalized to day-level too, since Actual Budget's own budgeting model is monthly — a day-range picker there would imply a precision the underlying data doesn't have.

---

### Coach, not consultant — principle for the intelligence module

**Date:** 2026-07-07

**Decision:** Any feature that projects or infers something about the user's financial future (FIRE/Portfolio Independence projections, Expense Coverage, budget calibration, goal proposals) presents itself as a hypothesis computed from the user's own explicit inputs and assumptions ("with your current assumptions, projection shows X") — never as investment advice or a recommended strategy. Applies to every `intelligence-cluster`-labeled issue, present and future — check this entry before writing any projection/recommendation logic.

**Why:** Majordom is a personal tool, not a licensed financial advisor. Recommending specific strategies or predicting returns per instrument crosses into regulated advice territory and risks false confidence in numbers that are fundamentally assumptions. Surfaced concretely in the 2026-07-07 Home redesign discussion (Claude web, brought into Claude Code for implementation) around the Portfolio Independence projected-return question: is the yield hypothetical, user-set, derived from the user's own historical performance, or a forward-looking per-ETF projection (the way brokers/robo-advisors do it via published Capital Market Assumptions)? Landed on: always a user-editable input, optionally seeded from the user's own realized performance, never a forward-looking prediction tied to specific securities — that's deliberately out of scope.

**Mechanism, for any new intelligence-cluster issue:**
1. Any numeric assumption used in a projection (return rate, inflation, retirement age) is a user-editable input — never silently computed or injected without the user seeing/adjusting it.
2. A shown default/suggested value must be sourced from the user's own historical/observed data (e.g. Ghostfolio's realized portfolio performance, once available) or clearly flagged as a generic illustrative default — never a forward-looking claim about specific securities/ETFs.
3. The underlying questions (horizon, inheritance intent, risk comfort, income classification) are asked conversationally, spread across multiple natural sessions — never as a single upfront form (consistent with the already-rejected M2 onboarding wizard).

**Applies to:** all `intelligence-cluster`-labeled issues.

---

### Public demo — architecture (VPS, separate from personal instance)

**Date:** 2026-07-07

**Decision:** a public demo instance is a fully separate deployment, not a mode flag on the personal instance:
- **Own LXC/VPS** — external VPS (not the home LXC), own dedicated demo domain, kept off the existing personal domain. Isolates network/bandwidth risk from the home setup and doubles as a demonstration of the already-planned VPS consulting service.
- **Actual Budget fully invisible, technically, not just in the UI** — AB and the Majordom backend talk only over the internal Docker network; no AB port is ever exposed publicly.
- **Fictitious persona/data**, never Doru's real data (see "confidentiality directive" below — applies to docs too, not just the demo).
- **Concurrent visitors:** writes/confirmations in the demo are visually confirmed only, never actually persisted — per-visitor isolation was considered and rejected as too complex. Chat itself stays real (reads the fictitious seed data), only the write/confirm step is faked.
- **Reset:** nightly Btrfs snapshot restore (simple, matches existing backup mechanism) rather than a separate "fake write" storage layer.
- **Model:** Gemini 2.5 Flash Lite via Google Vertex EU — cheaper (~3x) than MiniMax M3, already proven in production, EU data processing (simpler sovereignty story for the target audience). Explicitly not an OpenRouter `:free` model (throttling risk exactly at traffic peaks). MiniMax stays for private empirical testing only, not the public demo.
- **EnableBanking fully disabled** in the demo (no real bank connections, ever).
- **Rate limiting:** Cloudflare, same pattern already used for EnableBanking.
- **Mandatory disclaimer**, shown before any input: data goes to a named public AI model, not processed locally — explicit "don't enter real data" warning.
- **Access:** Cloudflare Access Service Tokens for the Majordom PWA itself (non-interactive, no login popup loop); interactive email/OTP Access stays fine for occasional browser-only access (e.g. Proxmox).
- **Mobile:** PWA is already responsive: receipt photos from phone work without extra effort.
- **"Bonuri NL vs. audiență RO" framing:** works with receipts in any language/format — a selling point, not a weakness to hide.

**Why now, documented but not yet built:** captured during the 2026-07-07 Home redesign session so the architecture isn't re-derived later; actual build is deliberately sequenced after Ghostfolio (#4) and the Home redesign issues (#163-#167) land — the demo should show the finished product, not an in-progress one.

**Trigger to build:** see the "Public demo on a VPS" GitHub issue — blocked on Ghostfolio (#4) and the Home redesign batch.

---

<a id="ab-stays-not-moneymatter-not-firefly"></a>
### AB stays as finance engine — not MoneyMatter, not Firefly III, not a custom engine

**Date:** 2026-08-17

**Decision:** Actual Budget (AB) remains the finance engine. Closed — do not reopen without a new, concrete trigger (not just "found an app that looks simpler").

**Why not MoneyMatter:** Enable Banking NL sync confirmed working on their side, but switching engines doesn't fix the real problems observed (partial misunderstanding of rollover/carryover, deduplication bugs on import) — those are usage/implementation issues on the current engine, not AB limitations, and would follow to any new engine.

**Why not Firefly III:** incompatible data model — Firefly is double-entry bookkeeping (business accounting), AB is envelope budgeting (YNAB-style, with rollover on savings categories). Migrating would mean rebuilding the budgeting logic from scratch around new accounting concepts. No native bank sync (CSV or paid importers only). AB already handles the shared-budget case (Doru + partner) without manual reconciliation — a real advantage for the current use case.

**Why not a custom engine:** disproportionate risk for the benefit, especially without a programming background — double-entry correctness, reconciliation, and bank sync are exactly the areas where mistakes are expensive and hard to debug. Sure (the long-term successor candidate already tracked in this repo, see `#ghostfolio-vs-sure-portfolio-comparison`) confirms the right model: a mature engine + an external conversational layer, not an engine built from scratch.

**Rejected: forking MoneyMatter.** Reintroduces full AGPL exposure (the whole project would need to become AGPL) without removing the real complexity of a finance engine. Generalizable principle: if AGPL-licensed code is ever adopted, it stays isolated as a separate self-hosted microservice consumed over REST (the same pattern as `VehicleClient`, see `#vehicle-manager`) — never adapted directly into this codebase.

**Reconfirmed as the project's central principle, independent of this decision:** `_PROPOSAL_TOOLS` — nothing writes to AB without explicit user confirmation — is what Majordom actually is, not an implementation detail that varies with the backend engine.

**Still open, not blocking this decision:** import deduplication bug (exact symptom not yet pinned down), new Home charts (recharts) — see `docs/roadmap.md` backlog.

---

<a id="self-host-only-no-saas-tier"></a>
### Self-host only — no hosted SaaS tier

**Date:** 2026-08-17

**Decision:** Majordom stays self-hosted only. No tier where Doru hosts other users' financial data. The public demo stays an isolated, non-persistent showcase, not an alternative way to use the product.

**Why it came up:** real setup friction connecting to AB (blind `base_url`/`password`/`file` entry) suggested a hosted tier as a way around it, following MoneyMatter's self-host-or-cloud model.

**Why rejected:**
- Doesn't solve the actual problem — self-host users still enter AB credentials; a SaaS tier just gives some users a way to skip the step entirely, it doesn't remove it.
- Business-model shift, not a technical one: hosting other people's financial data is direct GDPR liability as a data controller for sensitive third-party data — a different category from "sell setup consulting on the client's own server" (the current model).
- AB has no safe native multi-tenancy (one server password, not isolated accounts) — correct hosting would still need one AB instance per client, technically identical to the existing VPS-setup-as-a-service, just with Doru holding final access instead of the client.
- Contradicts DEPPSiT's positioning (digital sovereignty — your data, your server); a tier where Doru hosts other people's money is the opposite of that message.

**The real friction gets solved by a setup wizard instead** — see `docs/specs/ab-setup-wizard.md` — credentials entered once, validated live, encrypted at rest.

**Demo, confirmed unaffected by this decision:** separate VPS, own subdomain, AB unreachable from the public internet, write actions confirmed visually but not persisted for demo visitors, Gemini Flash Lite via Google Vertex EU, Cloudflare Access with Service Tokens.

**Rejected:** hosted SaaS tier, even offered optionally alongside self-host.

---

### Every proposed action needs verifiable proof, not just a success message

**Date:** 2026-08-02

**Decision:** any action Majordom proposes (categorization, rule, transfer, budget change) must show the user proof they can check — a clear preview of affected transactions before confirmation, and an easy-to-verify summary after — not just a "done" message.

**Why:** direct user quote — "often I can't tell if what it did is correct, and I don't trust it, so I end up going into AB to check anyway." That defeats the point of delegating: if the user re-verifies manually every time, Majordom adds a step instead of saving time.

**Applies to:** every `_PROPOSAL_TOOLS` flow, present and future — check this entry before writing any action that changes AB state. Same spirit as the "Coach, not consultant" principle above, applied to trust instead of scope.

---

<a id="115-184-185-shipped"></a>
### #115/#184/#185 shipped — Universal Transaction UI, phase 2

**Date:** 2026-08-28

**Shipped:** split-across-categories (#115, `POST /transactions/{id}/split`, backend-only,
no chat tool by design — see `#universal-transaction-ui`), the dedicated Transactions
table (#184, filters + bulk category edit, no AI), and manual entry + split-lines UI
(#185, killing the interim chat-routing for manual transactions). See
`docs/specs/add-review-transaction.md`'s "What actually shipped" section for how #185
narrowed from its original draft. All three delegated to `deepseek-senior` via isolated
git worktrees, live-tested end to end against the local dev stack before merge.

**Three real integration bugs found, worth remembering as a class of mistake — two by
the delegates themselves, one by an independent retroactive `pre-commit-review` pass
run after merge (task-complete step 1, done late this round — worth doing *before*
committing next time):**

1. **`split_transaction()` (#115) filtered on `financial_id`, but the value every
   caller actually has is the primary key `id`.** `add_transaction()` /
   `ReceiptService.confirm()` return `str(tx.id)` as `"transaction_id"` —
   `financial_id` (a separate, often-`None` field, architecture.md rule 21) is never
   returned to any caller. Anyone passing that `transaction_id` into split would get a
   false "not found." Found by the #185 delegate *before* writing code for it (correctly
   treated as a circuit-breaker case), fixed by Claude directly in `main` (commit
   `1332372`), verified live (correct id → 200 with right structure; the old
   `financial_id` value → correctly 400s "not found").
2. **The photo-review categories list sent `cat.name` mislabeled as `id`** —
   `ReceiptService.process_image()`'s categories array had `{"id": cat.name, ...}`, so
   the dropdown's value was always a display name, never a real category id. This
   happened to "work" only because `add_transaction(category_name=...)` also expects a
   name — two compensating mistakes, not a working design. Switching the dropdown to
   real AB UUIDs (needed for #115's `category_id` contract) required a `_resolve_category_name()`
   helper in `receipt_service.py` to translate UUID/slug/name back to a name for
   `add_transaction()` — without it, a UUID would have been passed straight through as a
   "name" and silently created a garbage category literally named after the UUID.
3. **`split_transaction()`'s children never set `cleared`, defaulting to `False`
   regardless of the parent's actual reconciled state** (architecture.md rule 7 —
   every creation path must set `cleared` explicitly). Splitting an already
   bank-matched/reconciled transaction silently produced permanently-unreconciled
   children. Fixed (commit `db1bc54`) by copying `tx.cleared` onto each child; verified
   live (a `cleared=True` test transaction's split children now correctly show
   `cleared=1`).

**Process note:** #185's delegate touched `receipt_service.py` despite an explicit
"Do NOT touch — stop and describe it" instruction in its prompt, without stopping to
ask (unlike bug #1 above, where the same delegate correctly used the circuit breaker).
The change itself was verified correct and necessary before being accepted — but the
instruction-following gap is worth watching for in future large delegated tasks: a
circuit breaker invoked once in a task isn't a guarantee it fires every time a stated
boundary is crossed.

**Tooling note (not a project decision, kept here since it affects any future
delegation):** running multiple `opencode run` instances at once repeatedly hung at
"bootstrapping" with zero CPU and zero network activity — root cause was contention on
opencode's shared SQLite db (`~/.local/share/opencode/opencode.db`), made worse by a
long-running interactive opencode session already holding it open. Fixed by setting
`XDG_DATA_HOME` to a per-task temp directory for each delegated `opencode run` — fully
isolates its db/log/session-history from any other concurrent instance. `--continue`
does not work across that isolation (a fresh `XDG_DATA_HOME` has no prior session to
continue) — the delegate re-derives context by re-reading its own prompt file and the
relevant issue/docs instead, which worked fine in practice but costs some redundant
exploration. Doru is evaluating Aider as a possible replacement for opencode in the
`delegate-by-complexity` skill for a future session, specifically because Aider keeps
state per-repo rather than in one shared global db — not decided, not started.
