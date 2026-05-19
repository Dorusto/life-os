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


class TransferRequest(BaseModel):
    from_account_id: str
    to_account_id: str
    amount: float
    date: str
    notes: str = ""


class TransferResult(BaseModel):
    message: str


def _get_client() -> ActualBudgetClient:
    return ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )


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
    try:
        result = await client.create_transfer(
            from_account_id=body.from_account_id,
            to_account_id=body.to_account_id,
            amount=body.amount,
            tx_date=tx_date,
            notes=body.notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Transfer failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to create transfer")

    return TransferResult(message=f"Transfer of €{body.amount:.2f} completed successfully.")
