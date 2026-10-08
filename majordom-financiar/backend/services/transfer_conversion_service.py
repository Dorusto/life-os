"""
TransferConversionService — the write logic for confirmed transaction→transfer
conversion proposals (#144).

Moved out of the FastAPI handler in backend/api/transfer_conversion.py so the
same code runs whether the confirmation came from the PWA card, a plain HTTP
call, or an MCP tool. Registered as the "transfer_conversion" handler on the
shared pending-proposal store at import time.

The conversion reassigns the transaction's payee to the target account's
transfer payee (convert_transaction_to_transfer) — never a delete+recreate.
"""
import logging

from backend.core import pending_proposals
from backend.core.finance.provider import get_provider

logger = logging.getLogger(__name__)


async def confirm_transfer_conversion(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed transfer_conversion proposal.

    `overrides` (the PWA card's edited target account) win over `payload` (what
    propose_transfer_conversion stored). The target account is re-validated
    here because the card's select is editable.

    Returns {"message": <result text>, "errors": []}.
    """
    transaction_id = payload["transaction_id"]
    target_account_id = overrides.get("target_account_id") or payload["target_account_id"]

    provider = get_provider()
    accounts = await provider.get_accounts()
    matched = next((a for a in accounts if str(a.id) == str(target_account_id)), None)
    if not matched:
        raise ValueError("Selected target account not found")
    target_account_id = matched.id
    target_name = matched.name

    tx = await provider.get_transaction_by_id(transaction_id)
    if not tx:
        raise ValueError(f"Transaction not found: {transaction_id}")
    if tx["account_id"] and tx["account_id"] == target_account_id:
        raise ValueError(
            f"Transaction is already in account '{target_name}' — cannot convert it "
            "into a transfer to the same account."
        )

    result = await provider.convert_transaction_to_transfer(transaction_id, target_account_id)

    return {
        "message": f"Converted transaction into transfer → {target_name} (€{result['amount']:.2f})",
        "errors": [],
    }


pending_proposals.register_handler("transfer_conversion", confirm_transfer_conversion)
