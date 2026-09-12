"""Vehicle chart computation logic — reads from the local database directly.

This module is the vehicle-manager's own chart engine. Every function here
is synchronous and takes an optional db_path parameter, following the
style of database.py. No HTTP calls live here.

Callers (the REST endpoints in main.py) add chat/frontend-specific fields
such as refetch — they are not part of this module's output.
"""
from datetime import date, timedelta

from app import database


def get_fuel_intervals(
    vehicle_id: int,
    months: int,
    start_date: str | None = None,
    end_date: str | None = None,
    db_path: str | None = None,
) -> list[dict]:
    """Return one entry per full-tank-to-full-tank fill-up interval.

    Same algorithm as the original ``_get_fuel_intervals`` in
    majordom-financiar, but reads from the local database instead of via HTTP.

    Each returned dict:
        {"date": iso date of the later fill-up, "distance_km": float,
         "liters": float, "consumption": L/100km float}.
    """
    rows = database.get_vehicle_log(
        vehicle_id, limit=500, entry_type="fuel", db_path=db_path
    )
    full_tank_rows = sorted(
        (
            r
            for r in rows
            if r.get("fuel_full_tank") and r.get("odo_km") and r.get("fuel_liters")
        ),
        key=lambda r: r.get("date") or "",
    )
    if start_date or end_date:
        cutoff_start, cutoff_end = start_date, end_date
    else:
        cutoff_start, cutoff_end = None, None
        if months > 0 and full_tank_rows:
            latest = (full_tank_rows[-1].get("date") or "")[:10]
            if latest:
                cutoff_start = (
                    date.fromisoformat(latest) - timedelta(days=months * 30)
                ).isoformat()

    intervals = []
    for prev, curr in zip(full_tank_rows, full_tank_rows[1:]):
        distance = curr["odo_km"] - prev["odo_km"]
        if distance <= 0:
            continue
        x = (curr.get("date") or "")[:10]
        if cutoff_start and x < cutoff_start:
            continue
        if cutoff_end and x > cutoff_end:
            continue
        intervals.append(
            {
                "date": x,
                "distance_km": distance,
                "liters": curr["fuel_liters"],
                "consumption": curr["fuel_liters"] / distance * 100,
            }
        )
    return intervals


def _monthly_range(vehicle_id: int, months: int, db_path: str | None = None) -> list[dict]:
    """One entry per calendar month with total_cost and total_distance_km.

    Uses the fuel intervals for distance, and all log entries (any type) for cost.
    """
    rows = database.get_vehicle_log(vehicle_id, limit=500, db_path=db_path)
    intervals = get_fuel_intervals(vehicle_id, 0, db_path=db_path)

    monthly: dict[str, dict] = {}

    for r in rows:
        month = (r.get("date") or "")[:7]
        if not month:
            continue
        bucket = monthly.setdefault(month, {"total_cost": 0.0, "total_distance_km": 0.0})
        bucket["total_cost"] += float(r.get("cost_total") or 0)

    for iv in intervals:
        month = (iv.get("date") or "")[:7]
        if not month:
            continue
        bucket = monthly.setdefault(month, {"total_cost": 0.0, "total_distance_km": 0.0})
        bucket["total_distance_km"] += iv["distance_km"]

    result = [
        {
            "month": m,
            "total_cost": round(monthly[m]["total_cost"], 2),
            "total_distance_km": round(monthly[m]["total_distance_km"], 2),
        }
        for m in sorted(monthly)
    ]

    if months > 0:
        result = result[-months:]

    return result


def build_consumption_chart(
    vehicle: dict,
    months: int = 12,
    start_date: str | None = None,
    end_date: str | None = None,
    db_path: str | None = None,
) -> dict:
    """Return a chart dict for fuel consumption (L/100km) over time.

    No ``refetch`` key — that is added by the caller.
    """
    intervals = get_fuel_intervals(
        vehicle["id"], months, start_date, end_date, db_path=db_path
    )
    points = [{"x": iv["date"], "y": round(iv["consumption"], 1)} for iv in intervals]
    return {
        "type": "chart",
        "chart_type": "line",
        "title": f"Fuel Consumption — {vehicle['name'].title()}",
        "data": {
            "series": [
                {
                    "label": "L/100km",
                    "color": "#6366F1",
                    "points": points,
                }
            ],
            "empty_message": (
                "Not enough full-tank fill-ups yet to calculate a consumption trend "
                "(need at least 2)."
            ),
        },
    }


def build_distance_chart(
    vehicle: dict,
    months: int = 12,
    start_date: str | None = None,
    end_date: str | None = None,
    db_path: str | None = None,
) -> dict:
    """Return a chart for distance between fill-ups (km)."""
    intervals = get_fuel_intervals(
        vehicle["id"], months, start_date, end_date, db_path=db_path
    )
    points = [{"x": iv["date"], "y": round(iv["distance_km"], 0)} for iv in intervals]
    return {
        "type": "chart",
        "chart_type": "line",
        "title": f"Distance Between Fill-ups — {vehicle['name'].title()}",
        "data": {
            "series": [
                {
                    "label": "km",
                    "color": "#22C55E",
                    "points": points,
                }
            ],
            "empty_message": (
                "Not enough full-tank fill-ups yet to calculate a distance trend "
                "(need at least 2)."
            ),
        },
    }


def build_cost_per_km_chart(
    vehicle: dict,
    months: int = 12,
    start_date: str | None = None,
    end_date: str | None = None,
    db_path: str | None = None,
) -> dict:
    """Return cost per km by calendar month as a line chart."""
    monthly = _monthly_range(vehicle["id"], months, db_path=db_path)
    points = [
        {
            "x": m["month"] + "-01",
            "y": round(m["total_cost"] / m["total_distance_km"], 3),
        }
        for m in monthly
        if m["total_distance_km"] > 0
    ]
    return {
        "type": "chart",
        "chart_type": "line",
        "title": f"Cost per km — {vehicle['name'].title()}",
        "data": {
            "series": [
                {
                    "label": "€/km",
                    "color": "#F59E0B",
                    "points": points,
                }
            ],
            "empty_message": (
                "No monthly distance data yet — log a few fill-ups to see cost per km."
            ),
        },
    }


def build_monthly_cost_chart(
    vehicle: dict,
    months: int = 12,
    start_date: str | None = None,
    end_date: str | None = None,
    db_path: str | None = None,
) -> dict:
    """Return total monthly vehicle cost as a line chart."""
    monthly = _monthly_range(vehicle["id"], months, db_path=db_path)
    points = [{"x": m["month"] + "-01", "y": m["total_cost"]} for m in monthly]
    return {
        "type": "chart",
        "chart_type": "line",
        "title": f"Monthly Cost — {vehicle['name'].title()}",
        "data": {
            "series": [
                {
                    "label": "€",
                    "color": "#F59E0B",
                    "points": points,
                }
            ],
            "empty_message": (
                "No monthly cost data yet — log some fuel or service entries."
            ),
        },
    }


def build_mileage_chart(
    vehicle: dict,
    start_date: str | None = None,
    end_date: str | None = None,
    db_path: str | None = None,
) -> dict:
    """Return odometer readings from every individual log entry as a line chart."""
    rows = database.get_vehicle_log(vehicle["id"], limit=500, db_path=db_path)
    points = []
    for r in sorted(rows, key=lambda r: (r.get("date") or "")):
        date_str = (r.get("date") or "")[:10]
        odo = r.get("odo_km")
        if not date_str or odo is None:
            continue
        if start_date and date_str < start_date:
            continue
        if end_date and date_str > end_date:
            continue
        points.append({"x": date_str, "y": float(odo)})
    return {
        "type": "chart",
        "chart_type": "line",
        "title": f"Mileage — {vehicle['name'].title()}",
        "data": {
            "series": [
                {
                    "label": "km",
                    "color": "#22C55E",
                    "points": points,
                }
            ],
            "empty_message": "No odometer readings logged yet.",
        },
    }


def build_costs_summary(
    period: str = "",
    db_path: str | None = None,
) -> dict:
    """Aggregate cost across all vehicles.

    Uses the existing ``database.get_vehicle_stats_data`` per vehicle.
    """
    vehicles = database.get_vehicles(active_only=True, db_path=db_path)
    total_fuel_cost = 0.0
    total_other_cost = 0.0
    total_cost = 0.0
    total_distance = 0.0
    for v in vehicles:
        stats = database.get_vehicle_stats_data(v["id"], period=period, db_path=db_path)
        if not stats:
            continue
        total_fuel_cost += float(stats.get("total_fuel_cost") or 0)
        total_other_cost += float(stats.get("total_other_cost") or 0)
        total_cost += float(stats.get("total_cost") or 0)
        total_distance += float(stats.get("total_distance") or 0)

    cost_per_km = round(total_fuel_cost / total_distance, 3) if total_distance > 0 else None

    return {
        "available": True,
        "vehicle_count": len(vehicles),
        "total_fuel_cost": round(total_fuel_cost, 2),
        "total_other_cost": round(total_other_cost, 2),
        "total_cost": round(total_cost, 2),
        "total_distance": round(total_distance, 1),
        "cost_per_km": cost_per_km,
    }
