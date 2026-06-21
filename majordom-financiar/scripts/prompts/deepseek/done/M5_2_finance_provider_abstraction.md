# Task: M5.2 — FinanceProvider abstraction (tool layer only)

## Context

Majordom is a FastAPI + React PWA personal finance assistant. Currently the tool layer
calls `ActualBudgetClient` directly everywhere. This task introduces a `FinanceProvider`
Protocol so the tool layer becomes backend-agnostic — switching to Sure later = one env var.

**Scope: tool layer only.** Do NOT touch `api/transactions.py`, `api/accounts.py`,
`api/csv_import.py`, `api/receipts.py`, `api/home.py`, `api/setup.py`, `api/fire.py`,
`api/balance_adjustments.py`, or `services/receipt_service.py`. These are extracted in M6, not abstracted here.

## Goal

After this task:
- `tools/finance/actual_budget.py`, `api/category_actions.py`, `services/notification_service.py`
  call `get_provider()` instead of `ActualBudgetClient` directly
- Setting `FINANCE_BACKEND=sure` (future) will switch the entire tool layer without touching tool code
- The app behaves identically — this is a pure refactor, zero new functionality

## Files to create

### 1. `backend/core/finance/__init__.py`
Empty — makes it a package.

### 2. `backend/core/finance/provider.py`

Define a `FinanceProvider` Protocol and a `get_provider()` factory function.

The Protocol must include exactly these methods (copy signatures from `backend/core/actual_client/client.py`):

```python
from typing import Protocol, runtime_checkable
from datetime import date

@runtime_checkable
class FinanceProvider(Protocol):
    async def get_accounts(self) -> list: ...
    async def get_today_transactions(self) -> list: ...
    async def get_categories(self) -> list: ...
    async def get_category_groups(self) -> list[str]: ...
    async def get_monthly_stats(self, month: int | None = None, year: int | None = None) -> dict: ...
    async def get_budget_status(self, month: int | None = None, year: int | None = None) -> list[dict]: ...
    async def get_recent_transactions(self, limit: int = 20) -> list[dict]: ...
    async def get_spending_history(self, months: int = 3) -> list[dict]: ...
    async def add_transaction(self, account_id: str, amount: float, payee: str,
                               category_name: str = "", tx_date: date | None = None,
                               notes: str = "", is_expense: bool = True) -> str | None: ...
    async def adjust_account_balance(self, account_id: str, target_balance: float) -> float: ...
    async def set_account_goal(self, account_name: str, target: float, deadline: str | None = None) -> str: ...
    async def create_category(self, name: str, group_name: str) -> object: ...
    async def create_category_group(self, name: str) -> str: ...
    async def delete_category(self, name: str) -> None: ...
    async def rename_category(self, old_name: str, new_name: str) -> None: ...
    async def set_budget_amount(self, category_name: str, new_amount: float, month: date | None = None) -> dict: ...
    async def count_uncategorized(self) -> int: ...
    async def count_uncategorized_by_payee(self, payee: str) -> int: ...
    async def get_uncategorized_groups(self) -> list[dict]: ...
    async def update_uncategorized_by_payee(self, payee: str, category_id: str) -> int: ...
    async def create_payee_rule(self, payee_name_prefix: str, category_id: str) -> None: ...
```

The factory:
```python
def get_provider() -> FinanceProvider:
    backend = os.getenv("FINANCE_BACKEND", "actual_budget")
    if backend == "actual_budget":
        from backend.core.finance.actual_budget_provider import ActualBudgetProvider
        return ActualBudgetProvider()
    raise ValueError(f"Unknown FINANCE_BACKEND: {backend!r}")
```

### 3. `backend/core/finance/actual_budget_provider.py`

A thin wrapper around `ActualBudgetClient`. Every method delegates to the client:

```python
class ActualBudgetProvider:
    def _client(self) -> ActualBudgetClient:
        from backend.core.config import settings
        cfg = settings.actual_budget
        # same constructor args as the existing _get_client() in actual_budget.py
        return ActualBudgetClient(url=cfg.url, sync_id=cfg.sync_id, **{"password": cfg.password})

    async def get_accounts(self):
        return await self._client().get_accounts()

    # ... one line per method, same pattern
```

Read each method signature from `backend/core/actual_client/client.py` and delegate exactly. No logic here.

## Files to modify

### 4. `backend/tools/finance/actual_budget.py`

Remove `_get_client()` and its import of `ActualBudgetClient`. Add:
```python
from backend.core.finance.provider import get_provider
```

Replace every `client = _get_client()` / `_get_client().method()` with `client = get_provider()`.
The variable name `client` can stay — makes the diff minimal.

### 5. `backend/api/category_actions.py`

Same pattern: replace the local `_get_client()` and `ActualBudgetClient` import with `get_provider()`.

### 6. `backend/services/notification_service.py`

Same pattern. This file uses: `get_accounts()`, `get_today_transactions()`, `get_budget_status()`, `count_uncategorized()`.

## Critical Rules

- **No financial data in SQLite** — nothing changes here, all reads/writes still go to AB via the provider
- **async/sync**: `ActualBudgetProvider` delegates to `ActualBudgetClient` which handles the executor internally — no change needed
- **Config from settings singleton** — `ActualBudgetProvider._client()` must use `settings.actual_budget`, never `os.environ` directly
- **Do NOT touch** any file outside the 6 listed above

## Gotchas

1. `_get_client()` in `actual_budget.py` is also imported by `api/budget.py` and `tools/finance/vehicle.py`:
   ```python
   # api/budget.py line 46:
   from backend.tools.finance.actual_budget import _get_client
   # tools/finance/vehicle.py line 23:
   from backend.tools.finance.actual_budget import _get_client
   ```
   When you remove `_get_client()` from `actual_budget.py`, these two files will break.
   Fix: give each its own local `_get_client()` that instantiates `ActualBudgetClient` directly.
   Do NOT route `budget.py` or `vehicle.py` through the provider — they are not in scope.

2. `Protocol` requires `from typing import Protocol` (Python 3.8+). Use `runtime_checkable` so `isinstance()` works if needed later.

3. `ActualBudgetProvider._client()` creates a new instance on every call — same behavior as the existing `_get_client()` pattern. Do not cache it.

## Do NOT touch

- `backend/api/transactions.py`, `accounts.py`, `csv_import.py`, `receipts.py`, `home.py`, `setup.py`, `fire.py`, `balance_adjustments.py`, `income_sources.py`
- `backend/services/receipt_service.py`
- `backend/core/actual_client/client.py` — the client stays unchanged
- `backend/tools/finance/vehicle.py` and `backend/api/budget.py` — fix the broken import (see Gotcha 1) but do not refactor

## Done when

- App starts without import errors
- Chat works: LLM can call finance tools and receive correct responses
- `FINANCE_BACKEND` env var exists and defaults to `actual_budget`
- `api/budget.py` and `tools/finance/vehicle.py` still work (local `_get_client()`)
- No changes to any file outside the 6 listed
