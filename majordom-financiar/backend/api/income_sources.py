"""
Income source endpoints.

POST /api/income/sources — create an AB category + an Actual Budget rule for
an unknown income payee discovered during CSV import, or mark a payee as an
internal transfer between accounts (also an AB rule) (#99).

Flow:
  1. CSV import detects unknown income rows (rows with !is_expense and no category).
  2. Frontend shows IncomeSourceCard for each row, asking the user to either name
     the income source or mark it as a transfer from another account.
  3. This endpoint creates the category in Actual Budget and a matching AB rule
     so future CSV imports auto-categorize transactions from this payee.
"""
import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core.actual_client import ActualBudgetClient
from backend.core.config import settings


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

    body.payee is used verbatim as the rule's CONTAINS-match text — the
    frontend lets the user edit it before submitting, so there's no
    server-side "smart prefix" guess to second-guess (#99).

    Income mode (type="income"):
      1. Creates a category in Actual Budget under the "Income" group.
      2. Creates an AB rule (payee → category) so future CSV imports auto-categorize.
      3. Retroactively categorizes existing uncategorized transactions with this payee.

    Transfer mode (type="transfer"):
      1. Creates an AB rule (payee → the target account's transfer payee) so future
         CSV imports auto-detect this payee as a transfer, using Actual Budget's own
         transfer mechanism — no separate Majordom-side storage needed (#99).
    """
    client = _get_client()

    # Check for an existing rule already covering this payee before creating
    # anything new — avoids duplicate rules (and duplicate categories, for
    # income mode) if the user submits the same payee twice (#99).
    existing = (await client.match_existing_rules([{"payee": body.payee, "notes": ""}]))[0]

    if body.type == "income":
        if not body.income_name:
            raise HTTPException(status_code=422, detail="income_name required for type=income")
        if existing and existing.get("category_name", "").lower() == body.income_name.lower():
            cats = await client.get_categories()
            category = next((c for c in cats if c.name.lower() == body.income_name.lower()), None)
        else:
            category = await client.create_category(name=body.income_name, group_name="Income")
            await client.create_payee_rule(
                payee_name_prefix=body.payee,
                category_id=category.id,
            )
            logger.info(
                "Income category created in AB: %s (group=Income) [user=%s]",
                body.income_name, current_user,
            )
        updated = await client.update_uncategorized_by_payee(body.payee, category.id)
        return CreateIncomeSourceResponse(category_name=body.income_name, updated_count=updated)

    else:  # type == "transfer"
        if not body.account_id:
            raise HTTPException(status_code=422, detail="account_id required for type=transfer")
        if existing and existing.get("is_transfer") and existing.get("account_id") == body.account_id:
            logger.info("Transfer rule already exists: %s → account %s — skipped", body.payee, body.account_id)
        else:
            await client.create_payee_transfer_rule(
                payee_name_prefix=body.payee,
                target_account_id=body.account_id,
            )
            logger.info(
                "Transfer rule created: %s → account %s [user=%s]",
                body.payee, body.account_id, current_user,
            )
        return CreateIncomeSourceResponse(category_name=None, updated_count=0)
