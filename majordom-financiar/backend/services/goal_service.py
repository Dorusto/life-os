"""
GoalService — the write logic for confirmed goal proposals (set_category_goal,
set_goal).

Moved out of the FastAPI handler in backend/api/category_actions.py so the same
code runs whether the confirmation came from the PWA card, a plain HTTP call, or
an MCP tool. Registered as the "set_category_goal" and "set_goal" handlers on
the shared pending-proposal store at import time.
"""
import logging

from backend.core import pending_proposals
from backend.core.finance.provider import get_provider

logger = logging.getLogger(__name__)


async def confirm_set_category_goal(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed set_category_goal proposal.

    `overrides` (the PWA card's edited fields) win over `payload` (what
    propose_set_category_goal_template stored). Each field is only replaced when
    it is not None — never on truthiness.

    Returns {"message": <result text>, "errors": []}.
    """
    goal_type = (
        overrides["goal_type"] if overrides.get("goal_type") is not None
        else payload["goal_type"]
    )
    by_month = (
        overrides["by_month"] if overrides.get("by_month") is not None
        else payload.get("by_month", "")
    )
    monthly_limit = (
        overrides["monthly_limit"] if overrides.get("monthly_limit") is not None
        else payload.get("monthly_limit")
    )
    amount = (
        overrides["amount"] if overrides.get("amount") is not None
        else payload["amount"]
    )
    category_name = (
        overrides["category_name"] if overrides.get("category_name") is not None
        else payload["category_name"]
    )

    if goal_type not in ("by", "simple"):
        raise ValueError(f"Invalid goal_type: {goal_type!r}. Must be 'by' or 'simple'.")
    if amount <= 0:
        raise ValueError("The goal amount must be positive.")

    await get_provider().set_category_goal_template(
        category_name, goal_type, amount, by_month, monthly_limit,
    )
    if goal_type == "by":
        target_month = by_month or "no target month"
        message = f"Goal set for '{category_name}': save €{amount:.2f} by {target_month}."
    else:
        message = f"Goal set for '{category_name}': €{amount:.2f}/month"
        if monthly_limit is not None:
            message += f" until €{monthly_limit:.2f} total."
        else:
            message += "."
    return {"message": message, "errors": []}


async def confirm_set_goal(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed set_goal proposal.

    `overrides` (the PWA card's edited fields) win over `payload` (what
    set_account_goal stored). Each field is only replaced when it is not None —
    never on truthiness.

    Returns {"message": <result text>, "monthly_needed": <float|None>,
    "errors": []} — the PWA GoalProposalCard reads monthly_needed from the
    confirm response.
    """
    from backend.tools.finance.actual_budget import calc_monthly_needed

    account_name = payload["account_name"]
    target = (
        overrides["target"] if overrides.get("target") is not None
        else payload["target"]
    )
    deadline = (
        overrides["deadline"] if overrides.get("deadline") is not None
        else payload.get("deadline")
    )
    note = (
        overrides["note"] if overrides.get("note") is not None
        else payload.get("note")
    )

    if target <= 0:
        raise ValueError("The goal target must be positive.")

    provider = get_provider()
    await provider.set_account_goal(
        account_name=account_name,
        target=target,
        deadline=deadline,
        goal_note=note,
    )
    message = f"Goal set: {account_name} → €{target:,.0f}"
    if deadline:
        message += f" by {deadline}"
    accounts = await provider.get_accounts()
    balance = next((a.balance for a in accounts if a.name == account_name), 0.0)
    monthly_needed = calc_monthly_needed(target, balance, deadline)
    return {"message": message, "monthly_needed": monthly_needed, "errors": []}


pending_proposals.register_handler("set_category_goal", confirm_set_category_goal)
pending_proposals.register_handler("set_goal", confirm_set_goal)
