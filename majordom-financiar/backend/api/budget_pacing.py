"""
Annual budget pacing config + status endpoints (#112).

Settings-only feature, not a chat write action — plain REST, no confirmation
card / _PROPOSAL_TOOLS involvement. See backend/core/finance/budget_pacing.py
for the shared config storage + calculation this router is a thin wrapper
around.
"""
import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core.finance import budget_pacing
from backend.core.finance.provider import get_provider

logger = logging.getLogger(__name__)
router = APIRouter()


class CategoryOption(BaseModel):
    id: str
    name: str
    group_name: str


class BudgetPacingConfig(BaseModel):
    configured: bool
    annual_income: float | None = None
    fixed_category_ids: list[str] = []
    sinking_fund_category_ids: list[str] = []
    categories: list[CategoryOption] = []


class BudgetPacingConfigRequest(BaseModel):
    annual_income: float
    fixed_category_ids: list[str]
    sinking_fund_category_ids: list[str]


class BudgetPacingStatus(BaseModel):
    configured: bool
    annual_income: float | None = None
    months_elapsed: int | None = None
    expected_by_now: float | None = None
    actual_by_now: float | None = None
    over_by: float | None = None
    on_pace: bool | None = None


@router.get("/budget-pacing/config", response_model=BudgetPacingConfig)
async def get_budget_pacing_config(current_user: str = Depends(get_current_user)):
    client = get_provider()
    cats = await client.get_categories()
    categories = [
        CategoryOption(id=c.id, name=c.name, group_name=c.group_name)
        for c in cats if c.id and not getattr(c, "is_income", False)
    ]

    config = budget_pacing.get_config()
    if config is None:
        return BudgetPacingConfig(configured=False, categories=categories)

    return BudgetPacingConfig(
        configured=True,
        annual_income=config["annual_income"],
        fixed_category_ids=config["fixed_category_ids"],
        sinking_fund_category_ids=config["sinking_fund_category_ids"],
        categories=categories,
    )


@router.post("/budget-pacing/config", response_model=BudgetPacingConfig)
async def save_budget_pacing_config(
    body: BudgetPacingConfigRequest, current_user: str = Depends(get_current_user),
):
    budget_pacing.set_config(body.annual_income, body.fixed_category_ids, body.sinking_fund_category_ids)
    return await get_budget_pacing_config(current_user)


@router.get("/budget-pacing/status", response_model=BudgetPacingStatus)
async def get_budget_pacing_status_endpoint(current_user: str = Depends(get_current_user)):
    client = get_provider()
    status = await budget_pacing.compute_pacing_status(client)
    if status is None:
        return BudgetPacingStatus(configured=False)
    return BudgetPacingStatus(**status)
