"""
Close-account endpoints — confirm or cancel a pending close-account proposal.

POST /api/close-account/{id}/confirm  → close account in Actual Budget
POST /api/close-account/{id}/cancel   → discard proposal
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.tools import close_account as close_store
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


class ConfirmCloseAccountRequest(BaseModel):
    destination_account_id: str | None = None


@router.post("/close-account/{proposal_id}/confirm")
async def confirm_close_account(
    proposal_id: str,
    body: ConfirmCloseAccountRequest | None = None,
    current_user: str = Depends(get_current_user),
):
    proposal = close_store.get(proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Close-account proposal not found or already confirmed")

    account_id = proposal["account_id"]
    balance = proposal["balance"]
    destination_account_id = body.destination_account_id if body else None

    if abs(balance) >= 0.01 and not destination_account_id:
        raise HTTPException(status_code=400, detail="Destination account is required to close an account with a non-zero balance")

    try:
        client = _get_client()
        if destination_account_id:
            account_name = await client.close_account_with_transfer(account_id, destination_account_id)
        else:
            account_name = await client.close_account(account_id)
    except Exception as e:
        logger.error("Failed to confirm close account %s: %s", proposal_id, e)
        raise HTTPException(status_code=500, detail="Failed to close account")
    finally:
        close_store.delete(proposal_id)

    return {"message": f"{account_name} closed."}


@router.post("/close-account/{proposal_id}/cancel")
async def cancel_close_account(
    proposal_id: str,
    current_user: str = Depends(get_current_user),
):
    close_store.delete(proposal_id)
    return {"cancelled": True}
