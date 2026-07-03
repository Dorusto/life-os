"""
Accounts endpoints — manage bank account operations.

POST /api/accounts/transfer  → execute a transfer between two accounts in Actual Budget
"""
import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core.actual_client import ActualBudgetClient
from backend.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


class AccountListItem(BaseModel):
    id: str
    name: str
    balance: float
    off_budget: bool


class TransferRequest(BaseModel):
    from_account_id: str
    to_account_id: str
    amount: float
    date: str
    notes: str = ""
    create_account_name: str | None = None
    create_account_off_budget: bool = False


class TransferResult(BaseModel):
    message: str


def _get_client() -> ActualBudgetClient:
    return ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )


@router.get("/accounts", response_model=list[AccountListItem])
async def list_accounts(current_user: str = Depends(get_current_user)):
    """Return all (non-closed) accounts with off_budget distinction."""
    client = _get_client()
    accounts = await client.get_accounts()
    return [
        AccountListItem(id=a.id, name=a.name, balance=a.balance, off_budget=a.off_budget)
        for a in accounts
    ]


@router.post("/accounts/transfer", response_model=TransferResult)
async def transfer_money(
    body: TransferRequest,
    current_user: str = Depends(get_current_user),
):
    """Execute a transfer between two bank accounts in Actual Budget."""
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    try:
        tx_date = date.fromisoformat(body.date)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date: {body.date}")

    client = _get_client()

    to_account_id = body.to_account_id
    created_account_name: str | None = None
    if not to_account_id:
        if not body.create_account_name or not body.create_account_name.strip():
            raise HTTPException(status_code=400, detail="Destination account is required")
        try:
            created = await client.create_account(
                body.create_account_name.strip(),
                initial_balance=0.0,
                off_budget=body.create_account_off_budget,
            )
        except Exception as e:
            logger.error("Account creation failed: %s", e)
            raise HTTPException(status_code=500, detail="Failed to create account")
        to_account_id = created.id
        created_account_name = created.name

    try:
        result = await client.create_transfer(
            from_account_id=body.from_account_id,
            to_account_id=to_account_id,
            amount=body.amount,
            tx_date=tx_date,
            notes=body.notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Transfer failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to create transfer")

    message = f"Transfer of €{body.amount:.2f} completed successfully."
    if created_account_name:
        message = f"Account '{created_account_name}' created. " + message
    return TransferResult(message=message)
