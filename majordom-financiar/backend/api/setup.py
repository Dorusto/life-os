"""
First-launch setup endpoints.

GET  /api/setup/status   — returns whether setup is complete + on-budget account list
POST /api/setup/complete — marks setup complete; if path="today", adjusts account
                           balances in Actual Budget to match user-entered real values

The setup flag lives in SQLite user_preferences (key="setup_complete", value="1").
It is per-server, not per-user — both users share the same Actual Budget file, so
setup only needs to happen once.
"""
import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core.actual_client import ActualBudgetClient
from backend.core.config import settings
from backend.core.memory.database import MemoryDB

logger = logging.getLogger(__name__)
router = APIRouter()

SETUP_KEY = "setup_complete"


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class AccountBalance(BaseModel):
    account_id: str
    real_balance: float


class NewAccount(BaseModel):
    name: str
    balance: float


class SetupCompleteRequest(BaseModel):
    path: str  # "today" | "history"
    balances: list[AccountBalance] = []
    new_accounts: list[NewAccount] = []


class AccountInfo(BaseModel):
    id: str
    name: str
    balance: float


class SetupStatus(BaseModel):
    completed: bool
    accounts: list[AccountInfo]


class AdjustmentResult(BaseModel):
    account_name: str
    adjustment: float  # positive = deposit added, negative = payment added


class SetupCompleteResponse(BaseModel):
    adjustments: list[AdjustmentResult] = []


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/setup/status", response_model=SetupStatus)
async def setup_status(current_user: str = Depends(get_current_user)):
    db = MemoryDB(db_path=settings.memory.db_path)
    completed = db.get_preference(SETUP_KEY) == "1"

    client = ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )
    try:
        accounts = await client.get_accounts()
        account_list = [AccountInfo(id=a.id, name=a.name, balance=a.balance) for a in accounts]
    except Exception as e:
        logger.warning("Could not fetch accounts for setup status: %s", e)
        account_list = []

    return SetupStatus(completed=completed, accounts=account_list)


@router.post("/setup/complete", response_model=SetupCompleteResponse)
async def setup_complete(
    body: SetupCompleteRequest,
    current_user: str = Depends(get_current_user),
):
    db = MemoryDB(db_path=settings.memory.db_path)
    adjustments: list[AdjustmentResult] = []

    if body.path == "today" and (body.balances or body.new_accounts):
        client = ActualBudgetClient(
            url=settings.actual.url,
            password=settings.actual.password,
            sync_id=settings.actual.sync_id,
        )

        # Create new accounts first, then adjust their balance
        for new_acc in body.new_accounts:
            if not new_acc.name.strip():
                continue
            try:
                created = await client.create_account(new_acc.name.strip(), initial_balance=0.0)
                diff = await client.adjust_account_balance(created.id, new_acc.balance)
                if abs(diff) >= 0.01:
                    adjustments.append(AdjustmentResult(
                        account_name=created.name,
                        adjustment=round(diff, 2),
                    ))
            except Exception as e:
                logger.warning("New account creation failed for %s: %s", new_acc.name, e)

        if body.balances:
            accounts = await client.get_accounts()
            account_name_map = {a.id: a.name for a in accounts}

            for entry in body.balances:
                try:
                    diff = await client.adjust_account_balance(entry.account_id, entry.real_balance)
                    if abs(diff) >= 0.01:
                        adjustments.append(AdjustmentResult(
                            account_name=account_name_map.get(entry.account_id, entry.account_id),
                            adjustment=round(diff, 2),
                        ))
                except Exception as e:
                    logger.warning("Balance adjustment failed for %s: %s", entry.account_id, e)

    db.set_preference(SETUP_KEY, "1")
    logger.info("Setup completed by %s (path=%s, adjustments=%d)", current_user, body.path, len(adjustments))
    return SetupCompleteResponse(adjustments=adjustments)
