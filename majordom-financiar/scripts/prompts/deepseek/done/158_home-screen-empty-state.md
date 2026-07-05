# Task: Home screen empty-state for brand-new installs

## Context

Issue #158, raised during #154's cold-test of the README install flow. On a fresh install with no accounts/transactions yet, the Home screen (`frontend/src/pages/Home.tsx`) shows a grid of zeroed-out widgets (€0 cashflow, 0% FIRE) with no guidance on what to do first. The chat screen (`frontend/src/pages/Chat.tsx`, lines ~616-628) already has good first-run guidance content ("Photograph a gas station receipt...", "Upload a CSV export from your bank...") — this task is specifically about the Home screen's first-run state, not the chat content, which stays as-is.

## Goal

On a brand-new install (no accounts created yet), Home shows a single clear "get started" card instead of the metrics row, goals section, and budget dashboard (which would otherwise just show zeros/nothing). The card points the user to Chat, where the existing guidance already tells them what to try.

## Relevant files

| File | What it contains |
|------|-----------------|
| `backend/api/home.py` | `GET /api/home` handler (line 62-85) — currently pops `accounts` out of `get_home_data()`'s response and never returns it (line 76), so the frontend has no way to know the account count today |
| `frontend/src/pages/Home.tsx` | The Home screen component — metrics row (line ~186-199), goals section (~201-211), budget dashboard (~213-222) all need to be conditionally hidden; new empty-state card goes in their place |

## Changes required

### 1. `backend/api/home.py`

The `/home` handler already has `accounts_raw` (line 76, popped from `get_home_data()`'s result) before converting it to `SimpleNamespace` objects for the FIRE calculation. Add `"account_count": len(accounts_raw)` to the returned dict (line 82-85) — do not re-add the full `accounts` list itself, just the count. This is the only backend change needed.

### 2. `frontend/src/pages/Home.tsx`

- Read `account_count` off `homeData` (same pattern as the existing `budgetStatus`/`stats`/`goals`/`fireData` destructuring around line 29-32).
- When `homeData` has loaded and `account_count === 0`, render a single empty-state card in place of the metrics row + goals section + budget dashboard (i.e. wrap those three existing sections in a conditional, and render the new card in the `else` branch). Keep the header, notification banner, and "Needs resolving" sections exactly as they are — those are still relevant even before any accounts exist.
- Empty-state card content: a short headline (e.g. "Let's get started") and 3 short lines describing what the user can do — import a CSV, photograph a receipt, or just ask a question — each as a `→` bullet, matching the visual style already used for the equivalent bullets in `Chat.tsx` (lines ~616, 627, 628: `<li className="flex gap-2"><span className="text-accent">→</span> ...`). Below the bullets, one button/CTA that calls `navigate('/chat')`.
- Style the card container the same way other Home cards are styled: `bg-surface border border-border rounded-2xl` (see `MetricCard`, line ~343, or `GoalCard`, line ~256, for the exact existing class conventions), placed inside a `<section className="px-5 ...">` wrapper like the other sections.
- Exact copy is not strictly scoped — keep it short, friendly, and consistent with the app's existing tone (see the Chat.tsx welcome content referenced above for tone).

## Critical Rules

- No specific architecture.md/decisions.md rules apply beyond general frontend conventions already in the file (Tailwind classes, `useQuery` pattern) — this is a self-contained, additive frontend change plus one backend field.

## Gotchas

1. `homeData` can be `undefined` during initial load (see the `?.` optional chaining used throughout Home.tsx for `budgetStatus`, `stats`, etc.) — don't render the empty-state card (or the normal sections) until `homeData` has actually loaded; only branch on `account_count === 0` once `homeData` is defined, otherwise you'll flash the empty-state card for one render on every load, including for users who do have accounts.
2. Don't invent a mechanism to auto-open the CSV file picker or camera from the Home screen — that would require new cross-page plumbing between `Home.tsx` and `Chat.tsx`'s existing `csvInputRef`/photo capture inputs that doesn't exist today and is out of scope. The button should simply `navigate('/chat')`; Chat.tsx's own existing welcome content already covers what to do next once there.

## Do NOT touch

- `frontend/src/pages/Chat.tsx` — its existing welcome/guidance content stays unchanged, this task only adds a pointer to it from Home.
- `BudgetDashboard`, `FireWidget`, `GoalCard` components — unchanged, just conditionally not rendered when there are zero accounts.

## Done when

- On an account with `account_count === 0`, Home shows the new get-started card instead of metrics/goals/budget sections.
- On an existing account with accounts already set up, Home renders exactly as it does today (no visual regression).
- Tapping the card's CTA navigates to `/chat`.
