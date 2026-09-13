# Task: wire investment-manager into majordom-financiar's coaching layer (read-only)

## Context
`tools/investment-manager/` (separate service, own frontend/backend/DB, port 8020 internal) was
just built and merged into `main` — a personal portfolio tracker (holdings, XIRR/TWR, allocation,
rebalancing, goals). `majordom-financiar` (this repo) needs a thin, read-only client to consume
its API for coaching features (#167 Expense Coverage, #177 Coast-FIRE) — same pattern already used
for `tools/vehicle-manager/` via `backend/core/vehicle_client/client.py`.

## Goal
A new `backend/core/investment_client/client.py`, modeled directly on
`backend/core/vehicle_client/client.py` (read that file first — same shape: base URL from
settings, `X-Service-Token` header auth, httpx client, typed methods, graceful degradation if the
service is down/not running).

## Concrete scope
1. Add `INVESTMENT_MANAGER_API_URL` and `INVESTMENT_MANAGER_SERVICE_TOKEN` to
   `backend/core/config/settings.py` (same pattern as the existing `vehicle_manager` settings
   block) and `.env.example`.
2. `InvestmentClient` with one method to start: `get_summary() -> dict | None` — calls
   `GET /portfolio/summary` on investment-manager (see `tools/investment-manager/app/main.py` for
   the exact response shape: `total_value_eur`, `xirr`, `twr`, `benchmark_return`, etc.). Return
   `None` (not raise) if the service is unreachable or returns an error — #167/#177 must degrade
   gracefully, not break majordom-financiar's own dashboard if investment-manager isn't running.
3. Do NOT build #167/#177 themselves yet — this task is only the client + settings wiring, so a
   future session can build the actual coaching feature on top of it. No new chat tools, no new
   `_PROPOSAL_TOOLS` entries, no UI changes.
4. Add a live smoke test: with the local `docker compose --profile investment-manager` stack
   running, confirm `InvestmentClient().get_summary()` returns real data, and confirm it returns
   `None` (not an exception) when the container is stopped.

## Critical rules
- Read `docs/architecture.md#critical-technical-rules` and `.claude/rules/duplication-prevention.md`
  before starting.
- Service-to-service auth only (`X-Service-Token`) — never a user JWT for this client.
- No financial data gets stored in majordom-financiar's own SQLite — this client only reads from
  investment-manager's API on demand, never caches/persists its response locally.

## Do NOT touch
`tools/investment-manager/` itself (already built, working, tested — read-only reference for the
response shape). Any existing vehicle_client code (reference only, don't modify).

## Done when
`InvestmentClient.get_summary()` works against the real running stack, degrades to `None` when the
service is down (tested both ways), settings/`.env.example` updated, no chat-tool or UI changes.
