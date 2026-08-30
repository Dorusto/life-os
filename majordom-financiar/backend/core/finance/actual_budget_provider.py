"""
Thin wrapper around ``ActualBudgetClient`` that implements ``FinanceProvider``.

Each method creates a fresh client instance (same behaviour as the previous
``_get_client()`` pattern) and delegates to it.
"""

from __future__ import annotations

from datetime import date


class ActualBudgetProvider:
    """FinanceProvider implementation backed by Actual Budget."""

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _client():
        """Return a fresh ``ActualBudgetClient`` configured from settings."""
        from backend.core.config import settings
        from backend.core.actual_client import ActualBudgetClient

        return ActualBudgetClient(
            url=settings.actual.url,
            password=settings.actual.password,
            sync_id=settings.actual.sync_id,
        )

    # ------------------------------------------------------------------
    # FinanceProvider protocol methods
    # ------------------------------------------------------------------

    async def get_accounts(self) -> list:
        return await self._client().get_accounts()

    async def get_today_transactions(self) -> list:
        return await self._client().get_today_transactions()

    async def get_categories(self) -> list:
        return await self._client().get_categories()

    async def get_category_groups(self) -> list[str]:
        return await self._client().get_category_groups()

    async def get_monthly_stats(
        self, month: int | None = None, year: int | None = None
    ) -> dict:
        return await self._client().get_monthly_stats(month=month, year=year)

    async def get_budget_status(
        self, month: int | None = None, year: int | None = None
    ) -> list[dict]:
        return await self._client().get_budget_status(month=month, year=year)

    async def get_budget_overview(
        self, month: int | None = None, year: int | None = None
    ) -> list[dict]:
        return await self._client().get_budget_overview(month=month, year=year)

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
    ) -> list[dict]:
        return await self._client().get_recent_transactions(
            limit=limit, start_date=start_date, end_date=end_date,
            account_id=account_id, offset=offset, category_ids=category_ids,
            payee=payee, uncategorized_only=uncategorized_only,
            amount_min=amount_min, amount_max=amount_max, is_expense=is_expense,
        )

    async def add_transaction(
        self,
        account_id: str,
        amount: float,
        payee: str,
        category_name: str = "",
        tx_date: date | None = None,
        notes: str = "",
        is_expense: bool = True,
    ) -> str | None:
        return await self._client().add_transaction(
            account_id=account_id,
            amount=amount,
            payee=payee,
            category_name=category_name,
            tx_date=tx_date,
            notes=notes,
            is_expense=is_expense,
        )

    async def adjust_account_balance(
        self, account_id: str, target_balance: float
    ) -> float:
        return await self._client().adjust_account_balance(
            account_id, target_balance
        )

    async def get_home_data(
        self, month: int | None = None, year: int | None = None
    ) -> dict:
        return await self._client().get_home_data(month=month, year=year)

    async def get_monthly_totals_batch(self, months: list[tuple[int, int]]) -> list[dict]:
        return await self._client().get_monthly_totals_batch(months)

    async def create_account(
        self, name: str, initial_balance: float = 0.0, off_budget: bool = False
    ) -> object:
        return await self._client().create_account(name, initial_balance, off_budget)

    async def create_transfer(
        self,
        from_account_id: str,
        to_account_id: str,
        amount: float,
        tx_date: date,
        notes: str = "",
    ) -> dict:
        return await self._client().create_transfer(
            from_account_id=from_account_id,
            to_account_id=to_account_id,
            amount=amount,
            tx_date=tx_date,
            notes=notes,
        )

    async def set_account_type(self, account_id: str, account_type: str) -> str:
        return await self._client().set_account_type(account_id, account_type)

    async def close_account(self, account_id: str) -> str:
        return await self._client().close_account(account_id)

    async def close_account_with_transfer(
        self, account_id: str, destination_account_id: str
    ) -> str:
        return await self._client().close_account_with_transfer(
            account_id, destination_account_id
        )

    async def set_account_goal(
        self, account_name: str, target: float, deadline: str | None = None, goal_note: str | None = None
    ) -> str:
        return await self._client().set_account_goal(
            account_name, target, deadline, goal_note
        )

    async def create_category(self, name: str, group_name: str) -> object:
        return await self._client().create_category(name, group_name)

    async def create_category_group(self, name: str) -> str:
        return await self._client().create_category_group(name)

    async def delete_category(self, name: str) -> None:
        return await self._client().delete_category(name)

    async def rename_category(self, old_name: str, new_name: str) -> None:
        return await self._client().rename_category(old_name, new_name)

    async def rename_category_group(self, old_name: str, new_name: str) -> None:
        return await self._client().rename_category_group(old_name, new_name)

    async def delete_category_group(self, name: str) -> None:
        return await self._client().delete_category_group(name)

    async def set_budget_amount(
        self,
        category_name: str,
        new_amount: float,
        month: date | None = None,
    ) -> dict:
        return await self._client().set_budget_amount(
            category_name, new_amount, month
        )

    async def get_budget_copy_source(self, month: int, year: int) -> dict:
        return await self._client().get_budget_copy_source(month, year)

    async def set_budget_carryover(self, category_name: str, month: date, enabled: bool) -> bool:
        return await self._client().set_budget_carryover(category_name, month, enabled)

    async def count_uncategorized(self) -> int:
        return await self._client().count_uncategorized()

    async def count_unreconciled(self) -> int:
        return await self._client().count_unreconciled()

    async def get_account_sync_status(self) -> list[dict]:
        return await self._client().get_account_sync_status()

    async def run_bank_resync(self, account_name: str) -> int:
        return await self._client().run_bank_resync(account_name)

    async def run_bank_resync_all(self) -> dict:
        return await self._client().run_bank_resync_all()

    async def get_duplicate_transactions_by_month(self) -> dict[str, list[dict]]:
        return await self._client().get_duplicate_transactions_by_month()

    async def merge_duplicate_transaction(
        self, manual_id: str, synced_id: str
    ) -> bool:
        return await self._client().merge_duplicate_transaction(
            manual_id, synced_id
        )

    async def resolve_transfer_duplicate(
        self, transfer_leg_id: str, synced_dup_id: str
    ) -> dict:
        return await self._client().resolve_transfer_duplicate(
            transfer_leg_id, synced_dup_id
        )

    async def count_uncategorized_by_payee(self, payee: str, notes_contains: str = "") -> int:
        return await self._client().count_uncategorized_by_payee(payee, notes_contains)

    async def list_uncategorized_by_payee(
        self, payee: str, notes_contains: str = "", limit: int = 20
    ) -> list[dict]:
        return await self._client().list_uncategorized_by_payee(payee, notes_contains, limit)

    async def get_uncategorized_groups(self) -> list[dict]:
        return await self._client().get_uncategorized_groups()

    async def get_transactions_by_tag(self, tag: str) -> dict:
        return await self._client().get_transactions_by_tag(tag)

    async def get_tag_category_breakdown(self, tag: str) -> dict:
        return await self._client().get_tag_category_breakdown(tag)

    async def update_uncategorized_by_payee(
        self, payee: str, category_id: str, notes_contains: str = ""
    ) -> int:
        return await self._client().update_uncategorized_by_payee(
            payee, category_id, notes_contains
        )

    async def get_goals(self) -> list[dict]:
        return await self._client().get_goals()

    async def get_fire_status(self) -> dict:
        return await self._client().get_fire_status()

    async def get_balance_history(
        self, scope: str = "total", days: int = 30, end_date: str | None = None
    ) -> list[dict]:
        return await self._client().get_balance_history(scope, days, end_date)

    async def bulk_update_category(self, financial_ids: list[str], category_id: str) -> int:
        return await self._client().bulk_update_category(financial_ids, category_id)

    async def get_payees(self) -> list[dict]:
        return await self._client().get_payees()

    async def get_schedules(self) -> list[dict]:
        return await self._client().get_schedules()

    async def split_transaction(self, transaction_id: str, splits: list[dict]) -> dict:
        return await self._client().split_transaction(transaction_id, splits)

    async def rename_account(self, account_id: str, new_name: str) -> None:
        return await self._client().rename_account(account_id, new_name)

    async def delete_transaction(self, financial_id: str) -> bool:
        return await self._client().delete_transaction(financial_id)

    async def create_payee_rule(
        self, payee_name_prefix: str, category_id: str
    ) -> None:
        return await self._client().create_payee_rule(
            payee_name_prefix, category_id
        )

    async def create_payee_notes_rule(
        self, payee_name_prefix: str, notes_contains: str, category_id: str
    ) -> None:
        return await self._client().create_payee_notes_rule(
            payee_name_prefix, notes_contains, category_id
        )

    async def create_payee_transfer_rule(
        self, payee_name_prefix: str, target_account_id: str
    ) -> None:
        return await self._client().create_payee_transfer_rule(
            payee_name_prefix, target_account_id
        )

    async def match_existing_rules(
        self, candidates: list[dict]
    ) -> list[dict | None]:
        return await self._client().match_existing_rules(candidates)

    async def attach_receipt_to_transaction(
        self, financial_id: str, category_name: str, notes: str
    ) -> bool:
        return await self._client().attach_receipt_to_transaction(
            financial_id, category_name, notes
        )

    async def find_near_duplicate_transaction(
        self,
        account_id: str,
        amount: float,
        date: date,
        date_window_days: int = 1,
        tolerance_pct: float = 0.02,
    ) -> dict | None:
        return await self._client().find_near_duplicate_transaction(
            account_id, amount, date, date_window_days, tolerance_pct
        )

    async def get_csv_import_context(
        self,
    ) -> tuple[set[str], list[str], dict[tuple[str, str], list[float]], list[str]]:
        return await self._client().get_csv_import_context()

    async def execute_csv_import(
        self, account_id: str, rows: list[dict]
    ) -> tuple[int, int, int, int]:
        return await self._client().execute_csv_import(account_id, rows)

    async def get_transaction_by_id(self, transaction_id: str) -> dict | None:
        return await self._client().get_transaction_by_id(transaction_id)

    async def add_transaction_tag(self, transaction_id: str, tag: str) -> str:
        return await self._client().add_transaction_tag(transaction_id, tag)

    async def convert_transaction_to_transfer(
        self, transaction_id: str, target_account_id: str
    ) -> dict:
        return await self._client().convert_transaction_to_transfer(
            transaction_id, target_account_id
        )
