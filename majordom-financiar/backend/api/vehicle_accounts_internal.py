"""
Internal-only sync endpoint — vehicle-manager writes each vehicle's current
value into a mirroring Actual Budget off-budget account here.

Deliberately mounted WITHOUT the "/api" prefix (see backend/main.py) and with
no auth dependency: majordom-web's nginx only proxies "/api/*" to
majordom-api (see frontend/nginx.conf), so this router is unreachable from
outside the internal Docker network — only another container on
majordom-net (vehicle-manager) can reach it, at
http://majordom-api:8000/internal/vehicle-accounts/sync. Never add an "/api"
prefix here and never call this from the browser-facing frontend.
"""
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.core.actual_client import ActualBudgetClient
from backend.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


def _get_client() -> ActualBudgetClient:
    return ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )


class VehicleAccountSyncRequest(BaseModel):
    name: str
    current_value: float
    ab_account_id: str | None = None


class VehicleAccountSyncResult(BaseModel):
    ab_account_id: str


@router.post("/vehicle-accounts/sync", response_model=VehicleAccountSyncResult)
async def sync_vehicle_account(body: VehicleAccountSyncRequest):
    """
    Create-or-update the off-budget AB account mirroring one vehicle.

    ab_account_id=None → create a new off-budget account (initial balance =
    current_value), tag it TYPE: Vehicle, return the new id for vehicle-manager
    to store. ab_account_id set → rename (if needed) + adjust the balance to
    current_value on the existing account.
    """
    client = _get_client()
    try:
        if body.ab_account_id is None:
            account = await client.create_account(
                name=body.name, initial_balance=body.current_value, off_budget=True,
            )
            await client.set_account_type(account.id, "Vehicle")
            return VehicleAccountSyncResult(ab_account_id=account.id)

        await client.rename_account(body.ab_account_id, body.name)
        await client.adjust_account_balance(body.ab_account_id, body.current_value)
        return VehicleAccountSyncResult(ab_account_id=body.ab_account_id)
    except ValueError as e:
        # ab_account_id pointing at a since-deleted AB account — vehicle-manager
        # should fall back to creating a new one rather than treating this as fatal.
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Vehicle account sync failed for %r: %s", body.name, e, exc_info=True)
        raise HTTPException(status_code=502, detail="Actual Budget sync failed")
