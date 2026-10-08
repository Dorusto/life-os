"""
RefuelService — the write logic for a confirmed refuel proposal.

Moved out of the FastAPI handler in backend/api/vehicle_proposals.py so the
same code runs whether the confirmation came from the PWA card, a plain HTTP
call, or an MCP tool. Registered as the "refuel" handler on the shared
pending-proposal store at import time.
"""
import logging
from datetime import date as _date

from backend.core import pending_proposals
from backend.core.config import settings
from backend.core.vehicle_client import VehicleClient, VehicleClientError
from backend.services.receipt_service import ReceiptService
from backend.services.refuel_rules import check_refuel_for_confirm
from backend.tools.finance.actual_budget import fire_budget_alert_check

logger = logging.getLogger(__name__)


async def interval_consumption(
    client: VehicleClient,
    vehicle_id: int,
    fill_date: str,
    full_tank: bool,
    missed_fill: bool,
) -> float | None:
    """Return the L/100km vehicle-manager computed for the interval this fill
    closes, or None when this fill doesn't close one (partial/missed fill) or
    the chart can't be read.

    vehicle-manager owns the full-tank-to-full-tank formula (partial fills
    between two full tanks are counted, missed fills skip the interval), so
    the reply must read its number instead of recomputing one here — otherwise
    the reply can disagree with the stats and charts.
    """
    if not full_tank or missed_fill:
        return None
    day = fill_date[:10]
    try:
        chart = await client.get_consumption_chart(
            vehicle_id, months=0, start_date=day, end_date=day
        )
        points = chart["data"]["series"][0]["points"]
        if not points:
            return None
        return points[-1].get("y")
    except VehicleClientError as e:
        logger.warning(
            "consumption chart lookup failed for vehicle %s on %s: %s",
            vehicle_id, day, e,
        )
        return None
    except (KeyError, IndexError, TypeError, AttributeError) as e:
        logger.warning(
            "unexpected consumption chart shape for vehicle %s on %s: %s",
            vehicle_id, day, e,
        )
        return None


async def confirm_refuel(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed refuel proposal.

    `overrides` (the PWA card's edited fields, or {attach_to, force_new} from
    MCP) win over `payload` (what log_refuel stored). An override of None or
    "" does not replace the payload value.

    Returns a plain dict with the FuelConfirmResponse field names.
    """
    def pick(override_key: str, payload_key: str, default=None):
        value = overrides.get(override_key)
        if value is None or value == "":
            value = payload.get(payload_key, default)
        return value

    client = VehicleClient(base_url=settings.vehicle_manager.url)
    service = ReceiptService()

    category_name = pick("category_name", "category_name")
    account_id = pick("account_id", "account_id")
    station = pick("station", "location", "Refuel")
    tx_date = pick("date", "date", _date.today().isoformat())
    vehicle_name = payload.get("vehicle_name", station)
    liters = pick("liters", "liters")
    total_eur = pick("total_eur", "total_eur")
    odo_km = pick("odo_km", "odo_km")
    vehicle_id = pick("vehicle_id", "vehicle_id")
    full_tank = pick("full_tank", "full_tank", True)
    missed_fill = pick("missed_fill", "missed_fill", False)
    fuel_grade = pick("fuel_grade", "fuel_grade")
    attach_to = overrides.get("attach_to")
    force_new = overrides.get("force_new", False)

    if not vehicle_id:
        raise ValueError("No vehicle selected")
    if not category_name:
        raise ValueError("No category selected")
    if not account_id:
        raise ValueError("No account selected")

    # Invariants that reject impossible data (decisions.md#operator-not-brain):
    # the card's fields are editable, so re-check at confirm time. Raising here
    # keeps the proposal alive (pending_proposals.confirm only deletes on
    # success) so the user can correct the card and retry.
    err = await check_refuel_for_confirm(client, vehicle_id, liters, odo_km)
    if err:
        raise ValueError(err)

    notes = f"[fuel] {liters}L — {vehicle_name}"

    # Read last ODO BEFORE inserting the new entry, otherwise km_since_last = 0.
    last_entry = await client.get_last_fuel_entry(vehicle_id)
    last_odo = last_entry["odo_km"] if last_entry else None

    tx_result = await service.resolve_transaction(
        account_id=account_id,
        amount=total_eur,
        date=tx_date,
        category_id=category_name,
        merchant=station,
        notes=notes,
        attach_to=attach_to,
        force_new=force_new,
        confirmed_by=confirmed_by,
    )
    if tx_result.get("attach_not_found"):
        raise LookupError("Transaction to attach to was not found")
    if "possible_match" in tx_result:
        return {
            "success": True,
            "duplicate": False,
            "possible_match": tx_result["possible_match"],
        }

    duplicate = tx_result.get("duplicate", False)
    transaction_id = tx_result.get("transaction_id")
    if transaction_id and not attach_to:
        fire_budget_alert_check(category_name)
    logger.info(
        "Refuel AB transaction resolved: %s €%.2f on %s → %s",
        station, total_eur, tx_date, transaction_id,
    )

    price_per_liter = round(total_eur / liters, 3) if liters else None
    entry = {
        "vehicle_id": vehicle_id,
        "date": tx_date,
        "odo_km": odo_km,
        "entry_type": "fuel",
        "fuel_liters": liters,
        "fuel_price_per_liter": price_per_liter,
        "fuel_full_tank": int(full_tank),
        "fuel_missed": int(missed_fill),
        "cost_total": total_eur,
        "cost_currency": "EUR",
        "fuel_grade": fuel_grade,
        "location": station,
        "source": payload.get("source", "chat_text"),
        "financial_id": transaction_id,
    }

    # vehicle-manager is optional: a failure here must not crash the request —
    # the AB transaction is already saved, so report it and move on.
    try:
        inserted, _ = await client.insert_log_entries(vehicle_id, [entry])
        vehicle_log_id = None
    except VehicleClientError as e:
        logger.error("Vehicle-manager insert failed after AB success: %s", e)
        return {
            "success": True,
            "duplicate": duplicate,
            "transaction_id": transaction_id,
            "vehicle_log_id": None,
            "km_since_last": None,
            "consumption_l100km": None,
            "cost_per_km": None,
            "vehicle_name": vehicle_name,
            "liters": liters,
            "price_per_liter": price_per_liter,
            "fuel_grade": None,
            "odo_warning": False,
        }

    km_since_last = None
    cost_per_km = None

    if vehicle_id and odo_km and last_odo is not None:
        km_since_last = odo_km - last_odo
        if km_since_last > 0:
            cost_per_km = round(total_eur / km_since_last, 3)

    # Consumption comes from vehicle-manager's interval (the entry is already
    # inserted above), so the reply matches the stats and charts.
    consumption_l100km = await interval_consumption(
        client, vehicle_id, tx_date, full_tank, missed_fill
    )

    return {
        "success": True,
        "duplicate": duplicate,
        "transaction_id": transaction_id,
        "vehicle_log_id": vehicle_log_id,
        "km_since_last": km_since_last,
        "consumption_l100km": consumption_l100km,
        "cost_per_km": cost_per_km,
        "vehicle_name": vehicle_name,
        "liters": liters,
        "price_per_liter": price_per_liter,
        "fuel_grade": None,
    }


pending_proposals.register_handler("refuel", confirm_refuel)
