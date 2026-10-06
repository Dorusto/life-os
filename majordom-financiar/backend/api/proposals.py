"""
Proposal endpoints — confirm or cancel a pending transaction proposal.

POST /api/proposals/{id}/confirm  → add transaction to Actual Budget
POST /api/proposals/{id}/cancel   → discard proposal

Thin wrappers over the shared pending-proposal store — the write logic lives
in backend/services/transaction_service.py, so the PWA card and MCP run the
same code.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core import pending_proposals
# Imported for its side effect: registers the "transaction" handler on the store.
from backend.services import transaction_service  # noqa: F401

logger = logging.getLogger(__name__)
router = APIRouter()


class ConfirmRequest(BaseModel):
    category_name: str | None = None
    account_id: str | None = None
    create_rule: bool = False


class ConfirmResult(BaseModel):
    success: bool
    message: str


@router.post("/proposals/{proposal_id}/confirm", response_model=ConfirmResult)
async def confirm_proposal(
    proposal_id: str,
    body: ConfirmRequest = ConfirmRequest(),
    current_user: str = Depends(get_current_user),
):
    try:
        result = await pending_proposals.confirm(
            proposal_id,
            overrides=body.model_dump(),
            confirmed_by=current_user,
        )
    except pending_proposals.ProposalNotFound:
        raise HTTPException(status_code=404, detail="Proposal not found or already confirmed")
    except pending_proposals.ProposalForbidden:
        raise HTTPException(
            status_code=403,
            detail="Only the household member who created this proposal can confirm it",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to confirm proposal %s: %s", proposal_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to add transaction")

    return ConfirmResult(**result)


@router.post("/proposals/{proposal_id}/cancel")
async def cancel_proposal(
    proposal_id: str,
    current_user: str = Depends(get_current_user),
):
    try:
        pending_proposals.reject(proposal_id, rejected_by=current_user)
    except pending_proposals.ProposalNotFound:
        # Idempotent, as before — cancelling an unknown/expired id is a no-op.
        logger.debug("Cancel for unknown/expired proposal %s — idempotent", proposal_id)
    except pending_proposals.ProposalForbidden:
        raise HTTPException(
            status_code=403,
            detail="Only the household member who created this proposal can reject it",
        )
    return {"cancelled": True}
