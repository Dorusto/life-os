"""
GET /api/home — all Home screen data in one AB session.
"""
import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from backend.api.auth import get_current_user
from backend.core.actual_client.client import _calc_fire
from backend.core.config import settings
from backend.core.memory.database import MemoryDB
from backend.core.finance.provider import get_provider

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/home")
async def get_home(
    month: int | None = None,
    year: int | None = None,
    current_user: str = Depends(get_current_user),
):
    client = get_provider()
    try:
        data = await client.get_home_data(month=month, year=year)
    except Exception as e:
        logger.error("Failed to fetch home data: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Could not fetch home data")

    # FIRE uses already-fetched accounts — no extra AB call
    accounts_raw = data.pop("accounts")

    # Reconstruct namespace objects for FIRE (need .off_budget and .name and .balance)
    from types import SimpleNamespace
    accounts = [SimpleNamespace(**a) for a in accounts_raw]

    return {
        **data,
        "fire": _calc_fire(accounts),
        "account_count": len(accounts_raw),
    }


@router.get("/home/pending")
async def get_home_pending(current_user: str = Depends(get_current_user)):
    """Live 'needs resolving' list for the Home widget dropdown."""
    from backend.services.notification_service import get_pending_items
    return {"items": await get_pending_items()}


@router.post("/home/sync")
async def sync_accounts(current_user: str = Depends(get_current_user)):
    """
    Re-sync every bank-linked account in one pass — the header sync icon's
    entry point. Same underlying action as the `finance__sync_accounts`
    chat tool (backend/tools/finance/actual_budget.py).
    """
    client = get_provider()
    try:
        return await client.run_bank_resync_all()
    except Exception as e:
        logger.error("Bank resync-all failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Sync failed")


@router.get("/home/duplicates/months")
async def get_duplicate_months(current_user: str = Depends(get_current_user)):
    """
    List months with suspected duplicate (manual-entry vs. bank-sync) pairs,
    newest first, zero-count months excluded — feeds the Home header badge +
    the review screen's month list.
    """
    try:
        by_month = await get_provider().get_duplicate_transactions_by_month()
    except Exception as e:
        logger.error("Failed to fetch duplicate months: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Could not fetch duplicates")

    dismissed_keys = MemoryDB(settings.memory.db_path).get_dismissed_finding_keys("duplicate_pair")
    months = []
    for m, pairs in by_month.items():
        visible_pairs = [
            p for p in pairs
            if f"{p['manual']['id']}:{p['synced']['id']}" not in dismissed_keys
        ]
        if visible_pairs:
            months.append({"month": m, "count": len(visible_pairs)})
    months.sort(key=lambda x: x["month"], reverse=True)  # newest first (YYYY-MM sorts lexically)
    return {"months": months}


@router.get("/home/duplicates/months/{month}")
async def get_duplicate_pairs(month: str, current_user: str = Depends(get_current_user)):
    """
    Full pair list for one month. Each pair is wrapped in a merge action via the
    shared proposal store so the existing /api/category-actions/{id}/confirm and
    /cancel endpoints can drive it — returns the `action_id` so the frontend can
    reference it without duplicating any proposal-store logic.
    """
    from backend.tools import category_actions as action_store
    # Basic shape guard — keep it lightweight, matching the existing plain-dict
    # convention in category_actions' confirm dispatch (no Pydantic validation).
    if len(month) != 7 or month[4] != "-":
        raise HTTPException(status_code=400, detail=f"Invalid month: {month!r}")
    try:
        by_month = await get_provider().get_duplicate_transactions_by_month()
    except Exception as e:
        logger.error("Failed to fetch duplicate pairs for %s: %s", month, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Could not fetch duplicates")

    dismissed_keys = MemoryDB(settings.memory.db_path).get_dismissed_finding_keys("duplicate_pair")
    pairs = [
        p for p in by_month.get(month, [])
        if f"{p['manual']['id']}:{p['synced']['id']}" not in dismissed_keys
    ]
    result = []
    for pair in pairs:
        action_id = uuid4().hex[:8]
        if pair.get("kind") == "transfer":
            # The "manual" side is a linked transfer leg (#229) — merging it away
            # like an ordinary duplicate would break the transfer link.
            action_store.store(action_id, {
                "action": "resolve_transfer_duplicate",
                "transfer_leg_id": pair["manual"]["id"],
                "synced_dup_id": pair["synced"]["id"],
            })
        else:
            action_store.store(action_id, {
                "action": "merge_duplicate",
                "manual_id": pair["manual"]["id"],
                "synced_id": pair["synced"]["id"],
            })
        result.append({"action_id": action_id, **pair})
    result.sort(key=lambda p: p["synced"]["date"], reverse=True)
    return {"month": month, "pairs": result}


@router.get("/home/uncategorized/groups")
async def get_uncategorized_group_actions(current_user: str = Depends(get_current_user)):
    """
    Uncategorized transactions grouped by payee, each wrapped as a categorize_with_rule
    proposal — the Inbox's second finding type (Phase B, docs/product-plan.md). Mirrors
    /home/duplicates/months+/{month} but flat: no natural month grouping for payees.
    """
    from backend.tools import category_actions as action_store

    client = get_provider()
    try:
        groups = await client.get_uncategorized_groups()
        categories = await client.get_categories()
    except Exception as e:
        logger.error("Failed to fetch uncategorized groups: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Could not fetch uncategorized groups")

    dismissed_keys = MemoryDB(settings.memory.db_path).get_dismissed_finding_keys("uncategorized_payee")
    categories_map = {c.id: c.name for c in categories}
    name_to_id = {c.name: c.id for c in categories}
    available_categories = [c.name for c in categories]

    items = []
    for g in groups:
        if g["payee_id"] in dismissed_keys:
            continue
        try:
            preview = await client.list_uncategorized_by_payee(g["payee_name"], limit=20)
        except Exception as e:
            logger.warning("Preview fetch failed for payee '%s': %s", g["payee_name"], e)
            preview = []
        action_id = uuid4().hex[:8]
        action_store.store(action_id, {
            "action": "categorize_with_rule",
            "payee": g["payee_name"],
            "payee_id": g["payee_id"],
            "category_id": name_to_id.get(g["suggested_category"]),
            "category_name": g["suggested_category"] or "",
            "count": g["count"],
            "rule_prefix": g["rule_prefix"],
            "is_consistent": g["is_consistent"],
            "categories_map": categories_map,
            "notes_contains": "",
        })
        items.append({
            "type": "category_action",
            "id": action_id,
            "action": "categorize_with_rule",
            "payee": g["payee_name"],
            "count": g["count"],
            "category_name": g["suggested_category"] or "",
            "rule_prefix": g["rule_prefix"],
            "is_consistent": g["is_consistent"],
            "notes_contains": "",
            "transactions": preview,
            "available_categories": available_categories,
        })
    return {"items": items}


@router.get("/home/unreconciled/groups")
async def get_unreconciled_group_actions(current_user: str = Depends(get_current_user)):
    """
    Unreconciled transactions grouped by account, each wrapped as a
    mark_reconciled proposal — the Inbox's third finding type (Phase C, #116,
    docs/product-plan.md). Mirrors /home/uncategorized/groups, grouped by
    account instead of payee.
    """
    from backend.tools import category_actions as action_store

    client = get_provider()
    try:
        groups = await client.list_unreconciled_groups()
    except Exception as e:
        logger.error("Failed to fetch unreconciled groups: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Could not fetch unreconciled groups")

    dismissed_keys = MemoryDB(settings.memory.db_path).get_dismissed_finding_keys("unreconciled_account")

    items = []
    for g in groups:
        if g["account_id"] in dismissed_keys:
            continue
        action_id = uuid4().hex[:8]
        action_store.store(action_id, {
            "action": "mark_reconciled",
            "account_id": g["account_id"],
            "account_name": g["account_name"],
            "count": g["count"],
        })
        items.append({
            "type": "category_action",
            "id": action_id,
            "action": "mark_reconciled",
            "account_name": g["account_name"],
            "count": g["count"],
            "transactions": g["transactions"],
        })
    return {"items": items}


@router.get("/home/budget-realism/flags")
async def get_budget_realism_flags(current_user: str = Depends(get_current_user)):
    """
    Categories where the most recently closed month's overspend is driven by
    a single one-off transaction rather than genuine recurring overspending —
    the Inbox's fourth finding type (Phase C, #110, docs/product-plan.md).
    """
    from backend.tools import category_actions as action_store

    client = get_provider()
    try:
        flags = await client.list_budget_realism_flags()
    except Exception as e:
        logger.error("Failed to fetch budget realism flags: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Could not fetch budget realism flags")

    dismissed_keys = MemoryDB(settings.memory.db_path).get_dismissed_finding_keys("budget_outlier")

    items = []
    for f in flags:
        if f["outlier_transaction_id"] in dismissed_keys:
            continue
        action_id = uuid4().hex[:8]
        action_store.store(action_id, {
            "action": "mark_budget_outlier",
            "outlier_transaction_id": f["outlier_transaction_id"],
            "category_name": f["category_name"],
            "budgeted": f["budgeted"],
            "actual": f["actual"],
            "trailing_average": f["trailing_average"],
            "outlier_amount": f["outlier_amount"],
            "outlier_date": f["outlier_date"],
            "outlier_notes": f["outlier_notes"],
            "recurring_amount": f["recurring_amount"],
        })
        items.append({
            "type": "category_action",
            "id": action_id,
            "action": "mark_budget_outlier",
            "category_name": f["category_name"],
            "budgeted": f["budgeted"],
            "actual": f["actual"],
            "trailing_average": f["trailing_average"],
            "outlier_amount": f["outlier_amount"],
            "outlier_date": f["outlier_date"],
            "outlier_notes": f["outlier_notes"],
            "recurring_amount": f["recurring_amount"],
        })
    return {"items": items}


_PERIOD_MONTHS = {"3m": 3, "6m": 6, "12m": 12}
_MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


@router.get("/home/budget-period")
async def get_budget_period(
    period: str,
    month: int | None = None,
    year: int | None = None,
    current_user: str = Depends(get_current_user),
):
    """
    Single endpoint for the Budget card's 1M/3M/6M/12M segmented control (#165).
    period="month" returns the same category breakdown BudgetDashboard already
    renders (reuses get_budget_status — no new calculation, per architecture.md
    rule 20). period="3m"/"6m"/"12m" returns a Chart.tsx-compatible line-chart
    payload of total spend per month, `month`/`year` is the window's last month.
    """
    from datetime import date as _date

    client = get_provider()
    today = _date.today()
    ref_month = month or today.month
    ref_year = year or today.year

    if period == "month":
        try:
            categories = await client.get_budget_status(month=ref_month, year=ref_year)
        except Exception as e:
            logger.error("Failed to fetch budget-period (month): %s", e, exc_info=True)
            raise HTTPException(status_code=500, detail="Could not fetch budget data")
        return {"mode": "month", "month": ref_month, "year": ref_year, "categories": categories}

    n = _PERIOD_MONTHS.get(period)
    if n is None:
        raise HTTPException(status_code=400, detail=f"Invalid period: {period!r}")

    months_list = []
    m, y = ref_month, ref_year
    for _ in range(n):
        months_list.append((m, y))
        m -= 1
        if m < 1:
            m, y = 12, y - 1
    months_list.reverse()

    try:
        totals = await client.get_monthly_totals_batch(months_list)
    except Exception as e:
        logger.error("Failed to fetch budget-period (%s): %s", period, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Could not fetch spending trend")
    points = [{"x": f"{_MONTH_ABBR[t['month'] - 1]} {t['year']}", "y": t["total"]} for t in totals]

    first_m, first_y = months_list[0]
    last_m, last_y = months_list[-1]
    range_label = (
        f"{_MONTH_ABBR[first_m - 1]} {first_y}"
        if (first_y, first_m) == (last_y, last_m)
        else f"{_MONTH_ABBR[first_m - 1]} {first_y} – {_MONTH_ABBR[last_m - 1]} {last_y}"
    )

    return {
        "mode": "trend",
        "month": ref_month,
        "year": ref_year,
        "range_label": range_label,
        "title": "Total spend / month",
        "data": {
            "series": [{"label": "Total spend", "color": "#4F8EF7", "points": points}],
        },
    }
