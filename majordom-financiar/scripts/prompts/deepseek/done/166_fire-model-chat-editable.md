# Task: Chat-editable FIRE model — 2-phase accumulation/decumulation, no hardcoded constants

## Context

Issue #166. `_calc_fire()` (`backend/core/actual_client/client.py`, lines 390-467) is currently a single-phase calculation with hardcoded constants (`FIRE_TARGET=190_000`, `MONTHLY_CONTRIBUTION=820`, `ANNUAL_RETURN=0.07`, `FIRE_YEAR=2035`). Doru asked (2026-07-07 session) to be able to change these assumptions from Chat, with the Home screen's "Portfolio Independence" card (`frontend/src/pages/Home.tsx`, `PortfolioIndependenceCard`) updating automatically. There is no single "set your target to €X" tool — a flat target is exactly the hardcoded-guess problem this removes. Instead, **target becomes a derived output**: the principal needed today to fund the user's real retirement plan (horizon, desired monthly spend, return assumptions), not a number the user sets directly. See `docs/decisions.md#coach-not-consultant--principle-for-the-intelligence-module` and `docs/decisions.md#fire--portfolio-independence--yield-source` for the guiding principles — every assumption stays a visible, user-editable input, never a silent default presented as fact.

## Goal

The user can say things like "set my retirement return to 6%" or "I want to retire in 8 years and spend €2500/month" in chat, get a confirmation card showing ALL current FIRE-model assumptions (editable, not just the ones mentioned), confirm, and see the Home screen's Portfolio Independence card recompute immediately — same mechanism already used for every other write in this app.

## Storage decision (already made, do not re-litigate)

One JSON blob under the existing generic `user_preferences` table, via `MemoryDB.get_preference("fire_model")` / `set_preference("fire_model", json.dumps(...))` (`backend/core/memory/database.py:276-293`). No new table, no migration. `MemoryDB` is instantiated fresh per call site: `MemoryDB(settings.memory.db_path)` (see `backend/tools/finance/actual_budget.py:128` for the exact pattern — `from backend.core.config import settings`).

**Default dict** (used whenever `get_preference("fire_model")` returns `None` — i.e. the user has never set anything yet):
```python
FIRE_MODEL_DEFAULTS = {
    "years_to_transition": 10.0,
    "years_in_retirement": 25.0,
    "monthly_contribution": 820.0,
    "accumulation_return": 0.08,
    "decumulation_return": 0.06,
    "desired_monthly_spend": 2000.0,
}
```
When loading, merge the stored dict over these defaults key-by-key (so adding a new key later doesn't break existing stored prefs), and track whether the stored value was `None` as `is_default_assumptions: bool` — the frontend/chat needs to know these are illustrative placeholders, not the user's real numbers, until they've set at least one.

## The math (2-phase model, replaces the single-phase constants)

Put these in `client.py`'s "Shared FIRE helpers" section (header comment at line 390-392), next to the existing `_fire_portfolio`.

**Required principal at transition** (present value of a depleting annuity — the monthly spend the user wants, paid for `years_in_retirement`, exhausting to exactly 0, at `decumulation_return`):
```
months_decum = round(years_in_retirement * 12)
r = decumulation_return / 12
required_principal = (
    desired_monthly_spend * months_decum if r == 0
    else desired_monthly_spend * (1 - (1 + r) ** -months_decum) / r
)
```

**Projected value at transition** (compound growth of current portfolio + future value of the monthly contribution series, both at `accumulation_return`, over `years_to_transition`):
```
months_acc = round(years_to_transition * 12)
if accumulation_return == 0:
    fv_at_transition = portfolio + monthly_contribution * months_acc
else:
    fv_at_transition = (
        portfolio * (1 + accumulation_return) ** years_to_transition
        + monthly_contribution * (((1 + accumulation_return / 12) ** months_acc - 1) / (accumulation_return / 12))
    )
```

**Percentage:** `fire_pct = round(fv_at_transition / required_principal * 100, 1)` if `required_principal` else `0`.

**Estimated year:** generalize the existing `_fire_months_to_target(portfolio)` (lines 409-423) into a version that takes `target` and `rate` as parameters instead of the hardcoded `FIRE_TARGET`/`ANNUAL_RETURN` module constants — same numeric loop (try `months` from 1 to 1200, return the first one where compound growth + contributions reaches `target`), so it can be reused for both the current estimate and the trend comparison below. Rename to `_fire_months_to_amount(portfolio, target, rate, monthly_contribution)`. Convert the returned months to a calendar year exactly as `_calc_fire` already does today (lines 445-448).

**Trend (1-month comparison, same limitation as today — not a true 3-6mo moving average, that still needs new persistence, out of scope):** compute `months_to_amount` for both `portfolio` and `portfolio_prev` (the existing `balance_prev_month_end`-based value), both against the *same* `required_principal`/`accumulation_return`, and diff them exactly like the existing `trend_months` logic (lines 449-453).

## `_calc_fire()` new return shape

Drop `months_remaining`, `projected_2035`, `on_track` — they were tied to the old fixed `FIRE_YEAR` concept, which no longer exists. Keep everything else, add the new fields:
```python
{
    "fire_portfolio": round(portfolio, 2),
    "fire_target": round(required_principal, 2),   # now a derived output, not a constant
    "fire_pct": ...,
    "fire_pct_prev": ...,
    "monthly_contribution": model["monthly_contribution"],   # from prefs now, not the old constant
    "estimated_year": ...,
    "trend_months": ...,
    "accumulation_return": model["accumulation_return"],
    "decumulation_return": model["decumulation_return"],
    "years_to_transition": model["years_to_transition"],
    "years_in_retirement": model["years_in_retirement"],
    "desired_monthly_spend": model["desired_monthly_spend"],
    "is_default_assumptions": is_default,
}
```
Delete the now-unused `FIRE_TARGET`, `MONTHLY_CONTRIBUTION`, `ANNUAL_RETURN`, `FIRE_YEAR` module constants (lines 394-397) — nothing should reference them anymore after this change. `FIRE_EXCLUDE` (line 398) stays, it's about which accounts count, unrelated to the model rewrite.

## New chat tool: `finance__propose_set_fire_model`

Template to copy end-to-end: `propose_set_category_budget` (`backend/tools/finance/actual_budget.py:849-908` for the propose function, `backend/tools/registry.py:382-397` for schema registration, `backend/tools/registry.py:1066-1068` for dispatch, `backend/api/chat.py:156` for the `_PROPOSAL_TOOLS` entry, `backend/api/category_actions.py:70-83` for the confirm-side branch).

**Schema params (all optional — the LLM passes only what the user actually mentioned):** `years_to_transition: float | None`, `years_in_retirement: float | None`, `monthly_contribution: float | None`, `accumulation_return: float | None`, `decumulation_return: float | None`, `desired_monthly_spend: float | None`. Tool description must make clear this is for changing FIRE/retirement planning assumptions (return rates, horizon, target retirement spend) so the LLM's tool selection can find it — mention "FIRE", "retirement", "financial independence assumptions", "Portfolio Independence".

**Propose function** (`propose_set_fire_model` in `actual_budget.py`, next to `propose_set_category_budget`): load current stored `fire_model` (merged with defaults, same loader `_calc_fire` uses — factor it into a small shared `_load_fire_model()` helper in `client.py` so both call sites stay in sync, per architecture.md rule 20). Build the "new" values by overlaying only the non-`None` arguments onto the current ones. Store the pending action via `action_store.store(action_id, {"action": "set_fire_model", "current": {...all 6 current values...}, "new": {...all 6 new values...}})`. Return `json.dumps({"type": "category_action", "action": "set_fire_model", "id": action_id, "current": {...}, "new": {...}})` — reuses the same `category_action` envelope type the frontend already dispatches on, just a new `action` value inside it (see Gotcha 1).

**Confirm-side** (`backend/api/category_actions.py`, new `elif action["action"] == "set_fire_model":` branch, same shape as the `set_budget`/`set_budget_carryover` branches): apply any `override` fields the user edited on the card (add the same 6 fields to the `GoalOverride` pydantic model at the top of the file, all optional floats), merge onto `action["new"]`, `set_preference("fire_model", json.dumps(merged))` via a fresh `MemoryDB(settings.memory.db_path)`, build a message summarizing what changed (e.g. `"FIRE assumptions updated: accumulation return 7% → 8%, horizon 10y → 8y"` — only mention fields that actually changed value, comma-separated; if nothing changed say `"No changes made."`).

## Frontend: extend `CategoryActionCard.tsx`, don't create a new component

This file already handles 6+ action types via `data.action` discriminated union and boolean flags (`isDelete`, `isSetBudget`, etc. — see lines 48-53). Add `isSetFireModel = data.action === 'set_fire_model'` the same way. Add 6 editable number inputs (years_to_transition, years_in_retirement, monthly_contribution, accumulation_return as a percentage input, decumulation_return as a percentage input, desired_monthly_spend), each pre-filled with `data.new.<field>` and falling back to `data.current.<field>`, matching the existing `useState` pre-fill pattern (e.g. line 14-16's `budgetAmount` state). Card title: `"Update FIRE assumptions?"`. On confirm, build the `overrides` object the same way the `set_budget` branch does (line 28-29), passing only the 6 FIRE fields.

Extend `CategoryActionData` (`frontend/src/lib/api.ts:749-778`): add `'set_fire_model'` to the `action` union (line 751), and add optional `current?: FireModelValues` / `new?: FireModelValues` fields, where `FireModelValues` is a new small interface with the 6 fields (all `number`). Extend `confirmCategoryAction`'s `override` param type (line 782) with the same 6 optional fields.

## Frontend: `PortfolioIndependenceCard` (`frontend/src/pages/Home.tsx`) — update for renamed/new fields

`FireData` (`frontend/src/lib/api.ts`) loses nothing it needs to keep (all current fields except `annual_return`, which is renamed) and gains `accumulation_return`, `decumulation_return`, `years_to_transition`, `years_in_retirement`, `desired_monthly_spend`, `is_default_assumptions` (all `number`, except the last which is `boolean`) — rename `annual_return` to `accumulation_return` everywhere it's used (the `InfoIcon` copy in `PortfolioIndependenceCard` currently reads `data.annual_return` — update to `data.accumulation_return`). Also update that `InfoIcon` copy to mention `decumulation_return` and `desired_monthly_spend`, and — only when `data.is_default_assumptions` is `true` — add a visible line inviting the user to set their real numbers from chat (e.g. "These are placeholder assumptions — tell Majordom your real numbers in Chat to personalize this.").

## `get_fire_chart()` (`backend/tools/finance/actual_budget.py:529-553`)

Remove the `from backend.core.actual_client.client import FIRE_YEAR` import and the `on_track`/`FIRE_YEAR`-based `extra` string (lines 531, 536-537) — both reference now-deleted concepts. Replace `extra` with something built from the new fields, e.g. `f"Est. {fire['estimated_year']} · €{fire['monthly_contribution']:.0f}/month"` if `estimated_year` is not `None`, else `f"€{fire['monthly_contribution']:.0f}/month · not reaching target within 100 years at current pace"`.

## Critical Rules

- "Coach, not consultant" (`docs/decisions.md`) — every assumption is a visible, editable input; a shown default must be flagged as a default (`is_default_assumptions`), never presented as the user's real number. (source: `docs/decisions.md#coach-not-consultant--principle-for-the-intelligence-module`)
- Every write tool needs a confirmation card with editable fields — `_PROPOSAL_TOOLS` in `backend/api/chat.py`, card fields never static text. (source: `docs/architecture.md` rule 5, `majordom-financiar/CLAUDE.md` known gotchas)
- Reuse the shared FIRE helper location in `client.py`, don't fork a second calculation path for chat vs. Home widget — both must call the same `_calc_fire()`. (source: `docs/architecture.md` rule 20)
- No financial data in SQLite — `fire_model` prefs are assumptions/preferences (no balances, no transactions), which is explicitly the allowed "user preferences" bucket, not a violation. (source: `docs/decisions.md#no-financial-data-in-sqlite`)
- `json.loads(args)` before `**args` for tool call dispatch — OpenAI format returns args as a string. (source: `majordom-financiar/CLAUDE.md`)

## Gotchas

1. The `category_action` JSON envelope type is reused for many unrelated action kinds (rename, delete, set_budget, set_fire_model, ...) — despite the name, `category_actions.py`/`CategoryActionCard.tsx` are the generic "pending confirmable action" mechanism for this whole app, not category-specific. Don't build a parallel envelope type or a new confirm endpoint.
2. `MemoryDB` has no singleton — every call site does `MemoryDB(settings.memory.db_path)` fresh. Don't try to inject/reuse one across requests.
3. `accumulation_return`/`decumulation_return` are stored and computed as fractions (`0.08`), not percentages (`8`) — only convert to `×100` at the display/input-label layer (frontend), never in stored data or backend math.
4. The numeric "months to amount" search must stay capped (1200 months / 100 years) and return `None` past that, exactly like the existing `_fire_months_to_target` — an uncapped loop with unfavorable inputs (e.g. `desired_monthly_spend` far larger than any realistic portfolio can fund) would loop effectively forever relative to request latency.

## Do NOT touch

- The Home card's structural layout (4-row `<Card accentSide="left">` structure, milestone-mark absence) — only the data flowing into it and the `InfoIcon` copy change.
- `Chart.tsx` / the generic chart system — `get_fire_chart()`'s `progress_list` shape stays the same, only its `extra` string content changes.
- Anything in `docs/decisions.md#fire--portfolio-independence--yield-source` — the Ghostfolio-seeded-default idea is a separate future step, not part of this task (no Ghostfolio integration exists yet, #4 is still blocked).

## Done when

- Saying "set my retirement return to 6%" (or similar) in chat produces a confirmation card showing all 6 current FIRE-model values, editable, with only the mentioned one pre-changed.
- Confirming updates `user_preferences.fire_model` and the Home screen's Portfolio Independence card reflects the new numbers on next load (target/percentage/estimated year all recomputed).
- A fresh install (no `fire_model` preference ever set) still renders the card correctly using the default assumptions, with `is_default_assumptions: true` surfaced somewhere the user can notice it.
- No references to `FIRE_TARGET`, `MONTHLY_CONTRIBUTION`, `ANNUAL_RETURN`, `FIRE_YEAR`, `on_track`, `projected_2035`, or `months_remaining` remain anywhere in the codebase.
- `finance__get_fire_chart` still returns a valid `progress_list` chart with no crash.
