"""
BudgetService — the write logic for a confirmed set_budget proposal.

Moved out of the FastAPI handler in backend/api/category_actions.py so the same
code runs whether the confirmation came from the PWA card, a plain HTTP call, or
an MCP tool. Registered as the "set_budget" handler on the shared pending-proposal
store at import time.
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


pending_proposals.register_handler("set_budget", confirm_set_budget)
