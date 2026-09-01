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
from backend.core.config import settings
from backend.core.memory.database import MemoryDB
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
        elif action["action"] == "set_category_goal":
            goal_type = override.goal_type if override.goal_type is not None else action["goal_type"]
            by_month = override.by_month if override.by_month is not None else action.get("by_month", "")
            monthly_limit = override.monthly_limit if override.monthly_limit is not None else action.get("monthly_limit")
            amount = override.amount if override.amount is not None else action["amount"]
            cat_name = override.category_name or action["category_name"]
            await client.set_category_goal_template(
                cat_name, goal_type, amount, by_month, monthly_limit,
            )
            if goal_type == "by":
                target_month = by_month or "no target month"
                message = f"Goal set for '{cat_name}': save €{amount:.2f} by {target_month}."
            else:
                message = f"Goal set for '{cat_name}': €{amount:.2f}/month"
                if monthly_limit is not None:
                    message += f" until €{monthly_limit:.2f} total."
                else:
                    message += "."
        elif action["action"] == "set_tag_goal":
            # Aliased local import: `set_fire_model` below also locally imports
            # MemoryDB/settings (unaliased), which makes those names local to
            # the whole function — a bare `MemoryDB`/`settings` reference here
            # would raise UnboundLocalError since this branch runs first.
            import json as _json
            from backend.core.memory.database import MemoryDB as _MemoryDB
            from backend.core.config import settings as _settings

            tag_name = override.tag or action["tag"]
            total_amount = override.amount if override.amount is not None else action["total_amount"]
            by_month = override.by_month if override.by_month is not None else action["by_month"]
            db = _MemoryDB(_settings.memory.db_path)
            db.set_preference(
                f"tag_goal:{tag_name.lower()}",
                _json.dumps({"total_amount": total_amount, "by_month": by_month}),
            )
            message = f"Goal set for #{tag_name}: €{total_amount:.2f} by {by_month}."
        elif action["action"] == "clear_reached_goals":
            # Constrain any override to the already-verified reached-goal names
            # stored at propose time (propose_clear_reached_goals re-checks
            # each name against get_reached_goal_categories() before storing
            # them) — don't let the confirm step re-open that check to an
            # unverified name.
            valid_names = set(action["category_names"])
            names = (
                [n for n in override.selected_category_names if n in valid_names]
                if override.selected_category_names is not None
                else action["category_names"]
            )
            cleared = []
            errors = []
            for name in names:
                try:
                    await client.clear_category_goal_template(name)
                    cleared.append(name)
                except Exception as e:
                    logger.warning("Failed to clear goal template for '%s': %s", name, e)
                    errors.append(name)
            if cleared:
                message = f"Goal template cleared for: {', '.join(cleared)}."
                if errors:
                    message += f" Failed for: {', '.join(errors)}."
            else:
                message = "No categories selected." if not names else f"Failed to clear: {', '.join(errors)}."
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
        elif action["action"] == "merge_duplicate":
            merged = await client.merge_duplicate_transaction(
                action["manual_id"],
                action["synced_id"],
            )
            if not merged:
                raise HTTPException(
                    status_code=404,
                    detail="One side of the duplicate pair is missing — it may already have been merged."
                )
            message = "Merged duplicate — kept the bank-synced transaction, removed the manual entry."
        elif action["action"] == "resolve_transfer_duplicate":
            result = await client.resolve_transfer_duplicate(
                action["transfer_leg_id"],
                action["synced_dup_id"],
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
        elif action["action"] == "tag_transaction":
            tag = override.tag or action["tag"]
            await client.add_transaction_tag(action["transaction_id"], tag)
            message = f"Tagged transaction with '{tag}'."
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
    action = action_store.get(action_id)
    if action and action["action"] in ("merge_duplicate", "resolve_transfer_duplicate", "categorize_with_rule", "mark_reconciled", "mark_budget_outlier", "create_schedule"):
        if action["action"] == "merge_duplicate":
            finding_key = f"{action['manual_id']}:{action['synced_id']}"
            finding_type = "duplicate_pair"
        elif action["action"] == "resolve_transfer_duplicate":
            finding_key = f"{action['transfer_leg_id']}:{action['synced_dup_id']}"
            finding_type = "duplicate_pair"
        elif action["action"] == "mark_reconciled":
            finding_key = action.get("account_id")
            finding_type = "unreconciled_account"
        elif action["action"] == "mark_budget_outlier":
            finding_key = action.get("outlier_transaction_id")
            finding_type = "budget_outlier"
        elif action["action"] == "create_schedule":
            finding_key = f"{action.get('payee_id')}:{action.get('account_id')}"
            finding_type = "recurring_candidate"
        else:
            # payee_id is only present on categorize_with_rule actions built from
            # the uncategorized-groups Inbox endpoint — a chat-originated one
            # without it (old proposals still in flight) just skips the dismiss.
            finding_key = action.get("payee_id")
            finding_type = "uncategorized_payee"
        if finding_key:
            MemoryDB(settings.memory.db_path).dismiss_finding(finding_type, finding_key)
    action_store.delete(action_id)
    return {"cancelled": True}
