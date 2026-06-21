"""
Finance tools — Actual Budget read and write operations.

These functions are called by execute_tool() in registry.py
after the LLM decides to use them.
"""
import json
from datetime import date as _date

from backend.core.config import settings
from backend.core.finance.provider import get_provider


def _looks_like_uuid(s: str) -> bool:
    import re
    return bool(re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', s, re.IGNORECASE))


async def add_transaction(
    payee: str,
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
    client = get_provider()
    try:
        tx_date = _date.fromisoformat(date)
    except ValueError:
        tx_date = _date.today()

    tx_id = await client.add_transaction(
        account_id=account_id,
        amount=amount,
        payee=payee,
        category_name=category_name,
        tx_date=tx_date,
        notes=notes,
        is_expense=is_expense,
    )

    if tx_id:
        return (
            f"Transaction added successfully: {payee} €{amount:.2f} "
            f"on {tx_date.isoformat()} (category: {category_name})"
        )
    return (
        f"Duplicate skipped — transaction already exists: "
        f"{payee} €{amount:.2f} on {tx_date.isoformat()}"
    )


async def propose_transaction(
    payee: str,
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
            prediction = SmartCategorizer().predict(payee, amount=amount)
            if prediction.category_name:
                category_name = prediction.category_name
        except Exception:
            pass

    if not account_id or not _looks_like_uuid(account_id):
        try:
            accounts = await get_provider().get_accounts()
            # Try to match by name first (LLM may pass account name instead of ID)
            name_hint = account_id or account_name or ""
            matched = next((a for a in accounts if a.name.lower() == name_hint.lower()), None)
            chosen = matched or (accounts[0] if accounts else None)
            if chosen:
                account_id = chosen.id
                account_name = chosen.name
        except Exception:
            pass

    proposal_id = proposal_store.create(
        payee=payee,
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
        "payee": payee,
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

    client = get_provider()

    # Fetch current budget allocations to compute new amounts
    budget_status = await client.get_budget_status(
        month=target_month.month,
        year=target_month.year,
    )

    all_category_names = [item["category_name"] for item in budget_status]

    def _resolve_category(name: str) -> str | None:
        """Return exact AB category name matching `name`, with fuzzy fallback."""
        from difflib import get_close_matches
        # Exact case-insensitive match first
        for cat in all_category_names:
            if cat.lower() == name.lower():
                return cat
        # Fuzzy match (cutoff 0.6 catches "Restaurante" → "Restaurants")
        matches = get_close_matches(name, all_category_names, n=1, cutoff=0.6)
        return matches[0] if matches else None

    resolved_source = _resolve_category(source_category)
    resolved_dest = _resolve_category(destination_category)

    if not resolved_source:
        raise ValueError(f"Category not found: {source_category}")
    if not resolved_dest:
        raise ValueError(f"Category not found: {destination_category}")

    source_category = resolved_source
    destination_category = resolved_dest

    source_budgeted = 0.0
    dest_budgeted = 0.0
    for item in budget_status:
        name = item["category_name"]
        if name == source_category:
            source_budgeted = item["budgeted"]
        elif name == destination_category:
            dest_budgeted = item["budgeted"]

    new_source = round(source_budgeted - amount, 2)
    new_destination = round(dest_budgeted + amount, 2)

    all_categories = sorted(
        [{"name": item["category_name"], "budgeted": item["budgeted"]} for item in budget_status],
        key=lambda x: x["name"],
    )

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
        "categories": all_categories,
    })


async def get_accounts() -> str:
    """Return all accounts with their current balances."""
    client = get_provider()
    accounts = await client.get_accounts()
    lines = ["Accounts:"]
    for a in accounts:
        lines.append(f"  - {a.name} (id: {a.id}): €{a.balance:.2f}")
    return "\n".join(lines)


async def get_monthly_stats(month: int | None = None, year: int | None = None) -> str:
    """Return spending totals for a given month, broken down by category."""
    client = get_provider()
    stats = await client.get_monthly_stats(month=month, year=year)
    m, y = stats["month"], stats["year"]
    lines = [f"Spending {y}-{m:02d}: €{stats['total']:.2f} total, {stats['count']} transactions"]
    for cat_data in sorted(stats.get("categories", {}).values(), key=lambda x: x["total"], reverse=True):
        lines.append(f"  - {cat_data['name']}: €{cat_data['total']:.2f}")
    return "\n".join(lines)


async def get_budget_status(month: int | None = None, year: int | None = None) -> str:
    """Return budget vs actual spending per category for a given month."""
    client = get_provider()
    today = _date.today()
    m = month or today.month
    y = year or today.year
    items = await client.get_budget_status(month=m, year=y)
    lines = [f"Budget status {y}-{m:02d}:"]
    for item in items:
        remaining = round(item['budgeted'] - item['spent'], 2)
        lines.append(
            f"  - {item['category_name']}: €{item['spent']:.2f} spent / €{item['budgeted']:.2f} budgeted"
            f" (€{remaining:.2f} remaining)"
        )
    return "\n".join(lines)


async def get_transactions(category: str | None = None, account: str | None = None, limit: int = 20) -> str:
    """Return recent transactions, optionally filtered by category or account name."""
    client = get_provider()
    all_txs = await client.get_recent_transactions(limit=limit * 4)
    result = []
    for tx in all_txs:
        if category and (tx.get("category_name") or "").lower() != category.lower():
            continue
        if account and (tx.get("account_name") or "").lower() != account.lower():
            continue
        result.append(tx)
        if len(result) >= limit:
            break
    lines = [f"Transactions ({len(result)}):"]
    for tx in result:
        amount = abs(tx["amount_cents"]) / 100
        lines.append(f"  - {tx['date']} · {tx['merchant']} · €{amount:.2f} ({tx.get('category_name') or 'uncategorized'}) [{tx.get('account_name','')}]")
    return "\n".join(lines)


async def get_spending_history(months: int = 3) -> str:
    """Return monthly spending totals for the last N months."""
    client = get_provider()
    today = _date.today()
    lines = [f"Spending history (last {months} months):"]
    for i in range(months - 1, -1, -1):
        m = today.month - i
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        stats = await client.get_monthly_stats(month=m, year=y)
        lines.append(f"  - {y}-{m:02d}: €{stats['total']:.2f} ({stats['count']} transactions)")
    return "\n".join(lines)


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
    Always fetches all accounts so the frontend can show account selectors.
    Fuzzy-matches the LLM's input (may be a name, not an ID) to real account IDs.
    """
    import json
    from difflib import get_close_matches

    client = get_provider()
    accounts = await client.get_accounts()

    accounts_list = [{"id": a.id, "name": a.name, "balance": a.balance} for a in accounts]

    def _resolve(value: str) -> tuple[str | None, str | None]:
        """Return (id, name) for value — tries exact ID match, then fuzzy name match. Returns (None, None) if not found."""
        for a in accounts:
            if a.id == value:
                return a.id, a.name
        for a in accounts:
            if a.name.lower() == value.lower():
                return a.id, a.name
        names = [a.name for a in accounts]
        matches = get_close_matches(value, names, n=1, cutoff=0.4)
        if matches:
            matched = next(a for a in accounts if a.name == matches[0])
            return matched.id, matched.name
        return None, None

    from_id, from_name = _resolve(from_account_id)
    to_id, to_name = _resolve(to_account_id)

    # If destination not found, ask for clarification instead of silent fallback
    if to_id is None:
        options = [a.name for a in accounts] + ["Record as expense instead"]
        return json.dumps({
            "type": "clarification",
            "question": f"Account '{to_account_id}' not found in Actual Budget. Choose a destination or record as expense:",
            "options": options,
        })

    # If source not found, fall back to first account (user can correct via selector)
    if from_id is None and accounts:
        from_id, from_name = accounts[0].id, accounts[0].name

    # Avoid same-account transfers
    if from_id == to_id and len(accounts) >= 2:
        other = next(a for a in accounts if a.id != from_id)
        to_id, to_name = other.id, other.name

    return json.dumps({
        "type": "account_transfer",
        "from_account_id": from_id,
        "from_account_name": from_name,
        "to_account_id": to_id,
        "to_account_name": to_name,
        "amount": amount,
        "date": date,
        "notes": notes,
        "accounts": accounts_list,
    })


async def propose_balance_adjustment(account_name: str, real_balance: float) -> str:
    """
    Propose adjusting an account balance to match the real bank balance.
    Returns a JSON string with type='balance_adjustment' for the frontend to render as a card.
    """
    import json
    import uuid
    from backend.tools import balance_adjustments as adj_store

    client = get_provider()
    accounts = await client.get_accounts()

    # match by exact name first, then partial (case-insensitive)
    matched = next((a for a in accounts if a.name.lower() == account_name.lower()), None)
    if not matched:
        matched = next((a for a in accounts if account_name.lower() in a.name.lower()), None)
    if not matched:
        names = ", ".join(a.name for a in accounts)
        return json.dumps({"type": "error", "message": f"Account '{account_name}' not found. Available: {names}"})

    proposal_id = uuid.uuid4().hex[:8]
    adj_store.store(proposal_id, {
        "account_id": matched.id,
        "account_name": matched.name,
        "current_balance": matched.balance,
        "real_balance": real_balance,
    })

    return json.dumps({
        "type": "balance_adjustment",
        "id": proposal_id,
        "account_name": matched.name,
        "current_balance": matched.balance,
        "real_balance": real_balance,
        "diff": round(real_balance - matched.balance, 2),
    })


async def complete_setup(balances: list[dict]) -> str:
    """
    Adjust account balances in AB to match user-provided real values.
    Marks setup as complete in user_preferences.
    Returns a summary string for the LLM to use in its response.
    """
    from backend.core.memory.database import MemoryDB

    client = get_provider()

    # Fetch account names for the summary
    accounts = await client.get_accounts()
    account_name_map = {a.id: a.name for a in accounts}

    results = []
    for entry in balances:
        account_id = entry["account_id"]
        real_balance = float(entry["real_balance"])
        try:
            diff = await client.adjust_account_balance(account_id, real_balance)
            name = account_name_map.get(account_id, account_id)
            if abs(diff) >= 0.01:
                results.append(f"{name}: adjusted {'+' if diff > 0 else ''}€{diff:.2f}")
            else:
                results.append(f"{name}: balance matches, no adjustment needed")
        except Exception as e:
            results.append(f"{account_id}: error — {e}")

    db = MemoryDB(db_path=settings.memory.db_path)
    db.set_preference("setup_complete", "1")

    if results:
        return "Setup complete. Adjustments:\n" + "\n".join(f"• {r}" for r in results)
    return "Setup complete. All balances already matched — no adjustments needed."


async def set_account_goal(account_name: str, target: float, deadline: str | None = None) -> str:
    """Propose setting a savings goal. Returns a confirmation card — does NOT write yet."""
    import uuid
    from difflib import get_close_matches
    from backend.tools import category_actions as action_store
    client = get_provider()
    accounts = await client.get_accounts()
    all_names = [a.name for a in accounts]
    exact = next((n for n in all_names if n.lower() == account_name.lower()), None)
    resolved = exact or (get_close_matches(account_name, all_names, n=1, cutoff=0.6) or [None])[0]
    if not resolved:
        return json.dumps({"type": "error", "message": f"Account not found: {account_name!r}. Available: {', '.join(all_names)}"})
    action_id = uuid.uuid4().hex[:8]
    action_store.store(action_id, {"action": "set_goal", "account_name": resolved, "target": target, "deadline": deadline})
    return json.dumps({"type": "goal_proposal", "id": action_id, "account_name": resolved, "target": target, "deadline": deadline})


async def rename_category(old_name: str, new_name: str) -> str:
    """Propose renaming a budget category. Returns a confirmation card — does NOT rename yet."""
    import uuid
    from difflib import get_close_matches
    from backend.tools import category_actions as action_store
    client = get_provider()
    cats = await client.get_categories()
    all_names = [c.name for c in cats]
    exact = next((n for n in all_names if n.lower() == old_name.lower()), None)
    resolved = exact or (get_close_matches(old_name, all_names, n=1, cutoff=0.6) or [None])[0]
    if not resolved:
        return json.dumps({"type": "error", "message": f"Category not found: {old_name!r}. Available: {', '.join(all_names)}"})
    action_id = uuid.uuid4().hex[:8]
    action_store.store(action_id, {"action": "rename", "category_name": resolved, "new_name": new_name})
    return json.dumps({"type": "category_action", "id": action_id, "action": "rename", "category_name": resolved, "new_name": new_name})


async def delete_category(name: str) -> str:
    """Propose deleting a budget category. Returns a confirmation card — does NOT delete yet."""
    import uuid
    from difflib import get_close_matches
    from backend.tools import category_actions as action_store
    client = get_provider()
    cats = await client.get_categories()
    all_names = [c.name for c in cats]
    exact = next((n for n in all_names if n.lower() == name.lower()), None)
    resolved = exact or (get_close_matches(name, all_names, n=1, cutoff=0.6) or [None])[0]
    if not resolved:
        return json.dumps({"type": "error", "message": f"Category not found: {name!r}. Available: {', '.join(all_names)}"})
    action_id = uuid.uuid4().hex[:8]
    action_store.store(action_id, {"action": "delete", "category_name": resolved})
    return json.dumps({"type": "category_action", "id": action_id, "action": "delete", "category_name": resolved})


async def create_category(name: str, group_name: str) -> str:
    """Propose creating a new category in a group. Returns a confirmation card — does NOT create yet."""
    import uuid
    from difflib import get_close_matches
    from backend.tools import category_actions as action_store
    client = get_provider()
    groups = await client.get_category_groups()
    exact = next((g for g in groups if g.lower() == group_name.lower()), None)
    resolved_group = exact or (get_close_matches(group_name, groups, n=1, cutoff=0.5) or [group_name])[0]
    action_id = uuid.uuid4().hex[:8]
    action_store.store(action_id, {"action": "create", "category_name": name, "group_name": resolved_group, "available_groups": groups})
    return json.dumps({"type": "category_action", "id": action_id, "action": "create", "category_name": name, "group_name": resolved_group, "available_groups": groups})


async def propose_set_category_budget(
    category_name: str,
    amount: float,
    month: str = "",
) -> str:
    """
    Propose setting a category's budget to a specific amount for a month.
    Returns JSON with type='category_action', action='set_budget' for the frontend card.
    Does NOT write to Actual Budget yet.
    """
    import json
    import uuid
    from difflib import get_close_matches
    from datetime import date as _date
    from backend.tools import category_actions as action_store

    today = _date.today()
    if month:
        try:
            year, m = int(month[:4]), int(month[5:7])
            target_month = _date(year, m, 1)
        except (ValueError, IndexError):
            target_month = today.replace(day=1)
    else:
        target_month = today.replace(day=1)

    client = get_provider()
    budget_status = await client.get_budget_status(
        month=target_month.month,
        year=target_month.year,
    )

    all_names = [item["category_name"] for item in budget_status]
    exact = next((n for n in all_names if n.lower() == category_name.lower()), None)
    resolved = exact or (get_close_matches(category_name, all_names, n=1, cutoff=0.6) or [None])[0]

    if not resolved:
        return json.dumps({
            "type": "error",
            "message": f"Category not found: {category_name!r}. Available: {', '.join(all_names)}",
        })

    current_amount = next(
        (item["budgeted"] for item in budget_status if item["category_name"] == resolved),
        0.0,
    )

    action_id = uuid.uuid4().hex[:8]
    action_store.store(action_id, {
        "action": "set_budget",
        "category_name": resolved,
        "new_amount": amount,
        "current_amount": current_amount,
        "month": target_month.isoformat(),
    })

    return json.dumps({
        "type": "category_action",
        "action": "set_budget",
        "id": action_id,
        "category_name": resolved,
        "current_amount": current_amount,
        "new_amount": amount,
        "month": target_month.strftime("%Y-%m"),
    })


async def setup_default_groups() -> str:
    """Propose creating the 7 standard category groups (Housing, Daily Living, Transport, Health, Lifestyle, Finance, Unexpected) with their default subcategories. Only creates groups/categories that don't already exist."""
    import uuid
    from backend.tools import category_actions as action_store

    _GROUPS = [
        ("Housing",      ["Home & Maintenance", "Utilities"]),
        ("Daily Living", ["Groceries & Drinks", "Clothing", "Children"]),
        ("Transport",    ["Transport"]),
        ("Health",       ["Health"]),
        ("Lifestyle",    ["Restaurants & Cafes", "Entertainment & Vacation", "Personal"]),
        ("Finance",      ["Investments & Savings"]),
        ("Unexpected",   ["Other"]),
    ]

    client = get_provider()
    existing_groups = await client.get_category_groups()
    existing_lower = {g.lower() for g in existing_groups}

    to_create = [(g, cats) for g, cats in _GROUPS if g.lower() not in existing_lower]

    if not to_create:
        return json.dumps({"type": "error", "message": "All 7 standard groups already exist."})

    action_id = uuid.uuid4().hex[:8]
    action_store.store(action_id, {"action": "setup_groups", "groups": to_create})
    preview = ", ".join(g for g, _ in to_create)
    return json.dumps({"type": "category_action", "id": action_id, "action": "setup_groups", "preview": preview, "groups": to_create})


async def propose_categorize_by_payee(payee: str, category_name: str) -> str:
    """
    Propose bulk-categorizing all uncategorized transactions for a given payee.
    Returns a confirmation card — does NOT write to Actual Budget yet.
    """
    import uuid
    from difflib import get_close_matches
    from backend.tools import category_actions as action_store

    client = get_provider()

    cats = await client.get_categories()
    cat_names = [c.name for c in cats]
    exact = next((c for c in cats if c.name.lower() == category_name.lower()), None)
    if not exact:
        close = get_close_matches(category_name, cat_names, n=1, cutoff=0.6)
        if close:
            exact = next((c for c in cats if c.name == close[0]), None)
    if not exact:
        return json.dumps({
            "type": "error",
            "message": f"Category not found: {category_name!r}. Available: {', '.join(cat_names)}",
        })

    count = await client.count_uncategorized_by_payee(payee)
    if count == 0:
        return json.dumps({
            "type": "error",
            "message": f"No uncategorized transactions found for payee matching '{payee}'.",
        })

    # Build id→name map for override resolution at confirm time
    categories_map = {c.id: c.name for c in cats}
    available_categories = [c.name for c in cats]

    action_id = uuid.uuid4().hex[:8]
    action_store.store(action_id, {
        "action": "categorize_by_payee",
        "payee": payee,
        "category_id": exact.id,
        "category_name": exact.name,
        "count": count,
        "categories_map": categories_map,
    })
    return json.dumps({
        "type": "category_action",
        "id": action_id,
        "action": "categorize_by_payee",
        "payee": payee,
        "category_name": exact.name,
        "count": count,
        "available_categories": available_categories,
    })


async def get_uncategorized_groups() -> str:
    """
    Fetch all uncategorized transaction groups by payee with suggested categories.
    Read-only — returns JSON for the LLM to present conversationally.
    """
    client = get_provider()
    groups = await client.get_uncategorized_groups()
    if not groups:
        return json.dumps({
            "type": "info",
            "message": "No uncategorized transactions found. Everything is already categorized.",
        })
    return json.dumps({
        "type": "uncategorized_groups",
        "groups": groups,
        "total": sum(g["count"] for g in groups),
    })


async def propose_categorize_with_rule(payee: str, category_name: str) -> str:
    """
    Propose categorizing a payee group AND creating an AB rule for future auto-categorization.
    Returns a confirmation card — does NOT write to Actual Budget yet.
    """
    import uuid
    from difflib import get_close_matches
    from backend.tools import category_actions as action_store

    client = get_provider()

    cats = await client.get_categories()
    cat_names = [c.name for c in cats]
    exact = next((c for c in cats if c.name.lower() == category_name.lower()), None)
    if not exact:
        close = get_close_matches(category_name, cat_names, n=1, cutoff=0.6)
        if close:
            exact = next((c for c in cats if c.name == close[0]), None)
    if not exact:
        return json.dumps({
            "type": "error",
            "message": f"Category not found: {category_name!r}. Available: {', '.join(cat_names)}",
        })

    count = await client.count_uncategorized_by_payee(payee)
    if count == 0:
        return json.dumps({
            "type": "error",
            "message": f"No uncategorized transactions found for payee matching '{payee}'.",
        })

    # Compute rule_prefix (same logic as get_uncategorized_groups in client.py)
    first_word = payee.split()[0] if payee else ""
    rule_prefix = (
        first_word
        if len(first_word) >= 4 and first_word.isalnum()
        else payee
    )

    # Check consistency: look up the payee in AB history
    is_consistent = True
    groups = await client.get_uncategorized_groups()
    for g in groups:
        if g["payee_name"].lower() == payee.lower() or payee.lower() in g["payee_name"].lower():
            is_consistent = g["is_consistent"]
            break

    # Build id→name map for override resolution at confirm time
    categories_map = {c.id: c.name for c in cats}
    available_categories = [c.name for c in cats]

    action_id = uuid.uuid4().hex[:8]
    action_store.store(action_id, {
        "action": "categorize_with_rule",
        "payee": payee,
        "category_id": exact.id,
        "category_name": exact.name,
        "count": count,
        "rule_prefix": rule_prefix,
        "is_consistent": is_consistent,
        "categories_map": categories_map,
    })
    return json.dumps({
        "type": "category_action",
        "id": action_id,
        "action": "categorize_with_rule",
        "payee": payee,
        "count": count,
        "category_name": exact.name,
        "rule_prefix": rule_prefix,
        "is_consistent": is_consistent,
        "available_categories": available_categories,
    })
