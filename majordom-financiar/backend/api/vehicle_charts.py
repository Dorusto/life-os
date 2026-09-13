"""
Direct REST access to vehicle cost data for the frontend's dashboard "Vehicle
costs" widget — bypasses the chat/LLM tool-calling flow entirely.

GET /api/vehicle/costs-summary
"""
import logging

from fastapi import APIRouter, Depends

from backend.api.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/vehicle/costs-summary")
async def vehicle_costs_summary(
    period: str = "",
    current_user: str = Depends(get_current_user),
):
    from backend.tools.finance.vehicle import get_vehicle_costs_summary
    return await get_vehicle_costs_summary(period=period)
