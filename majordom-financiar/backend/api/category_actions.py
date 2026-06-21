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
    category_name: str | None = None
    group_name: str | None = None
    amount: float | None = None
    payee: str | None = None
    create_rule: bool | None = None


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
        elif action["action"] == "setup_groups":
            created = []
            for group_name, sub_names in action["groups"]:
                try:
                    await client.create_category_group(group_name)
                except Exception:
                    pass
                for sub_name in sub_names:
                    try:
                        await client.create_category(sub_name, group_name)
                        created.append(f"{group_name} → {sub_name}")
                    except Exception:
                        pass
            message = f"Created {len(action['groups'])} groups with subcategories: {', '.join(g for g, _ in action['groups'])}"
        elif action["action"] == "create":
            cat_name = override.category_name or action["category_name"]
            grp_name = override.group_name or action["group_name"]
            await client.create_category(cat_name, grp_name)
            message = f"Category created: '{cat_name}' in group '{grp_name}'"
        elif action["action"] == "set_goal":
            target = override.target if override.target is not None else action["target"]
            deadline = override.deadline if override.deadline is not None else action.get("deadline")
            await client.set_account_goal(
                account_name=action["account_name"],
                target=target,
                deadline=deadline,
            )
            message = f"Goal set: {action['account_name']} → €{target:,.0f}"
            if deadline:
                message += f" by {deadline}"
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
        elif action["action"] == "categorize_by_payee":
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
            )
            message = (
                f"Categorized {count} transaction(s) for '{payee}' → '{cat_name}'"
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


@router.post("/category-actions/{action_id}/cancel")
async def cancel_category_action(
    action_id: str,
    current_user: str = Depends(get_current_user),
):
    action_store.delete(action_id)
    return {"cancelled": True}
