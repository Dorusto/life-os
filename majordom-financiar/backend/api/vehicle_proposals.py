"""API endpoints for vehicle refuel proposals (text-triggered, no photo)."""

import logging
from datetime import date as _date

from fastapi import APIRouter, Depends, HTTPException

from backend.api.auth import get_current_user
from backend.api.receipts import FuelConfirmRequest, FuelConfirmResponse, NearDuplicateMatch
from backend.tools import vehicle_proposals
from backend.tools.finance.actual_budget import fire_budget_alert_check
from backend.core.config import settings
from backend.core.vehicle_client import VehicleClient, VehicleClientError
from backend.services.receipt_service import ReceiptService

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

    Same logic as confirm_fuel_receipt in receipts.py — including the
    near-duplicate check against bank-synced transactions and the
    attach_to path, so a manually chat-logged refuel doesn't create
    a second transaction when the bank sync already picked it up:
    1. Get proposal from vehicle_proposals store → 404 if missing
    2. Attach to an existing tx, surface a possible match, or add a new
       AB transaction — same three-way dispatch as confirm_fuel_receipt
    3. vehicle_log INSERT via vehicle_client.insert_log_entries(), linked
       to the AB transaction via financial_id
    4. Calculate post-confirm stats
    5. Delete proposal
    6. Return FuelConfirmResponse
    """
    proposal = vehicle_proposals.get(proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    client = VehicleClient(base_url=settings.vehicle_manager.url)
    service = ReceiptService()

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

        tx_result = await service.resolve_transaction(
            account_id=account_id,
            amount=request.total_eur,
            date=tx_date,
            category_id=category_name,
            merchant=station,
            notes=notes,
            attach_to=request.attach_to,
            force_new=request.force_new,
            confirmed_by=current_user,
        )
        if tx_result.get("attach_not_found"):
            raise HTTPException(status_code=404, detail="Transaction to attach to was not found")
        if "possible_match" in tx_result:
            return FuelConfirmResponse(
                success=True,
                duplicate=False,
                possible_match=NearDuplicateMatch(**tx_result["possible_match"]),
            )

        duplicate = tx_result.get("duplicate", False)
        transaction_id = tx_result.get("transaction_id")
        if transaction_id and not request.attach_to:
            fire_budget_alert_check(category_name)
        logger.info(
            "Refuel AB transaction resolved: %s €%.2f on %s → %s",
            station, request.total_eur, tx_date, transaction_id,
        )

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
            "financial_id": transaction_id,
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
                duplicate=duplicate,
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
            duplicate=duplicate,
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