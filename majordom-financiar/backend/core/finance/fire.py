"""
Shared FIRE (Financial Independence, Retire Early) helpers.

Relocated from backend/core/actual_client/client.py (#216) — these are pure
calculations with no dependency on the Actual Budget client/session, used by
both the chat tool (get_fire_chart) and the Home screen widget so they share
the same calculation — see architecture.md rule 20.
"""
from __future__ import annotations

FIRE_EXCLUDE = ["house", "mortgage", "hypotheek", "hypotheken", "cory", "wabi sabi"]

FIRE_MODEL_DEFAULTS = {
    "years_to_transition": 10.0,
    "years_in_retirement": 25.0,
    "monthly_contribution": 820.0,
    "accumulation_return": 0.08,
    "decumulation_return": 0.06,
    "desired_monthly_spend": 2000.0,
}


def load_fire_model() -> dict:
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


def calc_fire(accounts: list) -> dict:
    """Calculate FIRE progress from an account list (current + previous-month-end balances).

    Uses the 2-phase model:
      1. Accumulation phase (years_to_transition): grow current portfolio + monthly
         contributions at accumulation_return.
      2. Decumulation phase (years_in_retirement): the principal needed at transition
         is the present value of a depleting annuity paying desired_monthly_spend
         for years_in_retirement at decumulation_return.

    All assumptions come from ``load_fire_model()`` — never hardcoded.
    """
    from datetime import date as _date
    today = _date.today()
    model = load_fire_model()
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
