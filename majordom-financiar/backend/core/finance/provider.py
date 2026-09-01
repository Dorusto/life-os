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

    async def get_recent_transactions(
        self, limit: int = 20, start_date: date | None = None, end_date: date | None = None,
        account_id: str | None = None,
        offset: int = 0,
        category_ids: list[str] | None = None,
        payee: str | None = None,
        uncategorized_only: bool = False,
        amount_min: float | None = None,
        amount_max: float | None = None,
        is_expense: bool | None = None,
    ) -> list[dict]: ...

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

    async def get_home_data(
        self, month: int | None = None, year: int | None = None
    ) -> dict: ...

    async def get_monthly_totals_batch(self, months: list[tuple[int, int]]) -> list[dict]: ...

    async def create_account(
        self, name: str, initial_balance: float = 0.0, off_budget: bool = False
    ) -> object: ...

    async def create_transfer(
        self,
        from_account_id: str,
        to_account_id: str,
        amount: float,
        tx_date: date,
        notes: str = "",
    ) -> dict: ...

    async def set_account_type(self, account_id: str, account_type: str) -> str: ...

    async def close_account(self, account_id: str) -> str: ...

    async def close_account_with_transfer(
        self, account_id: str, destination_account_id: str
    ) -> str: ...

    async def set_account_goal(
        self, account_name: str, target: float, deadline: str | None = None, goal_note: str | None = None
    ) -> str: ...

    async def create_category(self, name: str, group_name: str) -> object: ...

    async def create_category_group(self, name: str) -> str: ...

    async def delete_category(self, name: str) -> None: ...

    async def rename_category(self, old_name: str, new_name: str) -> None: ...

    async def rename_category_group(self, old_name: str, new_name: str) -> None: ...

    async def delete_category_group(self, name: str) -> None: ...

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

    async def list_unreconciled_groups(self) -> list[dict]: ...

    async def get_reconciliation_suspects(
        self, account_id: str, target_diff: float | None = None
    ) -> dict: ...

    async def mark_account_reconciled(self, account_id: str) -> int: ...

    async def list_budget_realism_flags(self, trailing_months: int = 6) -> list[dict]: ...

    async def get_account_sync_status(self) -> list[dict]: ...

    async def run_bank_resync(self, account_name: str) -> int: ...

    async def run_bank_resync_all(self) -> dict: ...

    async def get_duplicate_transactions_by_month(self) -> dict[str, list[dict]]: ...

    async def merge_duplicate_transaction(
        self, manual_id: str, synced_id: str
    ) -> bool: ...

    async def resolve_transfer_duplicate(
        self, transfer_leg_id: str, synced_dup_id: str
    ) -> dict: ...

    async def count_uncategorized_by_payee(self, payee: str, notes_contains: str = "") -> int: ...

    async def list_uncategorized_by_payee(
        self, payee: str, notes_contains: str = "", limit: int = 20
    ) -> list[dict]: ...

    async def get_uncategorized_groups(self) -> list[dict]: ...

    async def get_transactions_by_tag(self, tag: str) -> dict: ...

    async def get_tag_category_breakdown(self, tag: str) -> dict: ...

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

    async def attach_receipt_to_transaction(
        self, financial_id: str, category_name: str, notes: str
    ) -> bool: ...

    async def find_near_duplicate_transaction(
        self,
        account_id: str,
        amount: float,
        date: date,
        date_window_days: int = 1,
        tolerance_pct: float = 0.02,
    ) -> dict | None: ...

    async def get_csv_import_context(
        self,
    ) -> tuple[set[str], list[str], dict[tuple[str, str], list[float]], list[str]]: ...

    async def execute_csv_import(
        self, account_id: str, rows: list[dict]
    ) -> tuple[int, int, int, int]: ...

    async def get_transaction_by_id(self, transaction_id: str) -> dict | None: ...

    async def add_transaction_tag(self, transaction_id: str, tag: str) -> str: ...

    async def convert_transaction_to_transfer(
        self, transaction_id: str, target_account_id: str
    ) -> dict: ...

    async def get_balance_history(
        self, scope: str = "total", days: int = 30, end_date: str | None = None
    ) -> list[dict]: ...

    async def bulk_update_category(self, financial_ids: list[str], category_id: str) -> int: ...

    async def get_payees(self) -> list[dict]: ...

    async def get_schedules(self) -> list[dict]: ...

    async def split_transaction(self, transaction_id: str, splits: list[dict]) -> dict: ...

    async def rename_account(self, account_id: str, new_name: str) -> None: ...

    async def delete_transaction(self, financial_id: str) -> bool: ...


def get_provider() -> FinanceProvider:
    """Return a FinanceProvider instance based on the FINANCE_BACKEND env var."""
    backend = os.getenv("FINANCE_BACKEND", "actual_budget")
    if backend == "actual_budget":
        from backend.core.finance.actual_budget_provider import (
            ActualBudgetProvider,
        )

        return ActualBudgetProvider()
    raise ValueError(f"Unknown FINANCE_BACKEND: {backend!r}")
