"""
Generic pending-proposal routes — confirm or reject any proposal by id.

Type-agnostic: the proposal's own handler (registered in
backend/core/pending_proposals.py) does the write. Any door can use these
routes; the PWA's per-type cards keep their own endpoints.

Deliberately NOT under /proposals/... — backend/api/proposals.py already owns
/proposals/{id}/confirm for transaction proposals, and FastAPI silently
serves the first-registered duplicate.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core import pending_proposals

logger = logging.getLogger(__name__)
router = APIRouter()


class ConfirmBody(BaseModel):
    overrides: dict = {}


@router.post("/pending-proposals/{proposal_id}/confirm")
async def confirm_pending_proposal(
    proposal_id: str,
    body: ConfirmBody | None = None,
    current_user: str = Depends(get_current_user),
):
    """Confirm a pending proposal by id and execute its write."""
    overrides = body.overrides if body else {}
    try:
        return await pending_proposals.confirm(
            proposal_id, overrides=overrides, confirmed_by=current_user
        )
    except pending_proposals.ProposalNotFound:
        raise HTTPException(status_code=404, detail="Proposal not found")
    except pending_proposals.ProposalForbidden:
        raise HTTPException(
            status_code=403,
            detail="Only the household member who created this proposal can confirm it",
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to confirm proposal %s: %s", proposal_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Could not confirm the proposal")


@router.post("/pending-proposals/{proposal_id}/reject")
async def reject_pending_proposal(
    proposal_id: str,
    current_user: str = Depends(get_current_user),
):
    """Discard a pending proposal without executing it."""
    try:
        pending_proposals.reject(proposal_id, rejected_by=current_user)
    except pending_proposals.ProposalNotFound:
        raise HTTPException(status_code=404, detail="Proposal not found")
    except pending_proposals.ProposalForbidden:
        raise HTTPException(
            status_code=403,
            detail="Only the household member who created this proposal can reject it",
        )
    return {"rejected": True}
