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

# Every request builds its own ActualBudgetClient (see e.g. backend/api/home.py's
# _get_client()), but actualpy syncs to one shared local cache file keyed by sync_id —
# concurrent instances racing on that file causes intermittent "no such table" errors
# (#142, e.g. /api/home vs /api/home/pending firing together on Home page load).
# One process-wide lock serializes all actualpy access regardless of client instance.
_actual_lock = asyncio.Lock()


def rule_match_prefix(payee_name: str) -> str:
    """
    Default suggestion for an AB rule's CONTAINS-match text: first word if it's
    specific enough (>=4 alphanumeric chars) — generalizes across store-number
    suffixes, e.g. "Lidl Amsterdam 1234" -> "Lidl" also matches "Lidl Rotterdam
    5678" on a future import. Falls back to the full name otherwise.

    Only a *suggestion* — flows that let the user edit the merchant/payee text
    before confirming (CSV import, receipts) use whatever ends up in that field
    verbatim instead of calling this again, so the user stays in control of
    what a rule actually matches on (#99). Flows without a per-row editable
    field at confirm time (bulk uncategorized-groups action, chat proposal
    notes-rule) still rely on this as the actual value.
    """
    first_word = payee_name.split()[0] if payee_name else ""
    return first_word if len(first_word) >= 4 and first_word.isalnum() else payee_name


def _patch_bank_sync_balance_type() -> None:
    """Make actualpy tolerate balanceType codes it doesn't know about.

    actualpy's BalanceType enum only covers GoCardless's documented values,
    but some banks (e.g. ING NL) return other ISO 20022 codes verbatim
    (observed: "XPCD"). That's a raw balance-type label we never read —
    we only care about the imported transactions — so an unrecognized code
    should not abort the whole sync with a pydantic validation error.
    """
    from actual.api.bank_sync import BalanceType

    def _missing_(cls, value):
        logger.warning("Unknown bank-sync balanceType %r — treating as INFORMATION", value)
        return cls.INFORMATION

    BalanceType._missing_ = classmethod(_missing_)


_patch_bank_sync_balance_type()


def _safe_get_or_create_payee(session, name: str):
    """Like actualpy's get_or_create_payee but tolerates duplicate payee names.

    Uses .first() instead of .one_or_none() so it doesn't crash when the same
    payee name exists multiple times. Creates via actualpy's create_payee so the
    PayeeMapping entry is also created — without it the payee doesn't sync to AB.
    """
    from actual.database import Payees
    from actual.queries import create_payee as _create_payee
    payee = session.query(Payees).filter(
        Payees.name == name, Payees.tombstone == 0
    ).first()
    if payee is None:
        payee = _create_payee(session, name)
        session.flush()  # required: set_transaction_payee looks up payee by ID in DB
    return payee


def _tombstoned_category_remap(session, all_cats) -> tuple[dict[str, str], dict[str, str]]:
    """Fuzzy-match tombstoned (deleted) category ids to a living category id.

    When a category is deleted in AB, its past transactions keep the old
    category_id — get_categories() excludes tombstoned categories, so that
    spending would otherwise be silently dropped from any report.

    Returns (dead_names, remap): dead_names maps every tombstoned category id
    to its original display name; remap contains only the ids that found a
    close-enough living match (cutoff=0.4). Callers decide what to do with an
    unmatched dead id — some keep it visible under its original name, others
    drop it because it has no budget target to attach to.
    """
    from sqlmodel import select as _select
    from actual.database import Categories as _CatTable
    from difflib import get_close_matches

    all_raw = session.exec(_select(_CatTable)).all()
    dead_names = {str(c.id): (c.name or "") for c in all_raw if c.tombstone and c.id}
    living_lower = {(c.name or "").lower(): str(c.id) for c in all_cats if c.id and c.name}

    remap: dict[str, str] = {}
    for dead_id, dead_name in dead_names.items():
        matches = get_close_matches(dead_name.lower(), list(living_lower.keys()), n=1, cutoff=0.4)
        if matches:
            remap[dead_id] = living_lower[matches[0]]
    return dead_names, remap


def _compute_monthly_totals(session, txs) -> dict:
    """Aggregate a month's transactions into total/income/count/per-category breakdown.

    Shared by get_monthly_stats() and get_home_data() so the Home screen and the
    chat tool's spending numbers can't silently diverge if only one gets updated.
    """
    from actual.queries import get_categories

    total = 0.0
    income = 0.0
    count = 0
    by_category: dict[str, dict] = defaultdict(lambda: {"total": 0.0, "count": 0, "name": ""})

    for tx in txs:
        if tx.tombstone or tx.starting_balance_flag:
            continue
        if tx.transferred_id:
            continue  # skip transfer legs — not spending/income
        if tx.notes and '[Balance Adjustment]' in tx.notes:
            continue  # skip reconciliation adjustments — not real income/expense
        amount = float(tx.amount or 0) / 100
        if amount > 0:
            income += amount
            continue
        if tx.category and getattr(tx.category, 'is_income', False):
            continue  # skip income-category transactions
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

    # Remap tombstoned categories to living equivalents via fuzzy match
    try:
        all_cats = get_categories(session)
        dead_names, remap = _tombstoned_category_remap(session, all_cats)
        living_map = {str(c.id): (c.name or "Uncategorized") for c in all_cats if c.id}
        for dead_id, dead_name in dead_names.items():
            if dead_id not in by_category:
                continue
            live_id = remap.get(dead_id)
            if live_id:
                if live_id in by_category:
                    by_category[live_id]["total"] += by_category[dead_id]["total"]
                    by_category[live_id]["count"] += by_category[dead_id]["count"]
                else:
                    by_category[live_id] = by_category[dead_id].copy()
                    by_category[live_id]["name"] = living_map[live_id]
                del by_category[dead_id]
            else:
                by_category[dead_id]["name"] = dead_name or "Other"
    except Exception:
        pass

    return {
        "total": round(total, 2),
        "income": round(income, 2),
        "count": count,
        "categories": dict(by_category),
    }


def _compute_budget_vs_spent(
    session, txs, all_cats, target_year: int, target_month: int, include_zero: bool = False,
) -> list[dict]:
    """Merge budget allocations with actual spending per category for a month.

    Shared by get_budget_status() and get_home_data(). Includes the rollover-aware
    balance fallback (get_accumulated_budgeted_balance) for categories that have
    rollover enabled but got no fresh allocation this month — without it, a category
    funded last month and spent this month would show budgeted=0 even though real
    money is still available (e.g. a "Holidays" category funded in June, spent in July).

    `include_zero=True` keeps categories with no budget and no spending yet this
    month (needed by get_budget_overview() — a full editable budget table must
    show every category, not just the ones already active).
    """
    from datetime import date as _date
    yyyymm = target_year * 100 + target_month

    # --- 1. Fetch budget allocations (+ rollover flag) from zero_budgets ---
    budget_by_category: dict[str, float] = defaultdict(float)
    carryover_by_category: dict[str, bool] = {}

    try:
        from sqlalchemy import text as _text
        # Filter by the `month` column, NOT `id LIKE '{yyyymm}%'` — actualpy's own
        # create_budget() generates a random UUID `id` for new rows (only rows
        # created some other way follow the "{month}-{category_id}" id convention),
        # so an id-prefix filter silently misses any budget set via Majordom's own
        # tools. Confirmed live: a Transport budget written through
        # set_budget_amount() was invisible to this query under the old id-prefix
        # filter despite existing in the table with month=202607.
        rows = session.execute(
            _text("SELECT category, amount, carryover FROM zero_budgets WHERE month = :yyyymm"),
            {"yyyymm": yyyymm},
        ).fetchall()
        for row in rows:
            cat_id = str(row[0]) if row[0] else ""
            amount_cents = float(row[1] or 0)
            budget_by_category[cat_id] += amount_cents / 100
            carryover_by_category[cat_id] = bool(row[2])
        logger.debug("Budget lookup via zero_budgets succeeded: %d rows", len(rows))
    except Exception as e1:
        logger.warning("zero_budgets table not available: %s", e1)
        try:
            from sqlalchemy import text as _text
            rows = session.execute(
                _text("SELECT category, amount, carryover FROM reflect_budgets WHERE month = :yyyymm"),
                {"yyyymm": yyyymm},
            ).fetchall()
            for row in rows:
                cat_id = str(row[0]) if row[0] else ""
                amount_cents = float(row[1] or 0)
                budget_by_category[cat_id] += amount_cents / 100
                carryover_by_category[cat_id] = bool(row[2])
            logger.debug("Budget lookup via reflect_budgets succeeded: %d rows", len(rows))
        except Exception as e2:
            logger.warning(
                "reflect_budgets also not available: %s. Returning spending-only data.", e2,
            )

    # --- 2. Fetch actual spending for the month ---
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

    # --- 3. Category name/group resolution ---
    cat_name_map: dict[str, str] = {}
    cat_group_map: dict[str, str] = {}
    cat_obj_map = {}
    for cat in all_cats:
        if cat.id:
            cat_name_map[str(cat.id)] = cat.name or "Uncategorized"
            cat_group_map[str(cat.id)] = cat.group.name if cat.group else "Unexpected"
            cat_obj_map[str(cat.id)] = cat

    # --- 3b. Remap spending from tombstoned categories to living ones ---
    try:
        _dead_names, remap = _tombstoned_category_remap(session, all_cats)
        for dead_id, live_id in remap.items():
            if dead_id not in spent_by_category:
                continue
            spent_by_category[live_id] += spent_by_category.pop(dead_id)
            logger.debug(
                "Tombstoned category '%s' spending remapped to '%s'",
                _dead_names.get(dead_id, dead_id), cat_name_map.get(live_id, live_id),
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
        # A category with rollover enabled that got no fresh allocation this
        # month (relying entirely on last month's carried-over balance) shows
        # budgeted=0 here, even though real money is still available. Must run
        # BEFORE the budgeted==0-and-spent==0 skip below, otherwise a rollover
        # category with no spending yet this month gets filtered out before
        # ever checking its balance.
        if budgeted == 0 and cat_id in cat_obj_map:
            try:
                from actual.queries import get_accumulated_budgeted_balance
                accumulated = get_accumulated_budgeted_balance(
                    session, _date(target_year, target_month, 1), cat_obj_map[cat_id],
                )
                budgeted = round(float(accumulated), 2)
            except Exception:
                pass
        # Skip system/unbudgeted categories with no activity
        if not include_zero and budgeted == 0 and spent == 0:
            continue
        percentage = round(spent / budgeted * 100, 1) if budgeted > 0 else 0.0
        result.append({
            "category_id": cat_id,
            "category_name": cat_name_map.get(cat_id, "Unknown"),
            "group_name": cat_group_map.get(cat_id, "Unexpected"),
            "budgeted": budgeted,
            "spent": spent,
            "percentage": percentage,
            "carryover": carryover_by_category.get(cat_id, False),
        })

    # Sort: over-budget first, then by percentage descending
    result.sort(key=lambda r: (-1 if r["percentage"] > 100 else 0, -r["percentage"], r["category_name"]))
    return result


def _compute_goal_progress(session, accounts) -> list[dict]:
    """Parse savings goals from account notes and compute progress per account.

    Shared by get_goals() and get_home_data() (#143 audit) — both need the same
    TARGET:/DEADLINE: note-parsing and balance/percentage/monthly_needed math;
    previously copy-pasted in both, risking the same kind of silent drift #93
    already found between get_budget_status()/get_home_data().

    Account note format: "TARGET: 25000" (required), optional "DEADLINE: YYYY-MM".
    """
    import re
    from datetime import date as _date
    from actual.queries import get_transactions

    result = []
    for acc in accounts:
        if acc.closed or acc.tombstone:
            continue
        note = acc.notes or ""
        match = re.search(r'TARGET:\s*([\d]+(?:\.\d+)?)', note, re.IGNORECASE)
        if not match:
            continue
        target = float(match.group(1))
        txs = get_transactions(session, account=acc)
        balance = sum(
            float(tx.amount or 0) for tx in txs if not tx.tombstone
        ) / 100
        percentage = round(balance / target * 100, 1) if target > 0 else 0.0

        # Parse optional DEADLINE: YYYY-MM
        deadline = None
        monthly_needed = None
        months_remaining = None
        dl_match = re.search(r'DEADLINE:\s*(\d{4}-\d{2})', note, re.IGNORECASE)
        if dl_match:
            deadline = dl_match.group(1)
            dl_year, dl_month = map(int, deadline.split("-"))
            today = _date.today()
            months_remaining = (dl_year - today.year) * 12 + (dl_month - today.month)
            if months_remaining > 0:
                monthly_needed = round((target - balance) / months_remaining, 2)

        result.append({
            "id": str(acc.id),
            "name": acc.name,
            "balance": round(balance, 2),
            "target": target,
            "percentage": percentage,
            "deadline": deadline,
            "monthly_needed": monthly_needed,
            "months_remaining": months_remaining,
        })
    return result


@dataclass
class Account:
    id: str
    name: str
    balance: float
    off_budget: bool = False


@dataclass
class Category:
    id: str
    name: str
    group_name: str = ""
    is_income: bool = False


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
        async with _actual_lock:
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
                        off_budget=bool(acc.offbudget),
                    ))
                return result
        return await self._run(_get)

    async def get_today_transactions(self) -> list:
        """Fetch transactions for today only."""
        def _get():
            from actual.queries import get_transactions
            with self._get_actual() as actual:
                actual.download_budget()
                today = date.today()
                return get_transactions(actual.session, start_date=today, end_date=today)
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
                        is_income=bool(cat.group and getattr(cat.group, 'is_income', False)),
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
                totals = _compute_monthly_totals(actual.session, txs)
                return {"month": month, "year": year, **totals}

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
                create_transaction,
                get_categories,
            )
            with self._get_actual() as actual:
                actual.download_budget()

                imported_id = uuid.uuid4().hex[:16]

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
                    payee=payee if payee else None,
                    notes=notes,
                    amount=-abs(amount) if is_expense else abs(amount),
                    category=cat_obj,
                    imported_id=imported_id,
                    imported_payee=payee if payee else None,
                )
                actual.commit()
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
            from datetime import date as _date
            from actual.queries import get_transactions, get_categories

            start = _date(year, month, 1)
            last_day = calendar.monthrange(year, month)[1]
            end = _date(year, month, last_day)

            with self._get_actual() as actual:
                actual.download_budget()
                txs = get_transactions(actual.session, start_date=start, end_date=end)
                all_cats = get_categories(actual.session)  # non-tombstoned only
                return _compute_budget_vs_spent(actual.session, txs, all_cats, year, month)

        return await self._run(_get)

    async def get_budget_overview(self, month: int | None = None, year: int | None = None) -> list[dict]:
        """
        Full editable budget table for a month — every expense category (even
        ones with no budget/spending yet), grouped and sorted like Actual
        Budget's own Budget screen. Each item adds "carryover" (current
        rollover-overspending state) on top of get_budget_status()'s fields.
        """
        today = date.today()
        month = month or today.month
        year = year or today.year

        def _get():
            import calendar
            from datetime import date as _date
            from actual.queries import get_transactions, get_categories

            start = _date(year, month, 1)
            last_day = calendar.monthrange(year, month)[1]
            end = _date(year, month, last_day)

            with self._get_actual() as actual:
                actual.download_budget()
                txs = get_transactions(actual.session, start_date=start, end_date=end)
                all_cats = [c for c in get_categories(actual.session) if not getattr(c, "is_income", False)]
                result = _compute_budget_vs_spent(actual.session, txs, all_cats, year, month, include_zero=True)
                result.sort(key=lambda r: (r["group_name"], r["category_name"]))
                return result

        return await self._run(_get)

    async def delete_transaction(self, financial_id: str) -> bool:
        """Soft-delete a transaction by financial_id (tombstone=1). Returns False if not found."""
        def _delete():
            from actual.database import Transactions
            with self._get_actual() as actual:
                actual.download_budget()
                tx = actual.session.query(Transactions).filter(
                    Transactions.financial_id == financial_id,
                    Transactions.tombstone == 0,
                ).first()
                if not tx:
                    logger.warning(f"Transaction not found for deletion: {financial_id}")
                    return False
                tx.tombstone = 1
                actual.commit()
                logger.info(f"Transaction deleted in Actual Budget: {financial_id}")
                return True
        return await self._run(_delete)

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

    async def find_near_duplicate_transaction(
        self,
        account_id: str,
        amount: float,
        date: date,
        date_window_days: int = 1,
        tolerance_pct: float = 0.02,
    ) -> dict | None:
        """
        Look for an existing UNCATEGORIZED transaction in `account_id` within
        `date_window_days` of `date`, whose amount is within `tolerance_pct` of
        `amount`. For matching a receipt scan against a bank-sync transaction
        that already exists for the same real-world purchase (issue #121) —
        amounts rarely match exactly (OCR total vs. card authorization amount),
        so this is a tolerance match, not exact-hash dedup.
        Returns the closest match (smallest amount delta) as a dict, or None.
        """
        def _find():
            from datetime import timedelta
            from actual.database import Transactions, Payees
            with self._get_actual() as actual:
                actual.download_budget()
                window_start = date - timedelta(days=date_window_days)
                window_end = date + timedelta(days=date_window_days)
                candidates = (
                    actual.session.query(Transactions)
                    .join(Payees, Transactions.payee_id == Payees.id, isouter=True)
                    .filter(
                        Transactions.acct == account_id,
                        Transactions.category_id == None,
                        Transactions.tombstone == 0,
                        Transactions.is_parent == 0,
                        Transactions.date >= int(window_start.strftime("%Y%m%d")),
                        Transactions.date <= int(window_end.strftime("%Y%m%d")),
                    )
                    .all()
                )
                best = None
                best_delta = None
                for tx in candidates:
                    tx_amount = abs(float(tx.amount or 0)) / 100
                    if tx_amount == 0:
                        continue
                    delta_pct = abs(tx_amount - amount) / tx_amount
                    if delta_pct <= tolerance_pct:
                        if best_delta is None or delta_pct < best_delta:
                            best = tx
                            best_delta = delta_pct
                if not best:
                    return None
                return {
                    "financial_id": best.financial_id,
                    "date": best.get_date().isoformat(),
                    "amount": abs(float(best.amount or 0)) / 100,
                    "payee": best.payee.name if best.payee else "",
                    "notes": best.notes or "",
                }
        return await self._run(_find)

    async def attach_receipt_to_transaction(
        self, financial_id: str, category_name: str, notes: str,
    ) -> bool:
        """
        Attach OCR receipt details (category + notes) to an existing
        transaction instead of creating a new one — used when #121's
        near-duplicate match is confirmed by the user. Appends to any
        existing notes rather than overwriting them.
        """
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
                    return False
                cat = get_or_create_category(actual.session, category_name, group_name="Majordom")
                tx.category_id = cat.id
                existing_notes = (tx.notes or "").strip()
                tx.notes = f"{existing_notes} {notes}".strip() if existing_notes else notes
                actual.commit()
                return True
        return await self._run(_update)

    async def adjust_account_balance(self, account_id: str, target_balance: float) -> float:
        """
        Create a balance adjustment transaction so the account's balance matches
        target_balance. Returns the adjustment amount (positive = deposit,
        negative = payment). Returns 0.0 if already matching (within 1 cent).
        """
        def _adjust():
            from actual.queries import get_transactions, create_transaction
            from actual.database import Accounts
            from datetime import date as _date
            import uuid

            with self._get_actual() as actual:
                actual.download_budget()

                acc = actual.session.query(Accounts).filter(
                    Accounts.id == account_id, Accounts.tombstone == 0
                ).first()
                if not acc:
                    raise ValueError(f"Account not found: {account_id}")

                txs = get_transactions(actual.session, account=acc)
                current_cents = sum(int(tx.amount or 0) for tx in txs if not tx.tombstone)
                target_cents = round(target_balance * 100)
                diff_cents = target_cents - current_cents

                if abs(diff_cents) < 1:
                    return 0.0

                diff_euros = diff_cents / 100
                create_transaction(
                    actual.session,
                    date=_date.today(),
                    account=account_id,
                    payee=None,
                    notes="[Balance Adjustment]",
                    amount=diff_euros,
                    category=None,
                    imported_id=f"adj-{account_id[:8]}-{uuid.uuid4().hex[:8]}",
                )
                actual.commit()
                logger.info(
                    "Balance adjustment: account=%s target=%.2f diff=%.2f",
                    account_id, target_balance, diff_euros,
                )
                return diff_euros

        return await self._run(_adjust)

    async def get_goals(self) -> list[dict]:
        """
        Return accounts that have a savings goal defined in their note field.
        Format: the account note must contain a line "TARGET: 25000" (case-insensitive).
        Returns list of {id, name, balance, target, percentage}.
        """
        def _get():
            from actual.queries import get_accounts
            with self._get_actual() as actual:
                actual.download_budget()
                accounts = get_accounts(actual.session)
                return _compute_goal_progress(actual.session, accounts)
        return await self._run(_get)

    async def get_home_data(
        self,
        month: int | None = None,
        year: int | None = None,
    ) -> dict:
        """Fetch all Home screen data in a single AB session — one download_budget()."""

        def _get():
            import calendar
            from datetime import date as _date
            from actual.queries import get_accounts, get_transactions, get_categories
            from actual.database import Transactions, Accounts

            target_month = month or _date.today().month
            target_year = year or _date.today().year

            # Previous month/year (for #77 trend indicators) — handles January rollover.
            if target_month == 1:
                prev_month, prev_year = 12, target_year - 1
            else:
                prev_month, prev_year = target_month - 1, target_year
            prev_last_day = calendar.monthrange(prev_year, prev_month)[1]
            prev_end = _date(prev_year, prev_month, prev_last_day)
            prev_end_int = int(prev_end.strftime("%Y%m%d"))

            with self._get_actual() as actual:
                actual.download_budget()  # once only

                # 1. Accounts (needed for net worth + FIRE)
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
                    # Balance as of the end of the previous month — reuses the same
                    # already-fetched transaction list, no extra AB query. Powers the
                    # FIRE widget's month-over-month trend (#77).
                    balance_prev_month_end = sum(
                        float(tx.amount or 0)
                        for tx in txs
                        if not tx.tombstone and tx.date is not None and tx.date <= prev_end_int
                    ) / 100
                    accounts_result.append({
                        "id": str(acc.id),
                        "name": acc.name,
                        "balance": balance,
                        "balance_prev_month_end": balance_prev_month_end,
                        "off_budget": bool(acc.offbudget),
                    })

                # 2. Monthly stats (cashflow)
                start = _date(target_year, target_month, 1)
                last_day = calendar.monthrange(target_year, target_month)[1]
                end = _date(target_year, target_month, last_day)

                txs = get_transactions(actual.session, start_date=start, end_date=end)
                totals = _compute_monthly_totals(actual.session, txs)

                # Previous month's cashflow (#77 trend) — same shared helper, different range.
                prev_start = _date(prev_year, prev_month, 1)
                prev_txs = get_transactions(actual.session, start_date=prev_start, end_date=prev_end)
                prev_totals = _compute_monthly_totals(actual.session, prev_txs)

                stats_result = {
                    "month": target_month, "year": target_year, **totals,
                    "prev_cashflow": round(prev_totals["income"] - prev_totals["total"], 2),
                }

                # 3. Budget status — same computation as get_budget_status(), reused
                # here so the Home screen and the chat tool never diverge.
                all_cats = get_categories(actual.session)
                budget_result = _compute_budget_vs_spent(
                    actual.session, txs, all_cats, target_year, target_month,
                )

                # 4. Goals — same helper as get_goals(), see rule 20 (#143 audit)
                goals_result = _compute_goal_progress(actual.session, accounts_data)

                # 5. "Needs resolving" counts — surfaced on Home so the user
                # sees them without digging into chat (issue #130). Global
                # counts, not scoped to target_month, same session, no extra
                # download_budget() call.
                uncategorized_count = (
                    actual.session.query(Transactions)
                    .filter(
                        Transactions.category_id == None,
                        Transactions.tombstone == 0,
                        Transactions.is_parent == 0,
                        Transactions.transferred_id == None,
                    )
                    .count()
                )
                unreconciled_count = (
                    actual.session.query(Transactions)
                    .join(Accounts, Transactions.acct == Accounts.id)
                    .filter(
                        Transactions.cleared == False,
                        Transactions.tombstone == 0,
                        Transactions.is_parent == 0,
                        (Accounts.account_sync_source == None) | (Accounts.account_sync_source == ""),
                    )
                    .count()
                )

            return {
                "accounts": accounts_result,
                "stats": stats_result,
                "budget": budget_result,
                "goals": goals_result,
                "uncategorized_count": uncategorized_count,
                "unreconciled_count": unreconciled_count,
            }

        return await self._run(_get)

    async def set_account_goal(self, account_name: str, target: float, deadline: str | None = None) -> str:
        """
        Write or update TARGET: <amount> (and optionally DEADLINE: YYYY-MM) in the account note.
        Returns the account name on success.
        """
        def _set():
            import re
            from actual.queries import get_accounts
            with self._get_actual() as actual:
                actual.download_budget()
                accounts = get_accounts(actual.session)
                acc = next(
                    (a for a in accounts if a.name.lower() == account_name.lower() and not a.closed),
                    None,
                )
                if not acc:
                    raise ValueError(f"Account not found: {account_name}")
                note = acc.notes or ""
                target_tag = f"TARGET: {int(target) if target == int(target) else target}"
                if re.search(r'TARGET:\s*[\d]+(?:\.\d+)?', note, re.IGNORECASE):
                    note = re.sub(r'TARGET:\s*[\d]+(?:\.\d+)?', target_tag, note, flags=re.IGNORECASE)
                else:
                    note = (note.strip() + "\n" + target_tag).strip()
                if deadline:
                    dl_tag = f"DEADLINE: {deadline}"
                    if re.search(r'DEADLINE:\s*\d{4}-\d{2}', note, re.IGNORECASE):
                        note = re.sub(r'DEADLINE:\s*\d{4}-\d{2}', dl_tag, note, flags=re.IGNORECASE)
                    else:
                        note = (note.strip() + "\n" + dl_tag).strip()
                acc.notes = note
                actual.commit()
                return acc.name
        return await self._run(_set)

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

    async def get_category_groups(self) -> list[str]:
        """Return names of all non-hidden category groups."""
        def _get():
            from actual.queries import get_category_groups
            with self._get_actual() as actual:
                actual.download_budget()
                groups = get_category_groups(actual.session)
                return [g.name for g in groups if not g.tombstone and g.name]
        return await self._run(_get)

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

    async def delete_category(self, name: str) -> None:
        """Soft-delete a category by setting tombstone=1. Raises ValueError if not found."""
        def _delete():
            from actual.queries import get_category
            with self._get_actual() as actual:
                actual.download_budget()
                cat = get_category(actual.session, name)
                if not cat:
                    raise ValueError(f"Category not found: {name}")
                cat.tombstone = 1
                actual.commit()
                logger.info(f"Category deleted: {name!r}")
        return await self._run(_delete)

    async def rename_category(self, old_name: str, new_name: str) -> None:
        """Rename an existing category. Raises ValueError if not found."""
        def _rename():
            from actual.queries import get_category
            with self._get_actual() as actual:
                actual.download_budget()
                cat = get_category(actual.session, old_name)
                if not cat:
                    raise ValueError(f"Category not found: {old_name}")
                cat.name = new_name
                actual.commit()
                logger.info(f"Category renamed: {old_name!r} → {new_name!r}")
        return await self._run(_rename)

    async def rename_category_group(self, old_name: str, new_name: str) -> None:
        """Rename an existing category group. Raises ValueError if not found."""
        def _rename():
            from actual.database import CategoryGroups
            with self._get_actual() as actual:
                actual.download_budget()
                group = (
                    actual.session.query(CategoryGroups)
                    .filter(CategoryGroups.name == old_name, CategoryGroups.tombstone == 0)
                    .first()
                )
                if not group:
                    raise ValueError(f"Category group not found: {old_name}")
                group.name = new_name
                actual.commit()
                logger.info(f"Category group renamed: {old_name!r} → {new_name!r}")
        return await self._run(_rename)

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

    @staticmethod
    def _get_or_create_transfer_payee(session, to_acct) -> "Payees":
        """
        Find (or create) the special payee that triggers a linked transfer to
        `to_acct`. When an account is created, actualpy creates a blank Payee
        with `transfer_acct` set to that account's id — setting a transaction's
        payee to it is what makes actualpy auto-create the mirrored transaction
        in the destination account. Shared by create_transfer() and
        create_payee_transfer_rule() so both use the exact same lookup.
        """
        from actual.database import Payees
        from actual.queries import get_or_create_payee

        transfer_payee = (
            session.query(Payees)
            .filter(
                Payees.transfer_acct == to_acct.id,
                Payees.tombstone == 0,
            )
            .first()
        )
        if not transfer_payee:
            transfer_payee = get_or_create_payee(session, None)
            transfer_payee.transfer_acct = to_acct.id
        return transfer_payee

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
                get_account,
            )

            with self._get_actual() as actual:
                actual.download_budget()

                # Resolve accounts
                from_acct = get_account(actual.session, from_account_id)
                if not from_acct:
                    raise ValueError(f"Source account not found: {from_account_id}")
                if from_acct.tombstone or from_acct.closed:
                    raise ValueError(f"Source account is closed: {from_acct.name}")
                to_acct = get_account(actual.session, to_account_id)
                if not to_acct:
                    raise ValueError(f"Destination account not found: {to_account_id}")
                if to_acct.tombstone or to_acct.closed:
                    raise ValueError(f"Destination account is closed: {to_acct.name}")

                transfer_payee = self._get_or_create_transfer_payee(actual.session, to_acct)

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
                    if tx.notes and '[Balance Adjustment]' in tx.notes:
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


    async def count_uncategorized(self) -> int:
        """Count all transactions without a category (expenses and income, excludes transfers)."""
        def _count():
            from actual.database import Transactions
            with self._get_actual() as actual:
                actual.download_budget()
                return (
                    actual.session.query(Transactions)
                    .filter(
                        Transactions.category_id == None,
                        Transactions.tombstone == 0,
                        Transactions.is_parent == 0,
                        Transactions.transferred_id == None,
                    )
                    .count()
                )
        return await self._run(_count)

    async def count_unreconciled(self) -> int:
        """
        Count transactions not yet marked cleared, excluding accounts with a
        live bank sync link (account_sync_source set — gocardless/simplefin).
        Those self-resolve at the next sync, so flagging them is noise; only
        manual/CSV-only accounts (e.g. crypto.com) genuinely stay
        unreconciled until fixed by hand.
        """
        def _count():
            from actual.database import Transactions, Accounts
            with self._get_actual() as actual:
                actual.download_budget()
                return (
                    actual.session.query(Transactions)
                    .join(Accounts, Transactions.acct == Accounts.id)
                    .filter(
                        Transactions.cleared == False,
                        Transactions.tombstone == 0,
                        Transactions.is_parent == 0,
                        (Accounts.account_sync_source == None) | (Accounts.account_sync_source == ""),
                    )
                    .count()
                )
        return await self._run(_count)

    async def get_account_sync_status(self) -> list[dict]:
        """
        Per-account bank-sync metadata for open accounts:
        {id, name, sync_source, last_sync, most_recent_transaction_date}.
        `sync_source` is empty for manual/CSV-only accounts (no live bank
        link) — `most_recent_transaction_date` is used as a staleness proxy
        for those, since there's no import-timestamp field on the account
        itself.
        """
        def _get():
            from actual.queries import get_accounts, get_transactions
            with self._get_actual() as actual:
                actual.download_budget()
                accounts = get_accounts(actual.session)
                result = []
                for acc in accounts:
                    if acc.closed:
                        continue
                    last_sync = getattr(acc, "last_sync", None)
                    most_recent = None
                    if not acc.account_sync_source:
                        txs = get_transactions(actual.session, account=acc)
                        dates = [tx.get_date() for tx in txs if not tx.tombstone]
                        if dates:
                            most_recent = max(dates).isoformat()
                    result.append({
                        "id": str(acc.id),
                        "name": acc.name,
                        "sync_source": acc.account_sync_source or "",
                        "last_sync": last_sync,
                        "most_recent_transaction_date": most_recent,
                    })
                return result
        return await self._run(_get)

    async def run_bank_resync(self, account_name: str) -> int:
        """Trigger a live bank re-sync for one account. Returns the count of newly imported transactions."""
        def _sync():
            from actual.queries import get_account
            with self._get_actual() as actual:
                actual.download_budget()
                acc = get_account(actual.session, account_name)
                if not acc:
                    raise ValueError(f"Account not found: {account_name}")
                new_txs = actual.run_bank_sync(account=acc)
                actual.commit()
                return len(new_txs)
        return await self._run(_sync)

    async def count_uncategorized_by_payee(self, payee: str, notes_contains: str = "") -> int:
        """
        Count uncategorized transactions whose payee matches `payee` (case-insensitive
        substring). If `notes_contains` is set, also requires notes to contain it
        (case-insensitive) — for payees that cover multiple real-world categories
        distinguished only by the bank's description/Omschrijving text.
        """
        def _count():
            from actual.database import Transactions, Payees
            with self._get_actual() as actual:
                actual.download_budget()
                q = (
                    actual.session.query(Transactions)
                    .join(Payees, Transactions.payee_id == Payees.id, isouter=True)
                    .filter(
                        Payees.name.ilike(f"%{payee}%"),
                        Transactions.category_id == None,
                        Transactions.tombstone == 0,
                        Transactions.is_parent == 0,
                    )
                )
                if notes_contains:
                    q = q.filter(Transactions.notes.ilike(f"%{notes_contains}%"))
                return q.count()
        return await self._run(_count)

    async def list_uncategorized_by_payee(
        self, payee: str, notes_contains: str = "", limit: int = 20,
    ) -> list[dict]:
        """
        Return the actual uncategorized transactions matching `payee` (and
        `notes_contains` if set), for confirmation-card preview — so the user
        can see exactly what will be affected instead of just a count.
        """
        def _list():
            from actual.database import Transactions, Payees
            with self._get_actual() as actual:
                actual.download_budget()
                q = (
                    actual.session.query(Transactions)
                    .join(Payees, Transactions.payee_id == Payees.id, isouter=True)
                    .filter(
                        Payees.name.ilike(f"%{payee}%"),
                        Transactions.category_id == None,
                        Transactions.tombstone == 0,
                        Transactions.is_parent == 0,
                    )
                )
                if notes_contains:
                    q = q.filter(Transactions.notes.ilike(f"%{notes_contains}%"))
                txs = q.order_by(Transactions.date.desc()).limit(limit).all()
                return [
                    {
                        "date": tx.get_date().isoformat(),
                        "amount": abs(float(tx.amount or 0)) / 100,
                        "notes": tx.notes or "",
                    }
                    for tx in txs
                ]
        return await self._run(_list)


    async def get_uncategorized_groups(self) -> list[dict]:
        """
        Group uncategorized transactions by payee. For each group:
        - payee_name: str
        - payee_id: str (AB UUID)
        - count: int
        - rule_prefix: str  — first word of payee name if >=4 alphanum chars, else full payee name
        - suggested_category: str | None  — from AB history, or from notes if no history exists
        - suggested_category_source: "history" | "notes" | None
        - is_consistent: bool  — False if same payee was categorized differently before
        """
        def _fetch():
            from actual.database import Transactions, Payees, Categories
            from sqlalchemy import func
            with self._get_actual() as actual:
                actual.download_budget()
                rows = (
                    actual.session.query(
                        Payees.id.label("payee_id"),
                        Payees.name.label("payee_name"),
                        func.count(Transactions.id).label("count"),
                        func.max(Transactions.date).label("latest_date"),
                    )
                    .join(Transactions, Transactions.payee_id == Payees.id)
                    .filter(
                        Transactions.category_id == None,
                        Transactions.tombstone == 0,
                        Transactions.is_parent == 0,
                        Transactions.transferred_id == None,
                    )
                    .group_by(Payees.id, Payees.name)
                    # Most recent transaction first — the user works backward in
                    # time through AB, not by which payee has the most duplicates.
                    .order_by(func.max(Transactions.date).desc())
                    .all()
                )

                # Fetched once, reused for the notes-based fallback below —
                # avoids a per-group category query.
                all_cat_names = [
                    c.name for c in actual.session.query(Categories)
                    .filter(Categories.tombstone == 0, Categories.name != None)
                    .all()
                ]

                groups = []
                for row in rows:
                    rule_prefix = rule_match_prefix(row.payee_name or "")
                    history = (
                        actual.session.query(Transactions.category_id)
                        .filter(
                            Transactions.payee_id == row.payee_id,
                            Transactions.category_id != None,
                            Transactions.tombstone == 0,
                        )
                        .all()
                    )
                    cat_ids = [h.category_id for h in history]
                    unique_cats = set(cat_ids)
                    suggested_category = None
                    suggested_category_source = None
                    is_consistent = True
                    if unique_cats:
                        is_consistent = len(unique_cats) == 1
                        most_common_id = max(set(cat_ids), key=cat_ids.count)
                        cat = actual.session.query(Categories).filter(
                            Categories.id == most_common_id,
                            Categories.tombstone == 0,
                        ).first()
                        if cat:
                            suggested_category = cat.name
                            suggested_category_source = "history"

                    # No usable payee history (e.g. a person's name paid for
                    # varying purposes — groceries vs. gift vs. allowance) —
                    # fall back to matching the uncategorized transactions'
                    # own notes against real category names, same logic as
                    # propose_transaction (#122). Only applied as a fallback,
                    # never overriding an existing history-based suggestion.
                    if suggested_category is None:
                        notes_rows = (
                            actual.session.query(Transactions.notes)
                            .filter(
                                Transactions.payee_id == row.payee_id,
                                Transactions.category_id == None,
                                Transactions.tombstone == 0,
                                Transactions.is_parent == 0,
                                Transactions.transferred_id == None,
                                Transactions.notes != None,
                            )
                            .all()
                        )
                        notes_matches = set()
                        for (notes_text,) in notes_rows:
                            notes_lower = (notes_text or "").lower()
                            if not notes_lower:
                                continue
                            match = next(
                                (c for c in all_cat_names if c.lower() in notes_lower),
                                None,
                            )
                            if match:
                                notes_matches.add(match)
                        # Only suggest if every transaction with usable notes
                        # agrees on the same category — a mixed group (some
                        # "groceries", some "gift") stays unsuggested, letting
                        # the user disambiguate via notes_contains (#105)
                        # instead of guessing wrong for half of them.
                        if len(notes_matches) == 1:
                            suggested_category = next(iter(notes_matches))
                            suggested_category_source = "notes"

                    groups.append({
                        "payee_id": str(row.payee_id),
                        "payee_name": row.payee_name or "Unknown",
                        "count": row.count,
                        "rule_prefix": rule_prefix,
                        "suggested_category": suggested_category,
                        "suggested_category_source": suggested_category_source,
                        "is_consistent": is_consistent,
                    })
                return groups
        return await self._run(_fetch)

    async def get_transactions_by_tag(self, tag: str) -> dict:
        """
        Return every transaction whose notes contain the given #tag (case-insensitive),
        with an income/cost/net breakdown. Powers ad-hoc per-order/per-job costing (#126)
        — e.g. a shared #C002-GVoros tag links a YouTube/Printful order's income
        transaction to its associated cost transaction(s).
        """
        def _fetch():
            from actual.database import Transactions, Payees
            with self._get_actual() as actual:
                actual.download_budget()
                tag_pattern = tag if tag.startswith("#") else f"#{tag}"
                rows = (
                    actual.session.query(Transactions, Payees.name)
                    .outerjoin(Payees, Transactions.payee_id == Payees.id)
                    .filter(
                        Transactions.notes.ilike(f"%{tag_pattern}%"),
                        Transactions.tombstone == 0,
                        Transactions.is_parent == 0,
                    )
                    .order_by(Transactions.date)
                    .all()
                )

                transactions = []
                income = 0.0
                cost = 0.0
                for tx, payee_name in rows:
                    amount = float(tx.amount or 0) / 100
                    if amount > 0:
                        income += amount
                    else:
                        cost += abs(amount)
                    transactions.append({
                        "date": tx.get_date().isoformat() if tx.date is not None else None,
                        "payee": payee_name or "",
                        "amount": round(amount, 2),
                        "notes": tx.notes or "",
                    })

                return {
                    "tag": tag_pattern,
                    "transactions": transactions,
                    "income": round(income, 2),
                    "cost": round(cost, 2),
                    "net": round(income - cost, 2),
                }
        return await self._run(_fetch)

    async def create_payee_rule(self, payee_name_prefix: str, category_id: str) -> None:
        """Create an AB rule: imported_description contains prefix → set category."""
        def _create():
            from actual.rules import Rule, Condition, Action
            from actual.queries import create_rule
            with self._get_actual() as actual:
                actual.download_budget()
                rule = Rule(
                    conditions=[
                        Condition(
                            field="imported_description",
                            op="contains",
                            value=payee_name_prefix,
                        )
                    ],
                    operation="and",
                    actions=[
                        Action(op="set", field="category", value=category_id)
                    ],
                )
                create_rule(actual.session, rule)
                actual.commit()
        await self._run(_create)

    async def create_payee_notes_rule(
        self, payee_name_prefix: str, notes_contains: str, category_id: str,
    ) -> None:
        """
        Create an AB rule: imported_description contains prefix AND notes
        contains notes_contains → set category. Scoped to both payee and
        notes (not notes alone) so it doesn't over-match transactions from
        other payees that happen to share the same description text — e.g.
        a payee whose category varies by transaction (family member: gift
        vs. groceries vs. allowance) only gets auto-categorized for the
        specific notes pattern the user confirmed, not every transaction.
        """
        def _create():
            from actual.rules import Rule, Condition, Action
            from actual.queries import create_rule
            with self._get_actual() as actual:
                actual.download_budget()
                rule = Rule(
                    conditions=[
                        Condition(
                            field="imported_description",
                            op="contains",
                            value=payee_name_prefix,
                        ),
                        Condition(
                            field="notes",
                            op="contains",
                            value=notes_contains,
                        ),
                    ],
                    operation="and",
                    actions=[
                        Action(op="set", field="category", value=category_id)
                    ],
                )
                create_rule(actual.session, rule)
                actual.commit()
        await self._run(_create)

    async def create_payee_transfer_rule(self, payee_name_prefix: str, target_account_id: str) -> None:
        """
        Create an AB rule: imported_description contains prefix → set payee to
        the special transfer payee for target_account_id. Reuses the same
        transfer-payee lookup as create_transfer() — setting a transaction's
        payee to it is what makes actualpy auto-create the linked mirror
        transaction in target_account_id (#99).
        """
        def _create():
            from actual.rules import Rule, Condition, Action
            from actual.queries import create_rule, get_account
            with self._get_actual() as actual:
                actual.download_budget()
                to_acct = get_account(actual.session, target_account_id)
                if not to_acct:
                    raise ValueError(f"Target account not found: {target_account_id}")
                transfer_payee = self._get_or_create_transfer_payee(actual.session, to_acct)
                rule = Rule(
                    conditions=[
                        Condition(
                            field="imported_description",
                            op="contains",
                            value=payee_name_prefix,
                        )
                    ],
                    operation="and",
                    actions=[
                        Action(op="set", field="description", value=transfer_payee.id)
                    ],
                )
                create_rule(actual.session, rule)
                actual.commit()
        await self._run(_create)

    async def match_existing_rules(self, candidates: list[dict]) -> list[dict | None]:
        """
        Read-only check: for each candidate {"payee": str, "notes": str}, see if an
        AB rule already existing (from AB's own UI, or from a previous "save as
        rule" checkbox — create_payee_rule/create_payee_notes_rule/create_payee_transfer_rule)
        would categorize it. Evaluates rule CONDITIONS only via Rule.evaluate() —
        never calls Rule.run()/Action.run(), so nothing is ever written to AB by
        this check, even for a matching transfer rule (#99).

        Fetches the ruleset once and evaluates every candidate in memory — no
        per-candidate query, however many rows are passed.

        Returns, per candidate in the same order:
          {"category_name": str} — a category rule matched
          {"is_transfer": True, "account_id": str, "account_name": str} — a transfer rule matched
          None — no existing rule matches
        """
        def _match():
            from actual.database import Transactions, Payees, Categories, Accounts
            from actual.queries import get_ruleset
            from actual.rules import ActionType

            with self._get_actual() as actual:
                actual.download_budget()
                ruleset = get_ruleset(actual.session)
                if not ruleset.rules:
                    return [None] * len(candidates)

                categories_by_id = {
                    c.id: c.name for c in actual.session.query(Categories)
                    .filter(Categories.tombstone == 0).all()
                }
                transfer_target_by_payee_id = {
                    p.id: p.transfer_acct
                    for p in actual.session.query(Payees)
                    .filter(Payees.transfer_acct != None).all()
                }
                account_names_by_id = {
                    a.id: a.name for a in actual.session.query(Accounts).all()
                }

                results: list[dict | None] = []
                for cand in candidates:
                    tx = Transactions(
                        imported_description=cand.get("payee") or "",
                        notes=cand.get("notes") or "",
                    )
                    match = None
                    for rule in ruleset.rules:
                        if not rule.evaluate(tx):
                            continue
                        for action in rule.actions:
                            if action.op != ActionType.SET:
                                continue
                            if action.field == "category":
                                cat_name = categories_by_id.get(action.value)
                                if cat_name:
                                    match = {"category_name": cat_name}
                            elif action.field == "description":
                                target_acct_id = transfer_target_by_payee_id.get(action.value)
                                if target_acct_id:
                                    match = {
                                        "is_transfer": True,
                                        "account_id": target_acct_id,
                                        "account_name": account_names_by_id.get(target_acct_id, ""),
                                    }
                        if match:
                            break
                    results.append(match)
                return results

        return await self._run(_match)

    async def update_uncategorized_by_payee(
        self, payee: str, category_id: str, notes_contains: str = "",
    ) -> int:
        """
        Find all uncategorized transactions whose payee name matches `payee`
        (case-insensitive substring), optionally also requiring notes to
        contain `notes_contains`. Set their category to `category_id`.
        Returns count of updated transactions.
        """
        def _update():
            from actual.database import Transactions, Payees, Categories
            with self._get_actual() as actual:
                actual.download_budget()
                cat = actual.session.query(Categories).filter(
                    Categories.id == category_id,
                    Categories.tombstone == 0,
                ).first()
                if not cat:
                    raise ValueError(f"Category ID not found: {category_id}")
                q = (
                    actual.session.query(Transactions)
                    .join(Payees, Transactions.payee_id == Payees.id, isouter=True)
                    .filter(
                        Payees.name.ilike(f"%{payee}%"),
                        Transactions.category_id == None,
                        Transactions.tombstone == 0,
                        Transactions.is_parent == 0,
                    )
                )
                if notes_contains:
                    q = q.filter(Transactions.notes.ilike(f"%{notes_contains}%"))
                txs = q.all()
                count = 0
                for tx in txs:
                    tx.category_id = cat.id
                    count += 1
                if count:
                    actual.commit()
                logger.info(
                    "Retroactively categorized %d transaction(s) for payee '%s' → category_id '%s'",
                    count, payee, category_id,
                )
                return count
        return await self._run(_update)

    async def get_budget_copy_source(self, month: int, year: int) -> dict:
        """
        Fetch per-category budgeted amounts for `month`/`year`, for the "copy
        last month's budget" flow (#87). Excludes:
        - Income categories (only expense categories get copied)
        - Goal-template categories — detected via "#template" in the
          category's Notes entry. (Categories.goal_def/template_settings
          looked like they might also signal this — verified live they
          don't: template_settings defaults to {'source': 'notes'} on every
          category regardless, not a usable flag.) Blindly copying a fixed
          amount onto a category that already has its own goal template
          double-budgets it every month instead of tracking toward the goal
          (the exact bug in #125 — Dolomiti received the full €2000 again
          each month via repeated copy).

        Returns {"categories": [{category_id, category_name, group_name,
        amount}], "excluded_templates": [category_name, ...]}.
        """
        def _get():
            import calendar
            from collections import defaultdict
            from actual.queries import get_categories
            from actual.database import Notes

            yyyymm = year * 100 + month
            with self._get_actual() as actual:
                actual.download_budget()

                all_cats = get_categories(actual.session)
                notes_by_id = {
                    str(n.id): (n.note or "")
                    for n in actual.session.query(Notes).all()
                }

                budget_by_category: dict[str, float] = defaultdict(float)
                try:
                    from sqlalchemy import text as _text
                    # Filter by `month`, not `id LIKE` — see get_budget_status().
                    rows = actual.session.execute(
                        _text("SELECT category, amount FROM zero_budgets WHERE month = :yyyymm"),
                        {"yyyymm": yyyymm},
                    ).fetchall()
                    for row in rows:
                        if row[0]:
                            budget_by_category[str(row[0])] += float(row[1] or 0) / 100
                except Exception:
                    try:
                        from sqlalchemy import text as _text
                        rows = actual.session.execute(
                            _text("SELECT category, amount FROM reflect_budgets WHERE month = :yyyymm"),
                            {"yyyymm": yyyymm},
                        ).fetchall()
                        for row in rows:
                            if row[0]:
                                budget_by_category[str(row[0])] += float(row[1] or 0) / 100
                    except Exception:
                        pass

                categories = []
                excluded_templates = []
                for cat in all_cats:
                    if not cat.id or cat.hidden or getattr(cat, "is_income", False):
                        continue
                    cat_id = str(cat.id)
                    note_text = notes_by_id.get(cat_id, "")
                    # goal_def/template_settings are NOT reliable signals here —
                    # verified live that template_settings defaults to
                    # {'source': 'notes'} on every category regardless of
                    # whether it actually has a goal template. The #template
                    # text convention in Notes is the only real signal.
                    has_template = "#template" in note_text.lower()
                    if has_template:
                        excluded_templates.append(cat.name or "Unknown")
                        continue
                    categories.append({
                        "category_id": cat_id,
                        "category_name": cat.name or "Unknown",
                        "group_name": cat.group.name if cat.group else "Unexpected",
                        "amount": round(budget_by_category.get(cat_id, 0.0), 2),
                    })

                categories.sort(key=lambda c: (c["group_name"], c["category_name"]))
                return {"categories": categories, "excluded_templates": excluded_templates}

        return await self._run(_get)

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

    async def set_budget_carryover(self, category_name: str, month: date, enabled: bool) -> bool:
        """
        Toggle "Rollover Overspending" for a category in a given month — the
        same `carryover` field on ZeroBudgets/ReflectBudgets that AB's own UI
        writes (click Balance -> Cover overspending / roll over).

        actualpy's create_budget(carryover=...) only applies that value when
        creating a brand-new budget row — if a budget already exists for the
        month (the common case, e.g. right after #87's copy), the carryover
        kwarg is silently ignored. Set the field directly on the existing
        row instead of relying on that.
        """
        def _set():
            from actual.queries import get_budget, get_category, create_budget
            with self._get_actual() as actual:
                actual.download_budget()
                cat = get_category(actual.session, category_name)
                if not cat:
                    raise ValueError(f"Category not found: {category_name}")
                budget = get_budget(actual.session, month, cat)
                if not budget:
                    budget = create_budget(actual.session, month, cat, amount=0.0, carryover=enabled)
                budget.carryover = int(enabled)
                actual.commit()
                return True
        return await self._run(_set)
