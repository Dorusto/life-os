"""API endpoint for vehicle refuel proposals (text-triggered, no photo)."""

import logging

from fastapi import APIRouter, Depends, HTTPException

from backend.api.auth import get_current_user
from backend.api.receipts import FuelConfirmRequest, FuelConfirmResponse
from backend.core import pending_proposals
# Imported for its side effect: registers the "refuel" handler on the store.
from backend.services import refuel_service  # noqa: F401

logger = logging.getLogger(__name__)

router = APIRouter(redirect_slashes=False)


class VehicleProposalConfirm(FuelConfirmRequest):
    """Same fields as FuelConfirmRequest — receipt_id comes from URL path, not body."""
    receipt_id: str = ""


@router.post("/vehicle/proposals/{proposal_id}/confirm", response_model=FuelConfirmResponse)
async def confirm_vehicle_proposal(
    proposal_id: str,
    request: VehicleProposalConfirm,
    current_user: str = Depends(get_current_user),
):
    """
    Confirm a text-triggered refuel proposal.

    Thin wrapper over the shared pending-proposal store — the write logic
    (near-duplicate check, attach_to path, AB transaction, vehicle_log insert,
    stats) lives in backend/services/refuel_service.py.
    """
    try:
        result = await pending_proposals.confirm(
            proposal_id,
            overrides=request.model_dump(),
            confirmed_by=current_user,
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
        logger.error("Failed to confirm vehicle proposal %s: %s", proposal_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Could not confirm the refuel entry")

    return FuelConfirmResponse(**result)
