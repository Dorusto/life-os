---
title: Self‑hosting
description: Run Majordom Invest – standalone with uvicorn or via the monorepo’s Docker Compose profile. All environment variables, ports, and authentication details.
---

Majordom Invest can be started in two ways: **standalone** with uvicorn (useful during development or when you want a lightweight setup) or **through the monorepo’s Docker Compose** profile (the recommended production path when you are also running Majordom Finance and the other companion services).

## Standalone (uvicorn)

1. Create a Python virtual environment and install the dependencies:

   ```bash
   python3 -m venv .venv
   .venv/bin/pip install -r requirements.txt
   ```

2. Make a copy of `.env.example` → `.env` and fill in every variable (see [Environment variables](#environment-variables) below).

3. Launch the backend server:

   ```bash
   .venv/bin/uvicorn app.main:app --port 8020
   ```

   The API will be reachable at `http://localhost:8020`.

4. (Optional) Run the frontend development server:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

   When started this way, the frontend automatically proxies requests to `/api/` to the backend at `http://localhost:8020`. The frontend dev server runs on port 5173 by default (Vite’s standard port).

## Via Docker Compose (monorepo profile)

From the root of the Majordom realm monorepo (the directory that contains the `docker-compose.yml` for the whole project):

```bash
docker compose --profile investment-manager up -d --build
```

This builds the image using the included `Dockerfile`, starts the backend on the internal port 8020, serves the SPA through nginx on port 3020 (configurable via the `INVESTMENT_MANAGER_WEB_PORT` override), and optionally starts a sqlite‑web debug viewer on port 8890 (bound to loopback only).

The nginx container also performs the `/api/` → backend prefix‑stripping described in the [Frontend](#frontend) section.

## Environment variables

All configuration is read from environment variables. If you run standalone, they go in a `.env` file (copied from `.env.example`). When launched through Docker Compose, they must be present in `majordom-financiar/.env` and are passed to the container automatically.

| Variable | Purpose |
|----------|---------|
| `INVESTMENT_MANAGER_USER1_USERNAME` / `INVESTMENT_MANAGER_USER1_PASSWORD` | Login credentials for the service’s own frontend (you can define up to nine users: `USER1` through `USER9`). |
| `INVESTMENT_MANAGER_JWT_SECRET` | Used to sign the JWT tokens issued by `/auth/login`. Generate a strong random value: `python3 -c "import secrets; print(secrets.token_hex(32))"`. |
| `INVESTMENT_MANAGER_SERVICE_TOKEN` | A shared secret that lets Majordom Finance call this service’s endpoints without a per‑user login. The value **must be identical** to `INVESTMENT_MANAGER_SERVICE_TOKEN` in `majordom-financiar/.env`. |
| `TWELVE_DATA_API_KEY` | Your [Twelve Data](https://twelvedata.com) API key for price and market‑data lookups. A free tier (800 calls/day) is sufficient for a personal portfolio updated once or twice daily. |

## Authentication

Every route of the API except the health check (`/health`) requires one of the following:

- **A user JWT** – obtained by calling `/auth/login` with valid credentials. Send it as `Authorization: Bearer <token>`.
- **The service token** – sent in the `X-Service-Token` header.

If neither is present and valid, the request receives a `401 Unauthorized` response.

## Database

The service stores data in a single SQLite database located at the path given by the `INVESTMENT_DB_PATH` environment variable (defaults to `/app/data/investments.db`). When deployed via Docker Compose, the `/app/data` directory is persisted through a Docker volume, so your data survives container recreations.

The schema covers securities, transactions (with an `external_id` unique index for idempotent re‑imports), price caches and history, FX rates, target allocations, goals, and settings.

## Frontend

The frontend (a React single‑page application built with Vite and TypeScript) is served by an nginx container that also acts as a reverse proxy for the API:

- Requests to `/api/...` are forwarded to the backend after stripping the `/api` prefix. For example, a browser request to `/api/holdings` is transformed into a request to `/holdings` on the backend.
- All other routes fall back to `index.html` so that the React Router can handle deep links and page reloads without hitting a `404`.

## Ports

| Port (inside container) | Purpose | Exposed externally when using Docker Compose |
|-------------------------|---------|----------------------------------------------|
| 8020 | Backend FastAPI server | Not exposed by default (nginx proxies to it). |
| 3020 (default) | Frontend nginx (serves SPA and proxies API). Configurable via `INVESTMENT_MANAGER_WEB_PORT`. | Public. |
| 8890 | sqlite‑web database viewer (bound to `127.0.0.1` only). | Loopback‑only (access via `localhost` on the host). |

## Market data key

The `TWELVE_DATA_API_KEY` is used **only on the server side**. It is never sent to the browser, so you do not have to worry about it being exposed in the client‑side JavaScript or in the network tab.
