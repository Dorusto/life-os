# investment-manager

A standalone FastAPI + React service for personal investment/portfolio tracking: holdings,
transactions (buy/sell/dividend/fee), average-cost basis, XIRR + TWR + benchmark comparison,
allocation, rebalancing and CAGR goal projections. Same architectural shape as
`tools/vehicle-manager/` — own frontend, own backend, own SQLite database, own Docker container,
talking to `majordom-financiar` only over REST (never the other way around).

Built end to end 2026-09-12; see `docs/standalone-app-plan.md` for the spec and a build-status
section at the end. The frontend's visual system is documented in `frontend/DESIGN.md` (portable
by design — tokens live in one file).

## Layout

```
app/            FastAPI backend
  main.py       thin routes only
  auth.py       JWT + X-Service-Token (provided, used as-is)
  database.py   SQLite schema + CRUD (/app/data/investments.db)
  models.py     Pydantic request/response models
  market_data.py  Twelve Data prices/FX/history, cached daily
  csv_import.py  XTB .xlsx Cash Operations parser
  stats.py      cost basis, XIRR, TWR, allocation, rebalancing, projections
frontend/       React + Vite + TypeScript + Tailwind SPA
  src/lib/        api client, auth, formatting, helpers
  src/components/ shared primitives, charts, shell, modals
  src/pages/      Login, Dashboard, Holdings, Transactions, Income, Rebalancing, Goals, Settings
tests/          pytest suite (self-contained fixtures)
```

## Run

Through the monorepo compose (from `majordom-financiar/`):

```bash
docker compose --profile investment-manager up -d --build
```

Frontend on `http://<host>:3020` (override `INVESTMENT_MANAGER_WEB_PORT`); backend internal
`:8020`; sqlite-web debug viewer loopback-only on `:8890`. Nginx serves the SPA and proxies the
API under `/api/` (prefix stripped) — see `frontend/nginx.conf` and
`tools/standalone-app-playbook.md` §2.1.

Standalone:

```bash
# backend
python -m venv .venv && .venv/bin/pip install -r requirements.txt
INVESTMENT_MANAGER_JWT_SECRET=... INVESTMENT_MANAGER_SERVICE_TOKEN=... \
INVESTMENT_MANAGER_USER1_USERNAME=... INVESTMENT_MANAGER_USER1_PASSWORD=... \
TWELVE_DATA_API_KEY=... .venv/bin/uvicorn app.main:app --port 8020

# frontend (proxies /api to :8020)
cd frontend && npm install && npm run dev
```

Configuration is documented in `.env.example`. `TWELVE_DATA_API_KEY` is server-side only and is
never exposed in the UI.

## Tests

```bash
.venv/bin/python -m pytest
```

## Notes

- Base/display currency is EUR; securities in other currencies are converted at a cached FX rate
  before being summed. Cost basis is **average cost** (a tracking figure, not a tax figure).
- Market data refreshes at most once per symbol per day and serves stale cached values if the
  API is unavailable, so a failed call never breaks a page.
- Scope boundaries, data model and API contract: `docs/standalone-app-plan.md`.
- Why this is a separate service: `majordom-financiar/docs/decisions.md#portfolio-becomes-separate-service`.
