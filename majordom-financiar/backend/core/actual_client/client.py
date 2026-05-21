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


def _safe_get_or_create_payee(session, name: str):
    """Like actualpy's get_or_create_payee but tolerates duplicate payee names."""
    from actual.database import Payees
    from uuid import uuid4
    payee = session.query(Payees).filter(
        Payees.name == name, Payees.tombstone == 0
    ).first()
    if payee is None:
        payee = Payees(id=str(uuid4()), name=name, tombstone=0)
        session.add(payee)
        session.flush()
    return payee


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
                    if tx.transferred_id:
                        continue  # skip transfer legs — not spending
                    if tx.category and getattr(tx.category, 'is_income', False):
                        continue  # skip income-category transactions regardless of sign
                    amount = float(tx.amount or 0) / 100
                    if amount >= 0:
                        continue  # skip income
                    amount = abs(amount)
                    total += amount
                    count += 1

                    cat_name = "Uncategorized"
                    cat_key = "uncategorized"
                    if tx.category_id:
                        if tx.category:
                            cat_name = tx.category.name or "Uncategorized"
                            cat_key = str(tx.category_id)
                        else:
                            # Tombstoned category — keep UUID, remap below
                            cat_key = str(tx.category_id)
                            cat_name = f"Deleted:{cat_key[:8]}"

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
        is_expense: bool = True,
    ) -> str | None:
        """Add a transaction. Returns the ID or None if duplicate."""
        if tx_date is None:
            tx_date = date.today()

        def _add():
            import uuid
            from actual.queries import (
                create_transaction, get_or_create_payee,
                get_categories,
            )
            with self._get_actual() as actual:
                actual.download_budget()

                # Random UUID — manual entries are never deduplicated.
                # (CSV import uses its own dedup logic in add_transactions_batch.)
                imported_id = uuid.uuid4().hex[:16]

                payee_obj = _safe_get_or_create_payee(actual.session, payee) if payee else None
                # Only use existing visible categories — never create new ones, never use hidden ones
                cat_obj = None
                if category_name:
                    all_cats = get_categories(actual.session)
                    cat_obj = next(
                        (c for c in all_cats if c.name.lower() == category_name.lower() and not c.hidden),
                        None,
                    )
                tx = create_transaction(
                    actual.session,
                    date=tx_date,
                    account=account_id,
                    payee=payee_obj,
                    notes=notes,
                    amount=-abs(amount) if is_expense else abs(amount),
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
                    if tx.transferred_id:
                        continue  # skip transfer legs — not spending
                    if tx.category and getattr(tx.category, 'is_income', False):
                        continue  # skip income-category transactions
                    amount = float(tx.amount or 0) / 100
                    if amount >= 0:
                        continue  # skip income
                    amount = abs(amount)
                    cat_id = str(tx.category_id) if tx.category_id else "uncategorized"
                    spent_by_category[cat_id] += amount

                # --- 3. Fetch all categories for name resolution ---
                all_cats = get_categories(actual.session)  # non-tombstoned only
                cat_name_map: dict[str, str] = {}
                for cat in all_cats:
                    if cat.id:
                        cat_name_map[str(cat.id)] = cat.name or "Uncategorized"

                # --- 3b. Remap spending from tombstoned categories to living ones ---
                # When a category is deleted in AB, its transactions keep the old
                # category_id.  get_categories() excludes tombstoned, so those
                # transactions would be silently dropped.  We fuzzy-match deleted
                # category names to living categories and re-attribute the spending.
                try:
                    from sqlmodel import select as _select
                    from actual.database import Categories as _CatTable
                    from difflib import get_close_matches
                    all_raw = actual.session.exec(_select(_CatTable)).all()
                    dead_names = {
                        str(c.id): (c.name or "")
                        for c in all_raw if c.tombstone and c.id
                    }
                    living_lower = {
                        (c.name or "").lower(): str(c.id)
                        for c in all_cats if c.id and c.name
                    }
                    for dead_id, dead_name in dead_names.items():
                        if dead_id not in spent_by_category:
                            continue
                        matches = get_close_matches(
                            dead_name.lower(), list(living_lower.keys()), n=1, cutoff=0.4
                        )
                        if matches:
                            live_id = living_lower[matches[0]]
                            spent_by_category[live_id] += spent_by_category.pop(dead_id)
                            logger.debug(
                                "Tombstoned category '%s' spending remapped to '%s'",
                                dead_name, cat_name_map.get(live_id, live_id),
                            )
                except Exception as e:
                    logger.warning("Tombstone remap failed (non-fatal): %s", e)

                # --- 4. Merge budget + spending — include ALL non-hidden categories ---
                all_category_ids = (
                    set(budget_by_category.keys())
                    | set(spent_by_category.keys())
                    | {str(c.id) for c in all_cats if c.id and not c.hidden}
                )

                result = []
                for cat_id in all_category_ids:
                    if cat_id == "uncategorized":
                        continue
                    # Skip categories not in our name map (deleted, hidden, etc.)
                    if cat_id not in cat_name_map:
                        continue
                    budgeted = round(budget_by_category.get(cat_id, 0.0), 2)
                    spent = round(spent_by_category.get(cat_id, 0.0), 2)
                    # Skip system/unbudgeted categories with no activity
                    if budgeted == 0 and spent == 0:
                        continue
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

    async def create_account(self, name: str, initial_balance: float = 0.0, off_budget: bool = False) -> Account:
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
                    off_budget=off_budget,
                )
                actual.commit()
                logger.info(f"Account created: {name} (initial balance: {initial_balance}, off_budget={off_budget})")
                return Account(id=str(acc.id), name=acc.name, balance=initial_balance)
        return await self._run(_create)

    async def create_category_group(self, name: str) -> str:
        """Create a category group in Actual Budget. Returns the group ID."""
        def _create():
            from actual.queries import create_category_group as _create_group
            with self._get_actual() as actual:
                actual.download_budget()
                group = _create_group(actual.session, name=name)
                actual.commit()
                logger.info(f"Category group created: {name} (id={group.id})")
                return str(group.id)
        return await self._run(_create)

    async def create_category(self, name: str, group_name: str) -> Category:
        """Create a category in a category group. Returns the Category."""
        def _create():
            from actual.queries import create_category as _create_cat
            with self._get_actual() as actual:
                actual.download_budget()
                cat = _create_cat(actual.session, name=name, group_name=group_name)
                actual.commit()
                logger.info(f"Category created: {name} in group {group_name}")
                return Category(id=str(cat.id), name=cat.name, group_name=group_name)
        return await self._run(_create)

    async def create_schedule(self, name: str, amount: float, day_of_month: int, account_id: str, is_income: bool = False) -> str:
        """Create a monthly recurring schedule in Actual Budget. Returns the schedule ID."""
        def _create():
            import calendar
            from datetime import date as _date
            from actual.queries import create_schedule as _create_schedule
            from actual.schedules import Schedule as ScheduleConfig

            today = _date.today()
            year, month = today.year, today.month
            if today.day > day_of_month:
                month += 1
                if month > 12:
                    month, year = 1, year + 1
            try:
                start_date = _date(year, month, day_of_month)
            except ValueError:
                start_date = _date(year, month, calendar.monthrange(year, month)[1])

            schedule_cfg = ScheduleConfig(start=start_date, frequency="monthly", interval=1)
            amount_op = "isapprox" if is_income else "is"

            with self._get_actual() as actual:
                actual.download_budget()
                sched = _create_schedule(
                    actual.session,
                    date=schedule_cfg,
                    amount=float(amount),
                    amount_operation=amount_op,
                    name=name,
                    account=account_id,
                )
                actual.commit()
                logger.info(f"Schedule created: {name} (€{amount} on day {day_of_month})")
                return str(sched.id)
        return await self._run(_create)

    async def create_transfer(
        self,
        from_account_id: str,
        to_account_id: str,
        amount: float,
        tx_date: date,
        notes: str = "",
    ) -> dict:
        """
        Create a transfer between two bank accounts in Actual Budget.

        Uses the transfer payee mechanism from actualpy: when a transaction's payee
        has a transfer_acct pointing to another account, actualpy automatically creates
        a second linked transaction in the destination account with the negated amount.

        Returns {"success": True} on success.
        """
        def _transfer():
            from datetime import date as _date
            from decimal import Decimal
            from actual.queries import (
                create_transaction,
                get_or_create_payee,
                get_account,
            )
            from actual.database import Payees

            with self._get_actual() as actual:
                actual.download_budget()

                # Resolve accounts
                from_acct = get_account(actual.session, from_account_id)
                if not from_acct:
                    raise ValueError(f"Source account not found: {from_account_id}")
                to_acct = get_account(actual.session, to_account_id)
                if not to_acct:
                    raise ValueError(f"Destination account not found: {to_account_id}")

                # Find the transfer payee for the destination account.
                # When an account is created, actualpy creates a Payee with
                # transfer_acct set to the account's id. This payee is what
                # triggers linked transfer transactions.
                transfer_payee = (
                    actual.session.query(Payees)
                    .filter(
                        Payees.transfer_acct == to_acct.id,
                        Payees.tombstone == 0,
                    )
                    .first()
                )
                if not transfer_payee:
                    # Create a transfer payee for the destination account
                    transfer_payee = get_or_create_payee(actual.session, None)
                    transfer_payee.transfer_acct = to_acct.id

                # Create the outgoing transaction in the source account.
                # With process_payee=True (default), create_transaction calls
                # set_transaction_payee which detects the transfer payee and
                # automatically creates a linked transaction in the destination
                # account with the positive amount.
                transfer_notes = f"[Transfer] {notes}" if notes else "[Transfer]"
                tx = create_transaction(
                    actual.session,
                    date=tx_date,
                    account=from_acct,
                    payee=transfer_payee,
                    notes=transfer_notes,
                    amount=-abs(Decimal(str(amount))),
                    category=None,
                    cleared=True,
                )
                actual.commit()
                logger.info(
                    f"Transfer created: {from_acct.name} → {to_acct.name} €{amount:.2f}"
                )
                return {"success": True}

        return await self._run(_transfer)

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

                    date_val = tx.date
                    if isinstance(date_val, int):
                        date_iso = f"{date_val // 10000:04d}-{(date_val % 10000) // 100:02d}-{date_val % 100:02d}"
                    else:
                        try:
                            date_iso = date_val.isoformat()
                        except AttributeError:
                            date_iso = str(date_val)

                    result.append({
                        "id": str(tx.id),
                        "date": date_iso,
                        "merchant": merchant,
                        "amount_cents": int(tx.amount or 0),
                        "category_name": category_name,
                        "category_id": category_id,
                        "account_name": account_name,
                        "notes": tx.notes or "",
                    })

                # Sort newest-first then slice — get_transactions() order is not guaranteed
                result.sort(key=lambda t: t["date"], reverse=True)
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

    async def set_budget_amount(
        self,
        category_name: str,
        new_amount: float,
        month: date | None = None,
    ) -> dict:
        """
        Upsert the budget allocation for a category in the given month.
        Returns {"category_name": ..., "old_amount": ..., "new_amount": ...}
        """
        from datetime import date as _date
        target_month = month or _date.today().replace(day=1)

        def _set():
            from actual.queries import create_budget, get_budget, get_category
            with self._get_actual() as actual:
                actual.download_budget()
                cat = get_category(actual.session, category_name)
                if not cat:
                    raise ValueError(f"Category not found: {category_name}")
                existing = get_budget(actual.session, target_month, cat)
                old_amount = float(existing.amount) / 100 if existing and existing.amount else 0.0
                create_budget(actual.session, target_month, cat, new_amount)
                actual.commit()
                return {"category_name": category_name, "old_amount": old_amount, "new_amount": new_amount}

        return await self._run(_set)
