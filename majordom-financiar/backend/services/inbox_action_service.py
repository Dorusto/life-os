"""
InboxActionService — the write logic for confirmed Inbox action proposals.

Moved out of the FastAPI handler in backend/api/category_actions.py so the same
code runs whether the confirmation came from the PWA card, a plain HTTP call, or
an MCP tool. Registers the "merge_duplicate", "resolve_transfer_duplicate",
"mark_reconciled", "mark_budget_outlier", "create_schedule" and
"deactivate_schedule" handlers on the shared pending-proposal store at import
time.
"""
import logging
from datetime import datetime

from backend.core import pending_proposals
from backend.core.config import settings
from backend.core.finance.provider import get_provider
from backend.core.memory.database import MemoryDB

logger = logging.getLogger(__name__)


async def _resolve_payee_id(client, name: str) -> str:
    """Resolve an edited payee name to an id, creating the payee if needed.

    A failure propagates — never silently drop the user's edited payee.
    """
    return await client.get_or_create_payee_id(name)


async def _resolve_category_id(client, name: str) -> str:
    """Resolve an edited category name to an id — exact match only.

    A name that isn't in the category list is a real error, not a silent
    fallback to the stored id (decisions.md#operator-not-brain).
    """
    cats = await client.get_categories()
    cat_obj = next((c for c in cats if c.name == name), None)
    if cat_obj is None:
        raise ValueError(f"Unknown category: {name!r}")
    return cat_obj.id


async def confirm_merge_duplicate(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed merge_duplicate proposal."""
    client = get_provider()

    payee_id = None
    if overrides.get("duplicate_payee"):
        payee_id = await _resolve_payee_id(client, overrides["duplicate_payee"])

    category_id = None
    if overrides.get("duplicate_category_name"):
        category_id = await _resolve_category_id(client, overrides["duplicate_category_name"])

    merged = await client.merge_duplicate_transaction(
        payload["manual_id"],
        payload["synced_id"],
        payee_id=payee_id,
        category_id=category_id,
        notes=overrides.get("duplicate_notes") or None,
    )
    if not merged:
        raise LookupError(
            "One side of the duplicate pair is missing — it may already have been merged."
        )
    return {
        "message": "Merged duplicate — kept the bank-synced transaction, removed the manual entry.",
        "errors": [],
    }


async def reject_merge_duplicate(payload: dict, rejected_by: str) -> None:
    """Dismiss the Inbox finding behind a rejected merge_duplicate proposal."""
    MemoryDB(settings.memory.db_path).dismiss_finding(
        "duplicate_pair", f"{payload['manual_id']}:{payload['synced_id']}"
    )


async def confirm_resolve_transfer_duplicate(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed resolve_transfer_duplicate proposal."""
    client = get_provider()

    payee_id = None
    if overrides.get("duplicate_payee"):
        payee_id = await _resolve_payee_id(client, overrides["duplicate_payee"])

    category_id = None
    if overrides.get("duplicate_category_name"):
        category_id = await _resolve_category_id(client, overrides["duplicate_category_name"])

    date_int = None
    if overrides.get("duplicate_date"):
        value = overrides["duplicate_date"]
        try:
            dt = datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            raise ValueError(f"Invalid date: {value!r}. Use YYYY-MM-DD.")
        date_int = dt.year * 10000 + dt.month * 100 + dt.day

    result = await client.resolve_transfer_duplicate(
        payload["transfer_leg_id"],
        payload["synced_dup_id"],
        payee_id=payee_id,
        category_id=category_id,
        notes=overrides.get("duplicate_notes") or None,
        date=date_int,
    )
    if not result.get("success"):
        raise LookupError(
            "One side of the transfer duplicate is missing — it may already have been resolved."
        )
    return {
        "message": (
            f"Transfer to/from {result['account_name']} was already recorded — removed the duplicate "
            f"bank-sync entry, kept the linked transfer. {result['account_name']} balance: "
            f"€{result['balance_before']:.2f} → €{result['balance_after']:.2f}."
        ),
        "errors": [],
    }


async def reject_resolve_transfer_duplicate(payload: dict, rejected_by: str) -> None:
    """Dismiss the Inbox finding behind a rejected resolve_transfer_duplicate proposal."""
    MemoryDB(settings.memory.db_path).dismiss_finding(
        "duplicate_pair", f"{payload['transfer_leg_id']}:{payload['synced_dup_id']}"
    )


async def confirm_mark_reconciled(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed mark_reconciled proposal."""
    client = get_provider()
    count = await client.mark_account_reconciled(payload["account_id"])
    return {
        "message": f"Marked {count} transaction(s) reconciled for '{payload['account_name']}'.",
        "errors": [],
    }


async def reject_mark_reconciled(payload: dict, rejected_by: str) -> None:
    """Dismiss the Inbox finding behind a rejected mark_reconciled proposal."""
    MemoryDB(settings.memory.db_path).dismiss_finding(
        "unreconciled_account", payload["account_id"]
    )


async def confirm_mark_budget_outlier(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed mark_budget_outlier proposal."""
    client = get_provider()
    await client.add_transaction_tag(payload["outlier_transaction_id"], "#one-off")
    # Unlike mark_reconciled/categorize_with_rule, tagging doesn't change any of
    # the conditions list_budget_realism_flags() checks (budgeted, actual,
    # outlier ratio) — without an explicit dismiss here, the same transaction
    # would flag again on every future fetch even after being tagged.
    MemoryDB(settings.memory.db_path).dismiss_finding(
        "budget_outlier", payload["outlier_transaction_id"]
    )
    return {
        "message": (
            f"Tagged {payload['category_name']}'s €{payload['outlier_amount']:.2f} transaction "
            f"as #one-off — it won't count toward future averages."
        ),
        "errors": [],
    }


async def reject_mark_budget_outlier(payload: dict, rejected_by: str) -> None:
    """Dismiss the Inbox finding behind a rejected mark_budget_outlier proposal."""
    MemoryDB(settings.memory.db_path).dismiss_finding(
        "budget_outlier", payload["outlier_transaction_id"]
    )


async def confirm_create_schedule(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed create_schedule proposal."""
    client = get_provider()

    name = overrides.get("schedule_name") or payload["payee_name"]
    amount = overrides["amount"] if overrides.get("amount") is not None else payload["avg_amount"]
    day_of_month = overrides.get("day_of_month") or payload["suggested_day_of_month"]
    if not 1 <= day_of_month <= 31:
        raise ValueError(f"Invalid day of month: {day_of_month!r}. Use 1–31.")

    await client.create_schedule(
        name=name,
        amount=abs(amount),
        day_of_month=day_of_month,
        account_id=payload["account_id"],
        is_income=payload["is_income"],
    )
    # Creating the schedule only affects future transactions — it does not
    # retroactively link the old transactions that triggered the finding, so
    # without this explicit dismiss the same group would flag again on the
    # next fetch.
    MemoryDB(settings.memory.db_path).dismiss_finding(
        "recurring_candidate", f"{payload['payee_id']}:{payload['account_id']}"
    )
    return {
        "message": f"Schedule created: {name} — €{abs(amount):.2f}/month on day {day_of_month}.",
        "errors": [],
    }


async def reject_create_schedule(payload: dict, rejected_by: str) -> None:
    """Dismiss the Inbox finding behind a rejected create_schedule proposal."""
    MemoryDB(settings.memory.db_path).dismiss_finding(
        "recurring_candidate", f"{payload['payee_id']}:{payload['account_id']}"
    )


async def confirm_deactivate_schedule(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed deactivate_schedule proposal."""
    client = get_provider()
    await client.set_schedule_active(payload["schedule_id"], active=False)
    return {
        "message": (
            f"Deactivated schedule: {payload['schedule_name']} "
            f"(overdue {payload['days_overdue']} days)."
        ),
        "errors": [],
    }


pending_proposals.register_handler(
    "merge_duplicate", confirm_merge_duplicate, on_reject=reject_merge_duplicate,
)
pending_proposals.register_handler(
    "resolve_transfer_duplicate", confirm_resolve_transfer_duplicate,
    on_reject=reject_resolve_transfer_duplicate,
)
pending_proposals.register_handler(
    "mark_reconciled", confirm_mark_reconciled, on_reject=reject_mark_reconciled,
)
pending_proposals.register_handler(
    "mark_budget_outlier", confirm_mark_budget_outlier, on_reject=reject_mark_budget_outlier,
)
pending_proposals.register_handler(
    "create_schedule", confirm_create_schedule, on_reject=reject_create_schedule,
)
pending_proposals.register_handler(
    "deactivate_schedule", confirm_deactivate_schedule,
)
