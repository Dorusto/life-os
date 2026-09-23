# Vehicle-manager standalone app — manual review checklist

Written 2026-09-12 for the user's own first-pass test of the standalone app (Phases 1-5, see
`standalone-app-plan.md`), before deciding what goes into the next implementation round. Two
issues already confirmed via an earlier automated pass are tracked separately —
[#265](https://github.com/Dorusto/life-os/issues/265) (chart Y-axis rounds to 0 under 1) and
[#266](https://github.com/Dorusto/life-os/issues/266) (no logout button) — no need to re-find
those, just note anything else.

Whatever you find, report it back (even small "I don't like how X looks") — it gets folded into
`majordom-financiar/scripts/prompts/deepseek/261_vehicle-manager-review-fixes.md` before the next
implementation round.

## Login / session

- [ ] Login with your `VEHICLE_MANAGER_USER1_USERNAME`/`VEHICLE_MANAGER_USER1_PASSWORD` (see `.env`) at `http://localhost:3010`
- [ ] Refresh on a vehicle detail page — should stay logged in, not error

## Vehicle list

- [ ] All 3 vehicles show with value + odometer
- [ ] Tapping each goes to the right detail page

## Vehicle detail

Do this for Duster, then at least once for "Test Car" (no purchase price set — the edge case
where value/projection should show the "no purchase price" message instead of crashing):

- [ ] Current-value card + projection
- [ ] Value-over-time chart
- [ ] Reminders (APK/insurance/service) — check what Test Car shows with missing data
- [ ] All 5 charts (consumption, distance, cost/km, monthly cost, mileage)
- [ ] Log — add a real entry (or a test one you delete afterward), confirm delete works

## Import

- [ ] Import page opens; if you have a real Fuelio CSV export, try a real import

## On your actual phone (not just a resized browser window)

- [ ] Everything visible, no horizontal scroll, buttons big enough to tap comfortably

## Integration with majordom-financiar

- [ ] Chat still answers vehicle questions correctly (charts/costs)
- [ ] Dashboard's "Vehicle costs" widget shows correct numbers
