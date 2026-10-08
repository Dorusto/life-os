"""
AccountTransferService — the write logic for confirmed account-transfer
proposals.

Moved out of the FastAPI handler in backend/api/accounts.py so the same code
runs whether the confirmation came from the PWA card, a plain HTTP call, or an
MCP tool. Registered as the "account_transfer" handler on the shared
pending-proposal store at import time.
"""
import logging
from datetime import date as _date

from backend.core import pending_proposals
from backend.core.finance.provider import get_provider

logger = logging.getLogger(__name__)


async def confirm_account_transfer(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed account_transfer proposal.

    `overrides` (the PWA card's edited fields) win over `payload` (what
    propose_account_transfer stored). The amount is only replaced when it is
    not None — never on truthiness.

    The destination is either an existing account (to_account_id) or a new one
    to create (create_account_name). Everything is re-validated here because
    the card's fields are editable.

    Returns {"message": <result text>, "errors": []}.
    """
    from_account_id = overrides.get("from_account_id") or payload["from_account_id"]
    amount = (
        overrides["amount"] if overrides.get("amount") is not None
        else payload["amount"]
    )

    create_account_name = overrides.get("create_account_name")
    if create_account_name is not None and not str(create_account_name).strip():
        create_account_name = None

    off_budget_override = overrides.get("create_account_off_budget")
    if off_budget_override is not None:
        new_account_off_budget = bool(off_budget_override)
    else:
        new_account_off_budget = bool(payload.get("to_account_off_budget", False))

    if create_account_name:
        create_mode = True
        new_account_name = str(create_account_name).strip()
        to_account_id = ""
    elif overrides.get("to_account_id"):
        create_mode = False
        to_account_id = overrides["to_account_id"]
    elif payload.get("create_to_account"):
        create_mode = True
        new_account_name = payload["to_account_name"]
        to_account_id = ""
    else:
        create_mode = False
        to_account_id = payload["to_account_id"]

    if amount <= 0:
        raise ValueError("Amount must be positive")

    try:
        tx_date = _date.fromisoformat(payload["date"])
    except (ValueError, TypeError):
        raise ValueError(f"Invalid date: {payload.get('date')}")

    provider = get_provider()
    accounts = await provider.get_accounts()
    account_ids = {str(a.id) for a in accounts}

    if str(from_account_id) not in account_ids:
        raise ValueError(f"Account not found: {from_account_id}")

    if not create_mode:
        if str(to_account_id) not in account_ids:
            raise ValueError(f"Account not found: {to_account_id}")
        if str(from_account_id) == str(to_account_id):
            raise ValueError("Source and destination are the same account")

    created_account_name: str | None = None
    if create_mode:
        created = await provider.create_account(
            new_account_name,
            initial_balance=0.0,
            off_budget=new_account_off_budget,
        )
        to_account_id = created.id
        created_account_name = created.name

    await provider.create_transfer(
        from_account_id=from_account_id,
        to_account_id=to_account_id,
        amount=amount,
        tx_date=tx_date,
        notes=payload.get("notes", ""),
    )

    message = f"Transfer of €{amount:.2f} completed successfully."
    if created_account_name:
        message = f"Account '{created_account_name}' created. " + message
    return {"message": message, "errors": []}


pending_proposals.register_handler("account_transfer", confirm_account_transfer)
