"""
CategoryRuleService — the write logic for a confirmed categorize_with_rule proposal.

Moved out of the FastAPI handler in backend/api/category_actions.py so the same
code runs whether the confirmation came from the PWA card, a plain HTTP call, or
an MCP tool. Registered as the "categorize_with_rule" handler on the shared
pending-proposal store at import time.
"""
import logging

from backend.core import pending_proposals
from backend.core.config import settings
from backend.core.finance.provider import get_provider
from backend.core.memory.database import MemoryDB

logger = logging.getLogger(__name__)


async def confirm_categorize_with_rule(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed categorize_with_rule proposal.

    `overrides` (the PWA card's edited fields) win over `payload` (what
    propose_categorize_with_rule stored). An override of None or "" does not
    replace the payload value.

    Returns {"message": <result text>, "errors": []}.
    """
    client = get_provider()

    payee = overrides.get("payee") or payload["payee"]

    # Resolve category_id from an override name if the user changed it. An
    # override name that isn't in the stored id→name map is a real error, not
    # a silent fallback to the old id.
    cat_id = payload["category_id"]
    cat_name = payload["category_name"]
    override_category = overrides.get("category_name")
    if override_category and override_category != payload["category_name"]:
        id_by_name = {v: k for k, v in payload.get("categories_map", {}).items()}
        if override_category not in id_by_name:
            raise ValueError(f"Unknown category: {override_category!r}")
        cat_id = id_by_name[override_category]
        cat_name = override_category

    count = await client.update_uncategorized_by_payee(
        payee=payee,
        category_id=cat_id,
        notes_contains=payload.get("notes_contains", ""),
    )

    # Optional AB rule: payee prefix → category for future imports. Never
    # automatic — only when the user explicitly checked the box on the card,
    # otherwise only when the payee's own history is consistent.
    should_create_rule = overrides.get("create_rule")
    if should_create_rule is None:
        should_create_rule = payload.get("is_consistent", False)
    rule_created = False
    rule_prefix = overrides.get("rule_prefix") or payload.get("rule_prefix") or payee
    if should_create_rule:
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
            f" AB rule created: future '{rule_prefix}' transactions will auto-categorize."
            if rule_created
            else " No rule created — payee history is inconsistent (same payee was categorized differently before)."
        )
    )
    return {"message": message, "errors": []}


async def reject_categorize_with_rule(payload: dict, rejected_by: str) -> None:
    """Dismiss the Inbox finding behind a rejected categorize_with_rule proposal.

    Only the payee id is stored (architecture rule 1) — the same dismiss the
    old cancel route did for Inbox-originated proposals.
    """
    payee_id = payload.get("payee_id")
    if payee_id:
        MemoryDB(settings.memory.db_path).dismiss_finding("uncategorized_payee", payee_id)


pending_proposals.register_handler(
    "categorize_with_rule",
    confirm_categorize_with_rule,
    on_reject=reject_categorize_with_rule,
)
