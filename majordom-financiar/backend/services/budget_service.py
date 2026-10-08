"""
BudgetService — the write logic for confirmed budget proposals (set_budget,
budget_copy).

Moved out of the FastAPI handler in backend/api/category_actions.py so the same
code runs whether the confirmation came from the PWA card, a plain HTTP call, or
an MCP tool. Registered as the "set_budget" and "budget_copy" handlers on the
shared pending-proposal store at import time.
"""
import logging
from datetime import date as _date

from backend.core import pending_proposals
from backend.core.finance.provider import get_provider

logger = logging.getLogger(__name__)


async def confirm_set_budget(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed set_budget proposal.

    `overrides` (the PWA card's edited fields) win over `payload` (what
    propose_set_category_budget stored). An edited amount of 0 is a valid budget,
    so the amount is only replaced when it is not None — never on truthiness.

    Returns {"message": <result text>, "errors": []}.
    """
    new_amount = (
        overrides["amount"] if overrides.get("amount") is not None
        else payload["new_amount"]
    )
    month_str = payload.get("month")
    month = _date.fromisoformat(month_str).replace(day=1) if month_str else None

    result = await get_provider().set_budget_amount(
        category_name=payload["category_name"],
        new_amount=new_amount,
        month=month,
    )
    message = (
        f"Budget updated: {result['category_name']} "
        f"€{result['old_amount']:.2f} → €{result['new_amount']:.2f}"
    )
    return {"message": message, "errors": []}


async def confirm_budget_copy(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed budget_copy proposal.

    `overrides` (the PWA card's edited per-category amounts) win over `payload`
    (what propose_budget_copy stored). `category_amounts` maps category_id to
    the edited amount; a category missing from it keeps its proposed amount.

    Returns {"message": <result text>, "errors": [<failed category names>]}.
    """
    target_month_str = payload["target_month"]
    year, mth = int(target_month_str[:4]), int(target_month_str[5:7])
    target_month = _date(year, mth, 1)
    amounts = overrides.get("category_amounts") or {}
    updated = 0
    errors: list[str] = []
    for cat in payload["categories"]:
        final_amount = amounts.get(cat["category_id"], cat["amount"])
        try:
            await get_provider().set_budget_amount(
                category_name=cat["category_name"],
                new_amount=final_amount,
                month=target_month,
            )
            updated += 1
        except Exception as e:
            logger.warning("Failed to set budget for '%s': %s", cat["category_name"], e)
            errors.append(cat["category_name"])
    if errors:
        message = (
            f"Budget copied to {target_month_str} — {updated} categories set, "
            f"{len(errors)} failed: {', '.join(errors)}."
        )
    else:
        message = f"Budget copied to {target_month_str} — {updated} categories set."
    return {"message": message, "errors": errors}


pending_proposals.register_handler("set_budget", confirm_set_budget)
pending_proposals.register_handler("budget_copy", confirm_budget_copy)
