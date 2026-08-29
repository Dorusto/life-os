"""
Accounts endpoints — manage bank account operations.

POST /api/accounts/transfer  → execute a transfer between two accounts in Actual Budget
"""
import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
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
    account_type: str | None = None


class CreateAccountRequest(BaseModel):
    name: str
    off_budget: bool = False


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


class SetAccountTypeRequest(BaseModel):
    account_type: str


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


@router.get("/accounts/balance-history")
async def get_balance_history(
    scope: str = Query(default="total"),
    days: int = Query(default=30, ge=1, le=365),
    end_date: str | None = Query(default=None),
    current_user: str = Depends(get_current_user),
):
    """Return a daily running balance series for the requested scope."""
    if scope not in ("total", "on_budget"):
        raise HTTPException(status_code=400, detail="scope must be 'total' or 'on_budget'")
    client = _get_client()
    return await client.get_balance_history(scope, days, end_date)


@router.post("/accounts", response_model=AccountListItem)
async def create_account(
    body: CreateAccountRequest,
    current_user: str = Depends(get_current_user),
):
    """Create a new account in Actual Budget — e.g. from the CSV import account selector."""
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Account name is required")
    client = _get_client()
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


@router.post("/accounts/{account_id}/type", response_model=AccountListItem)
async def set_account_type(
    account_id: str,
    body: SetAccountTypeRequest,
    current_user: str = Depends(get_current_user),
):
    """Set the account category (Cash / Investment / Vehicle / Loan / Rental) as a TYPE: tag in AB notes."""
    client = _get_client()
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
