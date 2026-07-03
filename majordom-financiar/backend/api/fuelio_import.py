"""
Fuelio CSV import endpoint — thin proxy to vehicle-manager.

POST /api/import/fuelio
  Forwards the uploaded CSV file as multipart to vehicle-manager's /import/fuelio
  endpoint and returns the parsed result unchanged.

No local CSV parsing — vehicle-manager handles all Fuelio parsing logic.
"""
import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core.config import settings
from backend.core.vehicle_client import VehicleClient, VehicleClientError

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Response model (same shape as before)
# ---------------------------------------------------------------------------

class FuelioImportResult(BaseModel):
    vehicle_name: str
    fuel_entries: int
    fuel_skipped: int
    cost_entries: int
    cost_skipped: int


# ---------------------------------------------------------------------------
# Endpoint — thin proxy to vehicle-manager
# ---------------------------------------------------------------------------

@router.post("/import/fuelio", response_model=FuelioImportResult)
async def import_fuelio(
    file: UploadFile = File(...),
    current_user: str = Depends(get_current_user),
):
    """
    Import a Fuelio sync CSV file.

    Forwards the file as multipart to vehicle-manager's /import/fuelio endpoint,
    which parses the Vehicle, Log, and Costs sections and returns the result.

    No AB transactions are created — historical data stays in vehicle_log.
    """
    raw = await file.read()
    if len(raw) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 2MB)")

    client = VehicleClient(base_url=settings.vehicle_manager.url)
    try:
        result = await client.import_fuelio(raw, file.filename or "fuelio.csv")
    except HTTPException:
        raise
    except VehicleClientError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Fuelio import failed: %s", e)
        raise HTTPException(status_code=500, detail="Fuelio import failed")

    return FuelioImportResult(**result)