"""
Accounts endpoints — manage bank account operations.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core.finance.provider import get_provider
# Side-effect imports: each registers its proposal type's confirm handler on
# the shared pending-proposal store at import time.
from backend.services import account_transfer_service  # noqa: F401
from backend.services import balance_adjustment_service  # noqa: F401
from backend.services import close_account_service  # noqa: F401

logger = logging.getLogger(__name__)
router = APIRouter()


class AccountListItem(BaseModel):
    id: str
    name: str
    balance: float
    off_budget: bool
    account_type: str | None = None


class CreateAccountRequest(BaseModel):
    name: str
    off_budget: bool = False


class SetAccountTypeRequest(BaseModel):
    account_type: str


class BalanceHistoryPoint(BaseModel):
    date: str
    balance: float


@router.get("/accounts", response_model=list[AccountListItem])
async def list_accounts(current_user: str = Depends(get_current_user)):
    """Return all (non-closed) accounts with off_budget distinction."""
    client = get_provider()
    accounts = await client.get_accounts()
    return [
        AccountListItem(
            id=a.id, name=a.name, balance=a.balance,
            off_budget=a.off_budget, account_type=a.account_type,
        )
        for a in accounts
    ]


@router.get("/accounts/balance-history", response_model=list[BalanceHistoryPoint])
async def get_balance_history(
    scope: str = Query(default="total"),
    days: int = Query(default=30, ge=1, le=365),
    end_date: str | None = Query(default=None),
    current_user: str = Depends(get_current_user),
):
    """Return a daily running balance series for the requested scope."""
    if scope not in ("total", "on_budget"):
        raise HTTPException(status_code=400, detail="scope must be 'total' or 'on_budget'")
    client = get_provider()
    return await client.get_balance_history(scope, days, end_date)


@router.post("/accounts", response_model=AccountListItem)
async def create_account(
    body: CreateAccountRequest,
    current_user: str = Depends(get_current_user),
):
    """Create a new account in Actual Budget — e.g. from the CSV import account selector."""
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Account name is required")
    client = get_provider()
    try:
        created = await client.create_account(
            body.name.strip(),
            initial_balance=0.0,
            off_budget=body.off_budget,
        )
    except Exception as e:
        logger.error("Account creation failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to create account")
    return AccountListItem(id=created.id, name=created.name, balance=created.balance, off_budget=body.off_budget)


@router.post("/accounts/{account_id}/type", response_model=AccountListItem)
async def set_account_type(
    account_id: str,
    body: SetAccountTypeRequest,
    current_user: str = Depends(get_current_user),
):
    """Set the account category (Cash / Investment / Vehicle / Loan / Rental) as a TYPE: tag in AB notes."""
    client = get_provider()
    try:
        await client.set_account_type(account_id, body.account_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    accounts = await client.get_accounts()
    account = next((a for a in accounts if str(a.id) == account_id), None)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found after update")
    return AccountListItem(
        id=str(account.id),
        name=account.name,
        balance=account.balance,
        off_budget=account.off_budget,
        account_type=account.account_type,
    )
