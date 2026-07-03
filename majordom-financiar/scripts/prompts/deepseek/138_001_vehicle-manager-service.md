# Task: Build vehicle-manager as an independent FastAPI service

## Context
Majordom (`majordom-financiar/`) currently stores vehicle data (`vehicles`, `vehicle_log` tables)
directly in its own `memory.db` SQLite file, and business logic (Fuelio CSV import, fuel stats,
reminders) lives inline in Majordom's backend. Per issue #138 and `docs/decisions.md#vehicle-manager`,
this is being extracted into its own independent FastAPI service with its own database — the
first extraction under the `life-os/` modular monorepo target (`docs/architecture.md`, "Target
Architecture" section — `tools/vehicle-manager/`).

This task builds ONLY the new service. It does not touch anything inside `majordom-financiar/`
except adding one new block to `docker-compose.yml` (wiring, no code dependency yet). A follow-up
task will make Majordom consume this service. Verify this task by curling the new service
directly — no Majordom code needs to run.

## Goal
A standalone FastAPI service, `tools/vehicle-manager/` (sibling directory to `majordom-financiar/`
in the `life-os/` repo root), with its own SQLite database, exposing a REST API that covers
100% of what Majordom's current vehicle logic does — so the follow-up task can delete all direct
SQLite access to `vehicles`/`vehicle_log` from Majordom's codebase.

## Relevant files (read for behavior parity — do not copy wholesale, re-implement cleanly)
| File | What it contains |
|------|-------------------|
| `majordom-financiar/backend/core/memory/database.py` lines 132-176 (schema) and 594-745 (`upsert_vehicle`, `set_vehicle_type`, `insert_vehicle_log_entries`, `get_vehicles`, `get_last_odo_per_vehicle`, `get_last_fuel_entry`, `get_vehicles_with_reminders`, `update_vehicle_due_date`, `update_vehicle_service`) | Exact current schema + CRUD semantics to replicate |
| `majordom-financiar/backend/tools/finance/vehicle.py` function `get_vehicle_stats` (lines 360-517) | Fuel/cost stats calculation logic to move into the new service as a computed endpoint |
| `majordom-financiar/backend/api/fuelio_import.py` (entire file) | Fuelio CSV parser — moves here wholesale, unchanged parsing logic |
| `majordom-financiar/backend/tools/finance/vehicle.py` function `get_vehicle_log` (lines 254-314) | The JOIN query this replaces (`GET /vehicles/{id}/log`) |
| `majordom-financiar/backend/api/vehicle_log_actions.py` (entire file) | Shows what `GET /log/{id}` and `DELETE /log/{id}` must support (financial_id must be readable before delete) |
| `majordom-financiar/Dockerfile.backend` | Dockerfile pattern to mirror (slim python, PYTHONPATH, curl for healthcheck) |
| `majordom-financiar/docker-compose.yml` | Service block pattern to mirror (see `actual-budget` service: healthcheck, volumes, networks) |

## New directory structure
```
tools/vehicle-manager/
├── app/
│   ├── __init__.py
│   ├── main.py           # FastAPI app + all routes
│   ├── database.py        # SQLite schema + CRUD (mirrors MemoryDB's vehicle methods)
│   ├── models.py           # Pydantic request/response models
│   └── fuelio_parser.py   # CSV parsing, moved from fuelio_import.py
├── scripts/
│   └── migrate_from_majordom.py  # one-off data migration
├── requirements.txt
├── Dockerfile
└── README.md               # what the service is, how to run it standalone
```

## Database schema (own SQLite file, e.g. `/app/data/vehicles.db`)
Same two tables as Majordom's current `vehicles`/`vehicle_log` (see database.py lines 132-176),
copied as-is — column names and types must stay identical since the migration script copies rows
1:1. Use the same `_get_conn()` pattern as `MemoryDB` (`sqlite3.Row` row factory, WAL mode,
foreign_keys ON).

## REST API — endpoints required

No authentication — this service lives only on the internal `majordom-net` Docker network, not
exposed to the host, and Majordom (which does have auth) is its only caller. Do not add an auth
layer.

| Method & path | Behavior |
|---|---|
| `GET /health` | `{"status": "ok"}` — for docker-compose healthcheck |
| `GET /vehicles?active_only=true` | List vehicles. Each object includes ALL profile columns plus a computed `last_odo` field = `MAX(vehicle_log.odo_km)` for that vehicle (mirrors `get_last_odo_per_vehicle` + `get_vehicles_with_reminders`, merged into one shape so callers never need two calls). |
| `GET /vehicles/{id}` | Single vehicle, same shape as above. 404 if not found. |
| `POST /vehicles` | Upsert by `(name, plate)` case-insensitive match — same semantics as `upsert_vehicle()`. Returns `{"id": <int>}`. |
| `PATCH /vehicles/{id}` | Partial update — accepts any subset of: `vehicle_type`, `apk_due`, `insurance_due`, `service_interval_km`, `service_interval_months`, `last_service_km`, `last_service_date`. Only provided fields are updated. 404 if vehicle missing. |
| `GET /vehicles/{id}/log?limit=10&entry_type=fuel` | Log entries for one vehicle, ordered by `date DESC`. `entry_type` filter optional (omit = all types). Mirrors the JOIN query in `vehicle.py::get_vehicle_log`. |
| `POST /vehicles/{id}/log` | Body: list of entry dicts (same fields as `insert_vehicle_log_entries`, `vehicle_id` filled from the path, not required in body). Batch `INSERT OR IGNORE` (same UNIQUE constraint dedup behavior as today: `UNIQUE(vehicle_id, fuelio_unique_id, entry_type)`). Returns `{"inserted": n, "skipped": n}`. |
| `GET /log/{entry_id}` | Single log entry, with `vehicle_name` joined in (needed before proposing a delete — caller must see which vehicle/financial_id it belongs to). 404 if missing. |
| `DELETE /log/{entry_id}` | Deletes the entry. 404 if missing, else `{"deleted": true}`. |
| `GET /vehicles/{id}/last-fuel-entry` | Most recent full-tank, non-missed fuel entry, or `null`. Mirrors `get_last_fuel_entry()` — this MUST stay a fast, isolated call because callers read it before writing a new entry (ordering matters, see Gotchas). |
| `GET /vehicles/{id}/stats?period=` | Computed stats — move the calculation logic from `vehicle.py::get_vehicle_stats` (fuel stats, other costs, consumption, cost/km) here, but return **structured JSON**, not the pre-formatted text lines — the caller (Majordom) still owns text formatting. `period` is `"YYYY-MM"`, `"YYYY"`, or empty for all-time, same parsing as today. Response shape: `{"profile": {...all vehicle columns...}, "fill_count": int, "total_liters": float, "total_fuel_cost": float, "total_distance": float, "avg_consumption": float\|null, "cost_per_km": float\|null, "cost_count": int, "total_other_cost": float, "total_cost": float}`. 404 if vehicle not found. |
| `POST /import/fuelio` | Multipart file upload (`file`). Move the ENTIRE CSV parsing logic from `fuelio_import.py` here unchanged (section parsing, `_parse_vehicle_section`, `_parse_log_section`, `_parse_costs_section`, `COST_TYPE_MAP`, `IGNORED_SECTIONS`, the 2MB size limit, the `"## Vehicle"` file-format check). Returns the same shape as today's `FuelioImportResult`: `{"vehicle_name": str, "fuel_entries": int, "fuel_skipped": int, "cost_entries": int, "cost_skipped": int}`. |

## Migration script (`scripts/migrate_from_majordom.py`)
Standalone script, run manually once at deploy time (not part of the app startup). Takes two
CLI args: path to Majordom's `memory.db`, path to the new service's `vehicles.db`. Reads all rows
from `vehicles` and `vehicle_log` in the source, and writes them into the destination with the
same schema (call the destination's schema-init first, then bulk `INSERT OR REPLACE` preserving
original `id` values — nothing outside these two tables references these ids across a network
boundary, but preserving them avoids any renumbering surprises). Print a summary: rows copied per
table. This script is NOT called by the app — it's a manual one-time step, document how to run it
in the README.

## Critical Rules
- No financial data of any kind flows through this service — it only ever touches `vehicles`/`vehicle_log`, never Actual Budget. (source: root `CLAUDE.md` — "Do not store financial data in SQLite" is about Actual Budget being the source of truth for money; this service's data was never financial data to begin with, it's operational vehicle data, same status quo as today.)
- Extract only what's specified above — do not add a UI, multi-user auth, or any endpoint not listed. Scope is explicitly internal-only per issue #138. (source: `gh issue view 138`)
- Match `MemoryDB`'s SQLite connection pattern (`sqlite3.Row` factory, WAL mode, foreign_keys ON) — same reliability characteristics as the code being replaced. (source: `backend/core/memory/database.py` lines 38-43)
- Keep the Fuelio CSV parsing logic behaviorally IDENTICAL to `fuelio_import.py` — same column names it reads (e.g. `"Data"` not `"Date"` for the Log section — a deliberate Romanian-locale quirk, not a bug), same `COST_TYPE_MAP`, same `_parse_odo`/`_parse_cost`/`_parse_int` edge-case handling (0 and empty string both map to `None`). This is a data-format contract for real historical CSV files — any behavior drift silently corrupts imported history.

## Gotchas
1. `GET /vehicles/{id}/last-fuel-entry` and `POST /vehicles/{id}/log` will be called as two separate sequential requests by Majordom (read last odo, THEN insert) — this service doesn't need to do anything special for that (no locking needed, single user), just make sure `last-fuel-entry` reflects only entries that existed before the read, which is trivially true for two sequential HTTP calls.
2. `vehicle_type` values are `'car'`, `'motorcycle'`, `'other'` — free-text field, no enum validation needed (matches today's `set_vehicle_type` which accepts anything).
3. The `docker-compose.yml` block you add: build context is a relative path OUTSIDE the compose file's directory (compose file lives in `majordom-financiar/`, the new service in sibling `tools/vehicle-manager/`) — use `context: ../tools/vehicle-manager`. Internal port `8010`, no `ports:` mapping to the host (not exposed, only reachable via `majordom-net`). Add a new named volume `vehicle-manager-data` mounted at `/app/data`. Healthcheck: `curl -f http://localhost:8010/health`, same interval/timeout/retries pattern as the `actual-budget` service block. Do NOT add `vehicle-manager` to `majordom-api`'s `depends_on` yet — that wiring happens in the follow-up task when Majordom's code actually starts calling it.

## Do NOT touch
- Anything inside `majordom-financiar/backend/` or `majordom-financiar/frontend/` — this task only creates `tools/vehicle-manager/` and edits `majordom-financiar/docker-compose.yml`.
- Do not delete `majordom-financiar/backend/api/fuelio_import.py` or any current vehicle code yet — that happens in the follow-up task once Majordom is verified to work against the new service.

## Done when
- `docker compose up -d vehicle-manager` starts cleanly and `GET http://vehicle-manager:8010/health` (from inside another container on `majordom-net`, or via `docker compose exec` with curl) returns `{"status": "ok"}`.
- `POST /vehicles` with a test vehicle, then `GET /vehicles` shows it with `last_odo: null`.
- `POST /vehicles/{id}/log` with a fuel entry, then `GET /vehicles` shows the updated `last_odo`.
- `GET /vehicles/{id}/stats` returns correct computed numbers for that test data.
- `POST /import/fuelio` accepts a real Fuelio sync CSV (ask the user for a sample export or use a hand-built minimal one with `## Vehicle` / `## Log` / `## Costs` sections) and returns correct counts.
- Running `scripts/migrate_from_majordom.py` against a COPY of the real `data/memory.db` (never the live file) populates the new DB with matching row counts for `vehicles` and `vehicle_log`.
