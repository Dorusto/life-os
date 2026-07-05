# Task: FIRE / Crossover Point report in chat

## Context

Roadmap item 4.9 (M4 — Smart Alerts), tracked as issue #156. The Home screen already has a FIRE widget (`FireWidget` component, roadmap 2.6, done) showing current portfolio %, target, and projected value. This task adds the same information as a chat-accessible report, so the user can ask about it conversationally instead of only seeing it on Home.

This is a report/chart tool, same family as the existing `finance__get_goals_chart` and `finance__get_budget_chart` — no new frontend component is needed, the existing generic chart system (`frontend/src/components/Chart.tsx`, `chart_type: "progress_list"`) already renders exactly this shape (see how `get_goals_chart` builds its `items` list in `backend/tools/finance/actual_budget.py` around line 490-521).

## Goal

The user can ask in chat, e.g. "cum stau cu FIRE-ul?", "how's my FIRE progress?", "when will I reach financial independence?", and get back a progress card showing: current portfolio value, target, percentage, projected year the target is reached, and monthly contribution — the same numbers already shown in the Home screen's `FireWidget`, not a re-derived or different calculation.

## Relevant files

| File | What it contains |
|------|-----------------|
| `backend/api/home.py` | Has `FIRE_TARGET`, `MONTHLY_CONTRIBUTION`, `ANNUAL_RETURN`, `FIRE_YEAR`, `FIRE_EXCLUDE` constants and `_fire_portfolio()` / `_calc_fire()` functions (lines 15-59) — currently the *only* place this logic lives |
| `backend/core/actual_client/client.py` | Where the other shared finance-calculation helpers already live: `_compute_monthly_totals`, `_compute_budget_vs_spent`, `_compute_goal_progress` (see `docs/architecture.md` rule 20) — this is where the FIRE helpers belong now that a second call site needs them |
| `backend/tools/finance/actual_budget.py` | `get_goals_chart()` (line ~490) — the pattern to copy for the new `get_fire_chart()` function: same `progress_list` chart JSON shape |
| `backend/tools/registry.py` | Tool schema list (~line 100-140) and dispatch (~line 990) — where `finance__get_goals_chart` is registered, add the new tool the same way |
| `backend/api/chat.py` | `_PROPOSAL_TOOLS` set (~line 158) and `_build_system_prompt()` (~line 101-116) — both need the new tool added |

## Changes required

### 1. `backend/core/actual_client/client.py` — extract shared FIRE helpers

Move `FIRE_TARGET`, `MONTHLY_CONTRIBUTION`, `ANNUAL_RETURN`, `FIRE_YEAR`, `FIRE_EXCLUDE`, `_fire_portfolio()`, and `_calc_fire()` from `backend/api/home.py` into this file as module-level constants/functions, next to the other `_compute_*` shared helpers. Keep their exact current logic and signature (they take an already-fetched `accounts` list — do not make them fetch accounts themselves, since `get_home_data()` already fetches accounts once per Home load and must keep reusing that same list, not trigger a second AB session).

Add a new `ActualBudgetClient` method `async def get_fire_status(self) -> dict` that fetches accounts fresh (own `download_budget()` + `get_accounts()`, same pattern as `get_goals()` right above it) and returns `_calc_fire(accounts)`.

### 2. `backend/api/home.py` — use the shared helpers instead of local copies

Delete the local `FIRE_TARGET`/`MONTHLY_CONTRIBUTION`/`ANNUAL_RETURN`/`FIRE_YEAR`/`FIRE_EXCLUDE`/`_fire_portfolio`/`_calc_fire` definitions. Import `_calc_fire` from `backend.core.actual_client.client` instead and call it exactly as before (`_calc_fire(accounts)`, still reusing the accounts list already fetched in `get_home_data()` — no behavior change here, purely a move).

### 3. `backend/tools/finance/actual_budget.py` — new `get_fire_chart()`

Add a function following the same structure as `get_goals_chart()` (line ~490): call `client.get_fire_status()`, build a single-item `progress_list` chart JSON:
- `label`: something like `"FIRE Progress"`
- `value`: portfolio value (`fire_portfolio`)
- `target`: `fire_target`
- `percentage`: `fire_pct`
- `extra`: a string combining the projected year/on-track status and monthly contribution, e.g. `"On track for {FIRE_YEAR} · €{monthly_contribution}/month"` or `"Behind pace for {FIRE_YEAR} · €{monthly_contribution}/month"` depending on `on_track`
- `title` of the overall chart JSON: `"FIRE Progress"`

### 4. `backend/tools/registry.py` — register the new tool

Add `finance__get_fire_chart` to the tool schema list, same shape as `finance__get_goals_chart`'s entry (no parameters). Description should mention FIRE, financial independence, retirement, and crossover point so the LLM's own tool-selection has a fighting chance even before the system-prompt bullet below is read — e.g. "Show FIRE (Financial Independence, Retire Early) progress: current portfolio, target, percentage complete, and projected year to reach it. Call when the user asks about FIRE progress, retirement projections, financial independence, or the crossover point."

Add the dispatch case (`if name == "finance__get_fire_chart":`) next to the `finance__get_goals_chart` one, calling the new `get_fire_chart()`.

### 5. `backend/api/chat.py` — wire the new tool into chat

- Add `"finance__get_fire_chart"` to `_PROPOSAL_TOOLS` (~line 158), next to `finance__get_goals_chart` — this is a chart/report tool, must short-circuit to a card exactly like the others, not loop back for text synthesis.
- Add an explicit bullet + example to `_build_system_prompt()`'s `## Finance tools` section, in the same style as the other bullets: "When the user asks about FIRE progress, financial independence, retirement timeline, or crossover point — call finance__get_fire_chart immediately." with an example like `"cum stau cu FIRE-ul?" → finance__get_fire_chart()`.

## Critical Rules

- **Reuse `_calc_fire`/`_fire_portfolio`, don't reimplement.** This is exactly the "second occurrence" case `docs/architecture.md` rule 20 describes — extract now, not later. (source: architecture.md#20, `CLAUDE.md` "Duplication & dead-code prevention")
- Every new write/report tool must be added to `_PROPOSAL_TOOLS` in `backend/api/chat.py` or the card never renders in the frontend. (source: `CLAUDE.md` known gotchas)
- New chart/report tools need an explicit system-prompt bullet + example — a tool with no bullet gets silently skipped by the LLM in favor of a hallucinated answer, confirmed root cause of #160 (fixed in a separate prompt, same lesson applies here pre-emptively). (source: this session's #160 investigation)
- `get_home_data()` must keep making exactly one `download_budget()` call per Home load — do not change `home.py`'s FIRE calculation to trigger a second AB session. (source: `backend/core/actual_client/client.py` `get_home_data()` docstring: "Fetch all Home screen data in a single AB session")

## Gotchas

1. `_calc_fire()`'s accounts parameter expects real account objects with `.off_budget`, `.name`, `.balance`, `.balance_prev_month_end` attributes (a `SimpleNamespace` in `home.py`'s case, real `actualpy` account objects in a fresh `get_accounts()` call) — both work today because `_fire_portfolio` only uses `getattr()`, keep it that way, don't add type-specific logic.
2. `progress_list` chart items expect `percentage` as a 0-100 number (already what `_calc_fire` returns as `fire_pct`), not a 0-1 fraction.

## Do NOT touch

- `FireWidget` (`frontend/src/components/FireWidget.tsx`) or the `/api/home` endpoint's behavior — the Home screen widget must keep showing exactly the same numbers as before, unchanged.
- `Chart.tsx` / the generic chart rendering system — `progress_list` already renders correctly, no frontend changes needed for this task.

## Done when

- Asking "cum stau cu FIRE-ul?" or "how's my FIRE progress?" in chat renders a progress card with the same portfolio/target/percentage numbers as the Home screen's FIRE widget.
- `backend/api/home.py` no longer defines its own FIRE constants/functions — it imports and calls the shared ones from `client.py`.
- Home screen FIRE widget still shows identical numbers after the refactor (no regression).
