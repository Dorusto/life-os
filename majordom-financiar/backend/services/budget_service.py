"""
BudgetService — the write logic for confirmed budget proposals (set_budget,
budget_copy, budget_rebalance, set_budget_carryover).

Moved out of the FastAPI handler in backend/api/category_actions.py so the same
code runs whether the confirmation came from the PWA card, a plain HTTP call, or
an MCP tool. Registered as the "set_budget", "budget_copy", "budget_rebalance"
and "set_budget_carryover" handlers on the shared pending-proposal store at
import time.
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


async def confirm_budget_rebalance(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed budget_rebalance proposal.

    `overrides` (the PWA card's edited source/destination/amount) win over
    `payload` (what propose_budget_rebalance stored). The new allocations are
    computed here from the month's real allocation — never sent by the client.

    Returns {"message": <result text>, "errors": []}.
    """
    source_category = overrides.get("source_category") or payload["source_category"]
    destination_category = overrides.get("destination_category") or payload["destination_category"]
    amount = (
        overrides["amount"] if overrides.get("amount") is not None
        else payload["amount"]
    )

    if amount <= 0:
        raise ValueError("Amount must be positive")

    month_str = payload["month"]
    year, mth = int(month_str[:4]), int(month_str[5:7])
    target_month = _date(year, mth, 1)

    provider = get_provider()
    budget_status = await provider.get_budget_status(
        month=target_month.month, year=target_month.year
    )

    def _resolve(name: str) -> str:
        for item in budget_status:
            if item["category_name"].lower() == name.lower():
                return item["category_name"]
        raise ValueError(f"Category not found: {name}")

    source_category = _resolve(source_category)
    destination_category = _resolve(destination_category)

    if source_category == destination_category:
        raise ValueError("Source and destination are the same category")

    allocated = {item["category_name"]: item["allocated"] for item in budget_status}
    new_source = round(allocated[source_category] - amount, 2)
    new_destination = round(allocated[destination_category] + amount, 2)

    await provider.set_budget_amount(
        category_name=source_category, new_amount=new_source, month=target_month
    )
    await provider.set_budget_amount(
        category_name=destination_category, new_amount=new_destination, month=target_month
    )

    return {
        "message": (
            f"Moved €{amount:.2f} from {source_category} to {destination_category}. "
            f"New allocations: {source_category} €{new_source:.2f}, "
            f"{destination_category} €{new_destination:.2f}."
        ),
        "errors": [],
    }


async def confirm_set_budget_carryover(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed set_budget_carryover proposal.

    `overrides` (the PWA card's edited fields) win over `payload` (what
    propose_set_budget_carryover stored). The category is only replaced when it
    is not None — never on truthiness.

    Returns {"message": <result text>, "errors": []}.
    """
    category_name = (
        overrides["category_name"] if overrides.get("category_name") is not None
        else payload["category_name"]
    )
    month_str = payload["month"]
    target_month = _date.fromisoformat(month_str)
    enabled = payload["enabled"]

    await get_provider().set_budget_carryover(category_name, target_month, enabled)
    message = (
        f"Rollover overspending {'enabled' if enabled else 'disabled'} "
        f"for '{category_name}' ({month_str[:7]})."
    )
    return {"message": message, "errors": []}


pending_proposals.register_handler("set_budget", confirm_set_budget)
pending_proposals.register_handler("budget_copy", confirm_budget_copy)
pending_proposals.register_handler("budget_rebalance", confirm_budget_rebalance)
pending_proposals.register_handler("set_budget_carryover", confirm_set_budget_carryover)
