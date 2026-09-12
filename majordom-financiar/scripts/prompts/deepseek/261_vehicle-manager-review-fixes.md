# Task: Fix issues found in the vehicle-manager standalone-app review (#261)

## Context

`tools/vehicle-manager/` is a standalone FastAPI + SQLite service with its own React frontend
at `tools/vehicle-manager/frontend/` (branded "Majordom Transport" in the UI), built end to end
in a prior session — see `tools/vehicle-manager/docs/standalone-app-plan.md` for the full build
record (5 phases) and `tools/standalone-app-playbook.md` for the reusable process/conventions
used to build it. It runs via `docker compose --profile vehicle-manager up -d` from
`majordom-financiar/` (services: `vehicle-manager` on internal port 8010, `vehicle-manager-web`
on host port 3010). It is a completely separate app from `majordom-financiar/frontend/` — do not
confuse the two, though one bug below (#265) exists in a file duplicated into both.

This task fixes concrete issues found during a live browser review of the built app. Each item
below is independent — fix them one at a time, don't let one block the others.

## Goal

Two confirmed issues (their own GitHub issues have full detail — read them before starting):

1. **[#265](https://github.com/Dorusto/life-os/issues/265)** — `Chart.tsx`'s line-chart Y-axis
   min/max labels round to `"0"` for any chart whose values are all under 1 (e.g. a cost-per-km
   chart with a €0.10–€0.27 range), even though the chart's own header text shows the correct
   precision right above it.
2. **[#266](https://github.com/Dorusto/life-os/issues/266)** — no logout button anywhere in
   `tools/vehicle-manager/frontend/`'s UI once logged in.

## Relevant files

| File | What it contains |
|------|-------------------|
| `tools/vehicle-manager/frontend/src/components/Chart.tsx` | The copy that needs fixing for #265 — line-chart rendering, axis-label formatting |
| `majordom-financiar/frontend/src/components/Chart.tsx` | The **original**, independent copy with the identical bug — fix this one too, or explicitly confirm with the user before skipping it (it's a different app, may be intentionally out of scope for this task) |
| `tools/vehicle-manager/frontend/src/lib/formatCurrency.ts` | `formatNumber(value, decimals: 0\|1\|2 = 0)` — the function whose default-0-decimals call site is the bug |
| `tools/vehicle-manager/frontend/src/lib/auth.ts` | Already exports `clearAuth()` — the primitive #266's fix needs, just not called from any page yet |
| `tools/vehicle-manager/frontend/src/pages/VehicleList.tsx` | Has the existing "Import" link pattern — the logout action can follow the same placement convention (top-right of the page header) |
| `tools/vehicle-manager/frontend/src/App.tsx` | Routing — `clearAuth()` + `navigate('/login')` is the same pattern `auth.ts`'s `authFetch` already uses on an unauthorized response |

## Changes required

### 1. `Chart.tsx` (#265) — both copies, see note above
Find the line-chart's axis-edge label rendering (search for two `formatNumber(seriesMax)` /
`formatNumber(seriesMin)` calls near each other, close to where the header text a few lines
above them calls `formatNumber(seriesMin, 2)` / `formatNumber(seriesMax, 2)`). Pass the same
decimals value to the axis-edge calls that the header already computes/uses, so the two never
show inconsistent precision. Don't hardcode `2` blindly — check what the header's own logic does
(it may already pick a decimals count based on magnitude) and reuse that, not a fresh guess.

### 2. Logout (#266)
Add a small, always-reachable logout control (exact placement/styling is your call — the
existing "Import" link in `VehicleList.tsx`'s header is a reasonable visual reference for a
small text-link-style action, but a dedicated icon button is also fine) that calls `clearAuth()`
then navigates to `/login`. It should be reachable from every authenticated page, not just one —
check whether there's a shared layout/header component it belongs in, or whether it needs adding
per-page.

## Critical Rules

- This monorepo has a pre-commit private-data scanner (`scripts/check-private-data.sh`, repo
  root) that blocks commits containing certain patterns. One already-known false-positive class:
  two adjacent Tailwind utility classes with a 2-letter prefix and a 2-3 digit value (e.g. a
  padding pair) can coincidentally match a license-plate-shaped regex. If a commit gets blocked
  and the flagged text is clearly not real private data, do NOT edit the scanner script — convert
  one of the flagged values to Tailwind's arbitrary-value bracket syntax instead (same visual
  result, breaks the false-positive match), or ask before doing anything else.
- Both `Chart.tsx` files currently have **identical content** (one was copied verbatim from the
  other) but are two separate files, not shared via import — a fix to one does not apply to the
  other automatically.
- Don't touch anything in `tools/vehicle-manager/app/` (the Python backend) — both issues are
  frontend-only.

## Gotchas

- `formatNumber`'s signature is `formatNumber(value: number, decimals: 0 | 1 | 2 = 0): string` in
  `frontend/src/lib/formatCurrency.ts` (present, identically, in both apps) — the type only
  allows 0, 1, or 2 decimals, not an arbitrary count.
- The app has no test suite — verify by actually running it (`docker compose build
  vehicle-manager-web && docker compose --profile vehicle-manager up -d vehicle-manager-web`,
  then check `http://localhost:3010` in a browser, or via `curl` through the same host/port if a
  browser isn't available in your environment) rather than assuming a code read is enough.

## Do NOT touch

- `tools/vehicle-manager/app/` (Python backend) — not part of either fix.
- Anything in `majordom-financiar/frontend/` beyond the one `Chart.tsx` file for #265 (and only
  if you decide to fix that copy too, per the note above).

## Done when

- #265: a chart with all-sub-1 values shows its real min/max on the axis edges, matching the
  header text's precision — verified live against a real chart with such values (vehicle-manager
  has real fixture data with a cost-per-km chart in the 0.10-0.27 range already, vehicle id 4
  "Duster" via `GET /vehicles/4/cost-per-km-chart` once authenticated).
- #266: logging in, then using the logout control, returns to `/login`, and `localStorage` no
  longer has the auth token afterward (check via browser devtools or a quick page-context script).

## Circuit breaker

If either fix reveals something this spec didn't anticipate (e.g. the axis-label bug turns out to
be structural rather than a missing-argument fix, or there's no sensible single place to put a
logout control without a larger layout change) — stop and describe the situation rather than
picking an undocumented design call yourself.

---

## If this implementation attempt fails or gets abandoned partway

Everything about this app's current state is committed to `main` and documented — nothing here
depends on any other in-progress conversation or session. To resume from scratch with a fresh
tool/session:
- `tools/vehicle-manager/docs/standalone-app-plan.md` — what was built, phase by phase, and why.
- `tools/standalone-app-playbook.md` — the reusable process/conventions (delegation discipline,
  the `/api/` Nginx prefix requirement, auth shape, etc.) extracted from building this app, meant
  for reuse on the next one (the investment-tracking app, #262) too.
- GitHub issues [#261](https://github.com/Dorusto/life-os/issues/261) (parent/tracking),
  [#264](https://github.com/Dorusto/life-os/issues/264) (dead backend routes, separate/lower
  priority than the two above), [#265](https://github.com/Dorusto/life-os/issues/265),
  [#266](https://github.com/Dorusto/life-os/issues/266).
- `majordom-financiar/docs/sessions/2026-W37.md` (search "vehicle-manager") for the full narrative
  of what was tried, what broke, and how it was fixed along the way.
