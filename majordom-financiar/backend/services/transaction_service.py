"""
TransactionService — the write logic for a confirmed transaction proposal.

Moved out of the FastAPI handler in backend/api/proposals.py so the same code
runs whether the confirmation came from the PWA card, a plain HTTP call, or an
MCP tool. Registered as the "transaction" handler on the shared
pending-proposal store at import time.
"""
import logging

from backend.core import pending_proposals
from backend.core.finance.provider import get_provider
from backend.tools.finance.actual_budget import add_transaction

logger = logging.getLogger(__name__)


async def confirm_transaction(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed transaction proposal.

    `overrides` (the PWA card's edited fields) win over `payload` (what
    propose_transaction stored). An override of None or "" does not replace
    the payload value.

    Returns {"success": True, "message": <add_transaction's result string>}.
    """
    category_name = overrides.get("category_name") or payload.get("category_name")
    account_id = overrides.get("account_id") or payload.get("account_id")
    create_rule = bool(overrides.get("create_rule"))

    if not category_name:
        raise ValueError("No category selected")
    if not account_id:
        raise ValueError("No account selected")

    result = await add_transaction(
        payee=payload["payee"],
        amount=payload["amount"],
        date=payload["date"],
        category_name=category_name,
        account_id=account_id,
        notes=payload.get("notes", ""),
        is_expense=payload.get("is_expense", True),
    )

    # Optional AB rule: payee + the notes text that matched a category this
    # time -> same category in future. Never automatic — only when the user
    # explicitly checked the box on the confirmation card.
    if create_rule and payload.get("notes_category_match"):
        try:
            client = get_provider()
            cats = await client.get_categories()
            cat = next((c for c in cats if c.name.lower() == category_name.lower()), None)
            if cat:
                from backend.core.finance.transaction_utils import rule_match_prefix
                rule_prefix = rule_match_prefix(payload["payee"])
                await client.create_payee_notes_rule(
                    payee_name_prefix=rule_prefix,
                    notes_contains=payload["category_name"],
                    category_id=cat.id,
                )
        except Exception as e:
            logger.warning("Failed to create notes-based AB rule for transaction proposal: %s", e)

    return {"success": True, "message": result}


pending_proposals.register_handler("transaction", confirm_transaction)
