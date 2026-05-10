"""
Finance tools — Actual Budget write operations.

These functions are called by execute_tool() in registry.py
after the LLM decides to use them.
"""
from datetime import date as _date

from backend.core.actual_client import ActualBudgetClient
from backend.core.config import settings


def _get_client() -> ActualBudgetClient:
    return ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )


async def add_transaction(
    merchant: str,
    amount: float,
    date: str,
    category_name: str,
    account_id: str,
    notes: str = "",
) -> str:
    """
    Add an expense to Actual Budget.
    Returns a human-readable result string (success or duplicate).
    """
    client = _get_client()
    try:
        tx_date = _date.fromisoformat(date)
    except ValueError:
        tx_date = _date.today()

    tx_id = await client.add_transaction(
        account_id=account_id,
        amount=amount,
        payee=merchant,
        category_name=category_name,
        tx_date=tx_date,
        notes=notes,
    )

    if tx_id:
        return (
            f"Transaction added successfully: {merchant} €{amount:.2f} "
            f"on {tx_date.isoformat()} (category: {category_name})"
        )
    return (
        f"Duplicate skipped — transaction already exists: "
        f"{merchant} €{amount:.2f} on {tx_date.isoformat()}"
    )


async def propose_transaction(
    merchant: str,
    amount: float,
    date: str,
    category_name: str,
    account_id: str,
    account_name: str,
    notes: str = "",
) -> str:
    """
    Create a pending proposal (does NOT add to Actual Budget yet).
    Returns a JSON string with type='proposal' for the frontend to render as a card.
    """
    import json
    from backend.tools import proposals as proposal_store

    proposal_id = proposal_store.create(
        merchant=merchant,
        amount=amount,
        date=date,
        category_name=category_name,
        account_id=account_id,
        account_name=account_name,
        notes=notes,
    )

    return json.dumps({
        "type": "proposal",
        "id": proposal_id,
        "merchant": merchant,
        "amount": amount,
        "date": date,
        "category_name": category_name,
        "account_id": account_id,
        "account_name": account_name,
        "notes": notes,
    })
