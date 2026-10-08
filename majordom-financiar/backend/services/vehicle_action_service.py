"""
VehicleActionService — the write logic for confirmed vehicle proposals.

Moved out of the per-type FastAPI handlers in backend/api/vehicle_*_actions.py
so the same code runs whether the confirmation came from the PWA card, a plain
HTTP call, or an MCP tool. Registers the vehicle proposal handlers on the
shared pending-proposal store at import time.
"""
import logging

from backend.core import pending_proposals
from backend.core.config import settings
from backend.core.finance.provider import get_provider
from backend.core.vehicle_client import VehicleClient

logger = logging.getLogger(__name__)


def _client() -> VehicleClient:
    return VehicleClient(base_url=settings.vehicle_manager.url)


async def confirm_vehicle_log_delete(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Delete a vehicle log entry and, best-effort, its linked AB transaction."""
    entry_id = payload["entry_id"]
    financial_id = payload.get("financial_id")
    client = _client()

    # Verify the entry exists via vehicle-manager
    entry = await client.get_log_entry(entry_id)
    if not entry:
        raise LookupError(f"Entry #{entry_id} not found")

    # Delete via vehicle-manager
    ok = await client.delete_log_entry(entry_id)
    if not ok:
        raise LookupError(f"Entry #{entry_id} not found")

    # Fuelio historical imports have no financial_id — only refuels logged
    # from photo/text (today onward) are linked to an AB transaction (#83).
    ab_deleted = False
    if financial_id:
        client_ab = get_provider()
        try:
            ab_deleted = await client_ab.delete_transaction(financial_id)
        except Exception as e:
            logger.error(
                "Failed to delete AB transaction %s for vehicle log entry %s: %s",
                financial_id, entry_id, e,
            )

    message = f"Vehicle log entry #{entry_id} deleted."
    if financial_id:
        message += " AB transaction also removed." if ab_deleted else " (AB transaction could not be removed — check manually.)"

    return {"message": message}


async def confirm_vehicle_reminder_due(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Set an APK/ITP or insurance due date on a vehicle."""
    vehicle_id = overrides.get("vehicle_id")
    if vehicle_id is None:
        vehicle_id = payload["vehicle_id"]
    due_date = overrides.get("due_date") or payload["due_date"]
    field = payload["field"]

    client = _client()
    vehicle = await client.get_vehicle(vehicle_id)
    vehicle_name = vehicle["name"] if vehicle else f"vehicle #{vehicle_id}"

    await client.patch_vehicle(vehicle_id, **{field: due_date})
    label = "APK/ITP" if field == "apk_due" else "Insurance"
    return {"message": f"{vehicle_name} {label} reminder set to {due_date}."}


async def confirm_vehicle_service_interval(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Set the service interval and last-service info on a vehicle."""
    vehicle_id = overrides.get("vehicle_id")
    if vehicle_id is None:
        vehicle_id = payload["vehicle_id"]

    client = _client()
    vehicle = await client.get_vehicle(vehicle_id)
    vehicle_name = vehicle["name"] if vehicle else f"vehicle #{vehicle_id}"

    def pick(key: str):
        value = overrides.get(key)
        if value is None:
            value = payload.get(key)
        return value

    patch_fields: dict = {}
    interval_km = pick("interval_km")
    if interval_km is not None:
        patch_fields["service_interval_km"] = interval_km
    interval_months = pick("interval_months")
    if interval_months is not None:
        patch_fields["service_interval_months"] = interval_months
    last_service_km = pick("last_service_km")
    if last_service_km is not None:
        patch_fields["last_service_km"] = last_service_km
    last_service_date = pick("last_service_date")
    if last_service_date is not None:
        patch_fields["last_service_date"] = last_service_date

    if patch_fields:
        await client.patch_vehicle(vehicle_id, **patch_fields)
    return {"message": f"{vehicle_name} service interval saved."}


async def confirm_vehicle_apk_required(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Mark whether a vehicle needs an APK/ITP/MOT inspection at all."""
    vehicle_id = overrides.get("vehicle_id")
    if vehicle_id is None:
        vehicle_id = payload["vehicle_id"]
    required = overrides.get("required")
    if required is None:
        required = payload["required"]

    client = _client()
    vehicle = await client.get_vehicle(vehicle_id)
    vehicle_name = vehicle["name"] if vehicle else f"vehicle #{vehicle_id}"

    await client.patch_vehicle(vehicle_id, apk_required=required)
    state = "required" if required else "not required"
    return {"message": f"{vehicle_name} APK/ITP marked as {state}."}


async def confirm_vehicle_type(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Set a vehicle's type (car / motorcycle / other)."""
    vehicle_id = overrides.get("vehicle_id")
    if vehicle_id is None:
        vehicle_id = payload["vehicle_id"]
    vehicle_type = overrides.get("vehicle_type")
    if vehicle_type is None:
        vehicle_type = payload["vehicle_type"]

    if vehicle_type not in ("car", "motorcycle", "other"):
        raise ValueError(
            f"Invalid vehicle type '{vehicle_type}'. Use 'car', 'motorcycle', or 'other'."
        )

    client = _client()
    vehicle = await client.get_vehicle(vehicle_id)
    vehicle_name = vehicle["name"] if vehicle else f"vehicle #{vehicle_id}"

    await client.patch_vehicle(vehicle_id, vehicle_type=vehicle_type)
    icons = {"car": "🚗", "motorcycle": "🏍️", "other": "🚙"}
    icon = icons.get(vehicle_type, "🚗")
    return {"message": f"{icon} {vehicle_name} is now set as a {vehicle_type}."}


async def confirm_vehicle_status(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Mark a vehicle active or inactive (e.g. after it's sold)."""
    vehicle_id = overrides.get("vehicle_id")
    if vehicle_id is None:
        vehicle_id = payload["vehicle_id"]
    active = payload["active"]

    client = _client()
    # Card fields are editable (rule 5) — the confirm body may carry a
    # user-corrected vehicle; resolve its current name for the reply.
    vehicle_name = payload["vehicle_name"]
    if vehicle_id != payload["vehicle_id"]:
        vehicle = await client.get_vehicle(vehicle_id)
        if not vehicle:
            raise LookupError("Vehicle not found")
        vehicle_name = vehicle["name"]

    ok = await client.patch_vehicle(vehicle_id, active=1 if active else 0)
    if not ok:
        raise LookupError("Vehicle not found")

    status_label = "active" if active else "inactive"
    return {"message": f"{vehicle_name} marked as {status_label}."}


pending_proposals.register_handler("vehicle_log_delete", confirm_vehicle_log_delete)
pending_proposals.register_handler("vehicle_reminder_due", confirm_vehicle_reminder_due)
pending_proposals.register_handler("vehicle_service_interval", confirm_vehicle_service_interval)
pending_proposals.register_handler("vehicle_apk_required", confirm_vehicle_apk_required)
pending_proposals.register_handler("vehicle_type", confirm_vehicle_type)
pending_proposals.register_handler("vehicle_status", confirm_vehicle_status)
