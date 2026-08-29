"""
Direct REST endpoints for vehicle value tracking.

Authenticated user-facing API. Talks to vehicle-manager via VehicleClient;
any Actual Budget interaction is vehicle-manager's responsibility through
majordom_client.py, never this module.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core.config import settings
from backend.core.vehicle_client import VehicleClient, VehicleClientError

logger = logging.getLogger(__name__)
router = APIRouter()


def _get_client() -> VehicleClient:
    return VehicleClient(base_url=settings.vehicle_manager.url)


def _raise_vehicle_error(e: VehicleClientError) -> None:
    raise HTTPException(status_code=502, detail=str(e))


class VehicleCreateRequest(BaseModel):
    name: str = "Unknown Vehicle"
    make: str = ""
    model: str = ""
    year: int | None = None
    plate: str = ""
    tank_capacity: float | None = None
    fuel_type: str = "petrol"
    active: int = 1
    vehicle_type: str = "car"
    purchase_price: float | None = None
    purchase_date: str | None = None
    vehicle_class: str | None = None
    annual_depreciation_pct: float | None = None
    salvage_floor_pct: float | None = None
    manual_mileage: float | None = None


class VehiclePatchRequest(BaseModel):
    name: str | None = None
    vehicle_type: str | None = None
    apk_due: str | None = None
    insurance_due: str | None = None
    service_interval_km: int | None = None
    service_interval_months: int | None = None
    last_service_km: float | None = None
    last_service_date: str | None = None
    active: int | None = None
    apk_required: bool | None = None
    purchase_price: float | None = None
    purchase_date: str | None = None
    vehicle_class: str | None = None
    annual_depreciation_pct: float | None = None
    salvage_floor_pct: float | None = None
    manual_mileage: float | None = None


class VehicleValueOverrideRequest(BaseModel):
    mode: str
    value: float
    direction: str | None = None
    date: str
    note: str | None = None


@router.get("/vehicle/list")
async def list_vehicles(current_user: str = Depends(get_current_user)):
    """Return all active vehicles from vehicle-manager."""
    client = _get_client()
    try:
        return await client.list_vehicles(active_only=True)
    except VehicleClientError as e:
        _raise_vehicle_error(e)


@router.get("/vehicle/{vehicle_id}")
async def get_vehicle(vehicle_id: int, current_user: str = Depends(get_current_user)):
    """Return one vehicle by id."""
    client = _get_client()
    try:
        vehicle = await client.get_vehicle(vehicle_id)
    except VehicleClientError as e:
        _raise_vehicle_error(e)

    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle


@router.post("/vehicle")
async def create_vehicle(
    body: VehicleCreateRequest,
    current_user: str = Depends(get_current_user),
):
    """Create or upsert a vehicle in vehicle-manager."""
    client = _get_client()
    try:
        vehicle_id = await client.upsert_vehicle(body.model_dump())
    except VehicleClientError as e:
        _raise_vehicle_error(e)
    return {"id": vehicle_id}


@router.patch("/vehicle/{vehicle_id}")
async def patch_vehicle(
    vehicle_id: int,
    body: VehiclePatchRequest,
    current_user: str = Depends(get_current_user),
):
    """Patch a vehicle in vehicle-manager."""
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No valid fields provided")

    client = _get_client()
    try:
        found = await client.patch_vehicle(vehicle_id, **fields)
    except VehicleClientError as e:
        _raise_vehicle_error(e)

    if not found:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    try:
        return await client.get_vehicle(vehicle_id)
    except VehicleClientError as e:
        _raise_vehicle_error(e)


@router.post("/vehicle/{vehicle_id}/value-override")
async def create_value_override(
    vehicle_id: int,
    body: VehicleValueOverrideRequest,
    current_user: str = Depends(get_current_user),
):
    """Create a manual value override in vehicle-manager."""
    client = _get_client()
    try:
        result = await client.create_value_override(
            vehicle_id=vehicle_id,
            mode=body.mode,
            value=body.value,
            direction=body.direction,
            date=body.date,
            note=body.note,
        )
    except VehicleClientError as e:
        _raise_vehicle_error(e)

    return result or {"vehicle_id": vehicle_id}


@router.get("/vehicle/{vehicle_id}/value-history")
async def get_value_history(
    vehicle_id: int,
    current_user: str = Depends(get_current_user),
):
    """Return the value override history for a vehicle."""
    client = _get_client()
    try:
        return await client.get_value_history(vehicle_id)
    except VehicleClientError as e:
        _raise_vehicle_error(e)


@router.get("/vehicle/{vehicle_id}/value-projection")
async def get_value_projection(
    vehicle_id: int,
    years: int = 12,
    current_user: str = Depends(get_current_user),
):
    """Return a value projection curve from vehicle-manager."""
    client = _get_client()
    try:
        result = await client.get_value_projection(vehicle_id, years)
    except VehicleClientError as e:
        _raise_vehicle_error(e)

    if result is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return result
