# frontend-shared

Source of truth for code shared by the standalone frontends in this monorepo
(`majordom-financiar/frontend`, `tools/vehicle-manager/frontend`, `tools/investment-manager/frontend`):

| Source (`src/`) | Generated into | Apps |
|---|---|---|
| `tokens.css` — the whole visual system (colors, themes, per-app accents, fonts, radii) | `src/styles/tokens.css` | all three |
| `BrandMark.tsx` — the logo | `src/components/BrandMark.tsx` | all three |
| (the logo's path) | `public/favicon.svg`, `public/icon-*.png` | all three |
| `formatCurrency.ts`, `formatDate.ts` | `src/lib/` | Finance, Transport |

Each app keeps its copy at the path it already imports from, but the copy is **generated** — never
edit it by hand. Edit `src/`, run `python3 scripts/sync_shared_frontend.py` from the repo root, and
commit the source together with the regenerated copies. The pre-commit hook
(`scripts/check_shared_frontend_sync.py`) fails the commit if a text copy has drifted. PNG icons
need `rsvg-convert` and are not checked (binary).

The copies are committed like any other source file, so Docker build contexts need no changes.

**Changing the logo:** replace `BRAND_MARK_PATH` in `BrandMark.tsx` (a path in a 100×100 box) and
run the sync — rail, login, favicon and PWA icons all follow.

**Changing an app's accent:** each app sets `data-accent` on `<html>` in its `index.html`
(Finance `sage`, Transport `amber`, Invest `olive`); the values live in `tokens.css`.
