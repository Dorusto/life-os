from __future__ import annotations

"""
Client for Actual Budget using the official actualpy library.
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
    """Async client for Actual Budget."""

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
                    # Calculate balance from transaction sum
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
        """Return monthly statistics directly from Actual Budget."""
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
                        continue  # skip income
                    amount = abs(amount)
                    total += amount
                    count += 1

                    cat_name = "Uncategorized"
                    cat_key = "uncategorized"
                    if tx.category_id and tx.category:
                        cat_name = tx.category.name or "Uncategorized"
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
    ) -> str | None:
        """Add a transaction. Returns the ID or None if duplicate."""
        if tx_date is None:
            tx_date = date.today()

        def _add():
            import hashlib
            from actual.queries import (
                create_transaction, get_or_create_payee,
                get_transactions, get_categories,
            )
            with self._get_actual() as actual:
                actual.download_budget()

                # Deterministic hash — same transaction (date+merchant+amount) → same ID
                sig = f"{tx_date.isoformat()}{payee}{abs(amount):.4f}"
                imported_id = hashlib.sha256(sig.encode()).hexdigest()[:16]

                # Check if already exists (e.g., previously imported via CSV)
                existing_ids = {
                    tx.financial_id for tx in get_transactions(actual.session)
                    if tx.financial_id and not tx.tombstone
                }
                if imported_id in existing_ids:
                    logger.info(f"Duplicate skipped: {payee} {amount:.2f} ({tx_date})")
                    return None

                payee_obj = get_or_create_payee(actual.session, payee)
                # Only use existing categories — never create new ones
                cat_obj = None
                if category_name:
                    all_cats = get_categories(actual.session)
                    cat_obj = next(
                        (c for c in all_cats if c.name.lower() == category_name.lower()),
                        None,
                    )
                tx = create_transaction(
                    actual.session,
                    date=tx_date,
                    account=account_id,
                    payee=payee_obj,
                    notes=notes,
                    amount=-abs(amount),
                    category=cat_obj,
                    imported_id=imported_id,
                )
                actual.commit()
                logger.info(f"Transaction added: {payee} {amount:.2f} → {tx.id}")
                return str(tx.id)

        return await self._run(_add)

    async def get_budget_status(
        self,
        month: int | None = None,
        year: int | None = None,
    ) -> list[dict]:
        """
        Return budget vs spent per category for the given month.

        Each item: {
            "category_id": str,
            "category_name": str,
            "budgeted": float,   # amount allocated in budget (EUR)
            "spent": float,      # amount actually spent (EUR, always positive)
            "percentage": float, # spent / budgeted * 100 (0 if budgeted == 0)
        }
        """
        today = date.today()
        month = month or today.month
        year = year or today.year

        def _get():
            import calendar
            from collections import defaultdict
            from datetime import date as _date
            from actual.queries import get_transactions, get_categories

            start = _date(year, month, 1)
            last_day = calendar.monthrange(year, month)[1]
            end = _date(year, month, last_day)
            yyyymm = year * 100 + month  # e.g. 202605

            with self._get_actual() as actual:
                actual.download_budget()

                # --- 1. Fetch budget allocations from zero_budgets ---
                budget_by_category: dict[str, float] = defaultdict(float)
                budget_lookup_succeeded = False

                try:
                    from sqlalchemy import text as _text
                    # Try zero_budgets table first
                    rows = actual.session.execute(
                        _text("SELECT category, amount FROM zero_budgets WHERE id LIKE :prefix"),
                        {"prefix": f"{yyyymm}%"},
                    ).fetchall()
                    for row in rows:
                        cat_id = str(row[0]) if row[0] else ""
                        amount_cents = float(row[1] or 0)
                        budget_by_category[cat_id] += amount_cents / 100
                    budget_lookup_succeeded = True
                    logger.debug(
                        "Budget lookup via zero_budgets succeeded: %d rows",
                        len(rows),
                    )
                except Exception as e1:
                    logger.warning("zero_budgets table not available: %s", e1)
                    try:
                        from sqlalchemy import text as _text
                        # Fallback: reflect_budgets table
                        rows = actual.session.execute(
                            _text("SELECT category, amount FROM reflect_budgets WHERE id LIKE :prefix"),
                            {"prefix": f"{yyyymm}%"},
                        ).fetchall()
                        for row in rows:
                            cat_id = str(row[0]) if row[0] else ""
                            amount_cents = float(row[1] or 0)
                            budget_by_category[cat_id] += amount_cents / 100
                        budget_lookup_succeeded = True
                        logger.debug(
                            "Budget lookup via reflect_budgets succeeded: %d rows",
                            len(rows),
                        )
                    except Exception as e2:
                        logger.warning(
                            "reflect_budgets also not available: %s. "
                            "Returning spending-only data.",
                            e2,
                        )

                # --- 2. Fetch actual spending for the month ---
                txs = get_transactions(actual.session, start_date=start, end_date=end)

                spent_by_category: dict[str, float] = defaultdict(float)

                for tx in txs:
                    if tx.tombstone or tx.starting_balance_flag:
                        continue
                    amount = float(tx.amount or 0) / 100
                    if amount >= 0:
                        continue  # skip income
                    amount = abs(amount)
                    cat_id = str(tx.category_id) if tx.category_id else "uncategorized"
                    spent_by_category[cat_id] += amount

                # --- 3. Fetch all categories for name resolution ---
                all_cats = get_categories(actual.session)
                cat_name_map: dict[str, str] = {}
                for cat in all_cats:
                    if cat.id and not cat.hidden:
                        cat_name_map[str(cat.id)] = cat.name or "Unknown"

                # --- 4. Merge budget + spending ---
                all_category_ids = set(budget_by_category.keys()) | set(spent_by_category.keys())

                result = []
                for cat_id in all_category_ids:
                    if cat_id == "uncategorized":
                        continue  # skip uncategorized — not a real category
                    budgeted = round(budget_by_category.get(cat_id, 0.0), 2)
                    spent = round(spent_by_category.get(cat_id, 0.0), 2)
                    if budgeted == 0 and spent == 0:
                        continue  # skip empty categories
                    percentage = round(spent / budgeted * 100, 1) if budgeted > 0 else 0.0
                    result.append({
                        "category_id": cat_id,
                        "category_name": cat_name_map.get(cat_id, "Unknown"),
                        "budgeted": budgeted,
                        "spent": spent,
                        "percentage": percentage,
                    })

                # Sort: over-budget first, then by percentage descending
                result.sort(key=lambda r: (-1 if r["percentage"] > 100 else 0, -r["percentage"], r["category_name"]))

                return result

        return await self._run(_get)

    async def update_transaction_category(self, financial_id: str, category_name: str) -> bool:
        """Update the category of an existing transaction by financial_id."""
        def _update():
            from actual.queries import get_or_create_category
            from actual.database import Transactions
            with self._get_actual() as actual:
                actual.download_budget()
                tx = actual.session.query(Transactions).filter(
                    Transactions.financial_id == financial_id,
                    Transactions.tombstone == 0,
                ).first()
                if not tx:
                    logger.warning(f"Transaction not found for category update: {financial_id}")
                    return False
                cat = get_or_create_category(actual.session, category_name, group_name="Majordom")
                tx.category_id = cat.id
                actual.commit()
                logger.info(f"Category updated in Actual Budget: {financial_id} → {category_name}")
                return True
        return await self._run(_update)

    async def get_total_balance(self) -> float:
        accounts = await self.get_accounts()
        return sum(acc.balance for acc in accounts)

    async def create_account(self, name: str, initial_balance: float = 0.0) -> Account:
        """Create a new account in Actual Budget."""
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
                logger.info(f"Account created: {name} (initial balance: {initial_balance})")
                return Account(id=str(acc.id), name=acc.name, balance=initial_balance)
        return await self._run(_create)

    async def get_full_context(
        self,
        month: int | None = None,
        year: int | None = None,
        recent_limit: int = 20,
    ) -> dict:
        """
        Fetch accounts, monthly stats, and recent transactions in a single session.
        Avoids the 429 rate-limit that occurs when opening three separate sessions.

        Returns a dict with three keys:
          accounts: list[dict] with name and balance (already formatted for chat context)
          stats: dict with month, year, total, count, categories
          recent_transactions: list[dict] with id, date, merchant, amount_cents, etc.
        """
        import calendar
        from datetime import date as _date

        today = _date.today()
        month = month or today.month
        year = year or today.year

        def _get():
            from actual.queries import get_accounts, get_transactions, get_categories

            with self._get_actual() as actual:
                actual.download_budget()

                # 1. Accounts — same logic as get_accounts()
                accounts_data = get_accounts(actual.session)
                accounts_result = []
                for acc in accounts_data:
                    if acc.closed:
                        continue
                    txs = get_transactions(actual.session, account=acc)
                    balance = sum(
                        float(tx.amount or 0)
                        for tx in txs
                        if not tx.tombstone
                    ) / 100
                    accounts_result.append({
                        "id": str(acc.id),
                        "name": acc.name,
                        "balance": balance,
                    })

                # 2. Monthly stats — same logic as get_monthly_stats()
                start = _date(year, month, 1)
                last_day = calendar.monthrange(year, month)[1]
                end = _date(year, month, last_day)

                txs = get_transactions(actual.session, start_date=start, end_date=end)

                total = 0.0
                count = 0
                by_category = defaultdict(lambda: {"total": 0.0, "count": 0, "name": ""})

                for tx in txs:
                    if tx.tombstone or tx.starting_balance_flag:
                        continue
                    amount = float(tx.amount or 0) / 100
                    if amount >= 0:
                        continue  # skip income
                    amount = abs(amount)
                    total += amount
                    count += 1

                    cat_name = "Uncategorized"
                    cat_key = "uncategorized"
                    if tx.category_id and tx.category:
                        cat_name = tx.category.name or "Uncategorized"
                        cat_key = str(tx.category_id)

                    by_category[cat_key]["total"] += amount
                    by_category[cat_key]["count"] += 1
                    by_category[cat_key]["name"] = cat_name

                stats_result = {
                    "month": month,
                    "year": year,
                    "total": round(total, 2),
                    "count": count,
                    "categories": dict(by_category),
                }

                # 3. Recent transactions — same logic as get_recent_transactions()
                all_txs = get_transactions(actual.session)

                txs_result = []
                for tx in all_txs:
                    if tx.tombstone or tx.starting_balance_flag:
                        continue

                    merchant = ""
                    if tx.payee:
                        merchant = tx.payee.name or ""
                    if not merchant and hasattr(tx, "imported_payee"):
                        merchant = tx.imported_payee or ""

                    category_name = None
                    if tx.category:
                        category_name = tx.category.name

                    txs_result.append({
                        "date": tx.date,
                        "merchant": merchant or "Unknown",
                        "amount": abs(float(tx.amount or 0)) / 100,
                        "category": category_name,
                    })

                txs_result.sort(key=lambda t: str(t["date"]), reverse=True)
                txs_result = txs_result[:recent_limit]

                # 4. Categories — for tool calling system prompt
                cats = get_categories(actual.session)
                categories_result = [
                    {"id": str(cat.id), "name": cat.name}
                    for cat in cats
                    if not cat.hidden
                ]

                return {
                    "accounts": accounts_result,
                    "stats": stats_result,
                    "recent_transactions": txs_result,
                    "categories": categories_result,
                }

        return await self._run(_get)

    async def get_recent_transactions(self, limit: int = 20) -> list[dict]:
        """
        Return the most recent transactions from Actual Budget, sorted by date descending.

        Returns plain dicts (not dataclasses) because the caller needs flexible
        access to fields that may or may not be set (category, payee, etc.).

        Each dict has:
          id, date, merchant, amount_cents, category_name, category_id,
          account_name, notes
        """
        def _get():
            from actual.queries import get_transactions
            with self._get_actual() as actual:
                actual.download_budget()
                all_txs = get_transactions(actual.session)

                result = []
                for tx in all_txs:
                    # Skip soft-deleted rows and the synthetic "starting balance" entry
                    if tx.tombstone or tx.starting_balance_flag:
                        continue

                    # Payee name: prefer the named payee object, fall back to
                    # imported_payee (the raw string from bank imports)
                    merchant = ""
                    if tx.payee:
                        merchant = tx.payee.name or ""
                    if not merchant and hasattr(tx, "imported_payee"):
                        merchant = tx.imported_payee or ""

                    category_name = None
                    category_id = None
                    if tx.category:
                        category_name = tx.category.name
                        category_id = str(tx.category.id) if tx.category.id else None

                    account_name = tx.account.name if tx.account else ""

                    result.append({
                        "id": str(tx.id),
                        "date": tx.date,
                        "merchant": merchant,
                        "amount_cents": int(tx.amount or 0),
                        "category_name": category_name,
                        "category_id": category_id,
                        "account_name": account_name,
                        "notes": tx.notes or "",
                    })

                # Sort newest-first then slice — get_transactions() order is not guaranteed
                result.sort(key=lambda t: str(t["date"]), reverse=True)
                return result[:limit]

        return await self._run(_get)

    async def add_transactions_batch(
        self,
        account_id: str,
        transactions: list,
        categorizer=None,
    ) -> tuple[int, int, int, list]:
        """
        Import multiple transactions at once in a single commit.

        Args:
            account_id: Account ID in Actual Budget
            transactions: list[NormalizedTransaction]
            categorizer: Optional SmartCategorizer for auto-categorization

        Returns:
            (imported, skipped_duplicates, errors, low_confidence_list)
            low_confidence_list: [(NormalizedTransaction, prediction)] for manual confirmation
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
                            # Auto-categorize only if the merchant was previously
                            # confirmed by the user (from_history=True).
                            # Keywords/AI alone are not enough — always ask.
                            if pred.from_history and pred.category_name and pred.category_name != "Other":
                                cat_obj = get_or_create_category(
                                    actual.session,
                                    pred.category_name,
                                    group_name="Majordom",
                                )
                            else:
                                low_confidence.append((tx, pred))

                        notes = "[import CSV]"
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
                        logger.warning(f"Error processing transaction {tx.merchant} {tx.amount}: {e}")
                        errors += 1

                if imported > 0:
                    actual.commit()
                    logger.info(f"CSV import: {imported} imported, {skipped} duplicates, {errors} errors, {len(low_confidence)} low confidence")

            return imported, skipped, errors, low_confidence

        return await self._run(_batch)
