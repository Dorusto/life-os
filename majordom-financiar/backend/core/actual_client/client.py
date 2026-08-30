from __future__ import annotations

"""
Client for Actual Budget using the official actualpy library.
"""
import asyncio
import hashlib
import logging
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import date

logger = logging.getLogger(__name__)

ACCOUNT_TYPES = ("Cash", "Investment", "Vehicle", "Loan", "Rental")

# Every request builds its own ActualBudgetClient (see e.g. backend/api/home.py's
# _get_client()), but actualpy syncs to one shared local cache file keyed by sync_id —
# concurrent instances racing on that file causes intermittent "no such table" errors
# (#142, e.g. /api/home vs /api/home/pending firing together on Home page load).
# One process-wide lock serializes all actualpy access regardless of client instance.
_actual_lock = asyncio.Lock()

# Shared short-lived READ-ONLY connection cache (#223) — see
# ActualBudgetClient._get_cached_read_actual() for why and how this is safe.
# Module-level like _actual_lock above: there is one Actual Budget instance
# for the whole app, so one shared cache slot is correct, not per-client-instance.
_cached_read_actual = None
_cached_read_expires_at: float = 0.0
_READ_CACHE_TTL_SECONDS = 4.0


class _CachedReadHandle:
    """
    Thin context manager standing in for `with self._get_actual() as actual:`
    at read-only call sites, so they need zero other changes. Unlike the real
    Actual.__exit__, this deliberately does NOT close the connection on exit —
    it stays open and shared until _get_cached_read_actual()'s TTL expires.
    """
    def __init__(self, actual):
        self._actual = actual

    def __enter__(self):
        return self._actual

    def __exit__(self, exc_type, exc_val, exc_tb):
        return False


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


def _financial_id(date_str: str, merchant: str, amount: float) -> str:
    """
    SHA256(date+merchant+amount)[:16] — cross-transport deduplication key.
    Identical for every import path (CSV, receipt scan, /add command), so a
    transaction imported once is never re-imported via another transport.
    """
    sig = f"{date_str}{merchant}{amount:.4f}"
    return hashlib.sha256(sig.encode()).hexdigest()[:16]


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


def _tx_side_dict(tx) -> dict:
    """Serialize one side of a duplicate pair for display/review (#181).

    Fields intentionally mirror the shared pair shape used by the review screen.
    Raw ``Transactions.amount`` is in cents — convert to a EUR float for the UI
    (divide by one hundred) — same convention as the existing
    ``find_near_duplicate_transaction``/``count_uncategorized_by_payee`` queries.

    Uses the row's own ``id`` (always present), not ``financial_id`` — that
    field is only populated for bank-synced/imported transactions or ones
    created via Majordom's own `add_transaction` (which sets `imported_id`);
    anything entered directly in the Actual Budget UI has `financial_id = None`
    (confirmed live: 15/234 transactions in one fixture account), which would
    make `Transactions.financial_id == None` match arbitrarily many rows.
    """
    cat = tx.category
    cat_name = cat.name if (cat and cat.name) else ""
    return {
        "id": tx.id,
        "date": tx.get_date().isoformat(),
        "amount": abs(float(tx.amount or 0)) / 100,
        "payee": tx.payee.name if tx.payee else "",
        "category_id": str(tx.category_id) if tx.category_id else "",
        "category_name": cat_name,
        "notes": tx.notes or "",
    }


def _find_duplicate_candidates(
    session, account, newly_synced_ids: set[str] | None = None,
) -> list[dict]:
    """Find suspected manual-entry vs. bank-sync duplicate pairs in one account.

    Matching rule (#181): same account, exact amount match (both sides describe the
    same real payment — no tolerance, unlike #121's OCR-vs-card-auth matcher), one
    side ``cleared == False`` (manual placeholder) and one side ``cleared == True``
    (bank-synced). No date window — a bank-linked account's uncleared pool stays small
    on its own, and a bad match is only a dismissible suggestion, never an automatic
    action. The "manual" side is the uncleared one, the "synced" side the cleared one.

    When ``newly_synced_ids`` is provided, only pairs whose synced side's
    ``financial_id`` is in that set are returned (used at sync time to restrict
    results to transactions this sync just imported).

    Returns a list of ``{"manual": {...}, "synced": {...}}`` dicts.
    """
    from actual.database import Transactions
    txs = (
        session.query(Transactions)
        .filter(
            Transactions.acct == account.id,
            Transactions.tombstone == 0,
            Transactions.is_parent == 0,
        )
        .all()
    )
    by_amount: dict[int, list] = defaultdict(list)
    for tx in txs:
        if tx.amount is None or tx.amount == 0:
            continue
        # Signed, not abs() — same real payment has the same sign in the same
        # account; an expense and an unrelated income of equal magnitude must
        # never be treated as a candidate pair.
        by_amount[int(tx.amount)].append(tx)

    pairs = []
    for group in by_amount.values():
        manuals = [t for t in group if not t.cleared]
        synceds = [t for t in group if t.cleared]
        for m in manuals:
            for s in synceds:
                if newly_synced_ids is not None and s.financial_id not in newly_synced_ids:
                    continue
                pairs.append({"manual": _tx_side_dict(m), "synced": _tx_side_dict(s)})
    return pairs


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

        # Parse optional NOTE: <free-text purpose>, shown in the goal card's info popup
        goal_note = None
        note_match = re.search(r'NOTE:\s*(.+)', note, re.IGNORECASE)
        if note_match:
            goal_note = note_match.group(1).strip()

        result.append({
            "id": str(acc.id),
            "name": acc.name,
            "balance": round(balance, 2),
            "target": target,
            "percentage": percentage,
            "deadline": deadline,
            "monthly_needed": monthly_needed,
            "months_remaining": months_remaining,
            "note": goal_note,
        })
    return result



# ── Shared FIRE (Financial Independence, Retire Early) helpers ──────────────
# Extracted from backend/api/home.py so the chat tool (get_fire_chart) and the
# Home screen widget share the same calculation — see architecture.md rule 20.

FIRE_EXCLUDE = ["house", "mortgage", "hypotheek", "hypotheken", "cory", "wabi sabi"]

FIRE_MODEL_DEFAULTS = {
    "years_to_transition": 10.0,
    "years_in_retirement": 25.0,
    "monthly_contribution": 820.0,
    "accumulation_return": 0.08,
    "decumulation_return": 0.06,
    "desired_monthly_spend": 2000.0,
}


def _load_fire_model() -> dict:
    """Load stored FIRE model preferences merged with defaults.

    Returns a dict with all 6 keys from FIRE_MODEL_DEFAULTS, plus
    ``is_default_assumptions: bool`` indicating whether the user has
    ever stored any custom value.
    """
    import json
    from backend.core.config import settings
    from backend.core.memory.database import MemoryDB

    db = MemoryDB(settings.memory.db_path)
    raw = db.get_preference("fire_model")
    stored = json.loads(raw) if raw else {}
    model = {**FIRE_MODEL_DEFAULTS, **stored}
    model["is_default_assumptions"] = raw is None
    return model


def _fire_portfolio(accounts: list, balance_attr: str = "balance") -> float:
    return sum(
        getattr(a, balance_attr) for a in accounts
        if a.off_budget
        and not any(p in a.name.lower() for p in FIRE_EXCLUDE)
    )


def _fire_months_to_amount(portfolio: float, target: float, rate: float, monthly_contribution: float) -> int | None:
    """Months from today until compound growth + contributions reach *target*.

    Solved numerically (the lump-sum + annuity formula isn't cleanly invertible).
    *rate* is the annual return (e.g. 8% = 0.08).  Returns None if not
    reached within 100 years (1200 months).
    """
    if portfolio >= target:
        return 0
    if rate == 0:
        # No growth — just linear contributions
        if monthly_contribution <= 0:
            return None
        months = (target - portfolio) / monthly_contribution
        return min(int(months) + 1, 1201) if months < 1200 else None

    for months in range(1, 1201):
        fv = portfolio * (1 + rate) ** (months / 12)
        fv += monthly_contribution * (((1 + rate / 12) ** months - 1) / (rate / 12))
        if fv >= target:
            return months
    return None


def _calc_fire(accounts: list) -> dict:
    """Calculate FIRE progress from an account list (current + previous-month-end balances).

    Uses the 2-phase model:
      1. Accumulation phase (years_to_transition): grow current portfolio + monthly
         contributions at accumulation_return.
      2. Decumulation phase (years_in_retirement): the principal needed at transition
         is the present value of a depleting annuity paying desired_monthly_spend
         for years_in_retirement at decumulation_return.

    All assumptions come from ``_load_fire_model()`` — never hardcoded.
    """
    from datetime import date as _date
    today = _date.today()
    model = _load_fire_model()
    is_default = model.pop("is_default_assumptions", False)

    portfolio = _fire_portfolio(accounts)
    portfolio_prev = _fire_portfolio(accounts, "balance_prev_month_end")

    # ── Required principal at transition (PV of depleting annuity) ──────────
    months_decum = round(model["years_in_retirement"] * 12)
    r = model["decumulation_return"] / 12
    if r == 0:
        required_principal = model["desired_monthly_spend"] * months_decum
    else:
        required_principal = model["desired_monthly_spend"] * (1 - (1 + r) ** -months_decum) / r

    # ── Percentage — today's savings ratio (matches every other goal card's
    # semantics: balance/target, not a forward projection). The forward-looking
    # view already lives in estimated_year/trend_months below; mixing a
    # projected numerator into fire_pct would make it inconsistent with the
    # "€X saved" sums row shown next to it on the card. ──────────────────────
    fire_pct = round(portfolio / required_principal * 100, 1) if required_principal else 0
    fire_pct_prev = round(portfolio_prev / required_principal * 100, 1) if required_principal else 0

    # ── Estimated year + 1-month trend (#164) ──────────────────────────────
    months_to_target = _fire_months_to_amount(
        portfolio, required_principal, model["accumulation_return"], model["monthly_contribution"]
    )
    months_to_target_prev = _fire_months_to_amount(
        portfolio_prev, required_principal, model["accumulation_return"], model["monthly_contribution"]
    )
    estimated_year = (
        today.year + (today.month - 1 + months_to_target) // 12
        if months_to_target is not None else None
    )
    trend_months = (
        months_to_target_prev - months_to_target
        if months_to_target is not None and months_to_target_prev is not None
        else None
    )

    return {
        "fire_portfolio": round(portfolio, 2),
        "fire_target": round(required_principal, 2),
        "fire_pct": fire_pct,
        "fire_pct_prev": fire_pct_prev,
        "monthly_contribution": model["monthly_contribution"],
        "estimated_year": estimated_year,
        "trend_months": trend_months,
        "accumulation_return": model["accumulation_return"],
        "decumulation_return": model["decumulation_return"],
        "years_to_transition": model["years_to_transition"],
        "years_in_retirement": model["years_in_retirement"],
        "desired_monthly_spend": model["desired_monthly_spend"],
        "is_default_assumptions": is_default,
    }


@dataclass
class Account:
    id: str
    name: str
    balance: float
    off_budget: bool = False
    account_type: str | None = None
    # YYYY-MM-DD of the account's most recent transaction — used as "Last
    # updated" by the annual liability balance reminder (#60).
    last_activity_date: str | None = None


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

    def _get_cached_read_actual(self):
        """
        Short-lived (a few seconds) shared READ-ONLY connection, reused across
        near-simultaneous read calls — e.g. one Dashboard render's ~8 parallel
        queries — instead of each opening its own fresh login + full budget
        download from scratch. #223 measured a ~13s Dashboard load dominated
        by exactly that repeated login+download, not by any single slow query.

        Only for methods that never write (never call actual.commit()) — a
        write must keep using self._get_actual() directly, so every write
        stays on its own fully-isolated, stateless connection, same as today.

        No extra locking needed: every call to this already runs inside
        _run()'s single-worker executor behind the module-level _actual_lock,
        so only one caller is ever in here at a time.
        """
        global _cached_read_actual, _cached_read_expires_at
        now = time.monotonic()
        if _cached_read_actual is None or now >= _cached_read_expires_at:
            if _cached_read_actual is not None:
                try:
                    _cached_read_actual.__exit__(None, None, None)
                except Exception:
                    logger.warning("Failed to close expired cached read connection", exc_info=True)
            actual = self._get_actual()
            actual.__enter__()
            _cached_read_actual = actual
            _cached_read_expires_at = now + _READ_CACHE_TTL_SECONDS
        return _CachedReadHandle(_cached_read_actual)

    async def _run(self, func):
        loop = asyncio.get_event_loop()
        async with _actual_lock:
            return await loop.run_in_executor(self._executor, func)

    async def get_accounts(self) -> list[Account]:
        def _get():
            from actual.queries import get_accounts, get_transactions
            with self._get_cached_read_actual() as actual:
                accounts = get_accounts(actual.session)
                result = []
                for acc in accounts:
                    if acc.closed:
                        continue
                    # Calculate balance from transaction sum + most recent
                    # activity date (tx.date is an int YYYYMMDD)
                    txs = get_transactions(actual.session, account=acc)
                    balance = 0.0
                    last_activity_int: int | None = None
                    for tx in txs:
                        if tx.tombstone:
                            continue
                        balance += float(tx.amount or 0)
                        if tx.date and (last_activity_int is None or int(tx.date) > last_activity_int):
                            last_activity_int = int(tx.date)
                    balance /= 100
                    last_activity_date = None
                    if last_activity_int is not None:
                        last_activity_date = (
                            f"{last_activity_int // 10000:04d}-"
                            f"{(last_activity_int // 100) % 100:02d}-"
                            f"{last_activity_int % 100:02d}"
                        )
                    import re
                    account_type = None
                    notes = acc.notes or ""
                    type_match = re.search(r'TYPE:\s*(' + '|'.join(ACCOUNT_TYPES) + r')', notes, re.IGNORECASE)
                    if type_match:
                        account_type = next(
                            (t for t in ACCOUNT_TYPES if t.lower() == type_match.group(1).lower()),
                            None,
                        )
                    result.append(Account(
                        id=str(acc.id),
                        name=acc.name,
                        balance=balance,
                        off_budget=bool(acc.offbudget),
                        account_type=account_type,
                        last_activity_date=last_activity_date,
                    ))
                return result
        return await self._run(_get)

    async def get_balance_history(self, scope: str = "total", days: int = 30, end_date: str | None = None) -> list[dict]:
        """
        Return a daily running balance series for the last `days` days.

        `scope` is one of:
          * "total"      — all open accounts
          * "on_budget"  — only on-budget accounts (off_budget == False)

        This mirrors get_accounts()'s balance calculation: every transaction amount
        is stored in cents, so we accumulate in cents (int) and only convert to EUR
        when building the final day-by-day series, avoiding float drift.

        The query uses actualpy's built-in `off_budget` filter rather than manually
        cross-referencing get_accounts().  The returned series is continuous — days
        with no transactions carry forward the last known running balance.
        """
        def _get():
            from datetime import date as _date, timedelta
            from actual.queries import get_transactions

            with self._get_cached_read_actual() as actual:

                off_budget = False if scope == "on_budget" else None
                txs = get_transactions(actual.session, off_budget=off_budget)

                # Build a sorted, date-bearing transaction list.  tx.date is an
                # actualpy int field in YYYYMMDD form.
                dated = [tx for tx in txs if not tx.tombstone and tx.date is not None]
                dated.sort(key=lambda tx: tx.date)

                today = _date.today()
                if end_date is not None:
                    try:
                        today = _date.fromisoformat(end_date)
                    except ValueError:
                        pass  # invalid ISO stays today
                start = today - timedelta(days=days - 1)

                def _date_int(d: _date) -> int:
                    return d.year * 10000 + d.month * 100 + d.day

                start_int = _date_int(start)

                running_cents = 0
                idx = 0
                n = len(dated)

                # Include every transaction that happened before the visible window,
                # so the first visible day already reflects the full all-time balance.
                while idx < n and dated[idx].date < start_int:
                    running_cents += int(dated[idx].amount or 0)
                    idx += 1

                result = []
                for offset in range(days):
                    day = start + timedelta(days=offset)
                    day_int = _date_int(day)

                    # Add all transactions up to the end of this calendar day.
                    while idx < n and dated[idx].date <= day_int:
                        running_cents += int(dated[idx].amount or 0)
                        idx += 1

                    result.append({
                        "date": day.isoformat(),
                        "balance": round(running_cents / 100, 2),
                    })

                return result

        return await self._run(_get)


    async def get_fire_status(self) -> dict:
        """Fetch accounts fresh and compute FIRE status.

        Own download_budget() + get_accounts(), same pattern as get_goals().
        Returns the _calc_fire() dict (fire_portfolio, fire_target, fire_pct, etc.).
        """
        def _get():
            from actual.queries import get_accounts, get_transactions
            from types import SimpleNamespace
            from datetime import date as _date
            import calendar

            with self._get_actual() as actual:

                # Previous month-end date for balance_prev_month_end
                today = _date.today()
                if today.month == 1:
                    prev_month, prev_year = 12, today.year - 1
                else:
                    prev_month, prev_year = today.month - 1, today.year
                prev_last_day = calendar.monthrange(prev_year, prev_month)[1]
                prev_end = _date(prev_year, prev_month, prev_last_day)
                prev_end_int = int(prev_end.strftime("%Y%m%d"))

                accounts_raw = get_accounts(actual.session)
                accounts_result = []
                for acc in accounts_raw:
                    if acc.closed:
                        continue
                    txs = get_transactions(actual.session, account=acc)
                    balance = sum(
                        float(tx.amount or 0)
                        for tx in txs
                        if not tx.tombstone
                    ) / 100
                    balance_prev_month_end = sum(
                        float(tx.amount or 0)
                        for tx in txs
                        if not tx.tombstone and tx.date is not None and tx.date <= prev_end_int
                    ) / 100
                    accounts_result.append({
                        "id": str(acc.id),
                        "name": str(acc.name),
                        "balance": balance,
                        "balance_prev_month_end": balance_prev_month_end,
                        "off_budget": bool(acc.offbudget),
                    })

                # Build SimpleNamespace objects (same shape home.py used to build)
                accounts = [SimpleNamespace(**a) for a in accounts_result]
                return _calc_fire(accounts)

        return await self._run(_get)

    async def get_today_transactions(self) -> list:
        """Fetch transactions for today only."""
        def _get():
            from actual.queries import get_transactions
            with self._get_actual() as actual:
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
                txs = get_transactions(actual.session, start_date=start, end_date=end)
                totals = _compute_monthly_totals(actual.session, txs)
                return {"month": month, "year": year, **totals}

        return await self._run(_get)

    async def get_monthly_totals_batch(self, months: list[tuple[int, int]]) -> list[dict]:
        """
        Same per-month totals as get_monthly_stats(), for an arbitrary list of
        (month, year) tuples, but in ONE download_budget() session instead of one
        per month. get_monthly_stats() called in a loop (the original #165 budget-
        trend and the pre-existing get_spending_trend chat tool both did this)
        logs in to Actual Budget once per month — for a 12-month window that's
        12 logins in quick succession, which reliably trips Actual Budget's own
        login rate limit (verified live: a 12M request 429'd, then locked out
        every other request for the cooldown period). This is the shared fix —
        get_spending_trend should move onto it too next time it's touched.
        """
        def _get():
            import calendar
            from actual.queries import get_transactions
            from datetime import date as _date

            with self._get_actual() as actual:
                results = []
                for month, year in months:
                    start = _date(year, month, 1)
                    last_day = calendar.monthrange(year, month)[1]
                    end = _date(year, month, last_day)
                    txs = get_transactions(actual.session, start_date=start, end_date=end)
                    totals = _compute_monthly_totals(actual.session, txs)
                    results.append({"month": month, "year": year, **totals})
                return results

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

            with self._get_cached_read_actual() as actual:
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

    async def add_transaction_tag(self, transaction_id: str, tag: str) -> str:
        """
        Append a #tag to a transaction's notes (trip tags, #176) — looked up by
        row `id`, the identifier finance__get_transactions/get_untagged_transactions
        already surface to the LLM, NOT `financial_id` (a different field used by
        update_transaction_category's lookup elsewhere in this file).

        No-ops if the tag is already present (case-insensitive substring check),
        so re-confirming the same tag twice doesn't duplicate it in notes.
        Returns the transaction's resulting notes string.
        """
        def _update():
            from actual.database import Transactions
            with self._get_actual() as actual:
                tx = actual.session.query(Transactions).filter(
                    Transactions.id == transaction_id,
                    Transactions.tombstone == 0,
                ).first()
                if not tx:
                    raise ValueError(f"Transaction not found: {transaction_id}")
                tag_pattern = tag if tag.startswith("#") else f"#{tag}"
                notes = tx.notes or ""
                if tag_pattern.lower() in notes.lower():
                    return notes
                new_notes = f"{notes} {tag_pattern}".strip()
                tx.notes = new_notes
                actual.commit()
                logger.info(f"Tag added to transaction {transaction_id}: {tag_pattern}")
                return new_notes
        return await self._run(_update)

    async def bulk_update_category(self, financial_ids: list[str], category_id: str) -> int:
        """Set the same category on many transactions in one download/commit cycle.
        Returns the number of transactions actually updated (skips ids not found).

        One ``download_budget()`` + one ``commit()`` for the whole batch (#184) —
        deliberately NOT a loop over ``update_transaction_category()``, which opens
        and commits its own session per call (one full round trip per row, far too
        slow for a bulk operation on hundreds of rows).
        """
        def _update():
            from actual.database import Transactions
            with self._get_actual() as actual:
                txs = actual.session.query(Transactions).filter(
                    Transactions.financial_id.in_(financial_ids),
                    Transactions.tombstone == 0,
                ).all()
                for tx in txs:
                    tx.category_id = category_id
                actual.commit()
                logger.info(
                    "Bulk category update: %d/%d transactions → %s",
                    len(txs), len(financial_ids), category_id,
                )
                return len(txs)
        return await self._run(_update)

    async def split_transaction(self, transaction_id: str, splits: list[dict]) -> dict:
        """
        Split an existing transaction into N children, one per category (#115).

        The original transaction becomes the parent (is_parent=1, no category);
        each entry in `splits` becomes a child carrying its own category and
        amount. `splits` is a list of {"category_id": str, "amount": float}
        with always-positive amounts — the sign follows the original
        transaction's direction (an expense's children stay negative, an
        income's stay positive). Actual Budget's own UI shows the result
        natively as a "Split" transaction once the underlying data is correct.

        `transaction_id` is the row's own primary key (`Transactions.id`), the
        same value `add_transaction()`/`ReceiptService.confirm()` return as
        "transaction_id" — NOT `financial_id` (architecture.md rule 21:
        `financial_id` is only populated for bank-synced/imported rows and is
        None for anything Majordom itself created via `add_transaction()`,
        which would make an equality filter on it match arbitrarily, or
        nothing at all, for exactly the transactions this method needs to
        find).

        Raises ValueError if the transaction is not found, is already split,
        any category_id is unknown, or the split amounts don't balance the
        original total (within 0.01 tolerance) — the API layer turns these
        into a 400.
        """
        def _split():
            from actual.queries import create_split, get_categories
            from actual.database import Transactions
            with self._get_actual() as actual:

                tx = actual.session.query(Transactions).filter(
                    Transactions.id == transaction_id,
                    Transactions.tombstone == 0,
                ).first()
                if not tx:
                    raise ValueError(f"Transaction not found: {transaction_id}")
                if tx.is_parent:
                    raise ValueError("Transaction is already split")

                original_amount = tx.get_amount()  # signed Decimal (EUR)
                sign = 1 if original_amount >= 0 else -1
                requested_total = sum(abs(float(s["amount"])) for s in splits)
                if abs(requested_total - abs(float(original_amount))) > 0.01:
                    raise ValueError(
                        f"Splits sum to {requested_total:.2f}, transaction total is {abs(float(original_amount)):.2f}"
                    )

                valid_ids = {str(c.id) for c in get_categories(actual.session) if c.id}
                bad = [s["category_id"] for s in splits if s["category_id"] not in valid_ids]
                if bad:
                    raise ValueError(f"Unknown category id(s): {', '.join(bad)}")

                tx.is_parent = 1
                tx.category_id = None
                created = []
                for s in splits:
                    child = create_split(actual.session, tx, amount=sign * abs(float(s["amount"])))
                    child.category_id = s["category_id"]
                    # create_split()/create_transaction() default cleared=False
                    # regardless of the parent's actual state — architecture.md
                    # rule 7 requires every creation path to set it explicitly,
                    # or a split on an already-cleared/reconciled transaction
                    # silently leaves its children permanently unreconciled.
                    child.cleared = tx.cleared
                    created.append(str(child.id))

                actual.commit()
                logger.info("Transaction split: %s → %d children", transaction_id, len(created))
                return {"parent_transaction_id": transaction_id, "child_count": len(created)}
        return await self._run(_split)

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

    async def get_csv_import_context(
        self,
    ) -> tuple[set[str], list[str], dict[tuple[str, str], list[float]], list[str]]:
        """
        Single AB session returning the data needed for a CSV preview:
          - set of financial_ids already in AB (for exact duplicate detection)
          - list of non-hidden AB category names (for the frontend dropdown)
          - (date, payee name lower) -> list of existing amounts, for near-duplicate
            detection (same date+merchant already in AB, but a different amount)
          - list of non-hidden category group names (for the "create new category" option)
        """
        def _get():
            from actual.queries import get_categories, get_category_groups, get_transactions
            with self._get_actual() as actual:
                existing_ids = {
                    tx.financial_id
                    for tx in get_transactions(actual.session)
                    if tx.financial_id and not tx.tombstone
                }
                ab_categories = [
                    c.name for c in get_categories(actual.session)
                    if c.name and not c.hidden and not c.tombstone
                ]
                category_groups = [
                    g.name for g in get_category_groups(actual.session)
                    if g.name and not g.hidden and not g.tombstone
                ]
                near_dup_index: dict[tuple[str, str], list[float]] = {}
                for tx in get_transactions(actual.session):
                    if tx.tombstone or not tx.payee or not tx.payee.name:
                        continue
                    key = (tx.get_date().isoformat(), tx.payee.name.strip().lower())
                    near_dup_index.setdefault(key, []).append(abs(float(tx.amount or 0)) / 100)
                return existing_ids, ab_categories, near_dup_index, category_groups
        return await self._run(_get)

    async def execute_csv_import(
        self,
        account_id: str,
        rows: list[dict],
    ) -> tuple[int, int, int, int]:
        """
        Write confirmed CSV rows to Actual Budget in a single session.

        Categories are resolved by name against the existing AB category list.
        No new categories are ever created — if a name is not found the transaction
        is imported without a category.

        Merge logic: if a duplicate already exists in AB without a category, and
        the CSV row has a confirmed category, assign the category instead of skipping.

        Retroactive categorization: after import, any existing uncategorized transaction
        whose payee name matches a confirmed merchant in this import gets the same category.

        Returns (imported, skipped, merged, retroactively_updated).
        """
        def _import():
            from datetime import datetime as dt
            from actual.database import Transactions
            from actual.queries import (
                create_transaction,
                get_categories,
                get_or_create_payee,
                get_transactions,
            )

            with self._get_actual() as actual:

                # Build dedup map: financial_id → transaction (for merge checks)
                existing_tx_map = {
                    tx.financial_id: tx
                    for tx in get_transactions(actual.session)
                    if tx.financial_id and not tx.tombstone
                }
                existing_ids = set(existing_tx_map.keys())

                # Category lookup by name — never create new categories
                all_cats = {
                    c.name: c
                    for c in get_categories(actual.session)
                    if not c.tombstone
                }

                imported = 0
                skipped = 0
                merged = 0

                for row in rows:
                    try:
                        tx_date = dt.strptime(row["date"], "%Y-%m-%d").date()
                    except ValueError:
                        tx_date = dt.now().date()

                    fid = _financial_id(tx_date.isoformat(), row["merchant"], row["amount"])

                    if row["duplicate"] or fid in existing_ids:
                        existing = existing_tx_map.get(fid)
                        if existing and not existing.category_id and row["category_name"]:
                            cat_obj = all_cats.get(row["category_name"])
                            if cat_obj:
                                existing.category = cat_obj
                                merged += 1
                            else:
                                skipped += 1
                        else:
                            skipped += 1
                        continue

                    # User-confirmed transfer → create proper AB transfer (two linked transactions).
                    # For expense rows: money leaves account_id → transfer_to_account_id.
                    # For income rows: money arrives from transfer_to_account_id → account_id.
                    if row["transfer_to_account_id"]:
                        from actual.queries import create_transfer as ab_create_transfer
                        from decimal import Decimal
                        tx_notes = f"[import CSV] {row['notes']}".strip() if row["notes"] else "[import CSV]"
                        src = account_id if row["is_expense"] else row["transfer_to_account_id"]
                        dst = row["transfer_to_account_id"] if row["is_expense"] else account_id
                        src_tx, dst_tx = ab_create_transfer(
                            actual.session,
                            date=tx_date,
                            source_account=src,
                            dest_account=dst,
                            amount=Decimal(str(row["amount"])),
                            notes=tx_notes,
                        )
                        # create_transfer() takes no imported_id/cleared params — set them
                        # directly on both legs so dedup (existing_tx_map) and reconciliation
                        # see this transfer on future imports. See issue #102.
                        src_tx.financial_id = fid
                        src_tx.cleared = True
                        dst_tx.financial_id = _financial_id(tx_date.isoformat(), row["merchant"], -row["amount"])
                        dst_tx.cleared = True
                        existing_ids.add(fid)
                        imported += 1
                        continue

                    # Skip auto-detected transfer candidates that have no user-confirmed destination
                    if row["is_transfer_candidate"]:
                        skipped += 1
                        continue

                    payee = get_or_create_payee(actual.session, row["merchant"])
                    cat_obj = all_cats.get(row["category_name"]) if row["category_name"] else None

                    actual_amount = -abs(row["amount"]) if row["is_expense"] else abs(row["amount"])
                    tx_notes = f"[import CSV] {row['notes']}".strip() if row["notes"] else "[import CSV]"
                    create_transaction(
                        actual.session,
                        date=tx_date,
                        account=account_id,
                        payee=payee,
                        notes=tx_notes,
                        amount=actual_amount,
                        category=cat_obj,
                        imported_id=fid,
                        cleared=True,
                        imported_payee=row["merchant"],
                    )
                    existing_ids.add(fid)
                    imported += 1

                # --- Retroactive categorization ---
                # For each confirmed merchant→category in this import, find all existing
                # uncategorized transactions with the same payee and assign the category.
                merchant_category_map: dict[str, str] = {
                    row["merchant"].lower(): row["category_name"]
                    for row in rows
                    if not row["duplicate"] and not row["is_transfer_candidate"] and row["category_name"]
                }

                retroactively_updated = 0
                if merchant_category_map:
                    uncategorized = actual.session.query(Transactions).filter(
                        Transactions.tombstone == 0,
                        Transactions.category_id == None,
                    ).all()
                    for tx in uncategorized:
                        if not tx.payee or not tx.payee.name:
                            continue
                        cat_name = merchant_category_map.get(tx.payee.name.lower())
                        if cat_name:
                            cat_obj = all_cats.get(cat_name)
                            if cat_obj:
                                tx.category_id = cat_obj.id
                                retroactively_updated += 1

                if imported > 0 or merged > 0 or retroactively_updated > 0:
                    actual.commit()
                    logger.info(
                        "CSV import committed: %d rows, %d merged, %d retroactively categorized",
                        imported, merged, retroactively_updated,
                    )

            return imported, skipped, merged, retroactively_updated
        return await self._run(_import)

    async def close_account(self, account_id: str) -> str:
        """
        Mark an account as closed in Actual Budget. Returns the account name.
        """
        def _close():
            from actual.database import Accounts

            with self._get_actual() as actual:

                acc = actual.session.query(Accounts).filter(
                    Accounts.id == account_id, Accounts.tombstone == 0
                ).first()
                if not acc:
                    raise ValueError(f"Account not found: {account_id}")

                acc.closed = True
                actual.commit()
                return acc.name
        return await self._run(_close)

    async def close_account_with_transfer(self, account_id: str, destination_account_id: str) -> str:
        """
        Zero out an account's balance by transferring it to destination_account_id,
        then close it — both in the same commit so the two steps can't split
        (transfer succeeds but close fails, or vice versa).

        Reuses the transfer-payee mechanism from create_transfer(): if balance > 0,
        the money moves out of the account being closed; if balance < 0 (a debt),
        the destination account pays it off instead. Returns the account name.
        """
        def _close_with_transfer():
            from decimal import Decimal
            from datetime import date as _date
            from actual.database import Accounts
            from actual.queries import create_transaction, get_account, get_transactions

            with self._get_actual() as actual:

                acc = get_account(actual.session, account_id)
                if not acc or acc.tombstone:
                    raise ValueError(f"Account not found: {account_id}")
                dest_acct = get_account(actual.session, destination_account_id)
                if not dest_acct or dest_acct.tombstone:
                    raise ValueError(f"Destination account not found: {destination_account_id}")
                if dest_acct.closed:
                    raise ValueError(f"Destination account is closed: {dest_acct.name}")

                balance = sum(
                    float(tx.amount or 0)
                    for tx in get_transactions(actual.session, account=acc)
                    if not tx.tombstone
                ) / 100

                if abs(balance) >= 0.01:
                    # balance > 0: money leaves the closing account into destination.
                    # balance < 0 (debt): destination pays it off into the closing account.
                    from_acct, to_acct = (acc, dest_acct) if balance > 0 else (dest_acct, acc)
                    transfer_payee = self._get_or_create_transfer_payee(actual.session, to_acct)
                    create_transaction(
                        actual.session,
                        date=_date.today(),
                        account=from_acct,
                        payee=transfer_payee,
                        notes="[Transfer] Account closure",
                        amount=-abs(Decimal(str(balance))),
                        category=None,
                        cleared=True,
                    )

                closing_acc = actual.session.query(Accounts).filter(
                    Accounts.id == account_id, Accounts.tombstone == 0
                ).first()
                closing_acc.closed = True
                actual.commit()
                return acc.name
        return await self._run(_close_with_transfer)

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

            with self._get_cached_read_actual() as actual:

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

    async def set_account_goal(
        self, account_name: str, target: float, deadline: str | None = None, goal_note: str | None = None,
    ) -> str:
        """
        Write or update TARGET: <amount> (and optionally DEADLINE: YYYY-MM, NOTE: <purpose>)
        in the account note. Returns the account name on success.
        """
        def _set():
            import re
            from actual.queries import get_accounts
            with self._get_actual() as actual:
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
                if goal_note:
                    # Single-line tag — strip newlines so it can't swallow a
                    # later TARGET:/DEADLINE: line or itself be swallowed by them.
                    note_tag = f"NOTE: {goal_note.strip().replace(chr(10), ' ')}"
                    if re.search(r'NOTE:\s*.+', note, re.IGNORECASE):
                        note = re.sub(r'NOTE:\s*.+', note_tag, note, flags=re.IGNORECASE)
                    else:
                        note = (note.strip() + "\n" + note_tag).strip()
                acc.notes = note
                actual.commit()
                return acc.name
        return await self._run(_set)

    async def set_account_type(self, account_id: str, account_type: str) -> str:
        """Set TYPE: <value> tag on account notes. Returns account name."""
        canonical = None
        for t in ACCOUNT_TYPES:
            if t.lower() == account_type.lower():
                canonical = t
                break
        if canonical is None:
            raise ValueError(
                f"Invalid account type: {account_type!r}. Must be one of {', '.join(ACCOUNT_TYPES)}"
            )

        def _set():
            import re
            from actual.database import Accounts
            with self._get_actual() as actual:
                acc = actual.session.query(Accounts).filter(
                    Accounts.id == account_id,
                    Accounts.tombstone == 0,
                ).first()
                if not acc or acc.closed:
                    raise ValueError(f"Account not found: {account_id}")
                note = acc.notes or ""
                type_tag = f"TYPE: {canonical}"
                if re.search(r'TYPE:\s*\w+', note, re.IGNORECASE):
                    note = re.sub(r'TYPE:\s*\w+', type_tag, note, flags=re.IGNORECASE)
                else:
                    note = (note.strip() + "\n" + type_tag).strip()
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
                groups = get_category_groups(actual.session)
                return [g.name for g in groups if not g.tombstone and g.name]
        return await self._run(_get)

    async def create_category(self, name: str, group_name: str) -> Category:
        """Create a category in a category group. Returns the Category."""
        def _create():
            from actual.queries import create_category as _create_cat
            with self._get_actual() as actual:
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
                cat = get_category(actual.session, name)
                if not cat:
                    raise ValueError(f"Category not found: {name}")
                cat.tombstone = 1
                actual.commit()
                logger.info(f"Category deleted: {name!r}")
        return await self._run(_delete)

    async def delete_category_group(self, name: str) -> None:
        """
        Soft-delete an empty category group (tombstone=1). Raises ValueError
        if the group doesn't exist, or if it still contains any live category.
        """
        def _delete():
            from actual.database import CategoryGroups
            from actual.queries import get_categories

            with self._get_actual() as actual:

                # Block deletion if any non-tombstoned category still lives in it
                living_categories = [
                    c for c in get_categories(actual.session)
                    if not getattr(c, 'tombstone', False)
                    and (c.group.name if c.group else '') == name
                ]
                if living_categories:
                    count = len(living_categories)
                    raise ValueError(
                        f"Category group '{name}' still has {count} categor{'y' if count == 1 else 'ies'} — move or delete them first"
                    )

                group = (
                    actual.session.query(CategoryGroups)
                    .filter(CategoryGroups.name == name, CategoryGroups.tombstone == 0)
                    .first()
                )
                if not group:
                    raise ValueError(f"Category group not found: {name}")

                group.tombstone = 1
                actual.commit()
                logger.info(f"Category group deleted: {name!r}")

        return await self._run(_delete)

    async def rename_account(self, account_id: str, new_name: str) -> None:
        """Rename an existing account by id. Raises ValueError if not found."""
        def _rename():
            from actual.database import Accounts
            with self._get_actual() as actual:
                acc = actual.session.query(Accounts).filter(
                    Accounts.id == account_id,
                    Accounts.tombstone == 0,
                ).first()
                if not acc:
                    raise ValueError(f"Account not found: {account_id}")
                acc.name = new_name
                actual.commit()
                logger.info(f"Account renamed: {account_id} → {new_name!r}")
        return await self._run(_rename)

    async def rename_category(self, old_name: str, new_name: str) -> None:
        """Rename an existing category. Raises ValueError if not found."""
        def _rename():
            from actual.queries import get_category
            with self._get_actual() as actual:
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
    def _get_or_create_transfer_payee(session, to_acct):
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

    async def get_transaction_by_id(self, transaction_id: str) -> dict | None:
        """
        Return a single non-tombstoned transaction's display fields by its row
        `id` — companion read for the transfer-conversion flow (#144), which
        needs the transaction's date/amount/payee/account for the confirmation
        card before anything is written.
        """
        def _get():
            from actual.database import Transactions
            with self._get_actual() as actual:
                tx = actual.session.query(Transactions).filter(
                    Transactions.id == transaction_id,
                    Transactions.tombstone == 0,
                ).first()
                if not tx:
                    return None
                return {
                    "id": str(tx.id),
                    "date": tx.get_date().isoformat(),
                    "amount": abs(float(tx.amount or 0)) / 100,
                    "merchant": tx.payee.name if tx.payee else "",
                    "account_id": str(tx.acct) if tx.acct else "",
                    "account_name": tx.account.name if tx.account else "",
                }
        return await self._run(_get)

    async def convert_transaction_to_transfer(
        self, transaction_id: str, target_account_id: str
    ) -> dict:
        """
        Convert an existing standalone transaction into a real AB transfer by
        reassigning its payee to the target account's transfer payee (#144).

        Reuses `_get_or_create_transfer_payee` (shared with create_transfer())
        for the payee lookup, then applies it to the EXISTING transaction via
        actualpy's `set_transaction_payee()` — the same function
        create_transaction(process_payee=True) calls internally and the same
        thing AB's own UI does when you change a transaction's type to
        "Transfer". It auto-creates the mirrored transaction in the target
        account, cross-links `transferred_id` both ways, and clears the category
        for on-budget target accounts — so the converted pair behaves exactly
        like a natively-created transfer (never spending/income). The
        transaction's own id/history is kept; nothing is deleted or recreated.

        Returns a dict for the confirmation message:
        {"payee", "amount", "target_account_name"}.
        """
        def _convert():
            from actual.database import Transactions
            from actual.queries import get_account, set_transaction_payee

            with self._get_actual() as actual:
                tx = actual.session.query(Transactions).filter(
                    Transactions.id == transaction_id,
                    Transactions.tombstone == 0,
                ).first()
                if not tx:
                    raise ValueError(f"Transaction not found: {transaction_id}")
                to_acct = get_account(actual.session, target_account_id)
                if not to_acct:
                    raise ValueError(f"Destination account not found: {target_account_id}")
                if to_acct.tombstone or to_acct.closed:
                    raise ValueError(f"Destination account is closed: {to_acct.name}")
                if tx.acct and str(tx.acct) == str(to_acct.id):
                    raise ValueError(
                        "Cannot convert a transaction into a transfer to its own account"
                    )

                transfer_payee = self._get_or_create_transfer_payee(actual.session, to_acct)
                set_transaction_payee(actual.session, tx, transfer_payee)
                actual.commit()
                logger.info(
                    "Transaction %s converted to transfer → %s (€%.2f)",
                    transaction_id, to_acct.name, abs(float(tx.amount or 0)) / 100,
                )
                return {
                    "payee": transfer_payee.name or "",
                    "amount": abs(float(tx.amount or 0)) / 100,
                    "target_account_name": to_acct.name,
                }
        return await self._run(_convert)

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
        """
        Return the most recent transactions from Actual Budget, sorted by date descending.
        Optional start_date/end_date narrow to a range (e.g. one calendar month) before
        sorting/limiting — same actualpy start_date/end_date params get_monthly_stats()
        and get_budget_status() already use, see #171.
        Optional account_id scopes the list to a single account (#194). The account
        is looked up by string-casting its id (same pattern get_accounts() uses) and
        passed to get_transactions() as an Account object, not a raw id.

        Additional optional filters (#184 — bulk table view, no-AI CRUD):
          offset            — apply after sort, before the limit slice (pagination)
          category_id       — keep only rows whose category_id matches
          payee             — case-insensitive substring match against merchant
          uncategorized_only — keep only rows where category_id is None
          amount_min/max    — compare against abs(amount_cents) / 100
          is_expense        — None = both; True = amount_cents < 0, False = >= 0

        Returns plain dicts (not dataclasses) because the caller needs flexible
        access to fields that may or may not be set (category, payee, etc.).

        Each dict has:
          id, financial_id, date, merchant, amount_cents, category_name,
          category_id, account_name, notes
        """
        def _get():
            from actual.queries import get_transactions, get_accounts
            with self._get_cached_read_actual() as actual:
                if account_id is not None:
                    matched = next(
                        (a for a in get_accounts(actual.session) if str(a.id) == account_id),
                        None,
                    )
                    if matched is None:
                        return []
                    all_txs = get_transactions(
                        actual.session, account=matched,
                        start_date=start_date, end_date=end_date,
                    )
                else:
                    all_txs = get_transactions(actual.session, start_date=start_date, end_date=end_date)

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
                    cat_id = None
                    if tx.category:
                        category_name = tx.category.name
                        cat_id = str(tx.category.id) if tx.category.id else None

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
                        "financial_id": tx.financial_id,
                        "date": date_iso,
                        "merchant": merchant,
                        "amount_cents": int(tx.amount or 0),
                        "category_name": category_name,
                        "category_id": cat_id,
                        "account_name": account_name,
                        "notes": tx.notes or "",
                    })

                # Filters applied on the normalized dict list (#184) — several
                # (payee substring, uncategorized) need the already-normalized
                # fields rather than the raw actualpy `tx` object.
                if category_ids:
                    result = [t for t in result if t["category_id"] in category_ids]
                if payee is not None:
                    needle = payee.casefold()
                    result = [t for t in result if needle in (t["merchant"] or "").casefold()]
                if uncategorized_only:
                    result = [t for t in result if t["category_id"] is None]
                if amount_min is not None:
                    result = [t for t in result if abs(t["amount_cents"]) / 100 >= amount_min]
                if amount_max is not None:
                    result = [t for t in result if abs(t["amount_cents"]) / 100 <= amount_max]
                if is_expense is not None:
                    if is_expense:
                        result = [t for t in result if t["amount_cents"] < 0]
                    else:
                        result = [t for t in result if t["amount_cents"] >= 0]

                # Sort newest-first then slice — get_transactions() order is not guaranteed
                result.sort(key=lambda t: t["date"], reverse=True)
                return result[offset:offset + limit]

        return await self._run(_get)


    async def count_uncategorized(self) -> int:
        """Count all transactions without a category (expenses and income, excludes transfers)."""
        def _count():
            from actual.database import Transactions
            with self._get_cached_read_actual() as actual:
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
            with self._get_cached_read_actual() as actual:
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
                acc = get_account(actual.session, account_name)
                if not acc:
                    raise ValueError(f"Account not found: {account_name}")
                new_txs = actual.run_bank_sync(account=acc)
                actual.commit()
                return len(new_txs)
        return await self._run(_sync)

    async def run_bank_resync_all(self) -> dict:
        """
        Re-sync every open account with a live bank link (gocardless/simplefin)
        in one pass — the header sync icon and the `sync_accounts` chat tool
        both call this, one commit for all accounts instead of one per account.
        A single account's sync failure doesn't stop the others.
        """
        def _sync():
            from actual.queries import get_accounts
            with self._get_actual() as actual:
                accounts = [a for a in get_accounts(actual.session) if not a.closed and a.account_sync_source]
                new_transactions = 0
                failed: list[str] = []
                duplicate_candidates: list[dict] = []
                for acc in accounts:
                    try:
                        new_txs = actual.run_bank_sync(account=acc)
                        # run_bank_sync returns the freshly-imported transactions
                        # (same model as get_transactions) — keep the length for the
                        # existing `new_transactions` counter AND the ids to restrict
                        # the duplicate scan to just this sync's imports.
                        new_ids = {tx.financial_id for tx in new_txs if getattr(tx, "financial_id", None)}
                        new_transactions += len(new_txs)
                        duplicate_candidates.extend(
                            _find_duplicate_candidates(
                                actual.session, acc, newly_synced_ids=new_ids,
                            )
                        )
                    except Exception as e:
                        logger.warning("Bank resync failed for account %s: %s", acc.name, e)
                        failed.append(acc.name)
                actual.commit()
                return {
                    "synced_accounts": len(accounts) - len(failed),
                    "new_transactions": new_transactions,
                    "failed": failed,
                    "duplicate_candidates": duplicate_candidates,
                }
        return await self._run(_sync)

    async def get_duplicate_transactions_by_month(self) -> dict[str, list[dict]]:
        """
        Historical batch scan for manual-entry vs. bank-sync duplicate pairs.

        Read-only, across all bank-linked accounts (the same `account_sync_source`
        filter `run_bank_resync_all()` applies), grouped by the bank-synced side's
        month as ``"YYYY-MM"`` keys. Used by the review screen to catch duplicates
        that predate the sync-time check — like the 3 already found live on prod.
        """
        def _get() -> dict[str, list[dict]]:
            from actual.queries import get_accounts
            with self._get_cached_read_actual() as actual:
                accounts = [a for a in get_accounts(actual.session) if not a.closed and a.account_sync_source]
                by_month: dict[str, list[dict]] = {}
                for acc in accounts:
                    for pair in _find_duplicate_candidates(actual.session, acc):
                        month_key = pair["synced"]["date"][:7]  # "YYYY-MM"
                        by_month.setdefault(month_key, []).append(pair)
                return by_month
        return await self._run(_get)

    async def merge_duplicate_transaction(
        self, manual_id: str, synced_id: str
    ) -> bool:
        """
        Merge a confirmed duplicate pair (#181) in one atomic commit.

        Not a blind delete: the manual entry may carry a category/notes the user
        already set; the bank-synced transaction is typically uncategorized fresh
        off the bank. Copy the manual side's `category_id` and `notes` onto the
        synced side only if the synced side lacks them (never overwrite), then
        soft-delete the manual side (tombstone=1). Everything runs in one
        `_get_actual()`/`commit()` block. Returns False if either side couldn't
        be found (e.g. already handled).

        Looks up by the row's own `id`, not `financial_id` — `financial_id` is
        None for anything entered directly in the Actual Budget UI, and matching
        on it could hit an arbitrary row instead of the intended one.
        """
        def _merge() -> bool:
            from actual.database import Transactions
            with self._get_actual() as actual:
                manual = actual.session.query(Transactions).filter(
                    Transactions.id == manual_id,
                    Transactions.tombstone == 0,
                ).first()
                synced = actual.session.query(Transactions).filter(
                    Transactions.id == synced_id,
                    Transactions.tombstone == 0,
                ).first()
                if not manual or not synced:
                    logger.warning(
                        "Duplicate merge failed — one side missing: manual=%s synced=%s",
                        manual_id, synced_id,
                    )
                    return False
                # Copy category/notes from the manual side only when the synced side
                # doesn't already have them — the bank-synced txn may be one the user
                # later categorized/annotated, which must win.
                if (not synced.category_id) and manual.category_id:
                    synced.category_id = manual.category_id
                if (not synced.notes) and manual.notes:
                    synced.notes = manual.notes
                manual.tombstone = 1
                actual.commit()
                logger.info(
                    "Merged duplicate transaction — kept %s, removed manual %s",
                    synced_id, manual_id,
                )
                return True
        return await self._run(_merge)

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

    async def _fetch_tagged(self, tag: str) -> tuple[str, list]:
        """Shared query for tag-filtered transactions. Returns (tag_pattern, rows)
        where rows are (Transactions, payee_name, category_name) tuples."""
        from actual.database import Transactions, Payees, Categories

        def _inner():
            with self._get_actual() as actual:
                tag_pattern = tag if tag.startswith("#") else f"#{tag}"
                rows = (
                    actual.session.query(Transactions, Payees.name, Categories.name)
                    .outerjoin(Payees, Transactions.payee_id == Payees.id)
                    .outerjoin(Categories, Transactions.category_id == Categories.id)
                    .filter(
                        Transactions.notes.ilike(f"%{tag_pattern}%"),
                        Transactions.tombstone == 0,
                        Transactions.is_parent == 0,
                    )
                    .order_by(Transactions.date)
                    .all()
                )
                return tag_pattern, rows
        return await self._run(_inner)

    async def get_transactions_by_tag(self, tag: str) -> dict:
        """
        Return every transaction whose notes contain the given #tag (case-insensitive),
        with an income/cost/net breakdown. Powers ad-hoc per-order/per-job costing (#126)
        — e.g. a shared #C002-GVoros tag links a YouTube/Printful order's income
        transaction to its associated cost transaction(s).
        """
        tag_pattern, rows = await self._fetch_tagged(tag)
        transactions = []
        income = 0.0
        cost = 0.0
        # rows are (Transactions, payee_name, category_name) — category_name unused here
        for tx, payee_name, _cat_name in rows:
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

    async def get_tag_category_breakdown(self, tag: str) -> dict:
        """
        Return spending broken down by category for all transactions tagged #tag.
        Mirrors get_transactions_by_tag's filtering but adds category info.
        Cost transactions (negative amount) are grouped by category name.
        Returns {"tag": tag_pattern, "total_cost", "total_income", "count", "categories": [{name, value}, ...]}
        """
        tag_pattern, rows = await self._fetch_tagged(tag)
        total_cost = 0.0
        total_income = 0.0
        cost_count = 0
        category_totals: dict[str, float] = {}
        for tx, _payee_name, category_name in rows:
            amount = float(tx.amount or 0) / 100
            if amount > 0:
                total_income += amount
                continue
            cost = abs(amount)
            total_cost += cost
            cost_count += 1
            cat_name = category_name or "Uncategorized"
            category_totals[cat_name] = category_totals.get(cat_name, 0.0) + cost
        categories = [
            {"name": name, "value": round(value, 2)}
            for name, value in category_totals.items()
        ]
        return {
            "tag": tag_pattern,
            "total_cost": round(total_cost, 2),
            "total_income": round(total_income, 2),
            "count": cost_count,
            "categories": categories,
        }

    async def create_payee_rule(self, payee_name_prefix: str, category_id: str) -> None:
        """Create an AB rule: imported_description contains prefix → set category."""
        def _create():
            from actual.rules import Rule, Condition, Action
            from actual.queries import create_rule
            with self._get_actual() as actual:
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
                    # actualpy's Condition.run() unconditionally calls
                    # transaction._object_session() — a transient (unattached)
                    # instance raises "Transactions is not attached to a session"
                    # as soon as any rule exists. session.add() only attaches it
                    # in-memory; nothing is committed/synced (commit() is never
                    # called here), so this stays a pure read-only check.
                    actual.session.add(tx)
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

    async def get_payees(self) -> list[dict]:
        """Return all non-tombstoned payees with their transaction counts.

        Counts transactions via get_transactions(session, payee=p), filtering out
        tombstoned rows. Sorted by transaction_count descending, so the settings
        screen shows the most-used payees first.
        """
        def _get():
            from actual.queries import get_payees, get_transactions
            with self._get_actual() as actual:
                result = []
                for p in get_payees(actual.session):
                    if p.tombstone:
                        continue
                    txs = get_transactions(actual.session, payee=p)
                    count = sum(1 for tx in txs if not tx.tombstone)
                    result.append({
                        "id": str(p.id),
                        # Some payees (e.g. the transfer/unset placeholder) have a
                        # null name — coerce to a string so the endpoint's
                        # PayeeItem.name: str doesn't reject the row.
                        "name": p.name or "Unnamed",
                        "transaction_count": count,
                    })
                result.sort(key=lambda x: x["transaction_count"], reverse=True)
                return result
        return await self._run(_get)

    async def get_schedules(self) -> list[dict]:
        """Return all non-tombstoned scheduled transactions (id, name, active).

        Amount/date details live in the schedule's `rule` relationship, which is
        not parsed here — the settings screen only needs name + state. The
        `active` field is the direct attribute on the Schedules model.
        """
        def _get():
            from actual.queries import get_schedules
            with self._get_actual() as actual:
                return [
                    {"id": str(s.id), "name": s.name or "Unnamed", "active": bool(s.active)}
                    for s in get_schedules(actual.session)
                    if not s.tombstone
                ]
        return await self._run(_get)
