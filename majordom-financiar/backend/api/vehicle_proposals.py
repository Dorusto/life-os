"""API endpoints for vehicle refuel proposals (text-triggered, no photo)."""

import logging
from datetime import date as _date

from fastapi import APIRouter, Depends, HTTPException

from backend.api.auth import get_current_user
from backend.api.receipts import FuelConfirmRequest, FuelConfirmResponse
from backend.tools import vehicle_proposals
from backend.tools.finance.actual_budget import add_transaction as ab_add_transaction
from backend.core.config import settings
from backend.core.vehicle_client import VehicleClient, VehicleClientError

logger = logging.getLogger(__name__)

router = APIRouter(redirect_slashes=False)


class VehicleProposalConfirm(FuelConfirmRequest):
    """Same fields as FuelConfirmRequest — receipt_id comes from URL path, not body."""
    receipt_id: str = ""


@router.post("/vehicle/proposals/{proposal_id}/confirm", response_model=FuelConfirmResponse)
async def confirm_vehicle_proposal(
    proposal_id: str,
    request: VehicleProposalConfirm,
    current_user: str = Depends(get_current_user),
):
    """
    Confirm a text-triggered refuel proposal.

    Same logic as confirm_fuel_receipt in receipts.py:
    1. Get proposal from vehicle_proposals store → 404 if missing
    2. AB transaction via ActualBudgetClient.add_transaction()
    3. vehicle_log INSERT via vehicle_client.insert_log_entries()
    4. Calculate post-confirm stats
    5. Delete proposal
    6. Return FuelConfirmResponse
    """
    proposal = vehicle_proposals.get(proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    client = VehicleClient(base_url=settings.vehicle_manager.url)

    try:
        category_name = request.category_name or proposal.get("category_name", "Car Costs")
        account_id = request.account_id or proposal.get("account_id", "")
        station = request.station or proposal.get("location", "Refuel")
        tx_date = request.date or _date.today().isoformat()
        vehicle_name = proposal.get("vehicle_name", station)
        notes = f"[fuel] {request.liters}L — {vehicle_name}"

        # Read last ODO BEFORE insert (so km_since_last is calculated correctly)
        vehicle_id = request.vehicle_id or proposal.get("vehicle_id")
        last_entry = await client.get_last_fuel_entry(vehicle_id) if vehicle_id else None
        last_odo = last_entry["odo_km"] if last_entry else None

        logger.info("Adding AB transaction: %s €%.2f on %s", station, request.total_eur, tx_date)
        ab_result = await ab_add_transaction(
            payee=station,
            amount=request.total_eur,
            date=tx_date,
            category_name=category_name,
            account_id=account_id,
            notes=notes,
            is_expense=True,
        )
        transaction_id = None
        logger.info("AB result: %s", ab_result)

        price_per_liter = round(request.total_eur / request.liters, 3) if request.liters else None
        entry = {
            "vehicle_id": vehicle_id,
            "date": tx_date,
            "odo_km": request.odo_km,
            "entry_type": "fuel",
            "fuel_liters": request.liters,
            "fuel_price_per_liter": price_per_liter,
            "fuel_full_tank": int(request.full_tank),
            "fuel_missed": int(request.missed_fill),
            "cost_total": request.total_eur,
            "cost_currency": "EUR",
            "fuel_grade": request.fuel_grade,
            "location": station,
            "source": "chat_text",
        }

        # Try to write vehicle log entry
        try:
            inserted, _ = await client.insert_log_entries(vehicle_id, [entry])
            vehicle_log_id = None
        except VehicleClientError as e:
            logger.error("Vehicle-manager insert failed after AB success: %s", e)
            # Return a response that tells the user AB was saved but vehicle part failed
            return FuelConfirmResponse(
                success=True,
                duplicate=False,
                transaction_id=transaction_id,
                vehicle_log_id=None,
                km_since_last=None,
                consumption_l100km=None,
                cost_per_km=None,
                vehicle_name=vehicle_name,
                liters=request.liters,
                price_per_liter=price_per_liter,
                fuel_grade=None,
                odo_warning=False,
            )

        # Calculate stats
        km_since_last = None
        consumption_l100km = None
        cost_per_km = None

        if vehicle_id and request.odo_km and last_odo is not None:
            km_since_last = request.odo_km - last_odo
            if km_since_last > 0:
                consumption_l100km = round((request.liters / km_since_last) * 100, 1)
                cost_per_km = round(request.total_eur / km_since_last, 3)

        vehicle_proposals.delete(proposal_id)

        return FuelConfirmResponse(
            success=True,
            duplicate=False,
            transaction_id=transaction_id,
            vehicle_log_id=vehicle_log_id,
            km_since_last=km_since_last,
            consumption_l100km=consumption_l100km,
            cost_per_km=cost_per_km,
            vehicle_name=vehicle_name,
            liters=request.liters,
            price_per_liter=price_per_liter,
            fuel_grade=None,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to confirm vehicle proposal %s: %s", proposal_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Could not confirm the refuel entry")