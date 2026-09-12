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

### Phase 1 — Migrate chart computation into vehicle-manager (backend only, no UI yet)

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

### Phase 2 — Auth on vehicle-manager

1. Add a login endpoint + JWT issuance to vehicle-manager, mirroring majordom-financiar's own
   `backend/api/auth.py` shape (single user, password from env/config, never hardcoded).
2. Protect **every** vehicle-manager endpoint, with no exemption for majordom-financiar's own
   server-to-server calls. **Decided 2026-09-12:** the internal Docker network is a real boundary
   today but not one worth designing the auth model around — "standalone app" likely means
   direct phone/Tailscale access to vehicle-manager eventually, at which point "it's only
   reachable internally" stops being true. Cheaper to build this correctly now than retrofit
   later. Mechanism: a service-level API key (distinct from the per-user JWT the new frontend's
   login issues) that majordom-financiar's `VehicleClient` sends on every request, stored as a
   config secret in both services' settings — same pattern already used for other secrets in
   this codebase (never hardcoded, read from env/settings).
3. **Done when:** vehicle-manager refuses an unauthenticated request from outside the Docker
   network, and majordom-financiar's existing proxy calls still work unchanged.

### Phase 3 — New frontend scaffold

1. New React + Vite + Tailwind app (same stack as majordom-financiar's `frontend/`, for
   consistency and so `Chart.tsx`'s existing `{chart_type, title, data, refetch}` contract can
   be reused directly — copy that component over, it's generic and already fits this data
   shape exactly).
2. Own login page, own `authFetch`-equivalent, own routing shell (bottom nav or similar —
   Fuelio's own navigation is the reference to look at for shape, not majordom-financiar's
   5-tab bar, since this is a different app with different sections).
3. New docker-compose service (own container, own port, own Nginx static-file serving —
   `majordom-web`'s existing Dockerfile is the structural reference).
4. **Done when:** the scaffold runs standalone, shows a login screen, and after login shows an
   empty vehicle list fetched from vehicle-manager's own (now-authenticated) API.

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
