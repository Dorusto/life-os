"""
Shared annual budget pacing helpers (#112).

One formula, three callers (Settings status endpoint, the Home/NotificationBell
pending-items check, and the on-request chat tool) — see
.claude/rules/duplication-prevention.md. Config (annual income + which AB
categories count as "fixed" / "sinking fund") is user-entered and stored in
user_preferences, same mechanism already used for tag_goal:* (#113) — this is
preference metadata, not financial data, so it doesn't touch the "no financial
data in SQLite" rule. Never defaulted or guessed: compute_pacing_status()
returns None when unconfigured and every caller must treat that as "nothing to
show", per docs/decisions.md#coach-not-consultant.
"""
from __future__ import annotations

import json

from backend.core.finance.provider import FinanceProvider

_CONFIG_KEY = "budget_pacing_config"


def get_config() -> dict | None:
    from backend.core.config import settings
    from backend.core.memory.database import MemoryDB

    db = MemoryDB(settings.memory.db_path)
    raw = db.get_preference(_CONFIG_KEY)
    return json.loads(raw) if raw else None


def set_config(
    annual_income: float, fixed_category_ids: list[str], sinking_fund_category_ids: list[str],
) -> None:
    from backend.core.config import settings
    from backend.core.memory.database import MemoryDB

    db = MemoryDB(settings.memory.db_path)
    db.set_preference(
        _CONFIG_KEY,
        json.dumps({
            "annual_income": annual_income,
            "fixed_category_ids": fixed_category_ids,
            "sinking_fund_category_ids": sinking_fund_category_ids,
        }),
    )


async def compute_pacing_status(provider: FinanceProvider) -> dict | None:
    """None means "not configured yet" — callers must show nothing / prompt
    the user to Settings, never fall back to a guessed number."""
    config = get_config()
    if config is None:
        return None

    totals = await provider.get_budget_pacing_totals(
        config["fixed_category_ids"], config["sinking_fund_category_ids"],
    )
    months_elapsed = totals["months_elapsed"]

    # Extrapolate from elapsed months rather than a flat ×12 on the current
    # month alone — handles a goal category created mid-year more sensibly
    # than assuming its current-month amount held for the whole year.
    annual_fixed = (totals["fixed_budgeted_elapsed"] / months_elapsed) * 12
    annual_sinking = (totals["sinking_budgeted_elapsed"] / months_elapsed) * 12
    pool = config["annual_income"] - annual_fixed - annual_sinking

    expected_by_now = (pool / 12) * months_elapsed
    actual_by_now = totals["discretionary_spent_elapsed"]
    over_by = actual_by_now - expected_by_now

    return {
        "configured": True,
        "annual_income": config["annual_income"],
        "months_elapsed": months_elapsed,
        "expected_by_now": round(expected_by_now, 2),
        "actual_by_now": round(actual_by_now, 2),
        "over_by": round(over_by, 2),
        "on_pace": over_by <= 0,
    }
