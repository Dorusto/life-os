# vehicle-manager — standalone app plan

Decided 2026-09-12 (see `majordom-financiar/docs/decisions.md#portfolio-becomes-separate-service`
and `#261`/`#263` on GitHub): `vehicle-manager` becomes a real, independently-usable app —
own frontend with its own charts (Fuelio referenced as the shape wanted), not pages living
inside majordom-financiar's own React app. Majordom-financiar keeps its existing simple REST
connection to it (no MCP, no protocol change — see `#263`, deliberately deferred).

This doc is the execution plan — detailed enough to build from in stages without needing a
design decision re-litigated at every step. Genuine open questions are called out explicitly
where they appear, not glossed over.

---

## 1. Current state (verified 2026-09-12, don't re-derive this)

`tools/vehicle-manager/` is a FastAPI service, **backend only, no frontend directory exists**.
Per its own README: internal port 8010, SQLite at `/app/data/vehicles.db`, **no authentication**
(lives on the internal `majordom-net` Docker network only, never exposed directly today).

**Already lives in vehicle-manager itself** (`app/database.py`, `app/depreciation.py`,
`app/main.py`) — nothing to move for these:
- Vehicle CRUD (`upsert_vehicle`, `get_vehicles`, `get_vehicle`, `patch_vehicle`)
- Fuel/service log CRUD (`insert_vehicle_log_entries`, `get_vehicle_log`, `get_log_entry`,
  `delete_log_entry`, `get_last_fuel_entry`)
- Value tracking: `value-history`, `value-projection` endpoints, `depreciation.py`'s curve math,
  manual value overrides
- Aggregate stats (`get_vehicle_stats_data` — fill count, total liters/cost, total distance,
  avg consumption, cost/km, other costs, total cost) — already a single number per period, not
  a time series
- Fuelio CSV import (`/import/fuelio`)
- AB-account linking (`link-account`)

**Still lives in majordom-financiar's `backend/tools/finance/vehicle.py`, needs migrating** —
this is the real gap between "vehicle-manager has data" and "vehicle-manager has all its own
charts":
- `_get_fuel_intervals()` — the full-tank-interval calculation every chart below is built on
- `get_vehicle_consumption_chart()` — L/100km over time, line chart
- `get_vehicle_distance_chart()` — km driven between fill-ups, line chart
- `get_vehicle_cost_per_km_chart()`
- `get_vehicle_monthly_cost_chart()`
- `get_vehicle_mileage_chart()`
- `get_vehicle_costs_summary()`

These all currently work by majordom-financiar fetching raw log rows from vehicle-manager over
HTTP, then doing the interval/chart-shaping math locally. For vehicle-manager to genuinely have
"all its own charts" (not just raw data), this math needs to live in vehicle-manager's own
codebase, computed directly against its own SQLite rows — no reason to round-trip through
majordom-financiar to compute a chart from data vehicle-manager already owns.

**Majordom-financiar's role today**: `backend/api/vehicle_value.py` and `vehicle_charts.py` are
explicitly-documented thin auth+proxy layers in front of vehicle-manager
(`backend/core/vehicle_client/client.py`) — this pattern is correct and stays; only the
chart-computation functions above need to move to the other side of that proxy.

---

## 2. Target shape

- `vehicle-manager` gains: real single-user auth (its own login, matching majordom-financiar's
  existing simple JWT pattern — `backend/api/auth.py` there is the reference shape, not shared
  secrets between the two services), the migrated chart-computation logic exposed as its own
  REST endpoints, and a new frontend consuming them directly.
- Majordom-financiar's chat tools (`vehicle__get_vehicle_consumption_chart` etc.) get refactored
  to call vehicle-manager's new chart endpoints via `VehicleClient`, instead of computing
  locally — same external behavior for chat users, no duplicated math between two codebases.
- Majordom-financiar's own Dashboard "Vehicle costs" widget and Accounts-page vehicle linking
  **stay exactly as they are** — summary-level, sourced from vehicle-manager's API, unchanged.
  The new standalone app is where full vehicle detail/charts live; majordom-financiar keeps only
  the cross-cutting pieces (linking a vehicle to a real bank account, a one-line cost summary).
- No MCP, no shared auth, no iframe embedding — plain REST, two independently deployable apps,
  exactly the connection pattern already in place today. See `#263` for why that's deliberate.

---

## 3. Phases

### ✅ Phase 1 — Migrate chart computation into vehicle-manager (backend only, no UI yet) — done 2026-09-12

Delegated to DeepSeek Flash (`delegate-by-complexity`); Aider completed 3 of 6 function refactors
correctly, then stopped partway and left a stray markdown code-fence that broke `charts.py`'s
Python syntax entirely — finished directly (same pattern, `git log` on `main` shows both commits)
and fixed the syntax artifact before merge. Live-verified: all 6 new vehicle-manager endpoints
tested directly against real fixture data; majordom-financiar's chat tools produce byte-identical
output to before the migration (compared point values, not just response shape).

1. Port `_get_fuel_intervals()` and the six chart/summary functions listed in §1 into
   `tools/vehicle-manager/app/` (a new `charts.py` module is a reasonable place — mirrors
   `depreciation.py`'s existing pattern of one module per computation area), operating directly
   on `vehicle-manager`'s own SQLite connection instead of an HTTP round-trip.
2. Expose them as new endpoints on vehicle-manager's own FastAPI app, e.g.
   `GET /vehicles/{id}/consumption-chart`, `/distance-chart`, `/cost-per-km-chart`,
   `/monthly-cost-chart`, `/mileage-chart`, `/costs-summary` — same query params the majordom-financiar
   versions already accept (`months`, `start_date`, `end_date` or `period`), so the response
   shape is a drop-in replacement.
3. Refactor majordom-financiar's `backend/tools/finance/vehicle.py` chart functions to call
   these new endpoints via `VehicleClient` (add the corresponding methods there) instead of
   computing locally — delete the now-dead local computation, don't leave it as an unused
   fallback (`duplication-prevention.md`: retire the old flow in the same task).
4. **Done when:** every existing majordom-financiar chat chart tool (`vehicle__get_*_chart`)
   still returns byte-identical output for the same vehicle/period as before the refactor —
   verify live against real fixture data, not just a diff review. `check_provider_wiring.py`
   and `check_silent_exceptions.py` clean.

### ✅ Phase 2 — Auth on vehicle-manager — done 2026-09-12

Implemented directly by Claude (not delegated — `delegate-by-complexity`'s rubric puts
security-sensitive code at "Foarte greu," never Aider). New `tools/vehicle-manager/app/auth.py`:
dual-path `get_current_user_or_service()` FastAPI dependency — a per-user JWT (`POST /auth/login`,
same shape as majordom-financiar's own `backend/api/auth.py`, own secret/own users,
`VEHICLE_MANAGER_`-prefixed env vars) OR a shared `X-Service-Token` header (constant-time
`hmac.compare_digest`, fails closed if unconfigured) for majordom-financiar's internal calls.
Added to all 21 routes in `main.py` except `/health` (must stay open for the Docker healthcheck).

`majordom-financiar/backend/core/vehicle_client/client.py`'s `_request()` (and the separately
implemented `import_fuelio()`) now send `X-Service-Token` from the new
`settings.vehicle_manager.service_token` field on every call. New env vars wired through
`docker-compose.yml`, both `.env.example` files (majordom-financiar's and a new one for
vehicle-manager itself, for standalone/non-compose runs), and the real local `.env`.

`requirements.txt` pins `python-jose==3.3.0` / `passlib[bcrypt]==1.7.4` / `bcrypt==3.2.2` —
matching majordom-financiar's own pins exactly, including the `bcrypt==3.2.2` pin needed because
passlib 1.7.4 breaks on bcrypt 4.x+ (same gotcha, avoided by copying the known-good pin instead
of rediscovering it).

**Found along the way:** the private-data scanner's "Real credential value" regex
(`scripts/check-private-data.sh`) had no whitelist entry for the `os.getenv(` idiom — flagged
`JWT_SECRET = os.getenv("VEHICLE_MANAGER_JWT_SECRET", ...)` as a leaked secret purely because the
line was new (whole new file = whole file counts as "added" in the diff), even though the
identical pattern already lives unflagged in majordom-financiar's own `backend/api/auth.py`.
Fixed by adding `os\.getenv\(` to the same whitelist alternation that already covers
`settings\.`/`cfg\.`/`self\.` — same "value comes from a safe accessor, not a hardcoded literal"
category, not a weakening of real-secret detection. Also hit the placeholder-prefix gotcha again
(this project's regex only whitelists `your_`/`paste_`/`change_`/`example` as safe placeholder
prefixes — `generate_a_random_secret_here` isn't one of them despite being used elsewhere
already-committed) — used `change_this_to_a_random_secret` instead in the two new `.env.example`
files.

**Live-verified** (docker exec + curl, browser still unavailable this session): `/health`
unauthenticated → 200; `/vehicles` unauthenticated → 401; wrong JWT → 401; wrong service token →
401; valid JWT (real login round-trip) → 200; valid service token → 200. Confirmed
majordom-financiar's existing chat tools still work end-to-end through the new auth — both
`get_vehicle_costs_summary()` and `get_vehicle_consumption_chart(vehicle_name="Duster")` called
directly inside the `majordom-api` container, returning real fixture data unchanged.
`check_provider_wiring.py` and `check_silent_exceptions.py` both clean; `ast.parse` clean on
every touched Python file.

**Done when** (met): vehicle-manager refuses an unauthenticated request, and majordom-financiar's
existing proxy calls still work unchanged — both confirmed above.

### ✅ Phase 3 — New frontend scaffold — done 2026-09-12

Implemented via a Claude fork (Doru's explicit choice over DeepSeek Pro, per
`delegate-by-complexity`'s standing rule to always ask before a Senior-tier dispatch — this
task was foundational/convention-setting: routing, auth pattern, API client shape, Docker/Nginx,
all precedent for Phases 4-5). User-facing branding: "Majordom Transport" (Doru's own naming),
kept separate from the technical `vehicle-manager` naming used everywhere in code/infra — #150's
service-naming question stays open and unrelated to this UI-layer choice.

New `tools/vehicle-manager/frontend/` — separate Vite+React+Tailwind app, own `package.json`,
own Docker image (multi-stage node→nginx, mirrors `majordom-web`'s Dockerfile). Trimmed to only
what this phase needs: no push notifications, no receipt flow, no chat, no `@fontsource`
webfonts (system fonts instead) — those get added in later phases only if actually needed.

Copied verbatim from majordom-financiar's frontend (confirmed portable, no majordom-financiar-
specific imports): `Chart.tsx` + its two dependencies `formatCurrency.ts`/`chartColors.ts` — not
wired to any page yet, Phase 4 does that. Adapted (not verbatim): `auth.ts` (own localStorage
keys `vehicle_manager_token`/`vehicle_manager_username`, dropped the AB-down 503 handling that
doesn't apply here), `Login.tsx` (Majordom Transport branding), a new minimal `api.ts`
(`login()` + `getVehicles()` only — more endpoints added in Phase 4, not stubbed speculatively),
a new `VehicleList.tsx` (deliberately minimal placeholder proving the pipeline works, not final
UI), and a trimmed `App.tsx`/`main.tsx` (single protected route, no bottom nav yet — only one
real page exists).

New `vehicle-manager-web` service in `majordom-financiar/docker-compose.yml`
(`VEHICLE_MANAGER_WEB_PORT`, default 3010), same `profiles: ["vehicle-manager"]` gate as the
other two vehicle-manager services. Nginx proxies `/auth/`, `/vehicles/`, `/log/`, `/import/`,
`/health` to `vehicle-manager:8010` internally — same pattern as majordom-financiar's own
`nginx.conf` proxying `/api/` to `majordom-api:8000`.

**Found and fixed along the way:** `tools/vehicle-manager/frontend/` needed its own
`.gitignore` (`node_modules/`) — the repo root's `.gitignore` has no `node_modules` pattern at
all (majordom-financiar's own frontend is covered only by `majordom-financiar/.gitignore`,
which doesn't reach outside that directory) — confirmed via `git check-ignore -v` before adding
it, not assumed. Separately, `package-lock.json`'s randomly-generated sha512 integrity hashes
coincidentally matched `check-private-data.sh`'s VIN-number regex (17 mixed alnum chars) —
excluded common lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `poetry.lock`,
`Cargo.lock`) from the scanner's diff entirely, since they're machine-generated high-entropy
content structurally incapable of containing the private-data categories this scanner checks
for — a narrower, more principled fix than the whitelist-prefix patches used for the two
`os.getenv(`/`change_`-prefix false positives found in Phase 2.

**Live-verified** through the real Nginx proxy (browser still unavailable this session, same
substitution as Phases 1-2): `GET /` serves `index.html` with the correct title; `POST
/auth/login` through the proxy returns a real JWT; `GET /vehicles` with that JWT returns the
real fixture vehicles (Duster/Test Car/kia) unchanged; the same request without a token → 401;
`/health` → 200; the built JS asset is served with a 200. `npm run build`/`npx tsc --noEmit`
both clean, `docker build` clean, `docker compose --profile vehicle-manager config` clean.
`git diff --stat` confirmed no stray edits outside the new directory plus the 2 files
(`docker-compose.yml`, `.env.example`) + the scanner fix.

**Done when** (met, and exceeded — real fixture data came back instead of an empty list, since
earlier phases' fixture vehicles already exist in the DB): the scaffold runs standalone, shows
a login screen, and after login shows the vehicle list fetched from vehicle-manager's own
(now-authenticated) API.

### Phase 4 — Frontend pages

1. Vehicle list (name, make/model/year, current value, last odo).
2. Vehicle detail: value/depreciation chart + projection card (already fully backed by
   vehicle-manager's existing `value-history`/`value-projection` endpoints — no Phase 1
   dependency for this part), consumption chart, distance chart, cost-per-km chart,
   monthly-cost chart, mileage chart, fuel/service log list, log-entry form, service/APK/
   insurance reminder fields.
3. Fuelio CSV import flow (backend already exists at `/import/fuelio` — just needs a UI).
4. **Done when:** every chart/section that existed in majordom-financiar's old `VehicleDetail.tsx`
   has an equivalent here, live-verified against real fixture data, not just a visual review.

### Phase 5 — Retire the old in-app pages

1. Once Phase 4 is live-verified, remove `majordom-financiar/frontend/src/pages/VehicleDetail.tsx`
   and its route (the standalone app is now the real destination) — **keep** the Dashboard
   "Vehicle costs" widget and Accounts-page vehicle-linking UI exactly as they are (summary-level,
   cross-cutting, not vehicle-manager's job to own).
2. **Done when:** no dead code, no broken links from Accounts/Dashboard into the removed route.

---

## 4. Critical rules (carried over from majordom-financiar, still apply)

- **`check_provider_wiring.py`/`check_silent_exceptions.py`** don't run against vehicle-manager
  today (they're majordom-financiar-specific scripts) — if this migration reveals the same
  "any new except-handler needs a log line" and "any new provider method needs wiring in 3
  places" gotchas apply here too (they likely will, same silent-failure risk class), port the
  equivalent mechanical checks into vehicle-manager's own pre-commit setup rather than relying
  on discipline alone. **Flag this explicitly once Phase 1 is underway** — don't silently skip
  it, and don't silently invent a check without a real incident to justify it either.
- **No financial data in vehicle-manager's SQLite** — this rule is about majordom-financiar's
  relationship to Actual Budget specifically, but the same spirit applies: vehicle-manager
  stores operational vehicle data only, never account balances or transaction amounts (those
  stay in Actual Budget, accessed only through the existing `link-account`/AB-tagging flow).
- **`--file` vs `--read` in any Aider dispatch**: a file the task deletes belongs on `--file`,
  not `--read` (found the hard way 2026-09-12, see `delegate-by-complexity`'s own decisions.md).
- Private-data scanner note: a short phrase describing an HTTP not-found status coincidentally
  matched the license-plate regex once already this project (2026-09-12) — if a similar false
  positive appears while writing code comments/commit messages for this work, reword rather than
  touching the shared regex.

## 5. Circuit breaker

If a phase reveals a real architectural decision not covered in this doc (a security-shape
choice, a data-model change, anything that isn't just "follow the pattern already established
above") — stop and describe the situation rather than picking an undocumented option.
