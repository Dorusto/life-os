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

    action = action_store.get(action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found or already completed")

    client = get_provider()
    errors: list[str] = []
    try:
        if action["action"] == "merge_duplicate":
            payee_id = None
            category_id = None
            if override.duplicate_payee:
                try:
                    payee_id = await client.get_or_create_payee_id(override.duplicate_payee)
                except Exception as e:
                    logger.warning("Failed to resolve payee for duplicate merge: %s", e)
            if override.duplicate_category_name:
                cats = await client.get_categories()
                cat_obj = next((c for c in cats if c.name == override.duplicate_category_name), None)
                if cat_obj:
                    category_id = cat_obj.id
                else:
                    logger.warning("Category '%s' not found for duplicate merge", override.duplicate_category_name)
            merged = await client.merge_duplicate_transaction(
                action["manual_id"],
                action["synced_id"],
                payee_id=payee_id,
                category_id=category_id,
                notes=override.duplicate_notes or None,
            )
            if not merged:
                raise HTTPException(
                    status_code=404,
                    detail="One side of the duplicate pair is missing — it may already have been merged."
                )
            message = "Merged duplicate — kept the bank-synced transaction, removed the manual entry."
        elif action["action"] == "resolve_transfer_duplicate":
            payee_id = None
            category_id = None
            date_int = None
            if override.duplicate_payee:
                try:
                    payee_id = await client.get_or_create_payee_id(override.duplicate_payee)
                except Exception as e:
                    logger.warning("Failed to resolve payee for transfer duplicate: %s", e)
            if override.duplicate_category_name:
                cats = await client.get_categories()
                cat_obj = next((c for c in cats if c.name == override.duplicate_category_name), None)
                if cat_obj:
                    category_id = cat_obj.id
                else:
                    logger.warning("Category '%s' not found for transfer duplicate", override.duplicate_category_name)
            if override.duplicate_date:
                from datetime import datetime as _dt
                try:
                    dt = _dt.strptime(override.duplicate_date, "%Y-%m-%d")
                    date_int = dt.year * 10000 + dt.month * 100 + dt.day
                except ValueError as e:
                    logger.warning("Invalid date '%s' for transfer duplicate: %s", override.duplicate_date, e)

            result = await client.resolve_transfer_duplicate(
                action["transfer_leg_id"],
                action["synced_dup_id"],
                payee_id=payee_id,
                category_id=category_id,
                notes=override.duplicate_notes or None,
                date=date_int,
            )
            if not result.get("success"):
                raise HTTPException(
                    status_code=404,
                    detail="One side of the transfer duplicate is missing — it may already have been resolved."
                )
            message = (
                f"Transfer to/from {result['account_name']} was already recorded — removed the duplicate "
                f"bank-sync entry, kept the linked transfer. {result['account_name']} balance: "
                f"€{result['balance_before']:.2f} → €{result['balance_after']:.2f}."
            )
        elif action["action"] == "mark_reconciled":
            count = await client.mark_account_reconciled(action["account_id"])
            message = f"Marked {count} transaction(s) reconciled for '{action['account_name']}'."
        elif action["action"] == "mark_budget_outlier":
            # Local import: `set_fire_model` below also locally imports MemoryDB/
            # settings, which makes both names local to this whole function per
            # Python's scoping rules — referencing the module-level import here
            # instead raises UnboundLocalError. Found live: confirm returned a
            # 500 with exactly that error.
            from backend.core.config import settings as _settings
            from backend.core.memory.database import MemoryDB as _MemoryDB

            await client.add_transaction_tag(action["outlier_transaction_id"], "#one-off")
            # Unlike mark_reconciled/categorize_with_rule, tagging doesn't change
            # any of the conditions list_budget_realism_flags() checks (budgeted,
            # actual, outlier ratio) — without an explicit dismiss here, the same
            # transaction would flag again on every future fetch even after being
            # tagged. Found live: the confirmed card didn't disappear, just grew
            # "#one-off" in its notes.
            _MemoryDB(_settings.memory.db_path).dismiss_finding(
                "budget_outlier", action["outlier_transaction_id"]
            )
            message = (
                f"Tagged {action['category_name']}'s €{action['outlier_amount']:.2f} transaction "
                f"as #one-off — it won't count toward future averages."
            )
        elif action["action"] == "create_schedule":
            # Local imports: another branch in this same function already imports
            # MemoryDB/settings, making those names local to the whole function.
            # Reference the aliased names here to avoid UnboundLocalError.
            from backend.core.config import settings as _settings
            from backend.core.memory.database import MemoryDB as _MemoryDB

            name = override.schedule_name or action["payee_name"]
            amount = override.amount if override.amount is not None else action["avg_amount"]
            day_of_month = override.day_of_month or action["suggested_day_of_month"]
            await client.create_schedule(
                name=name,
                amount=abs(amount),
                day_of_month=day_of_month,
                account_id=action["account_id"],
                is_income=action["is_income"],
            )
            # Creating the schedule only affects future transactions — it does
            # not retroactively link the old transactions that triggered the
            # finding, so without this explicit dismiss the same group would
            # flag again on the next fetch.
            _MemoryDB(_settings.memory.db_path).dismiss_finding(
                "recurring_candidate",
                f"{action['payee_id']}:{action['account_id']}",
            )
            message = f"Schedule created: {name} — €{abs(amount):.2f}/month on day {day_of_month}."
        elif action["action"] == "deactivate_schedule":
            await client.set_schedule_active(action["schedule_id"], active=False)
            message = (
                f"Deactivated schedule: {action['schedule_name']} "
                f"(overdue {action['days_overdue']} days)."
            )
        else:
            raise HTTPException(status_code=400, detail=f"Unknown action: {action['action']}")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Failed to confirm category action %s: %s", action_id, e)
        raise HTTPException(status_code=500, detail="Failed to execute category action")

    action_store.delete(action_id)

    return {"message": message, "errors": errors}


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
