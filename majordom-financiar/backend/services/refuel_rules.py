"""
Shared refuel rules — deterministic lookups in the user's own history and
invariants that reject impossible data (decisions.md#operator-not-brain).

Kept import-light on purpose: no import from backend.tools.* or
refuel_service, so both the chat/MCP proposal path and the confirm handlers
can use it without a cycle.
"""
import asyncio
import logging

from backend.core.finance.provider import get_provider

logger = logging.getLogger(__name__)


async def vehicle_refuel_context(client, vehicles: list[dict]) -> list[dict]:
    """Enrich each vehicle with refuel defaults derived from the user's own history.

    Adds three keys to a copy of each vehicle dict:
      max_liters            — tank_capacity * 1.05, else the largest logged
                              fuel_liters * 1.10, else None
      default_category_name — category of the vehicle's most recent fuel entry
                              that has a financial_id, else None
      default_account_id    — account of that same transaction, else None

    Never raises: any failure for one vehicle (vehicle-manager down, AB down)
    logs a warning and leaves that vehicle's three keys as None.
    """
    async def _one(vehicle: dict) -> dict:
        ctx = dict(vehicle)
        ctx["max_liters"] = None
        ctx["default_category_name"] = None
        ctx["default_account_id"] = None

        try:
            entries = await client.get_log(vehicle["id"], limit=200, entry_type="fuel")
        except Exception as e:
            logger.warning(
                "Refuel context: could not read fuel log for vehicle %s: %s",
                vehicle.get("id"), e,
            )
            return ctx

        tank_capacity = vehicle.get("tank_capacity")
        if tank_capacity:
            ctx["max_liters"] = round(float(tank_capacity) * 1.05, 2)
        else:
            logged_liters = [
                float(e["fuel_liters"])
                for e in entries
                if e.get("fuel_liters")
            ]
            if logged_liters:
                ctx["max_liters"] = round(max(logged_liters) * 1.10, 2)

        # get_log() is ordered by date DESC; financial_id is None for
        # Fuelio-imported entries — walk to the first non-empty one.
        financial_id = next(
            (e.get("financial_id") for e in entries if e.get("financial_id")),
            None,
        )
        if financial_id:
            try:
                tx = await get_provider().get_transaction_by_id(financial_id)
            except Exception as e:
                logger.warning(
                    "Refuel context: could not read transaction %s for vehicle %s: %s",
                    financial_id, vehicle.get("id"), e,
                )
                tx = None
            if tx:
                ctx["default_category_name"] = tx.get("category_name") or None
                ctx["default_account_id"] = tx.get("account_id") or None

        return ctx

    return await asyncio.gather(*(_one(v) for v in vehicles))


def refuel_invariant_error(
    vehicle_ctx: dict, liters: float | None, odo_km: float | None,
) -> str | None:
    """Return a plain-English message when the refuel is impossible, else None.

    Two invariants only (decisions.md#operator-not-brain):
      - odometer below the vehicle's last recorded reading
      - litres above what the tank can hold
    A missing value skips its own check.
    """
    name = vehicle_ctx.get("name") or "this vehicle"

    last_odo = vehicle_ctx.get("last_odo")
    if odo_km is not None and last_odo is not None and odo_km < last_odo:
        return (
            f"Odometer {odo_km:.0f} km is lower than the last recorded "
            f"{last_odo:.0f} km for {name}."
        )

    max_liters = vehicle_ctx.get("max_liters")
    if liters is not None and max_liters is not None and liters > max_liters:
        return (
            f"{liters:.1f} litres is more than {name}'s tank holds "
            f"(about {round(max_liters):.0f} L)."
        )

    return None


async def check_refuel_for_confirm(
    client, vehicle_id: int, liters: float | None, odo_km: float | None,
) -> str | None:
    """Confirm-time invariant check for one vehicle.

    vehicle-manager is optional: unreachable → log a warning and return None
    (the confirm proceeds; the proposal-time check already ran).
    """
    try:
        vehicles = await client.list_vehicles(active_only=False)
    except Exception as e:
        logger.warning("Refuel confirm check: could not list vehicles: %s", e)
        return None

    vehicle = next((v for v in vehicles if v.get("id") == vehicle_id), None)
    if vehicle is None:
        return None

    ctx = (await vehicle_refuel_context(client, [vehicle]))[0]
    return refuel_invariant_error(ctx, liters, odo_km)
