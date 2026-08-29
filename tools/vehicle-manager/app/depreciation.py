"""Pure depreciation math for vehicle-manager.

No database or HTTP access lives here — callers pass in the values they already
have and get back a number or a projected curve.
"""
from datetime import date, timedelta

CLASS_DEFAULT_ANNUAL_PCT = {
    "Economy": 12.0,
    "Standard": 15.0,
    "Luxury": 18.0,
}


def resolve_annual_pct(vehicle_class: str | None, annual_depreciation_pct: float | None) -> float:
    """Annual depreciation percentage to use.

    An explicit per-vehicle override wins. Otherwise fall back to the class
    default. Unknown class, or no class at all, falls back to Standard (15.0).
    """
    if annual_depreciation_pct is not None:
        try:
            return float(annual_depreciation_pct)
        except TypeError:
            pass
    if vehicle_class:
        return CLASS_DEFAULT_ANNUAL_PCT.get(vehicle_class, 15.0)
    return 15.0


def compute_current_value(
    purchase_price: float,
    purchase_date: str,
    vehicle_class: str | None,
    annual_depreciation_pct: float | None,
    salvage_floor_pct: float,
    as_of: date | None = None,
) -> float:
    """Declining-balance valuation, floored at the salvage percentage."""
    try:
        purchase_day = date.fromisoformat(purchase_date)
    except (TypeError, ValueError):
        return 0.0

    if as_of is None:
        as_of = date.today()
    days = (as_of - purchase_day).days
    years_elapsed = max(days, 0) / 365.25

    annual_pct = resolve_annual_pct(vehicle_class, annual_depreciation_pct)
    value = purchase_price * (1 - annual_pct / 100) ** years_elapsed

    floor_percent = salvage_floor_pct if salvage_floor_pct is not None else 10.0
    floor = purchase_price * floor_percent / 100
    return max(value, floor)


def project_value_curve(
    purchase_price: float,
    purchase_date: str,
    vehicle_class: str | None,
    annual_depreciation_pct: float | None,
    salvage_floor_pct: float,
    years_ahead: int = 12,
) -> list[dict]:
    """Project the value at each yearly anniversary from purchase_date outward."""
    try:
        purchase_day = date.fromisoformat(purchase_date)
    except (TypeError, ValueError):
        return []

    curve = []
    for i in range(years_ahead + 1):
        as_of = purchase_day + timedelta(days=i * 365)
        value = compute_current_value(
            purchase_price=purchase_price,
            purchase_date=purchase_date,
            vehicle_class=vehicle_class,
            annual_depreciation_pct=annual_depreciation_pct,
            salvage_floor_pct=salvage_floor_pct,
            as_of=as_of,
        )
        curve.append({"date": as_of.isoformat(), "value": round(value, 2)})
    return curve
