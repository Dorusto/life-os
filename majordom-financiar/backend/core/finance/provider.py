"""
FinanceProvider Protocol and factory function.

Defines the interface that any finance backend (Actual Budget, Sure, etc.)
must implement.  Tool-layer code calls ``get_provider()`` and uses the
returned object — it never imports ``ActualBudgetClient`` directly.
"""

from __future__ import annotations

import os
from datetime import date
from typing import Protocol, runtime_checkable


@runtime_checkable
class FinanceProvider(Protocol):
    """Protocol for finance backend clients."""

    async def get_accounts(self) -> list: ...

    async def get_today_transactions(self) -> list: ...

    async def get_categories(self) -> list: ...

    async def get_category_groups(self) -> list[str]: ...

    async def get_monthly_stats(
        self, month: int | None = None, year: int | None = None
    ) -> dict: ...

    async def get_budget_status(
        self, month: int | None = None, year: int | None = None
    ) -> list[dict]: ...

    async def get_budget_overview(
        self, month: int | None = None, year: int | None = None
    ) -> list[dict]: ...

    async def get_recent_transactions(self, limit: int = 20) -> list[dict]: ...

    async def get_spending_history(self, months: int = 3) -> list[dict]: ...

    async def add_transaction(
        self,
        account_id: str,
        amount: float,
        payee: str,
        category_name: str = "",
        tx_date: date | None = None,
        notes: str = "",
        is_expense: bool = True,
    ) -> str | None: ...

    async def adjust_account_balance(
        self, account_id: str, target_balance: float
    ) -> float: ...

    async def set_account_goal(
        self, account_name: str, target: float, deadline: str | None = None
    ) -> str: ...

    async def create_category(self, name: str, group_name: str) -> object: ...

    async def create_category_group(self, name: str) -> str: ...

    async def delete_category(self, name: str) -> None: ...

    async def rename_category(self, old_name: str, new_name: str) -> None: ...

    async def rename_category_group(self, old_name: str, new_name: str) -> None: ...

    async def set_budget_amount(
        self,
        category_name: str,
        new_amount: float,
        month: date | None = None,
    ) -> dict: ...

    async def get_budget_copy_source(self, month: int, year: int) -> dict: ...

    async def set_budget_carryover(self, category_name: str, month: date, enabled: bool) -> bool: ...

    async def get_goals(self) -> list[dict]: ...

    async def get_fire_status(self) -> dict: ...

    async def count_uncategorized(self) -> int: ...

    async def count_unreconciled(self) -> int: ...

    async def get_account_sync_status(self) -> list[dict]: ...

    async def run_bank_resync(self, account_name: str) -> int: ...

    async def count_uncategorized_by_payee(self, payee: str, notes_contains: str = "") -> int: ...

    async def list_uncategorized_by_payee(
        self, payee: str, notes_contains: str = "", limit: int = 20
    ) -> list[dict]: ...

    async def get_uncategorized_groups(self) -> list[dict]: ...

    async def get_transactions_by_tag(self, tag: str) -> dict: ...

    async def update_uncategorized_by_payee(
        self, payee: str, category_id: str, notes_contains: str = ""
    ) -> int: ...

    async def create_payee_rule(
        self, payee_name_prefix: str, category_id: str
    ) -> None: ...

    async def create_payee_notes_rule(
        self, payee_name_prefix: str, notes_contains: str, category_id: str
    ) -> None: ...

    async def create_payee_transfer_rule(
        self, payee_name_prefix: str, target_account_id: str
    ) -> None: ...

    async def match_existing_rules(
        self, candidates: list[dict]
    ) -> list[dict | None]: ...


def get_provider() -> FinanceProvider:
    """Return a FinanceProvider instance based on the FINANCE_BACKEND env var."""
    backend = os.getenv("FINANCE_BACKEND", "actual_budget")
    if backend == "actual_budget":
        from backend.core.finance.actual_budget_provider import (
            ActualBudgetProvider,
        )

        return ActualBudgetProvider()
    raise ValueError(f"Unknown FINANCE_BACKEND: {backend!r}")
