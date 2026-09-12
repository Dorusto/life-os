# investment-manager

A standalone FastAPI + React service for personal investment/portfolio tracking (holdings,
transactions, cost basis, performance, allocation). Same architectural shape as
`tools/vehicle-manager/` — own frontend, own backend, own SQLite database, own Docker container,
talking to `majordom-financiar` only over REST.

**Not yet built** — see `docs/standalone-app-plan.md` for the full spec (scope, data model, API
contract, market-data integration, design direction) before writing any code. Auth
(`app/auth.py`), the frontend's Nginx config, and the Dockerfiles are already written — use them
as-is, don't regenerate.

See `majordom-financiar/docs/decisions.md#portfolio-becomes-separate-service` for why this exists
as a separate app, and `tools/standalone-app-playbook.md` for the reusable build process.
