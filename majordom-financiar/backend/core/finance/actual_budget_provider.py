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

    async def get_recent_transactions(self, limit: int = 20) -> list[dict]:
        return await self._client().get_recent_transactions(limit=limit)

    async def get_spending_history(self, months: int = 3) -> list[dict]:
        return await self._client().get_spending_history(months=months)

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

    async def set_account_goal(
        self, account_name: str, target: float, deadline: str | None = None
    ) -> str:
        return await self._client().set_account_goal(
            account_name, target, deadline
        )

    async def create_category(self, name: str, group_name: str) -> object:
        return await self._client().create_category(name, group_name)

    async def create_category_group(self, name: str) -> str:
        return await self._client().create_category_group(name)

    async def delete_category(self, name: str) -> None:
        return await self._client().delete_category(name)

    async def rename_category(self, old_name: str, new_name: str) -> None:
        return await self._client().rename_category(old_name, new_name)

    async def set_budget_amount(
        self,
        category_name: str,
        new_amount: float,
        month: date | None = None,
    ) -> dict:
        return await self._client().set_budget_amount(
            category_name, new_amount, month
        )

    async def count_uncategorized(self) -> int:
        return await self._client().count_uncategorized()

    async def count_uncategorized_by_payee(self, payee: str, notes_contains: str = "") -> int:
        return await self._client().count_uncategorized_by_payee(payee, notes_contains)

    async def list_uncategorized_by_payee(
        self, payee: str, notes_contains: str = "", limit: int = 20
    ) -> list[dict]:
        return await self._client().list_uncategorized_by_payee(payee, notes_contains, limit)

    async def get_uncategorized_groups(self) -> list[dict]:
        return await self._client().get_uncategorized_groups()

    async def update_uncategorized_by_payee(
        self, payee: str, category_id: str, notes_contains: str = ""
    ) -> int:
        return await self._client().update_uncategorized_by_payee(
            payee, category_id, notes_contains
        )

    async def get_goals(self) -> list[dict]:
        return await self._client().get_goals()

    async def create_payee_rule(
        self, payee_name_prefix: str, category_id: str
    ) -> None:
        return await self._client().create_payee_rule(
            payee_name_prefix, category_id
        )
