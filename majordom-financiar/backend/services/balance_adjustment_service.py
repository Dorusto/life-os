"""
BalanceAdjustmentService — the write logic for confirmed balance-adjustment
proposals.

Moved out of the FastAPI handler in backend/api/balance_adjustments.py so the
same code runs whether the confirmation came from the PWA card, a plain HTTP
call, or an MCP tool. Registered as the "balance_adjustment" handler on the
shared pending-proposal store at import time.
"""
import logging

from backend.core import pending_proposals
from backend.core.finance.provider import get_provider

logger = logging.getLogger(__name__)


async def confirm_balance_adjustment(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed balance_adjustment proposal.

    `overrides` (the PWA card's edited fields) win over `payload` (what
    propose_balance_adjustment stored). The real balance is only replaced when
    it is not None — never on truthiness (0 is a valid balance).

    The account is re-validated here because the card's fields are editable.

    Returns {"message": <result text>, "errors": []}.
    """
    account_id = payload["account_id"]
    account_name = payload["account_name"]
    real_balance = (
        overrides["real_balance"] if overrides.get("real_balance") is not None
        else payload["real_balance"]
    )

    provider = get_provider()
    accounts = await provider.get_accounts()
    if str(account_id) not in {str(a.id) for a in accounts}:
        raise ValueError(f"Account not found: {account_id}")

    diff = await provider.adjust_account_balance(account_id, real_balance)

    if abs(diff) < 0.01:
        return {
            "message": f"{account_name} balance already correct, no adjustment needed.",
            "errors": [],
        }

    sign = "+" if diff > 0 else ""
    return {
        "message": f"{account_name} balance adjusted: {sign}€{diff:.2f}",
        "errors": [],
    }


pending_proposals.register_handler("balance_adjustment", confirm_balance_adjustment)
