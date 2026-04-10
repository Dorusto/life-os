from __future__ import annotations

"""
Client pentru Actual Budget folosind librăria oficială actualpy.
"""
import asyncio
import logging
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import date

logger = logging.getLogger(__name__)


@dataclass
class Account:
    id: str
    name: str
    balance: float


@dataclass
class Category:
    id: str
    name: str
    group_name: str = ""


class ActualBudgetClient:
    """Client async pentru Actual Budget."""

    def __init__(self, url: str, password: str, sync_id: str):
        self.url = url.rstrip("/")
        self.password = password
        self.sync_id = sync_id
        self._executor = ThreadPoolExecutor(max_workers=1)

    def _get_actual(self):
        from actual import Actual
        return Actual(
            base_url=self.url,
            password=self.password,
            file=self.sync_id,
        )

    async def _run(self, func):
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self._executor, func)

    async def get_accounts(self) -> list[Account]:
        def _get():
            from actual.queries import get_accounts, get_transactions
            with self._get_actual() as actual:
                actual.download_budget()
                accounts = get_accounts(actual.session)
                result = []
                for acc in accounts:
                    if acc.closed:
                        continue
                    # Calculează balanța din suma tranzacțiilor
                    txs = get_transactions(actual.session, account=acc)
                    balance = sum(
                        float(tx.amount or 0)
                        for tx in txs
                        if not tx.tombstone
                    ) / 100
                    result.append(Account(
                        id=str(acc.id),
                        name=acc.name,
                        balance=balance,
                    ))
                return result
        return await self._run(_get)

    async def get_default_account(self) -> Account | None:
        accounts = await self.get_accounts()
        if not accounts:
            return None
        for acc in accounts:
            name_lower = acc.name.lower()
            if any(k in name_lower for k in ["cheltuieli", "spending", "checking", "current"]):
                return acc
        return accounts[0]

    async def get_categories(self) -> list[Category]:
        def _get():
            from actual.queries import get_categories
            with self._get_actual() as actual:
                actual.download_budget()
                cats = get_categories(actual.session)
                return [
                    Category(
                        id=str(cat.id),
                        name=cat.name,
                        group_name=cat.group.name if cat.group else "",
                    )
                    for cat in cats
                    if not cat.hidden
                ]
        return await self._run(_get)

    async def get_monthly_stats(self, month: int | None = None, year: int | None = None) -> dict:
        """Returnează statistici lunare direct din Actual Budget."""
        today = date.today()
        month = month or today.month
        year = year or today.year

        def _get():
            from actual.queries import get_transactions
            from datetime import date as _date
            import calendar

            start = _date(year, month, 1)
            last_day = calendar.monthrange(year, month)[1]
            end = _date(year, month, last_day)

            with self._get_actual() as actual:
                actual.download_budget()
                txs = get_transactions(actual.session, start_date=start, end_date=end)

                total = 0.0
                count = 0
                by_category: dict[str, dict] = defaultdict(lambda: {"total": 0.0, "count": 0, "name": ""})

                for tx in txs:
                    if tx.tombstone or tx.starting_balance_flag:
                        continue
                    amount = float(tx.amount or 0) / 100
                    if amount >= 0:
                        continue  # ignoră venituri
                    amount = abs(amount)
                    total += amount
                    count += 1

                    cat_name = "Necategorizat"
                    cat_key = "uncategorized"
                    if tx.category_id and tx.category:
                        cat_name = tx.category.name or "Necategorizat"
                        cat_key = str(tx.category_id)

                    by_category[cat_key]["total"] += amount
                    by_category[cat_key]["count"] += 1
                    by_category[cat_key]["name"] = cat_name

                return {
                    "month": month,
                    "year": year,
                    "total": round(total, 2),
                    "count": count,
                    "categories": dict(by_category),
                }

        return await self._run(_get)

    async def add_transaction(
        self,
        account_id: str,
        amount: float,
        payee: str,
        category_name: str = "",
        tx_date: date | None = None,
        notes: str = "",
    ) -> str:
        if tx_date is None:
            tx_date = date.today()

        def _add():
            import uuid
            from actual.queries import create_transaction, get_or_create_payee, get_or_create_category
            with self._get_actual() as actual:
                actual.download_budget()
                payee_obj = get_or_create_payee(actual.session, payee)
                cat_obj = None
                if category_name:
                    cat_obj = get_or_create_category(actual.session, category_name, group_name="Majordom")
                tx = create_transaction(
                    actual.session,
                    date=tx_date,
                    account=account_id,
                    payee=payee_obj,
                    notes=notes or f"[Majordom] {payee}",
                    amount=-abs(amount),
                    category=cat_obj,
                    imported_id=str(uuid.uuid4()),
                )
                actual.commit()
                logger.info(f"Tranzacție adăugată: {payee} {amount:.2f} → {tx.id}")
                return str(tx.id)

        return await self._run(_add)

    async def get_total_balance(self) -> float:
        accounts = await self.get_accounts()
        return sum(acc.balance for acc in accounts)

    async def create_account(self, name: str, initial_balance: float = 0.0) -> Account:
        """Creează un cont nou în Actual Budget."""
        def _create():
            from actual.queries import create_account as _create_account
            from decimal import Decimal
            with self._get_actual() as actual:
                actual.download_budget()
                acc = _create_account(
                    actual.session,
                    name=name,
                    initial_balance=Decimal(str(initial_balance)),
                )
                actual.commit()
                logger.info(f"Cont creat: {name} (sold inițial: {initial_balance})")
                return Account(id=str(acc.id), name=acc.name, balance=initial_balance)
        return await self._run(_create)

    AUTO_CATEGORY_THRESHOLD = 0.75

    async def add_transactions_batch(
        self,
        account_id: str,
        transactions: list,
        categorizer=None,
    ) -> tuple[int, int, int, list]:
        """
        Importă mai multe tranzacții deodată într-un singur commit.

        Args:
            account_id: ID-ul contului din Actual Budget
            transactions: list[NormalizedTransaction]
            categorizer: SmartCategorizer opțional pentru auto-categorizare

        Returns:
            (imported, skipped_duplicates, errors, low_confidence_list)
            low_confidence_list: [(NormalizedTransaction, prediction)] pentru confirmare manuală
        """
        def _batch():
            import hashlib
            from actual.queries import (
                create_transaction, get_or_create_payee,
                get_or_create_category, get_transactions,
            )

            with self._get_actual() as actual:
                actual.download_budget()

                existing_txs = get_transactions(actual.session)
                existing_ids = {
                    tx.financial_id for tx in existing_txs
                    if tx.financial_id and not tx.tombstone
                }

                imported = 0
                skipped = 0
                errors = 0
                low_confidence = []

                for tx in transactions:
                    try:
                        sig = f"{tx.date.isoformat()}{tx.merchant}{tx.amount:.4f}"
                        imported_id = hashlib.sha256(sig.encode()).hexdigest()[:16]

                        if imported_id in existing_ids:
                            skipped += 1
                            continue

                        payee_obj = get_or_create_payee(actual.session, tx.merchant)

                        cat_obj = None
                        pred = None
                        if categorizer:
                            pred = categorizer.predict(
                                merchant=tx.merchant,
                                ocr_text=tx.description,
                            )
                            if pred.confidence >= self.AUTO_CATEGORY_THRESHOLD and pred.category_name and pred.category_name != "Altele":
                                cat_obj = get_or_create_category(
                                    actual.session,
                                    pred.category_name,
                                    group_name="Majordom",
                                )
                            else:
                                low_confidence.append((tx, pred))

                        notes = tx.description or f"[Majordom CSV] {tx.merchant}"
                        actual_amount = -abs(tx.amount) if tx.is_expense else abs(tx.amount)
                        create_transaction(
                            actual.session,
                            date=tx.date,
                            account=account_id,
                            payee=payee_obj,
                            notes=notes,
                            amount=actual_amount,
                            category=cat_obj,
                            imported_id=imported_id,
                        )
                        existing_ids.add(imported_id)
                        imported += 1

                    except Exception as e:
                        logger.warning(f"Eroare tranzacție {tx.merchant} {tx.amount}: {e}")
                        errors += 1

                if imported > 0:
                    actual.commit()
                    logger.info(f"CSV import: {imported} importate, {skipped} duplicate, {errors} erori, {len(low_confidence)} cu confidență mică")

            return imported, skipped, errors, low_confidence

        return await self._run(_batch)
