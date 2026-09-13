"""
FastAPI application for the investment-manager service.

REST API behind this app's own React frontend (per-user JWT) and
majordom-financiar's internal server-to-server calls (service token) — both
handled by ``app/auth.py``. Every route depends on
``auth.get_current_user_or_service`` except ``/health``, which the Docker
healthcheck calls unauthenticated.

Route handlers stay thin (plan section 11): validate → delegate to
``database`` / ``market_data`` / ``csv_import`` / ``stats`` → return. Portfolio
math never lives in this file.
"""
import logging
import os
from datetime import date, datetime, timezone

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile

from app import auth, csv_import, database, market_data, stats
from app.models import (
    DeleteResult,
    Goal,
    GoalCreate,
    HealthResponse,
    Security,
    SecurityCreate,
    SettingsUpdate,
    TargetAllocationRequest,
    Transaction,
    TransactionCreate,
    XtbImportResult,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("investment-manager")

app = FastAPI(title="investment-manager")

AUTH = Depends(auth.get_current_user_or_service)


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup():
    path = database.get_db_path()
    logger.info("Initializing database at %s", path)
    database.init_db(path)
    logger.info("investment-manager ready")


# ---------------------------------------------------------------------------
# Auth / health
# ---------------------------------------------------------------------------

@app.post("/auth/login", response_model=auth.TokenResponse)
async def login(request: auth.LoginRequest):
    return await auth.login(request)


@app.get("/health", response_model=HealthResponse)
async def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Securities
# ---------------------------------------------------------------------------

@app.get("/securities", response_model=list[Security])
async def list_securities(caller: str = AUTH):
    return database.get_securities()


@app.post("/securities", response_model=Security)
async def create_security(body: SecurityCreate, caller: str = AUTH):
    """Create a security. Missing name/currency is filled from Twelve Data."""
    metadata: dict = {}
    if not body.name or not body.currency:
        metadata = market_data.get_security_metadata(body.ticker)

    currency = body.currency or metadata.get("currency") or csv_import.currency_from_ticker(body.ticker)
    security_id = database.upsert_security(
        ticker=body.ticker,
        name=body.name or metadata.get("name"),
        asset_type=body.asset_type,
        currency=currency,
    )
    return database.get_security(security_id)


@app.delete("/securities/{security_id}", response_model=DeleteResult)
async def remove_security(security_id: int, caller: str = AUTH):
    if not database.delete_security(security_id):
        raise HTTPException(status_code=404, detail="Security not found")
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

@app.get("/transactions", response_model=list[Transaction])
async def list_transactions(security_id: int | None = None, type: str | None = None,
                            start_date: str | None = None, end_date: str | None = None,
                            limit: int | None = None, caller: str = AUTH):
    return database.get_transactions(
        security_id=security_id, type=type, start_date=start_date,
        end_date=end_date, limit=limit,
    )


@app.post("/transactions", response_model=Transaction)
async def create_transaction(body: TransactionCreate, caller: str = AUTH):
    security = database.get_security(body.security_id)
    if security is None:
        raise HTTPException(status_code=404, detail="Security not found")

    currency = body.currency or security["currency"] or "EUR"
    data = body.model_dump()
    data["currency"] = currency
    transaction_id, inserted = database.insert_transaction(data)
    if not inserted:
        # Same external_id already present — return the existing row rather
        # than erroring, so re-submitting an import is harmless.
        return database.get_transaction(transaction_id)
    return database.get_transaction(transaction_id)


@app.delete("/transactions/{transaction_id}", response_model=DeleteResult)
async def remove_transaction(transaction_id: int, caller: str = AUTH):
    if not database.delete_transaction(transaction_id):
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"deleted": True}


# ---------------------------------------------------------------------------
# XTB import
# ---------------------------------------------------------------------------

@app.post("/import/xtb", response_model=XtbImportResult)
async def import_xtb(file: UploadFile = File(...), caller: str = AUTH):
    """Import an XTB ``.xlsx`` report (Cash Operations sheet). Idempotent on
    XTB's own operation id, so re-importing an overlapping file adds nothing."""
    raw = await file.read()
    try:
        parsed = csv_import.parse_xtb(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    securities_created = 0
    inserted = 0
    skipped = 0

    for txn in parsed["transactions"]:
        existing = database.get_security_by_ticker(txn["ticker"])
        if existing is None:
            metadata = market_data.get_security_metadata(txn["ticker"])
            database.upsert_security(
                ticker=txn["ticker"],
                name=txn["name"] or metadata.get("name"),
                asset_type=txn.get("asset_type") or "stock",
                currency=metadata.get("currency") or txn["currency"],
            )
            securities_created += 1
            security = database.get_security_by_ticker(txn["ticker"])
        else:
            security = existing

        _, was_inserted = database.insert_transaction({
            **txn,
            "security_id": security["id"],
            "currency": security["currency"] or txn["currency"],
        })
        if was_inserted:
            inserted += 1
        else:
            skipped += 1

    return XtbImportResult(
        securities_created=securities_created,
        transactions_inserted=inserted,
        transactions_skipped=skipped,
        transfers_skipped=parsed["transfers_skipped"],
        rows_unparsed=parsed["rows_unparsed"],
        warnings=parsed["warnings"],
    )


# ---------------------------------------------------------------------------
# Portfolio views
# ---------------------------------------------------------------------------

@app.get("/portfolio/summary")
async def portfolio_summary(period: str = "1y", caller: str = AUTH):
    return stats.build_summary(period=period)


@app.get("/portfolio/allocation")
async def portfolio_allocation(caller: str = AUTH):
    return stats.build_allocation()


@app.get("/holdings")
async def holdings(include_closed: bool = False, caller: str = AUTH):
    """Open positions with cost basis, market value and gain/loss (plan section
    1 item 1) — the detail behind the Holdings page. ``include_closed=true``
    also returns fully-exited positions."""
    return stats.build_holdings(include_closed=include_closed)


@app.get("/portfolio/history")
async def portfolio_history(period: str = "1y", caller: str = AUTH):
    """Value series for the Dashboard chart (dates + EUR values)."""
    all_transactions = database.get_transactions()
    earliest = min((t["date"] for t in all_transactions), default=date.today().isoformat())
    start = stats.period_start(period, earliest)
    return stats.build_value_series(start_date=start)


@app.get("/portfolio/value")
async def portfolio_value(caller: str = AUTH):
    """Minimal read-only surface for majordom-financiar's coaching layer
    (#167/#177): current total portfolio value in EUR, no market-data detail."""
    holdings = stats.build_holdings()
    total = round(sum(h["market_value_eur"] or 0.0 for h in holdings), 2)
    return {
        "total_value_eur": total,
        "as_of": datetime.now(timezone.utc).date().isoformat(),
        "currency": "EUR",
        "positions": len(holdings),
    }


@app.get("/income")
async def income(caller: str = AUTH):
    return stats.build_income()


# ---------------------------------------------------------------------------
# Rebalancing
# ---------------------------------------------------------------------------

@app.get("/target-allocation")
async def get_target_allocation(caller: str = AUTH):
    return database.get_target_allocation()


@app.post("/target-allocation")
async def set_target_allocation(body: TargetAllocationRequest, caller: str = AUTH):
    database.replace_target_allocation([t.model_dump() for t in body.targets])
    return database.get_target_allocation()


@app.get("/rebalancing")
async def rebalancing(caller: str = AUTH):
    return stats.build_rebalancing()


# ---------------------------------------------------------------------------
# Goals
# ---------------------------------------------------------------------------

@app.get("/goals", response_model=list[Goal])
async def list_goals(caller: str = AUTH):
    return database.get_goals()


@app.post("/goals", response_model=Goal)
async def create_goal(body: GoalCreate, caller: str = AUTH):
    goal_id = database.create_goal(body.name, body.target_amount, body.target_date)
    return database.get_goal(goal_id)


@app.delete("/goals/{goal_id}", response_model=DeleteResult)
async def remove_goal(goal_id: int, caller: str = AUTH):
    if not database.delete_goal(goal_id):
        raise HTTPException(status_code=404, detail="Goal not found")
    return {"deleted": True}


@app.get("/goals/{goal_id}/projection")
async def goal_projection(goal_id: int, caller: str = AUTH):
    goal = database.get_goal(goal_id)
    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found")
    return stats.build_goal_projection(goal)


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

def _market_data_configured() -> bool:
    """Whether a Twelve Data key is available, from the stored setting or env.

    Deliberately reduced to a boolean at the REST boundary: the key value
    itself must never appear in a response body or a log line (plan section 6).
    """
    stored = (database.get_setting("twelve_data_api_key") or "").strip()
    env = os.getenv("TWELVE_DATA_API_KEY", "").strip()
    return bool(stored or env)


def _public_settings() -> dict:
    """Stored settings, minus the API key, plus the configuration flag.

    ``database.get_settings()`` returns the raw settings table, which now
    includes ``twelve_data_api_key``; the key is write-only (set via PUT, never
    read back), so it is stripped here to keep a single choke point for every
    settings response.
    """
    settings = dict(database.get_settings())
    settings.pop("twelve_data_api_key", None)
    settings["market_data_configured"] = _market_data_configured()
    return settings


@app.get("/settings")
async def get_settings(caller: str = AUTH):
    return _public_settings()


@app.put("/settings")
async def update_settings(body: SettingsUpdate, caller: str = AUTH):
    if body.benchmark_ticker is not None:
        database.set_setting("benchmark_ticker", body.benchmark_ticker)
    if body.assumed_annual_return is not None:
        database.set_setting("assumed_annual_return", str(body.assumed_annual_return))
    # Write-only field: an omitted or blank key leaves the stored one untouched,
    # so saving another setting (or clearing the input) cannot blank it. The
    # value is never logged and never echoed back.
    api_key = (body.twelve_data_api_key or "").strip()
    if api_key:
        database.set_setting("twelve_data_api_key", api_key)
    # Same shape as GET /settings, so clients can use the response directly.
    return _public_settings()
