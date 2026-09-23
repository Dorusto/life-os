"""
Direct REST access to investment-manager's health for the frontend's Settings →
Connections list — bypasses the chat/LLM tool-calling flow entirely.

GET /api/investment/status
"""
import logging

from fastapi import APIRouter, Depends

from backend.api.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/investment/status")
async def investment_status(
    current_user: str = Depends(get_current_user),
):
    # Imported inside the handler like the vehicle costs-summary proxy does, so
    # this module stays import-light and free of import cycles at startup.
    from backend.core.investment_client.client import InvestmentClient
    return {"available": await InvestmentClient().health()}
