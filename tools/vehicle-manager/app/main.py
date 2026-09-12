"""
FastAPI application for the vehicle-manager service.
Provides REST API for vehicle data management, replacing the inline vehicle
logic currently in majordom-financiar/backend/.

Every route requires authentication (see app/auth.py) — either a user JWT
(the standalone frontend's own login) or a service token (majordom-financiar's
internal proxy calls) — except /health, left open for the Docker healthcheck.
"""
import logging
from datetime import date

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from app import auth
from app.database import (
    init_db, upsert_vehicle, get_vehicles, get_vehicle, patch_vehicle,
    insert_vehicle_log_entries, get_vehicle_log, get_log_entry,
    delete_log_entry, get_last_fuel_entry, get_vehicle_stats_data,
    get_db_path,
    insert_value_override, get_value_overrides, update_current_value,
    set_ab_account_id,
)
from app import charts, depreciation, majordom_client, stats
from app.models import (
    DeleteResult, FuelioImportResult, HealthResponse, LogInsertResult,
    VehicleLogEntry, VehicleUpsertRequest, VehiclePatchRequest, VehicleUpsertResult,
    VehicleValueOverrideRequest, VehicleLinkAccountRequest,
)
from app.fuelio_parser import parse_csv, derive_vehicle_reminder_fields

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("vehicle-manager")

app = FastAPI(title="vehicle-manager")

AUTH = Depends(auth.get_current_user_or_service)


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup():
    db_path = get_db_path()
    logger.info("Initializing database at %s", db_path)
    init_db(db_path)
    logger.info("Vehicle-manager ready")


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@app.post("/auth/login", response_model=auth.TokenResponse)
async def login(request: auth.LoginRequest):
    return await auth.login(request)


# ---------------------------------------------------------------------------
# Cross-vehicle summary (must be registered before /vehicles/{vehicle_id})
# ---------------------------------------------------------------------------

@app.get("/vehicles/costs-summary")
async def costs_summary(period: str = "", caller: str = AUTH):
    """Aggregate cost across all vehicles."""
    return charts.build_costs_summary(period=period)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse)
async def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Vehicles
# ---------------------------------------------------------------------------

@app.get("/vehicles")
async def list_vehicles(active_only: bool = True, caller: str = AUTH):
    """List vehicles. Each object includes all profile columns plus computed last_odo."""
    return get_vehicles(active_only=active_only)


@app.get("/vehicles/{vehicle_id}")
async def get_vehicle_by_id(vehicle_id: int, caller: str = AUTH):
    """Single vehicle, same shape as list. 404 if not found."""
    v = get_vehicle(vehicle_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return v


@app.post("/vehicles", response_model=VehicleUpsertResult)
async def create_vehicle(body: VehicleUpsertRequest, caller: str = AUTH):
    """Upsert by (name, plate) case-insensitive match. Returns {id: int}."""
    data = body.model_dump()
    vid = upsert_vehicle(data)

    purchase_price = data.get("purchase_price")
    purchase_date = data.get("purchase_date")
    if purchase_price is not None and purchase_date:
        # upsert_vehicle() UPDATEs an existing row (matched by name+plate) as
        # often as it INSERTs a new one — e.g. every re-import of the same
        # Fuelio CSV. Re-reading here to find any ab_account_id it already
        # had is required: passing None unconditionally would tell
        # sync_vehicle_account() to always create a fresh AB account,
        # orphaning the previous one as a duplicate on every re-upsert.
        existing_vehicle = get_vehicle(vid)
        existing_ab_account_id = (existing_vehicle or {}).get("ab_account_id")

        current_value = depreciation.compute_current_value(
            purchase_price=purchase_price,
            purchase_date=purchase_date,
            vehicle_class=data.get("vehicle_class"),
            annual_depreciation_pct=data.get("annual_depreciation_pct"),
            salvage_floor_pct=data.get("salvage_floor_pct") or 10.0,
        )
        synced_id = await majordom_client.sync_vehicle_account(
            name=data.get("name", "Unknown Vehicle"),
            current_value=current_value,
            ab_account_id=existing_ab_account_id,
        )
        # synced_id is None on any sync failure — keep the existing link
        # rather than wiping it (same reasoning as update_vehicle below).
        update_current_value(vid, current_value, synced_id or existing_ab_account_id)

    return {"id": vid}


@app.patch("/vehicles/{vehicle_id}")
async def update_vehicle(vehicle_id: int, body: VehiclePatchRequest, caller: str = AUTH):
    """Partial update of a vehicle. 404 if missing."""
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields provided")
    found = patch_vehicle(vehicle_id, updates)
    if not found:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    vehicle = get_vehicle(vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    relevant_fields = {
        "name", "purchase_price", "purchase_date", "vehicle_class",
        "annual_depreciation_pct", "salvage_floor_pct",
    }
    if any(k in updates for k in relevant_fields):
        purchase_price = vehicle.get("purchase_price")
        purchase_date = vehicle.get("purchase_date")
        if purchase_price is not None and purchase_date:
            current_value = depreciation.compute_current_value(
                purchase_price=purchase_price,
                purchase_date=purchase_date,
                vehicle_class=vehicle.get("vehicle_class"),
                annual_depreciation_pct=vehicle.get("annual_depreciation_pct"),
                salvage_floor_pct=vehicle.get("salvage_floor_pct") or 10.0,
            )
            existing_ab_account_id = vehicle.get("ab_account_id")
            synced_id = await majordom_client.sync_vehicle_account(
                name=vehicle.get("name", "Unknown Vehicle"),
                current_value=current_value,
                ab_account_id=existing_ab_account_id,
            )
            # synced_id is None on any sync failure — keep the existing link
            # rather than wiping it, otherwise a transient majordom-api outage
            # permanently severs this vehicle's AB account and the next sync
            # would create a duplicate account instead of updating the real one.
            update_current_value(vehicle_id, current_value, synced_id or existing_ab_account_id)

    return get_vehicle(vehicle_id)


@app.post("/vehicles/{vehicle_id}/link-account")
async def link_vehicle_account(vehicle_id: int, body: VehicleLinkAccountRequest, caller: str = AUTH):
    """
    Link this vehicle to a pre-existing AB account without creating a new
    one or touching the target account's balance/name — only tags it as
    TYPE: Vehicle and stores the id. Deliberately separate from
    sync_vehicle_account's price/date-gated create/rename/adjust flow.
    """
    if get_vehicle(vehicle_id) is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    tagged = await majordom_client.tag_vehicle_account(body.ab_account_id)
    if not tagged:
        raise HTTPException(status_code=502, detail="Actual Budget tag failed")

    set_ab_account_id(vehicle_id, body.ab_account_id)
    return get_vehicle(vehicle_id)


# ---------------------------------------------------------------------------
# Vehicle Log
# ---------------------------------------------------------------------------

@app.post("/vehicles/{vehicle_id}/value-override")
async def create_value_override(vehicle_id: int, body: VehicleValueOverrideRequest, caller: str = AUTH):
    """Apply a manual correction to the vehicle's current value."""
    vehicle = get_vehicle(vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    current = vehicle.get("current_value") or 0.0

    if body.mode == "set":
        resulting = body.value
    elif body.mode == "adjust":
        if body.direction not in ("up", "down"):
            raise HTTPException(status_code=400, detail="direction must be 'up' or 'down' for adjust mode")
        resulting = current + (body.value if body.direction == "up" else -body.value)
    else:
        raise HTTPException(status_code=400, detail="mode must be 'set' or 'adjust'")

    insert_value_override(vehicle_id, resulting, body.date, body.note)

    existing_ab_account_id = vehicle.get("ab_account_id")
    synced_id = await majordom_client.sync_vehicle_account(
        name=vehicle["name"],
        current_value=resulting,
        ab_account_id=existing_ab_account_id,
    )
    # See update_vehicle's comment — never let a failed sync wipe a real link.
    final_ab_account_id = synced_id or existing_ab_account_id
    update_current_value(vehicle_id, resulting, final_ab_account_id)

    return get_vehicle(vehicle_id) or {
        "vehicle_id": vehicle_id,
        "current_value": resulting,
        "ab_account_id": final_ab_account_id,
    }


@app.get("/vehicles/{vehicle_id}/value-history")
async def value_history(vehicle_id: int, caller: str = AUTH):
    """Manual value corrections for a vehicle, newest first."""
    if get_vehicle(vehicle_id) is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return get_value_overrides(vehicle_id)


@app.get("/vehicles/{vehicle_id}/value-projection")
async def value_projection(vehicle_id: int, years: int = 12, caller: str = AUTH):
    v = get_vehicle(vehicle_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    purchase_price = v.get("purchase_price")
    purchase_date = v.get("purchase_date")
    if purchase_price is None or not purchase_date:
        raise HTTPException(status_code=404, detail="Vehicle value tracking is not configured")

    salvage_floor_pct = v.get("salvage_floor_pct") or 10.0
    salvage_floor = purchase_price * salvage_floor_pct / 100

    overrides = get_value_overrides(vehicle_id)
    overrides_oldest_first = list(reversed(overrides))

    return {
        "purchase": {"date": purchase_date, "value": purchase_price},
        "today": {"date": date.today().isoformat(), "value": v.get("current_value")},
        "salvage_floor": salvage_floor,
        "curve": depreciation.project_value_curve(
            purchase_price=purchase_price,
            purchase_date=purchase_date,
            vehicle_class=v.get("vehicle_class"),
            annual_depreciation_pct=v.get("annual_depreciation_pct"),
            salvage_floor_pct=salvage_floor_pct,
            years_ahead=years,
        ),
        "overrides": [{"date": o["date"], "value": o["value"]} for o in overrides_oldest_first],
    }


@app.get("/vehicles/{vehicle_id}/log")
async def list_vehicle_log(vehicle_id: int, limit: int = 10, entry_type: str | None = None, caller: str = AUTH):
    """Log entries for one vehicle, ordered by date DESC. entry_type filter optional."""
    return get_vehicle_log(vehicle_id, limit=limit, entry_type=entry_type)


@app.post("/vehicles/{vehicle_id}/log", response_model=LogInsertResult)
async def add_vehicle_log(vehicle_id: int, entries: list[VehicleLogEntry], caller: str = AUTH):
    """Batch INSERT OR IGNORE log entries. vehicle_id filled from path.
    Returns {inserted: n, skipped: n}."""
    dicts = []
    for e in entries:
        d = e.model_dump()
        d["vehicle_id"] = vehicle_id
        dicts.append(d)
    inserted, skipped = insert_vehicle_log_entries(dicts)
    return LogInsertResult(inserted=inserted, skipped=skipped)


# ---------------------------------------------------------------------------
# Single Log Entry
# ---------------------------------------------------------------------------

@app.get("/log/{entry_id}")
async def get_log_entry_by_id(entry_id: int, caller: str = AUTH):
    """Single log entry with vehicle_name joined. 404 if missing."""
    entry = get_log_entry(entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Log entry not found")
    return entry


@app.delete("/log/{entry_id}", response_model=DeleteResult)
async def delete_log_entry_by_id(entry_id: int, caller: str = AUTH):
    """Delete a log entry. 404 if missing."""
    found = delete_log_entry(entry_id)
    if not found:
        raise HTTPException(status_code=404, detail="Log entry not found")
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Last Fuel Entry (fast isolated call)
# ---------------------------------------------------------------------------

@app.get("/vehicles/{vehicle_id}/last-fuel-entry")
async def last_fuel_entry(vehicle_id: int, caller: str = AUTH):
    """Most recent full-tank, non-missed fuel entry, or null."""
    entry = get_last_fuel_entry(vehicle_id)
    return entry if entry else JSONResponse(content=None)


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

@app.get("/vehicles/{vehicle_id}/stats")
async def vehicle_stats(vehicle_id: int, period: str = "", caller: str = AUTH):
    """Computed stats: fuel stats, costs, consumption. Returns structured JSON.
    period: YYYY-MM, YYYY, or empty for all-time."""
    result = get_vehicle_stats_data(vehicle_id, period=period)
    if not result:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return result


# ---------------------------------------------------------------------------
# Dashboard / statistics (Fuelio-style)
# ---------------------------------------------------------------------------

@app.get("/vehicles/{vehicle_id}/summary")
async def vehicle_summary(vehicle_id: int, caller: str = AUTH):
    """Dashboard summary: fuel economy, last price, this month/year costs, reminders."""
    v = get_vehicle(vehicle_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return stats.build_vehicle_summary(v)


@app.get("/vehicles/{vehicle_id}/stats-detail")
async def vehicle_stats_detail(vehicle_id: int, period: str = "", caller: str = AUTH):
    """Rich statistics for the Stats screen (costs, bills, prices, distance, fill-ups)."""
    v = get_vehicle(vehicle_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return stats.build_vehicle_stats_detail(v, period=period)


@app.get("/vehicles/{vehicle_id}/cost-categories")
async def vehicle_cost_categories(vehicle_id: int, period: str = "",
                                  include_fuel: bool = True, caller: str = AUTH):
    """Cost breakdown by category as a pie-chart dict."""
    v = get_vehicle(vehicle_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return stats.build_cost_categories(v, period=period, include_fuel=include_fuel)


# ---------------------------------------------------------------------------
# Per‑vehicle chart endpoints
# ---------------------------------------------------------------------------

@app.get("/vehicles/{vehicle_id}/consumption-chart")
async def vehicle_consumption_chart(vehicle_id: int, months: int = 12,
                                     start_date: str | None = None,
                                     end_date: str | None = None,
                                     caller: str = AUTH):
    v = get_vehicle(vehicle_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return charts.build_consumption_chart(v, months, start_date, end_date)


@app.get("/vehicles/{vehicle_id}/distance-chart")
async def vehicle_distance_chart(vehicle_id: int, months: int = 12,
                                  start_date: str | None = None,
                                  end_date: str | None = None,
                                  caller: str = AUTH):
    v = get_vehicle(vehicle_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return charts.build_distance_chart(v, months, start_date, end_date)


@app.get("/vehicles/{vehicle_id}/cost-per-km-chart")
async def vehicle_cost_per_km_chart(vehicle_id: int, months: int = 12,
                                     start_date: str | None = None,
                                     end_date: str | None = None,
                                     caller: str = AUTH):
    v = get_vehicle(vehicle_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return charts.build_cost_per_km_chart(v, months, start_date, end_date)


@app.get("/vehicles/{vehicle_id}/monthly-cost-chart")
async def vehicle_monthly_cost_chart(vehicle_id: int, months: int = 12,
                                      start_date: str | None = None,
                                      end_date: str | None = None,
                                      caller: str = AUTH):
    v = get_vehicle(vehicle_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return charts.build_monthly_cost_chart(v, months, start_date, end_date)


@app.get("/vehicles/{vehicle_id}/mileage-chart")
async def vehicle_mileage_chart(vehicle_id: int,
                                 start_date: str | None = None,
                                 end_date: str | None = None,
                                 caller: str = AUTH):
    v = get_vehicle(vehicle_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return charts.build_mileage_chart(v, start_date, end_date)


# ---------------------------------------------------------------------------
# Fuelio Import
# ---------------------------------------------------------------------------

@app.post("/import/fuelio", response_model=FuelioImportResult)
async def import_fuelio(file: UploadFile = File(...), caller: str = AUTH):
    """Import a Fuelio sync CSV. Multipart file upload.
    Parses Vehicle, Log, and Costs sections. Returns counts."""
    raw = await file.read()
    try:
        vehicle_data, log_entries, cost_entries = parse_csv(raw)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Upsert the vehicle first to get a real vehicle_id
    vehicle_id = upsert_vehicle(vehicle_data)

    # Assign vehicle_id to log/cost entries
    for e in log_entries:
        e["vehicle_id"] = vehicle_id
    for e in cost_entries:
        e["vehicle_id"] = vehicle_id

    fuel_inserted, fuel_skipped = (0, 0)
    cost_inserted, cost_skipped = (0, 0)

    if log_entries:
        fuel_inserted, fuel_skipped = insert_vehicle_log_entries(log_entries)

    if cost_entries:
        cost_inserted, cost_skipped = insert_vehicle_log_entries(cost_entries)
        reminder_fields = derive_vehicle_reminder_fields(cost_entries)
        if reminder_fields:
            patch_vehicle(vehicle_id, reminder_fields)

    return FuelioImportResult(
        vehicle_name=vehicle_data.get("name", "Unknown"),
        fuel_entries=fuel_inserted,
        fuel_skipped=fuel_skipped,
        cost_entries=cost_inserted,
        cost_skipped=cost_skipped,
    )
