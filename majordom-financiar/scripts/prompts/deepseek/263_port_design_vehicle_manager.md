# Task: port investment-manager's design system to vehicle-manager

## Context
`tools/investment-manager/frontend/DESIGN.md` documents a design system (tokens, typography,
components) that turned out well and is meant to be reused platform-wide (its own "Porting
checklist" section says so explicitly — read that file in full first, it's short). `tools/
vehicle-manager/frontend/` is the first port target — lower risk than majordom-financiar's own
frontend (no real financial data flows through it), a good place to prove the port works before
that separate, more carefully-reviewed pass.

## Goal
Follow `investment-manager/frontend/DESIGN.md`'s own "Porting checklist" section exactly:
1. Copy `investment-manager/frontend/src/styles/tokens.css` and the `theme.extend` block from its
   `tailwind.config.js` into `vehicle-manager/frontend/`.
2. Add the IBM Plex Sans + IBM Plex Mono font weights the checklist specifies.
3. Port the reusable component primitives (Button, Card, Form, Modal, Feedback, Pill, Delta,
   MetricTile, Segmented, chart components) from investment-manager into vehicle-manager's
   `components/`, adapted only where vehicle-manager's data shapes genuinely differ (e.g. a
   vehicle-specific chart's data prop), not restyled.
4. Re-skin every existing vehicle-manager page (Dashboard, VehicleList, VehicleDetail, Timeline,
   Stats, Reminders, Login) to use the new tokens/components instead of its current ad hoc
   Tailwind classes/dark-utilitarian styling — same content, same layout structure, same routes,
   just the new visual language.
5. vehicle-manager currently has its own `BottomNav`/`VehicleSwitcher`/`LogoutButton` — keep these
   (they're this app's own navigation shape, investment-manager uses a left-rail instead since it's
   a different app) but restyle them with the new tokens.

## Do NOT touch
`tools/investment-manager/` itself (read-only reference). Backend code (`app/*.py`), routes,
auth, any business logic. This is a frontend visual pass only.

## Done when
Every existing page renders correctly with the new design system, `npx tsc --noEmit` and
`npm run build` clean, `docker compose --profile vehicle-manager up -d --build` brings up a
healthy stack, and a hard-refresh on a non-root route (e.g. `/timeline`) still returns the SPA
shell correctly (the `/api/` prefix routing must not regress).
