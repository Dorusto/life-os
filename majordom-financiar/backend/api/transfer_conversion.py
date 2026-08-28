"""
Transfer conversion endpoints — confirm or cancel a pending transaction→transfer proposal (#144).

POST /api/transfer-conversion/{id}/confirm  → convert the transaction in Actual Budget
POST /api/transfer-conversion/{id}/cancel   → discard proposal
"""
import logging
from fastapi import APIRouter, Depends, HTTPException

from backend.api.auth import get_current_user
from backend.tools import transfer_conversion as store
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


@router.post("/transfer-conversion/{proposal_id}/confirm")
async def confirm_transfer_conversion(
    proposal_id: str,
    current_user: str = Depends(get_current_user),
):
    proposal = store.get(proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Transfer conversion proposal not found or already confirmed")

    transaction_id = proposal["transaction_id"]
    target_account_id = proposal["target_account_id"]
    target_account_name = proposal["target_account_name"]

    try:
        client = _get_client()
        result = await client.convert_transaction_to_transfer(transaction_id, target_account_id)
    except Exception as e:
        logger.error("Failed to confirm transfer conversion %s: %s", proposal_id, e)
        raise HTTPException(status_code=500, detail=f"Failed to convert transaction to transfer: {e}")
    finally:
        store.delete(proposal_id)

    return {"message": f"Converted transaction into transfer → {target_account_name} (€{result['amount']:.2f})"}


@router.post("/transfer-conversion/{proposal_id}/cancel")
async def cancel_transfer_conversion(
    proposal_id: str,
    current_user: str = Depends(get_current_user),
):
    store.delete(proposal_id)
    return {"cancelled": True}
