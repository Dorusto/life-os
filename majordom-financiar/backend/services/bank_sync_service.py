"""
BankSyncService — the write logic for a confirmed bank_resync proposal.

Moved out of the FastAPI handler in backend/api/category_actions.py so the same
code runs whether the confirmation came from the PWA card, a plain HTTP call, or
an MCP tool. Registered as the "bank_resync" handler on the shared
pending-proposal store at import time.
"""
import logging

from backend.core import pending_proposals
from backend.core.finance.provider import get_provider

logger = logging.getLogger(__name__)


async def confirm_bank_resync(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed bank_resync proposal.

    Returns {"message": <result text>, "errors": []}.
    """
    acc_name = payload["account_name"]
    count = await get_provider().run_bank_resync(acc_name)
    return {
        "message": f"Resynced '{acc_name}' — {count} new transaction{'s' if count != 1 else ''} imported.",
        "errors": [],
    }


pending_proposals.register_handler("bank_resync", confirm_bank_resync)
