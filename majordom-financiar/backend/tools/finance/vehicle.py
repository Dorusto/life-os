"""Vehicle-related chat tools (non-financial queries — operational data from SQLite)."""
import sqlite3
from backend.core.config import settings


async def log_refuel(
    liters: float,
    total_eur: float,
    vehicle_name: str = "",
    odo_km: float | None = None,
    location: str = "",
    full_tank: bool = True,
) -> str:
    """
    Create a pending refuel proposal. Returns JSON with type='fuel_log'.
    Does NOT write to DB — only stores a pending proposal for frontend confirmation.
    """
    import json
    from datetime import date as _date
    from backend.tools import vehicle_proposals
    from backend.core.memory.database import MemoryDB
    from backend.core.config import settings as _settings
    from backend.tools.finance.actual_budget import _get_client

    today = _date.today().isoformat()
    db = MemoryDB(db_path=_settings.memory.db_path)

    # Resolve vehicle from name or ODO proximity
    vehicles = db.get_last_odo_per_vehicle()
    vehicle_id = None
    display_name = vehicle_name

    if vehicle_name:
        matched = next((v for v in vehicles if vehicle_name.lower() in v["name"].lower()), None)
    elif odo_km is not None:
        # Pick vehicle whose last_odo is closest to odo_km
        active = [v for v in vehicles if v["active"]]
        matched = min(active, key=lambda v: abs((v["last_odo"] or 0) - odo_km), default=None)
    else:
        active = [v for v in vehicles if v["active"]]
        matched = active[0] if len(active) == 1 else None

    if matched:
        vehicle_id = matched["id"]
        display_name = matched["name"]

    # Resolve account + categories from AB
    account_id, account_name = "", ""
    accounts_list = []
    categories_list = []
    try:
        client = _get_client()
        import asyncio
        accounts, ab_cats = await asyncio.gather(
            client.get_accounts(),
            client.get_categories(),
        )
        if accounts:
            account_id = accounts[0].id
            account_name = accounts[0].name
            accounts_list = [{"id": a.id, "name": a.name} for a in accounts]
        categories_list = [{"id": c.name, "name": c.name, "emoji": "📦"} for c in ab_cats]
    except Exception:
        pass

    # Default category: pick transport-related from AB, or fallback by vehicle type
    is_moto = matched and any(kw in matched["name"].lower() for kw in ["wabi", "honda", "suzuki", "yamaha", "moto"])
    preferred = "Motorbike Costs" if is_moto else "Car Costs"
    transport_keywords = ("motorbike", "car", "transport", "fuel") if is_moto else ("car", "transport", "fuel", "motorbike")
    category_name = next(
        (c.name for c in ab_cats if any(k in c.name.lower() for k in transport_keywords)),
        preferred,
    )

    proposal_id = vehicle_proposals.create(
        vehicle_id=vehicle_id,
        vehicle_name=display_name,
        liters=liters,
        total_eur=total_eur,
        odo_km=odo_km,
        location=location,
        full_tank=full_tank,
        missed_fill=False,
        date=today,
        account_id=account_id,
        account_name=account_name,
        category_name=category_name,
    )

    price_per_liter = round(total_eur / liters, 3) if liters else None

    return json.dumps({
        "type": "fuel_log",
        "receipt_id": proposal_id,
        "receipt_type": "fuel",
        "merchant": location,
        "amount": total_eur,
        "date": today,
        "suggested_category_id": category_name,
        "category_source": "keywords",
        "categories": categories_list,
        "accounts": accounts_list,
        "liters": liters,
        "price_per_liter": price_per_liter,
        "fuel_grade": None,
        "vehicles": vehicles,
        "suggested_vehicle_id": vehicle_id,
        "odo_km": odo_km,
    })


async def set_vehicle_reminder(
    vehicle_name: str,
    reminder_type: str,
    due_date: str,
) -> str:
    """
    Propose setting an APK/ITP or insurance expiry date on a vehicle.
    reminder_type: 'apk' or 'insurance'.
    due_date: ISO date string YYYY-MM-DD.
    Returns a confirmation card — does NOT write yet.
    """
    import uuid
    import json as _json
    from datetime import date as _date
    from backend.tools import vehicle_reminder_actions as action_store

    db_path = settings.memory.db_path
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            "SELECT id, name, apk_due, insurance_due FROM vehicles WHERE lower(name) LIKE lower(?) AND active=1 LIMIT 1",
            (f"%{vehicle_name}%",),
        ).fetchone()
    finally:
        conn.close()

    if not row:
        return f"No vehicle found matching '{vehicle_name}'."

    rtype = reminder_type.lower().strip()
    if rtype not in ("apk", "insurance"):
        return f"Invalid reminder type '{reminder_type}'. Use 'apk' or 'insurance'."

    try:
        due = _date.fromisoformat(due_date)
        days_remaining = (due - _date.today()).days
    except ValueError:
        return f"Invalid date format '{due_date}'. Use YYYY-MM-DD."

    # Fetch all active vehicles for the selector
    conn2 = sqlite3.connect(db_path)
    conn2.row_factory = sqlite3.Row
    try:
        all_vehicles = [dict(r) for r in conn2.execute(
            "SELECT id, name FROM vehicles WHERE active=1 ORDER BY name"
        ).fetchall()]
    finally:
        conn2.close()

    action_id = uuid.uuid4().hex[:8]
    action_store.store(action_id, {
        "vehicle_id": row["id"],
        "field": "apk_due" if rtype == "apk" else "insurance_due",
        "due_date": due_date,
    })

    label = "APK/ITP" if rtype == "apk" else "Insurance"
    return _json.dumps({
        "type": "vehicle_reminder",
        "id": action_id,
        "vehicle_id": row["id"],
        "vehicle_name": row["name"],
        "vehicles": all_vehicles,
        "reminder_type": rtype,
        "label": label,
        "due_date": due_date,
        "days_remaining": days_remaining,
    })


async def set_service_interval(
    vehicle_name: str,
    interval_km: int | None = None,
    interval_months: int | None = None,
    last_service_km: float | None = None,
    last_service_date: str | None = None,
) -> str:
    """
    Set service interval and last service info for a vehicle.
    Returns a confirmation card — does NOT write yet.
    interval_km: km between services, e.g. 15000.
    interval_months: months between services, e.g. 12.
    last_service_km: odometer at last service.
    last_service_date: date of last service, YYYY-MM-DD.
    """
    import uuid
    import json as _json
    from backend.tools import vehicle_reminder_actions as action_store

    db_path = settings.memory.db_path
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            "SELECT id, name FROM vehicles WHERE lower(name) LIKE lower(?) AND active=1 LIMIT 1",
            (f"%{vehicle_name}%",),
        ).fetchone()
        all_vehicles = [dict(r) for r in conn.execute(
            "SELECT id, name FROM vehicles WHERE active=1 ORDER BY name"
        ).fetchall()]
    finally:
        conn.close()

    if not row:
        return f"No vehicle found matching '{vehicle_name}'."

    action_id = uuid.uuid4().hex[:8]
    action_store.store(action_id, {
        "action": "set_service",
        "vehicle_id": row["id"],
        "interval_km": interval_km,
        "interval_months": interval_months,
        "last_service_km": last_service_km,
        "last_service_date": last_service_date,
    })

    return _json.dumps({
        "type": "vehicle_reminder",
        "id": action_id,
        "vehicle_id": row["id"],
        "vehicle_name": row["name"],
        "vehicles": all_vehicles,
        "reminder_type": "service",
        "label": "Service",
        "interval_km": interval_km,
        "interval_months": interval_months,
        "last_service_km": last_service_km,
        "last_service_date": last_service_date or "",
        "due_date": last_service_date or "",
        "days_remaining": 0,
    })


async def get_vehicle_log(vehicle_name: str = "", limit: int = 10) -> str:
    """
    Return the last N refuel entries for a vehicle from vehicle_log.
    Includes entry ID so the user can reference entries for deletion.
    """
    db_path = settings.memory.db_path
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        vehicle_clause = ""
        params: list = []
        if vehicle_name:
            row = conn.execute(
                "SELECT id, name FROM vehicles WHERE lower(name) LIKE lower(?) LIMIT 1",
                (f"%{vehicle_name}%",),
            ).fetchone()
            if not row:
                return f"No vehicle found matching '{vehicle_name}'."
            display_name = row["name"]
            vehicle_clause = "AND vl.vehicle_id = ?"
            params.append(row["id"])
        else:
            vehicles = conn.execute(
                "SELECT id, name FROM vehicles WHERE active=1 ORDER BY name"
            ).fetchall()
            if not vehicles:
                return "No vehicles found."
            if len(vehicles) > 1:
                names = ", ".join(v["name"] for v in vehicles)
                return f"Multiple vehicles: {names}. Specify which one."
            display_name = vehicles[0]["name"]
            vehicle_clause = "AND vl.vehicle_id = ?"
            params.append(vehicles[0]["id"])

        params.append(limit)
        rows = conn.execute(f"""
            SELECT vl.id, vl.date, vl.odo_km, vl.fuel_liters, vl.cost_total,
                   vl.location, vl.entry_type, vl.fuel_full_tank, vl.source,
                   v.name as vehicle_name
            FROM vehicle_log vl
            JOIN vehicles v ON v.id = vl.vehicle_id
            WHERE vl.entry_type = 'fuel'
              {vehicle_clause}
            ORDER BY vl.date DESC
            LIMIT ?
        """, params).fetchall()
    finally:
        conn.close()

    if not rows:
        return f"No fuel entries found for {display_name}."

    lines = [f"**{display_name} — last {len(rows)} refuel(s):**"]
    for i, r in enumerate(rows, 1):
        date_str = (r["date"] or "")[:10]
        odo = f"{r['odo_km']:.0f} km" if r["odo_km"] else "—"
        liters = f"{r['fuel_liters']:.1f}L" if r["fuel_liters"] else "—"
        cost = f"€{r['cost_total']:.2f}" if r["cost_total"] else "—"
        location = r["location"] or "—"
        lines.append(f"{i}. {date_str} | {odo} | {liters} | {cost} | {location} (ID #{r['id']})")
    return "\n".join(lines)


async def delete_vehicle_log_entry(entry_id: int) -> str:
    """
    Propose deleting a vehicle log entry. Returns a confirmation card — does NOT delete yet.
    Use the entry ID shown by get_vehicle_log.
    """
    import uuid
    import json as _json
    from backend.tools import vehicle_log_actions as action_store

    db_path = settings.memory.db_path
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute("""
            SELECT vl.*, v.name as vehicle_name
            FROM vehicle_log vl
            JOIN vehicles v ON v.id = vl.vehicle_id
            WHERE vl.id = ?
        """, (entry_id,)).fetchone()
    finally:
        conn.close()

    if not row:
        return f"No vehicle log entry found with ID #{entry_id}."

    action_id = uuid.uuid4().hex[:8]
    action_store.store(action_id, {"entry_id": entry_id})

    return _json.dumps({
        "type": "vehicle_log_action",
        "id": action_id,
        "action": "delete",
        "entry_id": entry_id,
        "vehicle_name": row["vehicle_name"],
        "date": (row["date"] or "")[:10],
        "odo_km": row["odo_km"],
        "fuel_liters": row["fuel_liters"],
        "cost_total": row["cost_total"],
        "location": row["location"],
    })


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
        # Resolve vehicle profile from name
        vehicle_clause = ""
        params: list = []
        if vehicle_name:
            profile = conn.execute(
                "SELECT * FROM vehicles WHERE lower(name) LIKE lower(?) AND active=1 LIMIT 1",
                (f"%{vehicle_name}%",)
            ).fetchone()
            if not profile:
                return f"No vehicle found matching '{vehicle_name}'."
            vehicle_id = profile["id"]
            display_name = profile["name"]
            vehicle_clause = "AND vehicle_id = ?"
            params.append(vehicle_id)
        else:
            vehicles = conn.execute(
                "SELECT * FROM vehicles WHERE active=1 ORDER BY name"
            ).fetchall()
            if not vehicles:
                return "No vehicles found. Import your Fuelio history first."
            if len(vehicles) > 1:
                names = ", ".join(v["name"] for v in vehicles)
                return f"Multiple vehicles found: {names}. Specify which one."
            profile = vehicles[0]
            vehicle_id = profile["id"]
            display_name = profile["name"]
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

    # Vehicle profile
    profile_parts = []
    if profile["make"] or profile["model"]:
        profile_parts.append(f"{profile['make'] or ''} {profile['model'] or ''}".strip())
    if profile["year"]:
        profile_parts.append(str(profile["year"]))
    if profile["plate"]:
        profile_parts.append(f"plate: {profile['plate']}")
    if profile["fuel_type"]:
        profile_parts.append(profile["fuel_type"])
    if profile_parts:
        lines.append(f"- Profile: {' · '.join(profile_parts)}")
    if profile["apk_due"]:
        lines.append(f"- APK/ITP due: {profile['apk_due']}")
    if profile["insurance_due"]:
        lines.append(f"- Insurance due: {profile['insurance_due']}")

    # Service interval info
    if profile["service_interval_km"] or profile["service_interval_months"]:
        interval_parts = []
        if profile["service_interval_km"]:
            interval_parts.append(f"every {profile['service_interval_km']:,} km")
        if profile["service_interval_months"]:
            interval_parts.append(f"every {profile['service_interval_months']} months")
        lines.append(f"- Service interval: {' or '.join(interval_parts)}")
        if profile["last_service_km"]:
            lines.append(f"- Last service: {profile['last_service_km']:.0f} km")
            if profile["service_interval_km"]:
                next_km = profile["last_service_km"] + profile["service_interval_km"]
                remaining = next_km - (max_odo or 0)
                lines.append(f"- Next service: {next_km:.0f} km ({remaining:.0f} km remaining)")
        if profile["last_service_date"]:
            lines.append(f"- Last service date: {profile['last_service_date']}")

    # Operational stats
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


async def set_vehicle_type(vehicle_name: str, vehicle_type: str) -> str:
    """
    Set the type of a vehicle ('car', 'motorcycle', 'other').
    Used to show the correct emoji in notifications.
    """
    from backend.core.memory.database import MemoryDB
    db = MemoryDB(settings.memory.db_path)
    found = db.set_vehicle_type(vehicle_name, vehicle_type)
    if not found:
        return f"Vehicle '{vehicle_name}' not found."
    icons = {"car": "🚗", "motorcycle": "🏍️", "other": "🚙"}
    icon = icons.get(vehicle_type, "🚗")
    return f"{icon} {vehicle_name} is now set as a {vehicle_type}."
