"""
CloseAccountService — the write logic for confirmed close-account proposals.

Moved out of the FastAPI handler in backend/api/close_account.py so the same
code runs whether the confirmation came from the PWA card, a plain HTTP call,
or an MCP tool. Registered as the "close_account" handler on the shared
pending-proposal store at import time.
"""
import logging

from backend.core import pending_proposals
from backend.core.finance.provider import get_provider

logger = logging.getLogger(__name__)


async def confirm_close_account(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed close_account proposal.

    `overrides` (the PWA card's edited fields) win over `payload` (what
    propose_close_account stored). The destination is only replaced when the
    override is non-empty.

    The account's balance is re-read here, not trusted from the proposal — it
    may have changed since the card was shown. A non-zero balance needs a
    destination account and is closed atomically via close_account_with_transfer
    (transfer + close in one commit), never a separate transfer then close.

    Returns {"message": <result text>, "errors": []}.
    """
    account_id = payload["account_id"]
    account_name = payload["account_name"]
    destination_account_id = (
        overrides["destination_account_id"]
        if overrides.get("destination_account_id")
        else payload.get("destination_account_id", "")
    )

    provider = get_provider()
    accounts = await provider.get_accounts()
    account = next((a for a in accounts if str(a.id) == str(account_id)), None)
    if account is None:
        raise ValueError(f"Account not found: {account_id}")

    if abs(account.balance) >= 0.01:
        if not destination_account_id:
            raise ValueError(
                "Destination account is required to close an account with a non-zero balance"
            )
        if str(destination_account_id) == str(account_id):
            raise ValueError("Destination account must be a different account")
        if str(destination_account_id) not in {str(a.id) for a in accounts}:
            raise ValueError(f"Account not found: {destination_account_id}")
        await provider.close_account_with_transfer(account_id, destination_account_id)
    else:
        await provider.close_account(account_id)

    return {"message": f"{account_name} closed.", "errors": []}


pending_proposals.register_handler("close_account", confirm_close_account)
