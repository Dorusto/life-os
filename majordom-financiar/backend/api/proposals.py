"""
Proposal endpoints — confirm or cancel a pending transaction proposal.

POST /api/proposals/{id}/confirm  → add transaction to Actual Budget
POST /api/proposals/{id}/cancel   → discard proposal
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.tools import proposals as proposal_store
from backend.tools.finance.actual_budget import add_transaction as _add_transaction

logger = logging.getLogger(__name__)
router = APIRouter()


class ConfirmRequest(BaseModel):
    category_name: str | None = None
    account_id: str | None = None


class ConfirmResult(BaseModel):
    success: bool
    message: str


@router.post("/proposals/{proposal_id}/confirm", response_model=ConfirmResult)
async def confirm_proposal(
    proposal_id: str,
    body: ConfirmRequest = ConfirmRequest(),
    current_user: str = Depends(get_current_user),
):
    proposal = proposal_store.get(proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found or already confirmed")

    category_name = body.category_name or proposal["category_name"]
    account_id = body.account_id or proposal["account_id"]

    try:
        result = await _add_transaction(
            payee=proposal["payee"],
            amount=proposal["amount"],
            date=proposal["date"],
            category_name=category_name,
            account_id=account_id,
            notes=proposal.get("notes", ""),
            is_expense=proposal.get("is_expense", True),
        )
    except Exception as e:
        logger.error("Failed to confirm proposal %s: %s", proposal_id, e)
        raise HTTPException(status_code=500, detail="Failed to add transaction")
    finally:
        proposal_store.delete(proposal_id)

    duplicate = "already exists" in result
    return ConfirmResult(success=True, message=result)


@router.post("/proposals/{proposal_id}/cancel")
async def cancel_proposal(
    proposal_id: str,
    current_user: str = Depends(get_current_user),
):
    proposal_store.delete(proposal_id)
    return {"cancelled": True}
