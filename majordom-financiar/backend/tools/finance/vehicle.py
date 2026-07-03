"""Vehicle-related chat tools (non-financial queries — operational data from vehicle-manager via HTTP)."""
import json
import logging
import uuid
from datetime import date as _date

from backend.core.config import settings
from backend.core.vehicle_client import VehicleClient, VehicleClientError

logger = logging.getLogger(__name__)


def _get_client() -> VehicleClient:
    return VehicleClient(base_url=settings.vehicle_manager.url)


def _get_actual_client():
    from backend.core.actual_client import ActualBudgetClient
    return ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )


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
    from backend.tools import vehicle_proposals

    today = _date.today().isoformat()
    client = _get_client()

    # Resolve vehicle from name or ODO proximity
    vehicles = await client.list_vehicles(active_only=True)
    vehicle_id = None
    display_name = vehicle_name

    if vehicle_name:
        matched = next((v for v in vehicles if vehicle_name.lower() in v["name"].lower()), None)
    elif odo_km is not None:
        # Pick vehicle whose last_odo is closest to odo_km
        active = [v for v in vehicles if v.get("active", 1)]
        matched = min(active, key=lambda v: abs((v.get("last_odo") or 0) - odo_km), default=None)
    else:
        active = [v for v in vehicles if v.get("active", 1)]
        matched = active[0] if len(active) == 1 else None

    if matched:
        vehicle_id = matched["id"]
        display_name = matched["name"]

    # Resolve account + categories from AB
    account_id, account_name = "", ""
    accounts_list = []
    categories_list = []
    try:
        actual = _get_actual_client()
        import asyncio
        accounts, ab_cats = await asyncio.gather(
            actual.get_accounts(),
            actual.get_categories(),
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
    from backend.tools import vehicle_reminder_actions as action_store

    client = _get_client()
    vehicles = await client.list_vehicles(active_only=True)

    matched = next((v for v in vehicles if vehicle_name.lower() in v["name"].lower()), None)
    if not matched:
        return f"No vehicle found matching '{vehicle_name}'."

    rtype = reminder_type.lower().strip()
    if rtype not in ("apk", "insurance"):
        return f"Invalid reminder type '{reminder_type}'. Use 'apk' or 'insurance'."

    try:
        due = _date.fromisoformat(due_date)
        days_remaining = (due - _date.today()).days
    except ValueError:
        return f"Invalid date format '{due_date}'. Use YYYY-MM-DD."

    action_id = uuid.uuid4().hex[:8]
    action_store.store(action_id, {
        "vehicle_id": matched["id"],
        "field": "apk_due" if rtype == "apk" else "insurance_due",
        "due_date": due_date,
    })

    label = "APK/ITP" if rtype == "apk" else "Insurance"
    return json.dumps({
        "type": "vehicle_reminder",
        "id": action_id,
        "vehicle_id": matched["id"],
        "vehicle_name": matched["name"],
        "vehicles": vehicles,
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
    from backend.tools import vehicle_reminder_actions as action_store

    client = _get_client()
    vehicles = await client.list_vehicles(active_only=True)
    matched = next((v for v in vehicles if vehicle_name.lower() in v["name"].lower()), None)

    if not matched:
        return f"No vehicle found matching '{vehicle_name}'."

    action_id = uuid.uuid4().hex[:8]
    action_store.store(action_id, {
        "action": "set_service",
        "vehicle_id": matched["id"],
        "interval_km": interval_km,
        "interval_months": interval_months,
        "last_service_km": last_service_km,
        "last_service_date": last_service_date,
    })

    return json.dumps({
        "type": "vehicle_reminder",
        "id": action_id,
        "vehicle_id": matched["id"],
        "vehicle_name": matched["name"],
        "vehicles": vehicles,
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
    client = _get_client()

    # An explicit name may refer to a retired/inactive vehicle — search all of
    # them so past data stays reachable for analysis. No name given means
    # "which of my current cars", so that stays active-only.
    if vehicle_name:
        vehicles = await client.list_vehicles(active_only=False)
        matched = next((v for v in vehicles if vehicle_name.lower() in v["name"].lower()), None)
        if not matched:
            return f"No vehicle found matching '{vehicle_name}'."
        display_name = matched["name"]
        vehicle_id = matched["id"]
    else:
        vehicles = await client.list_vehicles(active_only=True)
        if not vehicles:
            return "No vehicles found."
        if len(vehicles) > 1:
            names = ", ".join(v["name"] for v in vehicles)
            return f"Multiple vehicles: {names}. Specify which one."
        matched = vehicles[0]
        display_name = matched["name"]
        vehicle_id = matched["id"]

    rows = await client.get_log(vehicle_id, limit=limit, entry_type="fuel")
    if not rows:
        return f"No fuel entries found for {display_name}."

    lines = [f"**{display_name} — last {len(rows)} refuel(s):**"]
    for i, r in enumerate(rows, 1):
        date_str = (r.get("date") or "")[:10]
        odo = f"{r.get('odo_km', 0):.0f} km" if r.get("odo_km") else "—"
        liters = f"{r.get('fuel_liters', 0):.1f}L" if r.get("fuel_liters") else "—"
        cost = f"€{r.get('cost_total', 0):.2f}" if r.get("cost_total") else "—"
        location = r.get("location") or "—"
        lines.append(f"{i}. {date_str} | {odo} | {liters} | {cost} | {location} (ID #{r['id']})")
    return "\n".join(lines)


async def delete_vehicle_log_entry(entry_id: int) -> str:
    """
    Propose deleting a vehicle log entry. Returns a confirmation card — does NOT delete yet.
    Use the entry ID shown by get_vehicle_log.
    """
    from backend.tools import vehicle_log_actions as action_store

    client = _get_client()
    row = await client.get_log_entry(entry_id)

    if not row:
        return f"No vehicle log entry found with ID #{entry_id}."

    action_id = uuid.uuid4().hex[:8]
    action_store.store(action_id, {"entry_id": entry_id, "financial_id": row.get("financial_id")})

    return json.dumps({
        "type": "vehicle_log_action",
        "id": action_id,
        "action": "delete",
        "entry_id": entry_id,
        "vehicle_name": row.get("vehicle_name", "Unknown"),
        "date": (row.get("date") or "")[:10],
        "odo_km": row.get("odo_km"),
        "fuel_liters": row.get("fuel_liters"),
        "cost_total": row.get("cost_total"),
        "has_ab_transaction": bool(row.get("financial_id")),
        "location": row.get("location"),
    })


async def get_vehicle_stats(vehicle_name: str = "", period: str = "") -> str:
    """
    Return vehicle operational stats from vehicle_log.

    period: "YYYY-MM" (month), "YYYY" (year), or "" (all time).
    Returns a formatted text summary.
    """
    client = _get_client()

    # An explicit name may refer to a retired/inactive vehicle — search all of
    # them so past data stays reachable for analysis. No name given means
    # "which of my current cars", so that stays active-only.
    if vehicle_name:
        vehicles = await client.list_vehicles(active_only=False)
        if not vehicles:
            return "No vehicles found. Import your Fuelio history first."
        matched = next((v for v in vehicles if vehicle_name.lower() in v["name"].lower()), None)
        if not matched:
            return f"No vehicle found matching '{vehicle_name}'."
    else:
        vehicles = await client.list_vehicles(active_only=True)
        if not vehicles:
            return "No vehicles found. Import your Fuelio history first."
        if len(vehicles) > 1:
            names = ", ".join(v["name"] for v in vehicles)
            return f"Multiple vehicles found: {names}. Specify which one."
        matched = vehicles[0]

    vehicle_id = matched["id"]
    display_name = matched["name"]

    # Get stats from vehicle-manager
    stats = await client.get_stats(vehicle_id, period=period)
    if not stats:
        return f"No stats available for {display_name}."

    profile = stats.get("profile", matched)
    fill_count = stats.get("fill_count", 0)
    total_liters = stats.get("total_liters", 0.0)
    total_fuel_cost = stats.get("total_fuel_cost", 0.0)
    total_distance = stats.get("total_distance", 0)
    avg_consumption = stats.get("avg_consumption")
    cost_per_km = stats.get("cost_per_km")
    cost_count = stats.get("cost_count", 0)
    total_other_cost = stats.get("total_other_cost", 0.0)
    total_cost = stats.get("total_cost", 0.0)

    period_label = f" ({period})" if period else " (all time)"
    lines = [f"**{display_name.title()} stats{period_label}:**"]

    # Vehicle profile
    profile_parts = []
    if profile.get("make") or profile.get("model"):
        profile_parts.append(f"{profile.get('make') or ''} {profile.get('model') or ''}".strip())
    if profile.get("year"):
        profile_parts.append(str(profile["year"]))
    if profile.get("plate"):
        profile_parts.append(f"plate: {profile['plate']}")
    if profile.get("fuel_type"):
        profile_parts.append(profile["fuel_type"])
    if profile_parts:
        lines.append(f"- Profile: {' · '.join(profile_parts)}")
    if profile.get("apk_due"):
        lines.append(f"- APK/ITP due: {profile['apk_due']}")
    if profile.get("insurance_due"):
        lines.append(f"- Insurance due: {profile['insurance_due']}")

    # Service interval info
    if profile.get("service_interval_km") or profile.get("service_interval_months"):
        interval_parts = []
        if profile.get("service_interval_km"):
            interval_parts.append(f"every {profile['service_interval_km']:,} km")
        if profile.get("service_interval_months"):
            interval_parts.append(f"every {profile['service_interval_months']} months")
        lines.append(f"- Service interval: {' or '.join(interval_parts)}")
        if profile.get("last_service_km"):
            lines.append(f"- Last service: {profile['last_service_km']:.0f} km")
            if profile.get("service_interval_km"):
                next_km = profile["last_service_km"] + profile["service_interval_km"]
                current_odo = matched.get("last_odo") or 0
                remaining = next_km - current_odo
                lines.append(f"- Next service: {next_km:.0f} km ({remaining:.0f} km remaining)")
        if profile.get("last_service_date"):
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
    client = _get_client()
    vehicles = await client.list_vehicles(active_only=True)
    matched = next((v for v in vehicles if vehicle_name.lower() in v["name"].lower()), None)

    if not matched:
        return f"Vehicle '{vehicle_name}' not found."

    ok = await client.patch_vehicle(matched["id"], vehicle_type=vehicle_type)
    if not ok:
        return f"Vehicle '{vehicle_name}' not found."

    icons = {"car": "🚗", "motorcycle": "🏍️", "other": "🚙"}
    icon = icons.get(vehicle_type, "🚗")
    return f"{icon} {vehicle_name} is now set as a {vehicle_type}."