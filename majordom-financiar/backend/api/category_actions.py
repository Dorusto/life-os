"""
Category action endpoints — confirm or cancel a pending category-action proposal.

Every proposal lives on the shared pending-proposal store
(backend/core/pending_proposals.py); these routes just forward to it.

POST /api/category-actions/{id}/confirm
POST /api/category-actions/{id}/cancel
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core import pending_proposals
from backend.core.finance.provider import get_provider
# Imported for its side effect: registers the "categorize_with_rule" handler
# on the shared pending-proposal store.
from backend.services import category_rule_service  # noqa: F401
# Imported for its side effect: registers the "set_budget", "budget_copy",
# "budget_rebalance" and "set_budget_carryover" handlers on the shared
# pending-proposal store.
from backend.services import budget_service  # noqa: F401
# Imported for its side effect: registers the "set_category_goal", "set_goal",
# "set_tag_goal" and "clear_reached_goals" handlers on the shared
# pending-proposal store.
from backend.services import goal_service  # noqa: F401
# Imported for its side effect: registers the "category_create",
# "category_rename" and "category_delete" handlers on the shared
# pending-proposal store.
from backend.services import category_structure_service  # noqa: F401
# Imported for its side effect: registers the "set_fire_model" handler on the
# shared pending-proposal store.
from backend.services import fire_service  # noqa: F401
# Imported for its side effect: registers the "classify_income" handler on the
# shared pending-proposal store.
from backend.services import income_classification_service  # noqa: F401
# Imported for its side effect: registers the "tag_transaction" handler on the
# shared pending-proposal store.
from backend.services import transaction_tag_service  # noqa: F401
# Imported for its side effect: registers the "bank_resync" handler on the
# shared pending-proposal store.
from backend.services import bank_sync_service  # noqa: F401
# Imported for its side effect: registers the "merge_duplicate",
# "resolve_transfer_duplicate", "mark_reconciled", "mark_budget_outlier",
# "create_schedule" and "deactivate_schedule" handlers on the shared
# pending-proposal store.
from backend.services import inbox_action_service  # noqa: F401

logger = logging.getLogger(__name__)
router = APIRouter()


class GoalOverride(BaseModel):
    target: float | None = None
    deadline: str | None = None
    note: str | None = None
    category_name: str | None = None
    group_name: str | None = None
    amount: float | None = None
    payee: str | None = None
    create_rule: bool | None = None
    rule_prefix: str | None = None  # categorize_with_rule: edited AB-rule match text (#309)
    day_of_month: int | None = None
    schedule_name: str | None = None
    category_amounts: dict[str, float] | None = None  # budget_copy: category_id -> edited amount
    selected_category_names: list[str] | None = None  # clear_reached_goals: checked category names; None = all in the stored proposal
    tag: str | None = None  # tag_transaction: edited #tag value
    # FIRE model overrides
    years_to_transition: float | None = None
    years_in_retirement: float | None = None
    monthly_contribution: float | None = None
    accumulation_return: float | None = None
    decumulation_return: float | None = None
    desired_monthly_spend: float | None = None
    goal_type: str | None = None
    by_month: str | None = None
    monthly_limit: float | None = None
    duplicate_payee: str | None = None
    duplicate_category_name: str | None = None
    duplicate_notes: str | None = None
    duplicate_date: str | None = None
    income_type: str | None = None  # classify_income: edited passive/semi-passive/active


@router.post("/category-actions/{action_id}/confirm")
async def confirm_category_action(
    action_id: str,
    override: GoalOverride = GoalOverride(),
    current_user: str = Depends(get_current_user),
):
    # Every category-action proposal lives on the shared pending-proposal store
    # and carries its own id, so MCP can confirm the same one.
    if pending_proposals.get(action_id) is None:
        raise HTTPException(status_code=404, detail="Action not found or already completed")
    try:
        return await pending_proposals.confirm(
            action_id,
            overrides=override.model_dump(exclude_none=True),
            confirmed_by=current_user,
        )
    except pending_proposals.ProposalNotFound:
        raise HTTPException(status_code=404, detail="Action not found or already completed")
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
        logger.error("Failed to confirm category action %s: %s", action_id, e)
        raise HTTPException(status_code=500, detail="Failed to execute category action")


class SavingsBudgetProposal(BaseModel):
    amount: float
    month: str | None = None


@router.post("/category-actions/propose-savings-budget")
async def propose_savings_budget(
    body: SavingsBudgetProposal,
    current_user: str = Depends(get_current_user),
):
    """Chained follow-up after a savings goal is set — reuses propose_set_category_budget
    against the "Savings" category (see #76: offer to top up the budget by monthly_needed)."""
    import json
    from backend.core.actor import set_actor
    from backend.tools.finance.actual_budget import propose_set_category_budget

    # propose_set_category_budget stores the proposal with created_by=None, so
    # the request-scoped creator must be set here (the chat endpoint sets it
    # itself; this route is called directly by the frontend).
    set_actor(current_user)
    result = json.loads(await propose_set_category_budget(
        category_name="Savings",
        amount=body.amount,
        month=body.month or "",
    ))
    # needs_input is not a card — the frontend caller (proposeSavingsBudget)
    # only knows "error" vs a card.
    if result.get("type") == "needs_input":
        return {
            "type": "error",
            "message": result.get("message", "Savings category not found."),
        }
    return result


class CategoryOverviewApply(BaseModel):
    new_groups: list[str] = []
    renamed_groups: dict[str, str] = {}
    new_categories: list[dict] = []  # [{"name": str, "group_name": str}]
    renamed_categories: dict[str, str] = {}
    deleted_groups: list[str] = []


@router.post("/category-actions/overview/apply")
async def apply_category_overview(
    body: CategoryOverviewApply,
    current_user: str = Depends(get_current_user),
):
    """Apply a batch of edits made on the category overview card — new/renamed groups and categories."""
    client = get_provider()
    created_groups = 0
    renamed_groups = 0
    created_categories = 0
    renamed_categories = 0
    deleted_groups = 0
    errors: list[str] = []

    for group_name in body.new_groups:
        try:
            await client.create_category_group(group_name)
            created_groups += 1
        except Exception as e:
            logger.warning("Failed to create category group '%s': %s", group_name, e)

    for old_name, new_name in body.renamed_groups.items():
        try:
            await client.rename_category_group(old_name, new_name)
            renamed_groups += 1
        except Exception as e:
            logger.warning("Failed to rename category group '%s' -> '%s': %s", old_name, new_name, e)

    for group_name in body.deleted_groups:
        try:
            await client.delete_category_group(group_name)
            deleted_groups += 1
        except Exception as e:
            logger.warning("Failed to delete category group '%s': %s", group_name, e)
            errors.append(str(e))

    for cat in body.new_categories:
        try:
            await client.create_category(cat["name"], cat["group_name"])
            created_categories += 1
        except Exception as e:
            logger.warning("Failed to create category '%s' in '%s': %s", cat.get("name"), cat.get("group_name"), e)

    for old_name, new_name in body.renamed_categories.items():
        try:
            await client.rename_category(old_name, new_name)
            renamed_categories += 1
        except Exception as e:
            logger.warning("Failed to rename category '%s' -> '%s': %s", old_name, new_name, e)

    parts = []
    if created_groups:
        parts.append(f"{created_groups} group{'s' if created_groups != 1 else ''} created")
    if renamed_groups:
        parts.append(f"{renamed_groups} group{'s' if renamed_groups != 1 else ''} renamed")
    if deleted_groups:
        parts.append(f"{deleted_groups} group{'s' if deleted_groups != 1 else ''} deleted")
    if created_categories:
        parts.append(f"{created_categories} categor{'ies' if created_categories != 1 else 'y'} created")
    if renamed_categories:
        parts.append(f"{renamed_categories} categor{'ies' if renamed_categories != 1 else 'y'} renamed")
    message = ", ".join(parts) if parts else "No changes made."
    if errors:
        message = f"{message} ({'; '.join(errors)})" if parts else "; ".join(errors)
    return {"message": message, "errors": errors}


class BudgetOverviewApply(BaseModel):
    month: str  # YYYY-MM
    amounts: dict[str, float] = {}          # category_name -> new budgeted amount
    carryover: dict[str, bool] = {}          # category_name -> rollover enabled


@router.post("/category-actions/budget/apply")
async def apply_budget_overview(
    body: BudgetOverviewApply,
    current_user: str = Depends(get_current_user),
):
    """Apply a batch of edits made on the budget overview card — amounts and rollover toggles."""
    from datetime import date as _date

    client = get_provider()
    year, m = int(body.month[:4]), int(body.month[5:7])
    target_month = _date(year, m, 1)

    updated_amounts = 0
    updated_carryover = 0

    for category_name, amount in body.amounts.items():
        try:
            await client.set_budget_amount(category_name=category_name, new_amount=amount, month=target_month)
            updated_amounts += 1
        except Exception as e:
            logger.warning("Failed to set budget for '%s': %s", category_name, e)

    for category_name, enabled in body.carryover.items():
        try:
            await client.set_budget_carryover(category_name, target_month, enabled)
            updated_carryover += 1
        except Exception as e:
            logger.warning("Failed to set carryover for '%s': %s", category_name, e)

    parts = []
    if updated_amounts:
        parts.append(f"{updated_amounts} categor{'ies' if updated_amounts != 1 else 'y'} budgeted")
    if updated_carryover:
        parts.append(f"rollover updated for {updated_carryover} categor{'ies' if updated_carryover != 1 else 'y'}")
    message = ", ".join(parts) if parts else "No changes made."
    return {"message": message}


@router.post("/category-actions/{action_id}/cancel")
async def cancel_category_action(
    action_id: str,
    current_user: str = Depends(get_current_user),
):
    # Every category-action proposal lives on the shared pending-proposal store —
    # reject through it so the same id works from MCP. A missing proposal is
    # treated as already cancelled (idempotent).
    if pending_proposals.get(action_id) is not None:
        try:
            await pending_proposals.reject(action_id, rejected_by=current_user)
        except pending_proposals.ProposalForbidden:
            raise HTTPException(
                status_code=403,
                detail="Only the household member who created this proposal can reject it",
            )
    return {"cancelled": True}
