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
    is_expense: bool = True,
) -> str:
    """
    Add a transaction to Actual Budget.
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
        is_expense=is_expense,
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
    date: str = "",
    category_name: str = "",
    account_id: str = "",
    account_name: str = "",
    notes: str = "",
    is_expense: bool = True,
) -> str:
    """
    Create a pending proposal (does NOT add to Actual Budget yet).
    Returns a JSON string with type='proposal' for the frontend to render as a card.
    If account_id is missing, falls back to the first available account.
    """
    import json
    from backend.tools import proposals as proposal_store

    if not date:
        from datetime import date as _date
        date = _date.today().isoformat()

    if not category_name:
        try:
            from backend.core.memory.categorizer import SmartCategorizer
            prediction = SmartCategorizer().predict(merchant, amount=amount)
            if prediction.category_name:
                category_name = prediction.category_name
        except Exception:
            pass

    if not account_id:
        try:
            from backend.core.actual_client import ActualBudgetClient
            from backend.core.config import settings
            client = ActualBudgetClient(
                url=settings.actual.url,
                password=settings.actual.password,
                sync_id=settings.actual.sync_id,
            )
            accounts = await client.get_accounts()
            if accounts:
                account_id = accounts[0].id
                account_name = account_name or accounts[0].name
        except Exception:
            pass

    proposal_id = proposal_store.create(
        merchant=merchant,
        amount=amount,
        date=date,
        category_name=category_name,
        account_id=account_id,
        account_name=account_name,
        notes=notes,
        is_expense=is_expense,
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
        "is_expense": is_expense,
    })


async def propose_budget_rebalance(
    source_category: str,
    destination_category: str,
    amount: float,
    month: str = "",
) -> str:
    """
    Create a pending budget rebalance proposal (does NOT modify Actual Budget yet).
    Fetches current budget allocations for both categories, then returns a JSON
    string with type='budget_rebalance' for the frontend to render as a card.
    """
    import json
    from datetime import date as _date

    today = _date.today()
    # month param is "YYYY-MM" or empty (defaults to current month)
    if month:
        try:
            year, m = int(month[:4]), int(month[5:7])
            target_month = _date(year, m, 1)
        except (ValueError, IndexError):
            target_month = today.replace(day=1)
    else:
        target_month = today.replace(day=1)

    client = _get_client()

    # Fetch current budget allocations to compute new amounts
    budget_status = await client.get_budget_status(
        month=target_month.month,
        year=target_month.year,
    )

    source_budgeted = 0.0
    dest_budgeted = 0.0
    for item in budget_status:
        name = item["category_name"]
        if name.lower() == source_category.lower():
            source_budgeted = item["budgeted"]
            source_category = name  # normalize to exact name from AB
        elif name.lower() == destination_category.lower():
            dest_budgeted = item["budgeted"]
            destination_category = name  # normalize

    new_source = round(source_budgeted - amount, 2)
    new_destination = round(dest_budgeted + amount, 2)

    return json.dumps({
        "type": "budget_rebalance",
        "source_category": source_category,
        "destination_category": destination_category,
        "amount": amount,
        "month": target_month.strftime("%Y-%m"),
        "current_source_budget": source_budgeted,
        "current_destination_budget": dest_budgeted,
        "new_source_budget": new_source,
        "new_destination_budget": new_destination,
    })


async def propose_clarification(question: str, options: list[str]) -> str:
    """
    Ask the user a clarifying question with predefined answer options.
    No Actual Budget call needed — just returns JSON for the frontend.
    """
    import json
    return json.dumps({
        "type": "clarification",
        "question": question,
        "options": options,
    })


async def propose_account_transfer(
    from_account_id: str,
    to_account_id: str,
    amount: float,
    date: str,
    notes: str = "",
) -> str:
    """
    Propose a transfer between two bank accounts in Actual Budget.
    Fetches account names from context and returns JSON for the frontend.
    """
    import json

    client = _get_client()
    from_name = from_account_id
    to_name = to_account_id

    # Resolve account names from IDs
    try:
        accounts = await client.get_accounts()
        for acc in accounts:
            if acc.id == from_account_id:
                from_name = acc.name
            if acc.id == to_account_id:
                to_name = acc.name
    except Exception:
        pass  # fall back to IDs if we can't resolve

    return json.dumps({
        "type": "account_transfer",
        "from_account_id": from_account_id,
        "from_account_name": from_name,
        "to_account_id": to_account_id,
        "to_account_name": to_name,
        "amount": amount,
        "date": date,
        "notes": notes,
    })
