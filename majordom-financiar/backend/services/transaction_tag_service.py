"""
TransactionTagService — the write logic for a confirmed tag_transaction proposal.

Moved out of the FastAPI handler in backend/api/category_actions.py so the same
code runs whether the confirmation came from the PWA card, a plain HTTP call, or
an MCP tool. Registered as the "tag_transaction" handler on the shared
pending-proposal store at import time.
"""
import logging

from backend.core import pending_proposals
from backend.core.finance.provider import get_provider

logger = logging.getLogger(__name__)


async def confirm_tag_transaction(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed tag_transaction proposal.

    `overrides` (the PWA card's edited fields) win over `payload` (what
    propose_tag_transaction stored) when truthy.

    Returns {"message": <result text>, "errors": []}.
    """
    tag = overrides.get("tag") or payload["tag"]
    if not tag.startswith("#"):
        tag = f"#{tag}"

    await get_provider().add_transaction_tag(payload["transaction_id"], tag)
    return {"message": f"Tagged transaction with '{tag}'.", "errors": []}


pending_proposals.register_handler("tag_transaction", confirm_tag_transaction)
