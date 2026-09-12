"""Fuelio-style vehicle statistics computed from the local database.

Reads directly from `vehicle_log` / `vehicles` (never via HTTP), following
`charts.py`'s module shape: synchronous functions, optional `db_path`, plain
dict results for the REST layer. Powers the standalone frontend's Dashboard,
Stats and Reminders screens.
"""
from datetime import date, timedelta

import logging

from app import charts, database

logger = logging.getLogger(__name__)

# Fuelio-style display names for the `entry_type` values the log already
# carries (imported Fuelio CSVs use maintenance/insurance/service; the manual
# form offers the same set).
CATEGORY_LABELS = {
    "fuel": "Fuel",
    "service": "Service",
    "maintenance": "Maintenance",
    "insurance": "Insurance",
    "tolls": "Tolls",
    "parking": "Parking",
    "tax": "Tax",
    "other": "Other",
}


def category_label(entry_type: str | None) -> str:
    key = (entry_type or "other").lower()
    return CATEGORY_LABELS.get(key, key.title())


def _sum_cost(rows: list[dict]) -> float:
    return round(sum(float(r.get("cost_total") or 0) for r in rows), 2)


def _with_prefix(rows: list[dict], prefix: str) -> list[dict]:
    return [r for r in rows if (r.get("date") or "").startswith(prefix)]


def _period_filter(rows: list[dict], period: str) -> list[dict]:
    if not period:
        return rows
    return _with_prefix(rows, period)


def build_reminders(vehicle: dict, current_odo: float | None = None) -> list[dict]:
    """Due/overdue reminders derived from the vehicle profile, Fuelio-style.

    The profile holds fixed reminder fields (APK, insurance, service interval)
    rather than a generic reminders table — this shapes them into one list with
    due date/odometer and a 0..1 progress value so the UI can show a bar.
    """
    today = date.today()
    if current_odo is None:
        current_odo = vehicle.get("last_odo") or vehicle.get("manual_mileage")
    reminders: list[dict] = []

    def add(kind: str, label: str, *, due_date: str | None = None,
            due_odo: float | None = None, start_odo: float | None = None,
            interval_km: float | None = None, start_date: str | None = None,
            interval_days: int | None = None) -> None:
        days_left = None
        km_left = None
        overdue = False
        progress = None

        if due_date:
            try:
                due = date.fromisoformat(due_date[:10])
                days_left = (due - today).days
                overdue = overdue or days_left < 0
                if start_date and interval_days:
                    try:
                        start = date.fromisoformat(start_date[:10])
                        elapsed = (today - start).days
                        progress = max(0.0, min(1.0, elapsed / interval_days))
                    except ValueError:
                        logger.debug("stats: unparseable service start date %r", start_date)
            except ValueError:
                logger.debug("stats: unparseable reminder due date %r", due_date)

        if due_odo is not None and current_odo:
            km_left = due_odo - current_odo
            overdue = overdue or km_left < 0
            if start_odo is not None and interval_km:
                progress = max(0.0, min(1.0, (current_odo - start_odo) / interval_km))

        reminders.append({
            "kind": kind,
            "label": label,
            "due_date": due_date,
            "due_odo": due_odo,
            "days_left": days_left,
            "km_left": km_left,
            "overdue": overdue,
            "progress": round(progress, 3) if progress is not None else None,
        })

    if vehicle.get("apk_required") and vehicle.get("apk_due"):
        add("apk", "APK / inspection", due_date=vehicle.get("apk_due"))

    if vehicle.get("insurance_due"):
        add("insurance", "Insurance", due_date=vehicle.get("insurance_due"))

    interval_km = vehicle.get("service_interval_km")
    last_service_km = vehicle.get("last_service_km")
    if interval_km and last_service_km is not None:
        add(
            "service_km", "Service (km)",
            due_odo=last_service_km + interval_km,
            start_odo=last_service_km, interval_km=interval_km,
        )

    interval_months = vehicle.get("service_interval_months")
    last_service_date = vehicle.get("last_service_date")
    if interval_months and last_service_date:
        try:
            start = date.fromisoformat(last_service_date[:10])
            month_index = start.month - 1 + int(interval_months)
            due = date(start.year + month_index // 12, month_index % 12 + 1, min(start.day, 28))
            add(
                "service_months", "Service (time)",
                due_date=due.isoformat(),
                start_date=last_service_date, interval_days=int(interval_months) * 30,
            )
        except ValueError:
            logger.debug("stats: unparseable last service date %r", last_service_date)

    # Most urgent first: overdue, then soonest.
    def sort_key(r: dict):
        overdue_rank = 0 if r["overdue"] else 1
        horizon = r["days_left"] if r["days_left"] is not None else (
            r["km_left"] if r["km_left"] is not None else 10**9
        )
        return (overdue_rank, horizon if horizon is not None else 10**9)

    reminders.sort(key=sort_key)
    return reminders


def build_vehicle_summary(vehicle: dict, db_path: str | None = None) -> dict:
    """Dashboard summary for one vehicle."""
    vid = vehicle["id"]
    rows = database.get_vehicle_log(vid, limit=2000, db_path=db_path)
    intervals = charts.get_fuel_intervals(vid, 0, db_path=db_path)
    stats = database.get_vehicle_stats_data(vid, db_path=db_path) or {}

    fuel = [r for r in rows if r.get("entry_type") == "fuel"]
    full = [r for r in fuel if r.get("fuel_full_tank") and not r.get("fuel_missed")]
    last_fill = max(full, key=lambda r: r.get("date") or "", default=None)

    last_price = None
    last_fill_date = None
    if last_fill:
        last_fill_date = (last_fill.get("date") or "")[:10] or None
        price = last_fill.get("fuel_price_per_liter")
        if price is None and last_fill.get("fuel_liters") and last_fill.get("cost_total"):
            price = float(last_fill["cost_total"]) / float(last_fill["fuel_liters"])
        last_price = round(float(price), 3) if price else None

    today = date.today()
    month_prefix = today.strftime("%Y-%m")
    year_prefix = today.strftime("%Y")
    month_rows = _with_prefix(rows, month_prefix)
    year_rows = _with_prefix(rows, year_prefix)

    return {
        "vehicle_id": vid,
        "avg_consumption": stats.get("avg_consumption"),
        "last_consumption": round(intervals[-1]["consumption"], 1) if intervals else None,
        "last_fuel_price": last_price,
        "last_fuel_date": last_fill_date,
        "last_odo": vehicle.get("last_odo"),
        "fill_count": stats.get("fill_count", 0),
        "total_liters": stats.get("total_liters", 0.0),
        "total_fuel_cost": stats.get("total_fuel_cost", 0.0),
        "total_other_cost": stats.get("total_other_cost", 0.0),
        "total_cost": stats.get("total_cost", 0.0),
        "total_distance": stats.get("total_distance", 0.0),
        "cost_per_km": stats.get("cost_per_km"),
        "cost_this_month": _sum_cost(month_rows),
        "cost_this_year": _sum_cost(year_rows),
        "distance_this_month": _odometer_span(month_rows),
        "distance_this_year": _odometer_span(year_rows),
        "entry_count": len(rows),
        "reminders": build_reminders(vehicle, current_odo=vehicle.get("last_odo")),
    }


def _odometer_span(rows: list[dict]) -> float:
    values = [float(r["odo_km"]) for r in rows if r.get("odo_km")]
    if len(values) < 2:
        return 0.0
    return round(max(values) - min(values), 0)


def build_vehicle_stats_detail(vehicle: dict, period: str = "",
                               db_path: str | None = None) -> dict:
    """Rich stats for the Stats screen: costs, bills, prices, distance, fill-ups."""
    vid = vehicle["id"]
    rows = database.get_vehicle_log(vid, limit=2000, db_path=db_path)
    stats = database.get_vehicle_stats_data(vid, period=period, db_path=db_path) or {}

    today = date.today()
    this_month = today.strftime("%Y-%m")
    this_year = today.strftime("%Y")
    prev_month = (today.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
    prev_year = str(today.year - 1)

    fuel = [r for r in rows if r.get("entry_type") == "fuel"]
    fuel_costs = [float(r["cost_total"]) for r in fuel if r.get("cost_total")]
    prices = [float(r["fuel_price_per_liter"]) for r in fuel if r.get("fuel_price_per_liter")]

    monthly = charts._monthly_range(vid, 0, db_path=db_path)
    per_km = [
        (m["month"], m["total_cost"] / m["total_distance_km"])
        for m in monthly
        if m["total_distance_km"] > 0
    ]

    dated = sorted((r.get("date") or "")[:10] for r in rows if r.get("date"))
    span_days = None
    if len(dated) >= 2:
        try:
            span_days = max(1, (date.fromisoformat(dated[-1]) - date.fromisoformat(dated[0])).days)
        except ValueError:
            span_days = None
    total_cost = _sum_cost(rows)
    span_months = round(span_days / 30.0, 2) if span_days else None

    best_km = min(per_km, key=lambda p: p[1]) if per_km else None
    worst_km = max(per_km, key=lambda p: p[1]) if per_km else None

    return {
        "vehicle_id": vid,
        "period": period or "all",
        "costs": {
            "total": total_cost,
            "this_year": _sum_cost(_with_prefix(rows, this_year)),
            "this_month": _sum_cost(_with_prefix(rows, this_month)),
            "prev_year": _sum_cost(_with_prefix(rows, prev_year)),
            "prev_month": _sum_cost(_with_prefix(rows, prev_month)),
        },
        "bills": {
            "lowest": round(min(fuel_costs), 2) if fuel_costs else None,
            "highest": round(max(fuel_costs), 2) if fuel_costs else None,
        },
        "gas_price": {
            "best": round(min(prices), 3) if prices else None,
            "worst": round(max(prices), 3) if prices else None,
        },
        "cost_per_km": {
            "average": stats.get("cost_per_km"),
            "best": round(best_km[1], 3) if best_km else None,
            "worst": round(worst_km[1], 3) if worst_km else None,
            "best_month": best_km[0] if best_km else None,
            "worst_month": worst_km[0] if worst_km else None,
        },
        "cost_per_day": round(total_cost / span_days, 2) if span_days else None,
        "cost_per_month": round(total_cost / span_months, 2) if span_months else None,
        "fillups": {
            "count": stats.get("fill_count", 0),
            "total_liters": stats.get("total_liters", 0.0),
            "total_cost": stats.get("total_fuel_cost", 0.0),
            "avg_consumption": stats.get("avg_consumption"),
        },
        "distance": {
            "total": stats.get("total_distance", 0.0),
            "this_year": _odometer_span(_with_prefix(rows, this_year)),
            "this_month": _odometer_span(_with_prefix(rows, this_month)),
            "avg_per_month": round(stats.get("total_distance", 0.0) / span_months, 0)
            if span_months else None,
            "avg_per_day": round(stats.get("total_distance", 0.0) / span_days, 1)
            if span_days else None,
        },
    }


def build_cost_categories(vehicle: dict, period: str = "", include_fuel: bool = True,
                          db_path: str | None = None) -> dict:
    """Cost breakdown by entry_type as a pie-chart dict Chart.tsx can render."""
    vid = vehicle["id"]
    rows = _period_filter(database.get_vehicle_log(vid, limit=2000, db_path=db_path), period)

    totals: dict[str, float] = {}
    counted = 0
    for r in rows:
        cost = float(r.get("cost_total") or 0)
        if cost <= 0:
            continue
        category = (r.get("entry_type") or "other").lower()
        if not include_fuel and category == "fuel":
            continue
        totals[category] = totals.get(category, 0.0) + cost
        counted += 1

    grand_total = sum(totals.values())
    segments = [
        {
            "name": category_label(cat),
            "value": round(value, 2),
            "percentage": round(value / grand_total * 100, 1) if grand_total else 0.0,
        }
        for cat, value in sorted(totals.items(), key=lambda kv: -kv[1])
    ]

    return {
        "type": "chart",
        "chart_type": "pie",
        "title": f"Cost categories — {vehicle['name'].title()}",
        "data": {
            "total": round(grand_total, 2),
            "income": 0,
            "count": counted,
            "segments": segments,
            "empty_message": "No costs logged yet.",
        },
    }
