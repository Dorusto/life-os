"""
Pydantic models for the vehicle-manager REST API.
"""
from pydantic import BaseModel, Field
from typing import Any


class VehicleUpsertRequest(BaseModel):
    name: str = "Unknown Vehicle"
    make: str = ""
    model: str = ""
    year: int | None = None
    plate: str = ""
    tank_capacity: float | None = None
    fuel_type: str = "petrol"
    active: int = 1
    vehicle_type: str = "car"


class VehiclePatchRequest(BaseModel):
    vehicle_type: str | None = None
    apk_due: str | None = None
    insurance_due: str | None = None
    service_interval_km: int | None = None
    service_interval_months: int | None = None
    last_service_km: float | None = None
    last_service_date: str | None = None


class VehicleLogEntry(BaseModel):
    vehicle_id: int | None = None  # filled from path if not provided
    date: str = ""
    odo_km: float | None = None
    entry_type: str = "fuel"
    fuel_liters: float | None = None
    fuel_price_per_liter: float | None = None
    fuel_full_tank: int = 0
    fuel_missed: int = 0
    cost_total: float | None = None
    cost_currency: str = "EUR"
    remind_odo: float | None = None
    remind_date: str | None = None
    repeat_odo: float | None = None
    repeat_months: int | None = None
    location: str | None = None
    notes: str | None = None
    source: str = "fuelio_import"
    fuelio_unique_id: str | None = None
    financial_id: str | None = None
    fuel_grade: str | None = None


class LogInsertResult(BaseModel):
    inserted: int
    skipped: int


class VehicleUpsertResult(BaseModel):
    id: int


class DeleteResult(BaseModel):
    deleted: bool


class FuelioImportResult(BaseModel):
    vehicle_name: str
    fuel_entries: int
    fuel_skipped: int
    cost_entries: int
    cost_skipped: int


class HealthResponse(BaseModel):
    status: str
