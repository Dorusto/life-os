"""
Direct REST access to vehicle chart data, for the frontend's in-card period
switcher — bypasses the chat/LLM tool-calling flow entirely, since changing a
chart's time period is a deterministic parameter change, not something that
needs an LLM round-trip.

GET /api/vehicle/consumption-chart
GET /api/vehicle/distance-chart
"""
import json
import logging

from fastapi import APIRouter, Depends

from backend.api.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/vehicle/consumption-chart")
async def vehicle_consumption_chart(
    vehicle_name: str = "",
    months: int = 12,
    start_date: str | None = None,
    end_date: str | None = None,
    current_user: str = Depends(get_current_user),
):
    from backend.tools.finance.vehicle import get_vehicle_consumption_chart

    result = await get_vehicle_consumption_chart(
        vehicle_name=vehicle_name, months=months, start_date=start_date, end_date=end_date
    )
    return json.loads(result)


@router.get("/vehicle/distance-chart")
async def vehicle_distance_chart(
    vehicle_name: str = "",
    months: int = 12,
    start_date: str | None = None,
    end_date: str | None = None,
    current_user: str = Depends(get_current_user),
):
    from backend.tools.finance.vehicle import get_vehicle_distance_chart

    result = await get_vehicle_distance_chart(
        vehicle_name=vehicle_name, months=months, start_date=start_date, end_date=end_date
    )
    return json.loads(result)
