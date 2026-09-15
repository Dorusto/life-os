"""
Balance adjustment endpoints — confirm or cancel a pending balance adjustment proposal.

POST /api/balance-adjustments/{id}/confirm  → adjust account balance in Actual Budget
POST /api/balance-adjustments/{id}/cancel   → discard proposal
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.tools import balance_adjustments as adj_store
from backend.core.finance.provider import get_provider

logger = logging.getLogger(__name__)
router = APIRouter()


class ConfirmBalanceAdjustmentRequest(BaseModel):
    real_balance: float | None = None


@router.post("/balance-adjustments/{proposal_id}/confirm")
async def confirm_balance_adjustment(
    proposal_id: str,
    body: ConfirmBalanceAdjustmentRequest | None = None,
    current_user: str = Depends(get_current_user),
):
    proposal = adj_store.get(proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Balance adjustment proposal not found or already confirmed")

    account_id = proposal["account_id"]
    account_name = proposal["account_name"]
    # Card fields are editable (rule 5) — the confirm body may carry a
    # user-corrected real balance; fall back to the detected one.
    real_balance = body.real_balance if body and body.real_balance is not None else proposal["real_balance"]
    current_balance = proposal["current_balance"]

    try:
        client = get_provider()
        diff = await client.adjust_account_balance(account_id, real_balance)
    except Exception as e:
        logger.error("Failed to confirm balance adjustment %s: %s", proposal_id, e)
        raise HTTPException(status_code=500, detail="Failed to adjust account balance")

    adj_store.delete(proposal_id)

    if abs(diff) < 0.01:
        return {"message": f"{account_name} balance already correct, no adjustment needed."}

    sign = "+" if diff > 0 else ""
    return {"message": f"{account_name} balance adjusted: {sign}€{diff:.2f}"}


@router.post("/balance-adjustments/{proposal_id}/cancel")
async def cancel_balance_adjustment(
    proposal_id: str,
    current_user: str = Depends(get_current_user),
):
    adj_store.delete(proposal_id)
    return {"cancelled": True}
