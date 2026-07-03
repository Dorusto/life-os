# Task: Make Majordom consume vehicle-manager via HTTP, delete direct SQLite access

## Context
`tools/vehicle-manager/` (built in the previous task, `138_001_vehicle-manager-service.md`) is now
a running FastAPI service on `majordom-net`, port 8010, with its own SQLite database. It exposes
the full REST API listed below and its OpenAPI docs are available at
`http://vehicle-manager:8010/docs` from inside the Docker network — read them to confirm exact
request/response shapes before writing the client.

This task removes Majordom's direct SQLite access to `vehicles`/`vehicle_log` entirely and
replaces it with HTTP calls to vehicle-manager, mirroring how `backend/core/actual_client/`
already lets Majordom call Actual Budget as an external service. Per `CLAUDE.md`'s
"Duplication & dead-code prevention" rule, the OLD code must be deleted in this same task, not
left "just in case."

## Goal
The user-facing chat tools (`vehicle__get_vehicle_stats`, `vehicle__log_refuel`, etc.) behave
IDENTICALLY to today — same text output, same JSON card shapes sent to the frontend. Only the
data layer underneath changes. The Fuelio CSV import flow in the UI also behaves identically
(same `/api/import/fuelio` endpoint, same response shape) but now proxies to vehicle-manager
instead of parsing locally.

## Relevant files
| File | What changes |
|------|----------------|
| `backend/core/config/settings.py` | Add a `VehicleManagerConfig` dataclass + field on `Settings`, same pattern as `ActualBudgetConfig` (lines 33-42) |
| `backend/core/vehicle_client/client.py` (NEW) | httpx-based async client, mirrors the structure of `backend/core/actual_client/` at the package level (own `__init__.py` exporting the client class) |
| `backend/tools/finance/vehicle.py` | All 7 functions rewritten to call `vehicle_client` instead of `sqlite3.connect` / `MemoryDB` |
| `backend/api/vehicle_proposals.py` | Swap `MemoryDB.get_last_fuel_entry` + `MemoryDB.insert_vehicle_log_entries` for `vehicle_client` calls |
| `backend/api/receipts.py` | Same swap, in `_build_fuel_notes` and `confirm_fuel_receipt` (the fuel-specific sections only — do not touch the grocery/receipt paths) |
| `backend/api/vehicle_log_actions.py` | Swap the raw `sqlite3.connect` delete logic for `vehicle_client.delete_log_entry()` |
| `backend/api/vehicle_reminder_actions.py` | Swap `MemoryDB.get_vehicles/update_vehicle_service/update_vehicle_due_date` for `vehicle_client` equivalents |
| `backend/api/fuelio_import.py` | Rewrite to a thin auth + multipart-forwarding proxy — delete all CSV parsing code (`_parse_*`, `COST_TYPE_MAP`, `IGNORED_SECTIONS`) |
| `backend/services/notification_service.py` | `_check_vehicle_reminders` (lines 211-353): replace the raw `sqlite3.connect(settings.memory.db_path)` block (lines 230-243) with a `vehicle_client.list_vehicles()` call — see Gotcha #1, this function must become `async` |
| `backend/core/memory/database.py` | Delete the 9 vehicle methods (lines 594-745) and the `vehicles`/`vehicle_log` `CREATE TABLE` statements (lines 132-176) — this data no longer lives here |
| `docker-compose.yml` | Add `VEHICLE_MANAGER_URL=http://vehicle-manager:8010` to `majordom-api`'s environment (or `.env` — match how `ACTUAL_BUDGET_URL` is set today), add `vehicle-manager: condition: service_healthy` to `majordom-api`'s `depends_on` |

## `vehicle_client` — required methods
Async methods, one per vehicle-manager endpoint, using `httpx.AsyncClient`:
- `list_vehicles(active_only: bool = True) -> list[dict]`
- `get_vehicle(vehicle_id: int) -> dict | None` (None on 404)
- `upsert_vehicle(data: dict) -> int` (returns the id)
- `patch_vehicle(vehicle_id: int, **fields) -> bool` (False on 404)
- `get_log(vehicle_id: int, limit: int = 10, entry_type: str | None = None) -> list[dict]`
- `insert_log_entries(vehicle_id: int, entries: list[dict]) -> tuple[int, int]` (inserted, skipped)
- `get_log_entry(entry_id: int) -> dict | None`
- `delete_log_entry(entry_id: int) -> bool`
- `get_last_fuel_entry(vehicle_id: int) -> dict | None`
- `get_stats(vehicle_id: int, period: str = "") -> dict | None`
- `import_fuelio(file_bytes: bytes, filename: str) -> dict` (forwards multipart, returns the parsed response — let the vehicle-manager's HTTPException status/detail propagate up as-is on error)

Base URL comes from `settings.vehicle_manager.url`. Use a short timeout (5-10s, this is an
internal service on the same Docker network — no reason for a long timeout) and raise a clear
exception on connection failure so callers can catch it and report a useful error to the user
(see Gotcha #2).

## Critical Rules
- **No financial data in SQLite** stays satisfied — vehicle data was never financial data (Actual Budget remains the only financial source of truth), this rule is unaffected by this change. (source: root `CLAUDE.md`)
- **Retire the old flow completely in this same task** — delete `MemoryDB`'s 9 vehicle methods and the two `CREATE TABLE` statements once every call site is migrated. Do not leave them "in case something still calls it" — grep first to confirm nothing else references them, then delete. (source: `CLAUDE.md` "Duplication & dead-code prevention", the #93 audit is exactly the incident this rule exists to prevent)
- **Chat tool call args**: `json.loads(args)` before `**args` for any tool-calling path you touch — OpenAI format returns args as a string, not a dict. (source: `CLAUDE.md` critical rule 7 — only relevant if you touch `backend/api/chat.py`'s tool dispatch, which you should NOT need to for this task since tool function signatures in `vehicle.py` are unchanged)
- **`_PROPOSAL_TOOLS` in `backend/api/chat.py`**: do not remove or rename any `vehicle__*` entry — the tool names and signatures in `vehicle.py` must stay byte-identical, only their internal implementation changes.
- Config comes from the `settings` singleton, never `os.environ` directly outside `settings.py` itself. (source: `CLAUDE.md` critical rule 4)

## Gotchas
1. `_check_vehicle_reminders()` in `notification_service.py` is currently a plain `def`, not `async def`, and does a blocking `sqlite3.connect()`. Once it calls `vehicle_client` (which is async), it must become `async def _check_vehicle_reminders(...)`. Both call sites are already inside `async def` functions (`run_daily_digest` line 618, `get_pending_items` line 783) — just add `await` at both call sites, nothing else in those functions needs to change.
2. The three combined-write flows (`vehicle_proposals.py`, `receipts.py`'s fuel confirm, `vehicle_log_actions.py`'s delete confirm) each write to Actual Budget AND vehicle-manager in sequence — this is no longer a single atomic operation like it was with one shared SQLite connection. If the vehicle-manager call fails AFTER the Actual Budget call already succeeded, catch that specific failure, log it clearly, and return a response that tells the user explicitly: the AB transaction was saved but the vehicle log entry failed and needs manual attention. Do NOT attempt to roll back the AB transaction — keep this as a clearly-surfaced error, not silent data loss, and not a retry/rollback mechanism (overkill for a single-user internal tool).
3. Preserve the existing "read last_odo BEFORE insert" ordering exactly as it is today in `vehicle_proposals.py` and `receipts.py` — call `vehicle_client.get_last_fuel_entry()` (or the vehicle_client method that returns the last ODO, matching `get_last_odo_per_vehicle` — check which one each call site currently uses) BEFORE calling `vehicle_client.insert_log_entries()`. Getting this order wrong makes `km_since_last` compute as 0 (this exact bug is already flagged in `docs/architecture.md`'s "Fuel receipt" flow docs).
4. `fuelio_import.py`'s new proxy version must still enforce the auth dependency (`get_current_user`) and the response model `FuelioImportResult` — the frontend (`frontend/src/lib/api.ts` line 284, `POST /import/fuelio`) is untouched and expects the exact same request/response contract it gets today. Forward the uploaded `UploadFile`'s bytes as multipart to vehicle-manager and pass through its JSON response unchanged. If vehicle-manager returns a 400 (e.g. "not a Fuelio sync file"), propagate that as the same `HTTPException(status_code=400, detail=...)` the user sees today.
5. `vehicle.py::delete_vehicle_log_entry` currently reads `financial_id` from the row itself (at PROPOSE time, via a direct SQL SELECT) and stashes it in `vehicle_log_actions`' in-memory action store — that store is untouched by this migration, only the SELECT becomes `vehicle_client.get_log_entry(entry_id)`.

## Do NOT touch
- `backend/tools/vehicle_proposals.py` (the in-memory pending-proposal dict store, NOT `backend/api/vehicle_proposals.py`) and `backend/tools/vehicle_log_actions.py` / `backend/tools/vehicle_reminder_actions.py` (in-memory action stores) — these hold pending confirmation state in Majordom's process memory, unrelated to the `vehicles`/`vehicle_log` SQLite tables being removed.
- `backend/tools/registry.py` tool schemas — no tool name, parameter, or description changes.
- The photo/grocery receipt paths in `receipts.py` — only the fuel-specific sections change.
- `tools/vehicle-manager/` itself — that's the previous task's deliverable, read-only reference here (its OpenAPI docs are the spec for this task's client).

## Done when
- `docker compose up -d` brings up the full stack including `vehicle-manager`, `majordom-api` starts healthy with `VEHICLE_MANAGER_URL` set.
- Chat: "am alimentat 30L cu €55 la Shell, odo 52000" → produces the same `fuel_log` card as before, confirming it creates both an AB transaction and a vehicle_log entry via vehicle-manager, with correct `km_since_last`/consumption stats.
- Chat: "ce consum are Cora?" (or equivalent `vehicle__get_vehicle_stats` trigger) → same formatted text output as before.
- Fuelio CSV import via the frontend upload UI still works end-to-end, same result card.
- `grep -rn "vehicles\|vehicle_log" backend/core/memory/database.py` returns nothing (tables and methods fully removed).
- `grep -rn "sqlite3" backend/api/vehicle_log_actions.py backend/services/notification_service.py` shows no more direct queries against the vehicle tables.
