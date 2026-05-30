"""
Income source endpoints.

POST /api/income/sources — create an AB category + save SmartCategorizer mapping
for an unknown income payee discovered during CSV import, or mark a payee as an
internal transfer between accounts.

Flow:
  1. CSV import detects unknown income rows (rows with !is_expense and no category).
  2. Frontend shows IncomeSourceCard for each row, asking the user to either name
     the income source or mark it as a transfer from another account.
  3. This endpoint creates the category in Actual Budget and saves the mapping
     so future CSV imports auto-categorize transactions from this payee.
"""
import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core.actual_client import ActualBudgetClient
from backend.core.config import settings
from backend.core.memory import MemoryDB, SmartCategorizer


def _get_client() -> ActualBudgetClient:
    cfg = settings.actual
    return ActualBudgetClient(url=cfg.url, password=cfg.password, sync_id=cfg.sync_id)

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CreateIncomeSourceRequest(BaseModel):
    payee: str
    type: Literal["income", "transfer"]
    income_name: str | None = None    # required when type="income"
    account_id: str | None = None     # required when type="transfer"


class CreateIncomeSourceResponse(BaseModel):
    category_name: str | None = None
    updated_count: int = 0


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.post("/income/sources", response_model=CreateIncomeSourceResponse)
async def create_income_source(
    body: CreateIncomeSourceRequest,
    current_user: str = Depends(get_current_user),
):
    """
    Create an AB category for an income source or mark a payee as a transfer.

    Income mode (type="income"):
      1. Creates a category in Actual Budget under the "Income" group.
      2. Saves the payee → category_name mapping in SQLite via SmartCategorizer.
      3. Retroactively categorizes existing uncategorized transactions with this payee.

    Transfer mode (type="transfer"):
      1. Saves the payee → __transfer__:{account_id} mapping in SQLite.
      2. Future CSV imports will auto-detect this payee as a transfer candidate.
    """
    client = _get_client()
    db = MemoryDB(db_path=settings.memory.db_path)
    categorizer = SmartCategorizer(db=db)

    if body.type == "income":
        if not body.income_name:
            raise HTTPException(status_code=422, detail="income_name required for type=income")
        await client.create_category(name=body.income_name, group_name="Income")
        categorizer.learn(body.payee.lower(), body.income_name)
        logger.info(
            "Income category created in AB: %s (group=Income) [user=%s]",
            body.income_name, current_user,
        )
        updated = await client.update_uncategorized_by_payee(body.payee, body.income_name)
        return CreateIncomeSourceResponse(category_name=body.income_name, updated_count=updated)

    else:  # type == "transfer"
        if not body.account_id:
            raise HTTPException(status_code=422, detail="account_id required for type=transfer")
        # Save mapping so future CSV imports auto-detect this payee as a transfer
        categorizer.learn(body.payee.lower(), f"__transfer__:{body.account_id}")
        logger.info(
            "Transfer mapping saved: %s → __transfer__:%s [user=%s]",
            body.payee.lower(), body.account_id, current_user,
        )
        return CreateIncomeSourceResponse(category_name=None, updated_count=0)
