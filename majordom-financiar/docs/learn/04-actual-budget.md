# 04 — Actual Budget — how transactions are saved

## What is Actual Budget

A self-hosted budgeting application (runs in Docker at port 5006). It has a web interface where you see all transactions, charts, and per-category budgets. Majordom is just an "input channel" — it sends transactions there.

## Sync ID — what it is and where to find it

Actual Budget can manage multiple "budget files" (like separate databases). `ACTUAL_BUDGET_SYNC_ID` identifies your specific file. Find it in: Actual Budget → Settings → Advanced → Sync ID.

## What `download_budget()` does on every operation

actualpy re-downloads the current state of the budget before each operation. Inefficient but safe — guarantees you're working with fresh data. If you added something from the web UI and the backend doesn't know about it, it doesn't matter — next call sees everything.

## actualpy operation order — MANDATORY

```python
with self._get_actual() as actual:
    actual.download_budget()   # ALWAYS first
    # ... operations ...
    actual.commit()            # ALWAYS last for any write
```

Never skip `download_budget()` or `commit()`.

## Naming quirks in actualpy

```python
# create_transaction() — amount is in EUR (float), NOT cents
create_transaction(session, amount=45.99)   # ✓ correct
create_transaction(session, amount=4599)    # ✗ wrong — becomes €459,900

# imported_id vs financial_id
create_transaction(session, imported_id="abc123")  # saved internally as financial_id
# When reading: use tx.financial_id, NOT tx.imported_id

# Queries — there is NO actual.get_transactions() method
from actual.queries import get_transactions
txs = get_transactions(actual.session, start_date=today)  # ✓ correct

# Payee creation
create_transaction(session, payee="Kaufland")  # actualpy creates payee + PayeeMapping automatically
# Don't manually create Payees objects — it causes sync issues

# Category creation
from actual.queries import create_category_group, create_category, create_schedule
# NOT from actual.database — those classes don't have the right methods
```

## Balance calculation

Balance in Actual Budget is calculated from the sum of transactions — there is no stored balance field. `get_accounts()` returns the computed balance per account.

## Tombstone categories

AB never hard-deletes categories — it marks them `tombstone=1` (soft delete for CRDT sync). Transactions keep their `category_id` for the deleted category, but `get_categories()` omits tombstoned ones.

When displaying spending stats, always remap tombstoned categories:
```python
# If category_id not in living categories → fuzzy match by name to a living one
# This is done in get_budget_status() and get_monthly_stats()
```

## Transfers between accounts

A transfer between two on-budget accounts = two linked transactions. Use:
```python
# Method 1: create_transfer() — creates both sides
actual.create_transfer(...)

# Method 2: set_transaction_payee() with a payee that has transfer_acct set
# actualpy creates the second transaction automatically
```

Never record a transfer as two separate expense/income transactions.

## On-budget vs off-budget accounts

- **On-budget:** liquid accounts (checking, savings, cash) — included in budget math
- **Off-budget (tracking):** investments, debts, real estate — tracked for net worth, not budgeted

When Majordom creates accounts, respect this structure (relevant for issue #65).
