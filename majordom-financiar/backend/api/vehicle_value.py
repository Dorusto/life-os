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


class VehicleLinkAccountRequest(BaseModel):
    ab_account_id: str


@router.get("/vehicle/list")
async def list_vehicles(current_user: str = Depends(get_current_user)):
    """Return all active vehicles from vehicle-manager."""
    client = _get_client()
    try:
        return await client.list_vehicles(active_only=True)
    except VehicleClientError as e:
        _raise_vehicle_error(e)


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


@router.post("/vehicle/{vehicle_id}/link-account")
async def link_vehicle_account(
    vehicle_id: int,
    body: VehicleLinkAccountRequest,
    current_user: str = Depends(get_current_user),
):
    """Link a vehicle to a pre-existing AB account. Talks to vehicle-manager
    only (never to Actual Budget directly) — vehicle-manager itself relays
    the tag call to majordom-api's internal router."""
    client = _get_client()
    try:
        return await client.link_account(vehicle_id, body.ab_account_id)
    except VehicleClientError as e:
        _raise_vehicle_error(e)
