"""Vehicle-related chat tools (non-financial queries — operational data from SQLite)."""
import sqlite3
from backend.core.config import settings


async def get_vehicle_stats(vehicle_name: str = "", period: str = "") -> str:
    """
    Return vehicle operational stats from vehicle_log.

    period: "YYYY-MM" (month), "YYYY" (year), or "" (all time).
    Returns a formatted text summary.
    """
    db_path = settings.memory.db_path

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        # Resolve vehicle_id from name
        vehicle_clause = ""
        params: list = []
        if vehicle_name:
            row = conn.execute(
                "SELECT id, name FROM vehicles WHERE lower(name) LIKE lower(?) AND active=1 LIMIT 1",
                (f"%{vehicle_name}%",)
            ).fetchone()
            if not row:
                return f"No vehicle found matching '{vehicle_name}'."
            vehicle_id = row["id"]
            display_name = row["name"]
            vehicle_clause = "AND vehicle_id = ?"
            params.append(vehicle_id)
        else:
            # List all active vehicles if no name given
            vehicles = conn.execute(
                "SELECT id, name FROM vehicles WHERE active=1 ORDER BY name"
            ).fetchall()
            if not vehicles:
                return "No vehicles found. Import your Fuelio history first."
            if len(vehicles) > 1:
                names = ", ".join(v["name"] for v in vehicles)
                return f"Multiple vehicles found: {names}. Specify which one."
            vehicle_id = vehicles[0]["id"]
            display_name = vehicles[0]["name"]
            vehicle_clause = "AND vehicle_id = ?"
            params.append(vehicle_id)

        # Period filter
        period_clause = ""
        if period:
            if len(period) == 7:  # YYYY-MM
                period_clause = "AND substr(date, 1, 7) = ?"
                params.append(period)
            elif len(period) == 4:  # YYYY
                period_clause = "AND substr(date, 1, 4) = ?"
                params.append(period)

        # Fuel stats
        fuel_rows = conn.execute(f"""
            SELECT
                COUNT(*) as fill_count,
                SUM(fuel_liters) as total_liters,
                SUM(cost_total) as total_fuel_cost,
                MAX(odo_km) as max_odo,
                MIN(odo_km) as min_odo
            FROM vehicle_log
            WHERE entry_type = 'fuel'
              AND fuel_full_tank = 1
              AND fuel_missed = 0
              AND fuel_liters IS NOT NULL
              {vehicle_clause}
              {period_clause}
        """, params).fetchone()

        # Consumption: only full tanks, not missed
        # l/100km calculated from consecutive full fill-ups is complex;
        # use total_liters / total_distance as approximation
        fill_count = fuel_rows["fill_count"] or 0
        total_liters = fuel_rows["total_liters"] or 0.0
        total_fuel_cost = fuel_rows["total_fuel_cost"] or 0.0
        max_odo = fuel_rows["max_odo"] or 0
        min_odo = fuel_rows["min_odo"] or 0
        total_distance = max_odo - min_odo if max_odo > min_odo else 0

        avg_consumption = (total_liters / total_distance * 100) if total_distance > 0 else None
        cost_per_km = (total_fuel_cost / total_distance) if total_distance > 0 else None

        # Other costs
        other_params = list(params)
        cost_rows = conn.execute(f"""
            SELECT
                COUNT(*) as cost_count,
                SUM(cost_total) as total_other_cost
            FROM vehicle_log
            WHERE entry_type != 'fuel'
              AND cost_total > 0
              {vehicle_clause}
              {period_clause}
        """, other_params).fetchone()

        cost_count = cost_rows["cost_count"] or 0
        total_other_cost = cost_rows["total_other_cost"] or 0.0
        total_cost = total_fuel_cost + total_other_cost

    finally:
        conn.close()

    period_label = f" ({period})" if period else " (all time)"
    lines = [f"**{display_name.title()} stats{period_label}:**"]

    if fill_count == 0:
        lines.append("No fuel entries found for this period.")
    else:
        lines.append(f"- Fill-ups: {fill_count}")
        lines.append(f"- Total fuel: {total_liters:.1f} L (€{total_fuel_cost:.2f})")
        if total_distance > 0:
            lines.append(f"- Distance covered: {total_distance:.0f} km")
        if avg_consumption:
            lines.append(f"- Avg consumption: {avg_consumption:.1f} L/100km")
        if cost_per_km:
            lines.append(f"- Fuel cost/km: €{cost_per_km:.3f}")

    if cost_count > 0:
        lines.append(f"- Other costs ({cost_count} entries): €{total_other_cost:.2f}")

    if total_cost > 0:
        lines.append(f"- **Total vehicle cost: €{total_cost:.2f}**")

    return "\n".join(lines)
