---
title: Self-hosting
description: Run the vehicle-manager service yourself — standalone or via the monorepo's Docker Compose profile.
---

You can run the vehicle-manager service in two ways: standalone with uvicorn or through the monorepo's Docker Compose profile.

## Standalone (uvicorn)

1. Create a virtual environment and install dependencies:

   ```bash
   cd tools/vehicle-manager
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. Start the service:

   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8010
   ```

The backend will be available at `http://localhost:8010`.

## Docker Compose (monorepo)

If you’re already running the monorepo, you can start vehicle-manager alongside the other services:

```bash
# From the majordom-financiar directory
docker compose --profile vehicle-manager up -d
```

This automatically builds the image from `tools/vehicle-manager/Dockerfile` and mounts a named volume (`vehicle-manager-data`) at `/app/data` to persist the SQLite database.

## Environment variables

Copy the `.env.example` file from `tools/vehicle-manager` to `.env` and fill in the following values:

| Variable | Description |
|---|---|
| `VEHICLE_MANAGER_USER1_USERNAME` | Your login username for this service’s own frontend. |
| `VEHICLE_MANAGER_USER1_PASSWORD` | The password for that user (will be hashed at startup). |
| `VEHICLE_MANAGER_JWT_SECRET` | A random string used to sign JWT tokens for this service’s login. Generate one with `python3 -c "import secrets; print(secrets.token_hex(32))"`. |
| `VEHICLE_MANAGER_SERVICE_TOKEN` | A shared secret that lets Majordom Finance’s internal calls authenticate without a user login. **Must be identical** to the `VEHICLE_MANAGER_SERVICE_TOKEN` value in Majordom Finance’s `.env`. |
| `MAJORDOM_API_URL` | The URL of Majordom Finance’s API, used for syncing account data (e.g., `http://majordom-api:8000` when running inside Docker). |

> If you run vehicle-manager through the monorepo’s Docker Compose, these variables are read from `majordom-financiar/.env` (look for the `VEHICLE_MANAGER_*` entries in `docker-compose.yml`). You don’t need a separate `.env` file for the service in that case.

## Authentication

Every route except `/health` requires either a user JWT (obtained by logging in at `POST /auth/login`) or the shared service token sent as an `X-Service-Token` header. The user JWT is meant for the standalone frontend; the service token is used by Majordom Finance’s own server‑to‑server calls. Both are validated on each request.

## Database

The service uses a SQLite database stored at the path configured by the `VEHICLE_DB_PATH` environment variable. Default is `/app/data/vehicles.db`.

- **When running standalone**, the database file is created at the path you specify. Make sure the parent directory exists.
- **When running via Docker Compose**, a named Docker volume (`vehicle-manager-data`) is mounted at `/app/data`, so the database persists across container restarts.

### Changing the database path

Set the `VEHICLE_DB_PATH` environment variable to any writable path, for example:

```bash
export VEHICLE_DB_PATH=/srv/vehicle-manager/vehicles.db
```

## Migrating from Majordom Finance

If you already have vehicle data stored in Majordom Finance’s `memory.db`, you can copy it into the vehicle-manager database:

1. **Never work on the live database.** Make a copy first:

   ```bash
   cp /path/to/majordom-financiar/data/memory.db /tmp/memory-copy.db
   ```

2. Run the migration script, pointing it to the copy and to an empty target database:

   ```bash
   cd tools/vehicle-manager
   python scripts/migrate_from_majordom.py /tmp/memory-copy.db /tmp/vehicles.db
   ```

3. Copy the resulting `/tmp/vehicles.db` to the location your service will use (or mount it when starting the container).

The script reads all rows from the `vehicles` and `vehicle_log` tables and writes them with `INSERT OR REPLACE`, preserving original IDs. A summary of rows copied per table is printed at the end.

## Ports

- **Backend API**: 8010 (configurable via `uvicorn --port` or the `docker run` port mapping).
- **Standalone frontend (development)**: 5173 (Vite dev server, run from `tools/vehicle-manager/frontend` with `npm run dev`). In production the frontend is compiled into static files and served by the backend or a separate web server.
