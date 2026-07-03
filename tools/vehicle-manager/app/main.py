"""
FastAPI application for the vehicle-manager service.
Provides REST API for vehicle data management, replacing the inline vehicle
logic currently in majordom-financiar/backend/.

This service lives on the internal Docker network only (no auth layer).
"""
import logging

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from app.database import (
    init_db, upsert_vehicle, get_vehicles, get_vehicle, patch_vehicle,
    insert_vehicle_log_entries, get_vehicle_log, get_log_entry,
    delete_log_entry, get_last_fuel_entry, get_vehicle_stats_data,
    get_db_path,
)
from app.models import (
    DeleteResult, FuelioImportResult, HealthResponse, LogInsertResult,
    VehicleLogEntry, VehicleUpsertRequest, VehiclePatchRequest, VehicleUpsertResult,
)
from app.fuelio_parser import parse_csv

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("vehicle-manager")

app = FastAPI(title="vehicle-manager")


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
# Health
# ---------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse)
async def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Vehicles
# ---------------------------------------------------------------------------

@app.get("/vehicles")
async def list_vehicles(active_only: bool = True):
    """List vehicles. Each object includes all profile columns plus computed last_odo."""
    return get_vehicles(active_only=active_only)


@app.get("/vehicles/{vehicle_id}")
async def get_vehicle_by_id(vehicle_id: int):
    """Single vehicle, same shape as list. 404 if not found."""
    v = get_vehicle(vehicle_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return v


@app.post("/vehicles", response_model=VehicleUpsertResult)
async def create_vehicle(body: VehicleUpsertRequest):
    """Upsert by (name, plate) case-insensitive match. Returns {id: int}."""
    vid = upsert_vehicle(body.model_dump())
    return {"id": vid}


@app.patch("/vehicles/{vehicle_id}")
async def update_vehicle(vehicle_id: int, body: VehiclePatchRequest):
    """Partial update of a vehicle. 404 if missing."""
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields provided")
    found = patch_vehicle(vehicle_id, updates)
    if not found:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return get_vehicle(vehicle_id)


# ---------------------------------------------------------------------------
# Vehicle Log
# ---------------------------------------------------------------------------

@app.get("/vehicles/{vehicle_id}/log")
async def list_vehicle_log(vehicle_id: int, limit: int = 10, entry_type: str | None = None):
    """Log entries for one vehicle, ordered by date DESC. entry_type filter optional."""
    return get_vehicle_log(vehicle_id, limit=limit, entry_type=entry_type)


@app.post("/vehicles/{vehicle_id}/log", response_model=LogInsertResult)
async def add_vehicle_log(vehicle_id: int, entries: list[VehicleLogEntry]):
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
async def get_log_entry_by_id(entry_id: int):
    """Single log entry with vehicle_name joined. 404 if missing."""
    entry = get_log_entry(entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Log entry not found")
    return entry


@app.delete("/log/{entry_id}", response_model=DeleteResult)
async def delete_log_entry_by_id(entry_id: int):
    """Delete a log entry. 404 if missing."""
    found = delete_log_entry(entry_id)
    if not found:
        raise HTTPException(status_code=404, detail="Log entry not found")
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Last Fuel Entry (fast isolated call)
# ---------------------------------------------------------------------------

@app.get("/vehicles/{vehicle_id}/last-fuel-entry")
async def last_fuel_entry(vehicle_id: int):
    """Most recent full-tank, non-missed fuel entry, or null."""
    entry = get_last_fuel_entry(vehicle_id)
    return entry if entry else JSONResponse(content=None)


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

@app.get("/vehicles/{vehicle_id}/stats")
async def vehicle_stats(vehicle_id: int, period: str = ""):
    """Computed stats: fuel stats, costs, consumption. Returns structured JSON.
    period: YYYY-MM, YYYY, or empty for all-time."""
    stats = get_vehicle_stats_data(vehicle_id, period=period)
    if not stats:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return stats


# ---------------------------------------------------------------------------
# Fuelio Import
# ---------------------------------------------------------------------------

@app.post("/import/fuelio", response_model=FuelioImportResult)
async def import_fuelio(file: UploadFile = File(...)):
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

    return FuelioImportResult(
        vehicle_name=vehicle_data.get("name", "Unknown"),
        fuel_entries=fuel_inserted,
        fuel_skipped=fuel_skipped,
        cost_entries=cost_inserted,
        cost_skipped=cost_skipped,
    )
