"""
FIRE excluded-accounts config endpoints (#299).

Settings-only feature, not a chat write action — plain REST, no confirmation
card / _PROPOSAL_TOOLS involvement. See backend/core/finance/fire.py for the
shared preference storage + validation this router is a thin wrapper around.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core.finance import fire

logger = logging.getLogger(__name__)
router = APIRouter()


class FireExcludedAccounts(BaseModel):
    terms: list[str] = []


@router.get("/fire/excluded-accounts", response_model=FireExcludedAccounts)
async def get_fire_excluded_accounts(current_user: str = Depends(get_current_user)):
    return FireExcludedAccounts(terms=fire.get_fire_exclude_terms())


@router.put("/fire/excluded-accounts", response_model=FireExcludedAccounts)
async def save_fire_excluded_accounts(
    body: FireExcludedAccounts, current_user: str = Depends(get_current_user),
):
    try:
        terms = fire.set_fire_exclude_terms(body.terms)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return FireExcludedAccounts(terms=terms)
