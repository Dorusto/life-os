# vehicle-manager

A standalone FastAPI service for managing vehicle data (vehicles, fuel logs, costs,
reminders). This is the first extraction under the `life-os/` modular monorepo target,
moving vehicle logic out of `majordom-financiar/` into its own independent service.

## Architecture

- **FastAPI** service running on internal port `8010`
- **SQLite** database at `/app/data/vehicles.db` (persisted via Docker volume)
- **No authentication** — lives on the internal `majordom-net` Docker network only
- **No financial data** — only operational vehicle data (vehicles, fuel logs, costs)

## Running standalone (without Docker)

```bash
cd tools/vehicle-manager
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8010
```

The database will be created at `/app/data/vehicles.db` by default. To use a different
path, set the `VEHICLE_DB_PATH` environment variable.

## Running with Docker

```bash
# From the repo root (life-os/)
docker build -t vehicle-manager tools/vehicle-manager
docker run -d \
  --name vehicle-manager \
  --network majordom-net \
  -v vehicle-manager-data:/app/data \
  vehicle-manager
```

Or via docker-compose (from `majordom-financiar/`):

```bash
docker compose up -d vehicle-manager
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (`{"status": "ok"}`) |
| `GET` | `/vehicles?active_only=true` | List vehicles with computed `last_odo` |
| `GET` | `/vehicles/{id}` | Single vehicle with `last_odo` |
| `POST` | `/vehicles` | Upsert vehicle by `(name, plate)` |
| `PATCH` | `/vehicles/{id}` | Partial update of vehicle fields |
| `GET` | `/vehicles/{id}/log?limit=10&entry_type=fuel` | Log entries for a vehicle |
| `POST` | `/vehicles/{id}/log` | Batch insert log entries |
| `GET` | `/log/{entry_id}` | Single log entry with vehicle name |
| `DELETE` | `/log/{entry_id}` | Delete a log entry |
| `GET` | `/vehicles/{id}/last-fuel-entry` | Most recent full-tank fuel entry |
| `GET` | `/vehicles/{id}/stats?period=` | Computed fuel/cost statistics |
| `POST` | `/import/fuelio` | Import a Fuelio sync CSV file |

## Data Migration

To migrate existing data from Majordom's `memory.db`:

```bash
# 1. Copy the live database (never work on the live file!)
cp /path/to/majordom-financiar/data/memory.db /tmp/memory-copy.db

# 2. Run the migration script
cd tools/vehicle-manager
python scripts/migrate_from_majordom.py /tmp/memory-copy.db /tmp/vehicles.db

# 3. Copy the resulting vehicles.db to the Docker volume location
#    (or mount it directly when starting the container)
```

The migration script:
- Initializes the destination schema
- Reads all rows from `vehicles` and `vehicle_log`
- Writes them with `INSERT OR REPLACE`, preserving original IDs
- Prints a summary of rows copied per table

## Database Schema

Two tables, identical to Majordom's current schema:

- **vehicles** — vehicle profiles (make, model, year, plate, fuel type, tank capacity,
  APK/insurance due dates, service intervals, etc.)
- **vehicle_log** — fuel entries, cost entries, service reminders (linked to vehicles
  via `vehicle_id`, with `UNIQUE(vehicle_id, fuelio_unique_id, entry_type)` constraint)
