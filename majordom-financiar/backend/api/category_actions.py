"""
Category action endpoints — confirm or cancel a pending rename/delete proposal.

POST /api/category-actions/{id}/confirm
POST /api/category-actions/{id}/cancel
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.tools import category_actions as action_store
from backend.core.finance.provider import get_provider

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
    category_amounts: dict[str, float] | None = None  # budget_copy: category_id -> edited amount
    # FIRE model overrides
    years_to_transition: float | None = None
    years_in_retirement: float | None = None
    monthly_contribution: float | None = None
    accumulation_return: float | None = None
    decumulation_return: float | None = None
    desired_monthly_spend: float | None = None


@router.post("/category-actions/{action_id}/confirm")
async def confirm_category_action(
    action_id: str,
    override: GoalOverride = GoalOverride(),
    current_user: str = Depends(get_current_user),
):
    action = action_store.get(action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found or already completed")

    client = get_provider()
    try:
        if action["action"] == "rename":
            await client.rename_category(action["category_name"], action["new_name"])
            message = f"Category renamed: '{action['category_name']}' → '{action['new_name']}'"
        elif action["action"] == "delete":
            await client.delete_category(action["category_name"])
            message = f"Category deleted: '{action['category_name']}'"
        elif action["action"] == "create":
            cat_name = override.category_name or action["category_name"]
            grp_name = override.group_name or action["group_name"]
            await client.create_category(cat_name, grp_name)
            message = f"Category created: '{cat_name}' in group '{grp_name}'"
        elif action["action"] == "set_goal":
            from backend.tools.finance.actual_budget import calc_monthly_needed

            target = override.target if override.target is not None else action["target"]
            deadline = override.deadline if override.deadline is not None else action.get("deadline")
            note = override.note if override.note is not None else action.get("note")
            await client.set_account_goal(
                account_name=action["account_name"],
                target=target,
                deadline=deadline,
                goal_note=note,
            )
            message = f"Goal set: {action['account_name']} → €{target:,.0f}"
            if deadline:
                message += f" by {deadline}"
            accounts = await client.get_accounts()
            balance = next((a.balance for a in accounts if a.name == action["account_name"]), 0.0)
            monthly_needed = calc_monthly_needed(target, balance, deadline)
            return {"message": message, "monthly_needed": monthly_needed}
        elif action["action"] == "set_budget":
            from datetime import date as _date
            new_amount = override.amount if override.amount is not None else action["new_amount"]
            month_str = action.get("month")
            month = _date.fromisoformat(month_str).replace(day=1) if month_str else None
            result = await client.set_budget_amount(
                category_name=action["category_name"],
                new_amount=new_amount,
                month=month,
            )
            message = (
                f"Budget updated: {result['category_name']} "
                f"€{result['old_amount']:.2f} → €{result['new_amount']:.2f}"
            )
        elif action["action"] == "categorize_with_rule":
            payee = override.payee or action["payee"]
            # Resolve category_id from override name if user changed it
            cat_id = action["category_id"]
            cat_name = action["category_name"]
            if override.category_name and override.category_name != action["category_name"]:
                id_by_name = {v: k for k, v in action.get("categories_map", {}).items()}
                cat_id = id_by_name.get(override.category_name, cat_id)
                cat_name = override.category_name
            count = await client.update_uncategorized_by_payee(
                payee=payee,
                category_id=cat_id,
                notes_contains=action.get("notes_contains", ""),
            )
            # Decide whether to create rule
            should_create_rule = override.create_rule
            if should_create_rule is None:
                # Default: create rule if consistent
                should_create_rule = action.get("is_consistent", False)
            rule_created = False
            if should_create_rule:
                rule_prefix = action.get("rule_prefix", payee)
                await client.create_payee_rule(
                    payee_name_prefix=rule_prefix,
                    category_id=cat_id,
                )
                rule_created = True
                logger.info(
                    "AB rule created: '%s' → category '%s'",
                    rule_prefix, cat_name,
                )
            message = (
                f"Categorized {count} transaction(s) for '{payee}' → '{cat_name}'."
                + (
                    f" AB rule created: future '{action.get('rule_prefix', payee)}' transactions will auto-categorize."
                    if rule_created
                    else " No rule created — payee history is inconsistent (same payee was categorized differently before)."
                )
            )
        elif action["action"] == "budget_copy":
            from datetime import date as _date
            target_month_str = action["target_month"]
            year, mth = int(target_month_str[:4]), int(target_month_str[5:7])
            target_month = _date(year, mth, 1)
            overrides = override.category_amounts or {}
            updated = 0
            for cat in action["categories"]:
                final_amount = overrides.get(cat["category_id"], cat["amount"])
                await client.set_budget_amount(
                    category_name=cat["category_name"],
                    new_amount=final_amount,
                    month=target_month,
                )
                updated += 1
            message = f"Budget copied to {target_month_str} — {updated} categories set."
        elif action["action"] == "set_budget_carryover":
            from datetime import date as _date
            cat_name = override.category_name or action["category_name"]
            enabled = action["enabled"]
            month_str = action["month"]
            target_month = _date.fromisoformat(month_str)
            await client.set_budget_carryover(cat_name, target_month, enabled)
            message = f"Rollover overspending {'enabled' if enabled else 'disabled'} for '{cat_name}' ({month_str[:7]})."
        elif action["action"] == "bank_resync":
            acc_name = action["account_name"]
            count = await client.run_bank_resync(acc_name)
            message = f"Resynced '{acc_name}' — {count} new transaction{'s' if count != 1 else ''} imported."
        elif action["action"] == "set_fire_model":
            import json
            from backend.core.config import settings
            from backend.core.memory.database import MemoryDB

            # Merge override values onto the proposed "new" values
            merged = dict(action["new"])
            if override.years_to_transition is not None:
                merged["years_to_transition"] = override.years_to_transition
            if override.years_in_retirement is not None:
                merged["years_in_retirement"] = override.years_in_retirement
            if override.monthly_contribution is not None:
                merged["monthly_contribution"] = override.monthly_contribution
            if override.accumulation_return is not None:
                merged["accumulation_return"] = override.accumulation_return
            if override.decumulation_return is not None:
                merged["decumulation_return"] = override.decumulation_return
            if override.desired_monthly_spend is not None:
                merged["desired_monthly_spend"] = override.desired_monthly_spend

            db = MemoryDB(settings.memory.db_path)
            db.set_preference("fire_model", json.dumps(merged))

            # Build a summary of what changed
            current = action["current"]
            changed_parts = []
            for key in ("years_to_transition", "years_in_retirement", "monthly_contribution",
                        "accumulation_return", "decumulation_return", "desired_monthly_spend"):
                old_val = current.get(key)
                new_val = merged[key]
                if old_val != new_val:
                    if key in ("accumulation_return", "decumulation_return"):
                        changed_parts.append(f"{key.replace('_', ' ')} {old_val*100:.0f}% → {new_val*100:.0f}%")
                    elif key == "desired_monthly_spend":
                        changed_parts.append(f"desired monthly spend €{old_val:.0f} → €{new_val:.0f}")
                    elif key == "monthly_contribution":
                        changed_parts.append(f"monthly contribution €{old_val:.0f} → €{new_val:.0f}")
                    elif key == "years_to_transition":
                        changed_parts.append(f"horizon {old_val:.0f}y → {new_val:.0f}y")
                    elif key == "years_in_retirement":
                        changed_parts.append(f"retirement {old_val:.0f}y → {new_val:.0f}y")

            if changed_parts:
                message = "FIRE assumptions updated: " + ", ".join(changed_parts) + "."
            else:
                message = "No changes made."
        else:
            raise HTTPException(status_code=400, detail=f"Unknown action: {action['action']}")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Failed to confirm category action %s: %s", action_id, e)
        raise HTTPException(status_code=500, detail="Failed to execute category action")
    finally:
        action_store.delete(action_id)

    return {"message": message}


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
    from backend.tools.finance.actual_budget import propose_set_category_budget

    result = await propose_set_category_budget(
        category_name="Savings",
        amount=body.amount,
        month=body.month or "",
    )
    return json.loads(result)


class CategoryOverviewApply(BaseModel):
    new_groups: list[str] = []
    renamed_groups: dict[str, str] = {}
    new_categories: list[dict] = []  # [{"name": str, "group_name": str}]
    renamed_categories: dict[str, str] = {}


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
    if created_categories:
        parts.append(f"{created_categories} categor{'ies' if created_categories != 1 else 'y'} created")
    if renamed_categories:
        parts.append(f"{renamed_categories} categor{'ies' if renamed_categories != 1 else 'y'} renamed")
    message = ", ".join(parts) if parts else "No changes made."
    return {"message": message}


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
    action_store.delete(action_id)
    return {"cancelled": True}
