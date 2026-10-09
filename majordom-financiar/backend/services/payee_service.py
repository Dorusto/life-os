"""
PayeeService — the write logic for confirmed payee proposals (payee_rename,
payee_merge, payee_default_category).

Moved out of the FastAPI handler so the same code runs whether the confirmation
came from the PWA card, a plain HTTP call, or an MCP tool. Registered as the
"payee_rename", "payee_merge" and "payee_default_category" handlers on the
shared pending-proposal store at import time.
"""
import logging

from backend.core import pending_proposals
from backend.core.finance.provider import get_provider

logger = logging.getLogger(__name__)


async def build_payee_proposal(
    action: str,
    payee: dict,
    *,
    new_name: str = "",
    target: dict | None = None,
    category: dict | None = None,
) -> dict:
    """Create a pending payee proposal and return its card JSON.

    `payee`/`target` are rows from get_provider().get_payees() (id, name,
    transaction_count, transfer_account); `category` is {"id", "name"} or None.
    Every card key is always present — empty string when not applicable.
    """
    current_category_name = ""
    if action == "default_category":
        provider = get_provider()
        current_id = await provider.get_payee_default_category(payee["id"])
        if current_id:
            cats = await provider.get_categories()
            current_category_name = next(
                (c.name for c in cats if c.id == current_id), ""
            )

    payload = {
        "action": action,
        "payee_id": payee["id"],
        "payee_name": payee["name"],
        "new_name": new_name,
        "target_payee_id": target["id"] if target else "",
        "target_payee_name": target["name"] if target else "",
        "category_id": category["id"] if category else "",
        "category_name": category["name"] if category else "",
        "current_category_name": current_category_name,
        "transaction_count": payee.get("transaction_count", 0),
    }
    proposal_id = pending_proposals.create(f"payee_{action}", payload, created_by=None)
    return {"type": "payee_action", "id": proposal_id, **payload}


async def confirm_payee_rename(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed payee_rename proposal.

    `overrides` (the PWA card's edited fields) win over `payload` when non-empty.
    Returns {"message": <result text>, "errors": []}.
    """
    old_name = payload["payee_name"]
    new_name = (overrides.get("new_name") or payload.get("new_name") or "").strip()
    if not new_name:
        raise ValueError("New name required")
    if new_name.lower() == old_name.lower():
        raise ValueError("New name is the same as the current name")

    await get_provider().rename_payee(payload["payee_id"], new_name)
    return {"message": f"Payee renamed: '{old_name}' → '{new_name}'", "errors": []}


async def confirm_payee_merge(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed payee_merge proposal.

    Returns {"message": <result text>, "errors": []}.
    """
    source_id = payload["payee_id"]
    source_name = payload["payee_name"]
    target_id = overrides.get("target_payee_id") or payload.get("target_payee_id") or ""
    if not target_id:
        raise ValueError("Target payee required")
    if target_id == source_id:
        raise ValueError("Cannot merge a payee into itself")

    payees = await get_provider().get_payees()
    target = next((p for p in payees if p["id"] == target_id), None)
    if target is None:
        raise ValueError("Target payee not found")
    if target.get("transfer_account"):
        raise ValueError("Cannot merge into a transfer payee")

    result = await get_provider().merge_payee(source_id, target_id)
    return {
        "message": (
            f"Merged '{source_name}' into '{target['name']}' "
            f"({result['transactions_moved']} transactions moved, "
            f"{result['rules_updated']} rules updated)"
        ),
        "errors": [],
    }


async def confirm_payee_default_category(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed payee_default_category proposal.

    Returns {"message": <result text>, "errors": []}.
    """
    payee_id = payload["payee_id"]
    payee_name = payload["payee_name"]
    category_id = overrides.get("category_id") or payload.get("category_id") or ""
    if not category_id:
        raise ValueError("Category required")

    cats = await get_provider().get_categories()
    category = next((c for c in cats if c.id == category_id), None)
    if category is None:
        raise ValueError("Category not found")

    result = await get_provider().set_payee_default_category(payee_id, category_id)
    verb = "updated" if result.get("replaced") else "set"
    return {
        "message": (
            f"Default category for '{payee_name}' {verb} to '{category.name}' "
            f"— applies to new transactions"
        ),
        "errors": [],
    }


pending_proposals.register_handler("payee_rename", confirm_payee_rename)
pending_proposals.register_handler("payee_merge", confirm_payee_merge)
pending_proposals.register_handler("payee_default_category", confirm_payee_default_category)
