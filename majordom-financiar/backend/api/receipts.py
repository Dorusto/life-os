"""
Receipt endpoints — the core user flow:

  POST /api/receipts                  → upload image, run OCR, return extracted data
  POST /api/receipts/{id}/confirm     → user confirms/edits → save to Actual Budget
  POST /api/receipts/{id}/confirm-fuel → fuel receipt confirm → save AB + vehicle_log

Why two steps instead of one?
OCR accuracy on receipts is around 80-90%. The user must always review and
potentially correct the extracted data before it's saved. A single-step
"upload and save" would silently write wrong amounts/merchants into the budget.
The two-step design makes the review mandatory.

Why save the image to disk before processing?
The receipt_id (a UUID) ties the image file to the confirm request. This way:
  - confirm() always has access to the original image path for audit purposes
  - the frontend can display the image while the user edits the form
  - no database table needed for "draft receipts" — the UUID filename is enough

Receipt images are stored in /app/data/uploads/ which is a Docker volume,
so they survive container restarts.
"""
import logging
import uuid
from pathlib import Path
from typing import Optional

import aiofiles
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core.config import settings
from backend.core.vehicle_client import VehicleClient, VehicleClientError
from backend.services.receipt_service import ReceiptService

logger = logging.getLogger(__name__)
router = APIRouter()

UPLOADS_DIR = Path("/app/data/uploads")

# Browsers send these MIME types for photos (including HEIC from iPhone)
ALLOWED_MIME_TYPES = {
    "image/jpeg", "image/jpg", "image/png",
    "image/webp", "image/heic", "image/heif",
}
MAX_IMAGE_SIZE_MB = 20


# --- Response/request models ---

class Category(BaseModel):
    id: str    # e.g. "groceries"
    name: str  # e.g. "Alimente & Băuturi"
    emoji: str # e.g. "🛒"
    group_name: str = ""


class AccountOption(BaseModel):
    id: str
    name: str


class ReceiptDraft(BaseModel):
    """Returned after OCR — presented to user for review and editing."""
    receipt_id: str
    image_url: str              # /uploads/{receipt_id}.jpg
    merchant: Optional[str]
    amount: Optional[float]
    date: Optional[str]         # ISO format: YYYY-MM-DD
    suggested_category_id: Optional[str]
    # category_source tells the frontend why this category was suggested,
    # so it can show "From your history" vs "AI guess" in the UI.
    category_source: str        # "history" | "keywords" | "ai" | "none"
    categories: list[Category]
    accounts: list[AccountOption]
    # Fuel receipt fields
    receipt_type: str = "grocery"          # "fuel" | "grocery"
    liters: Optional[float] = None
    price_per_liter: Optional[float] = None
    fuel_grade: Optional[str] = None
    vehicles: list[dict] = []              # [{id, name, last_odo}] for vehicle selector
    suggested_vehicle_id: Optional[int] = None  # pre-selected from ODO proximity


class ConfirmRequest(BaseModel):
    receipt_id: str
    merchant: str
    amount: float
    date: str              # ISO format: YYYY-MM-DD
    category_id: str       # e.g. "groceries"
    account_id: str
    notes: Optional[str] = None
    force_new: bool = False        # skip the near-duplicate check, always create
    attach_to: Optional[str] = None  # financial_id of an existing tx to attach to instead
    create_rule: bool = False      # also create an AB rule so future receipts from this merchant auto-categorize (#99)


class NearDuplicateMatch(BaseModel):
    financial_id: str
    date: str
    amount: float
    payee: str


class ConfirmResponse(BaseModel):
    success: bool
    duplicate: bool
    transaction_id: Optional[str]
    possible_match: Optional[NearDuplicateMatch] = None  # set only when awaiting user decision — nothing saved yet


class FuelConfirmRequest(BaseModel):
    receipt_id: str
    # AB transaction fields
    account_id: str
    category_name: str     # e.g. "Car Costs", "Motorbike Costs"
    date: str              # YYYY-MM-DD
    station: str           # payee in AB
    total_eur: float
    # vehicle_log fields
    vehicle_id: int
    liters: float
    price_per_liter: Optional[float] = None
    odo_km: Optional[float] = None
    full_tank: bool = True
    missed_fill: bool = False
    fuel_grade: Optional[str] = None
    notes: Optional[str] = None
    force_new: bool = False
    attach_to: Optional[str] = None


class FuelConfirmResponse(BaseModel):
    success: bool
    duplicate: bool
    transaction_id: Optional[str] = None
    vehicle_log_id: Optional[int] = None
    km_since_last: Optional[float] = None
    consumption_l100km: Optional[float] = None
    cost_per_km: Optional[float] = None
    odo_warning: bool = False
    # Echoed back for stats display
    vehicle_name: Optional[str] = None
    liters: Optional[float] = None
    price_per_liter: Optional[float] = None
    fuel_grade: Optional[str] = None
    possible_match: Optional[NearDuplicateMatch] = None


# --- Routes ---

@router.post("/receipts", response_model=ReceiptDraft)
async def upload_receipt(
    file: UploadFile = File(...),
    current_user: str = Depends(get_current_user),
):
    """
    Upload a receipt image (from camera or gallery), run vision LLM OCR,
    and return the extracted data for the user to review.
    """

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. Use JPEG, PNG, or WebP.",
        )

    image_bytes = await file.read()

    if len(image_bytes) > MAX_IMAGE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail=f"Image too large. Maximum {MAX_IMAGE_SIZE_MB}MB.",
        )

    # Generate a UUID that acts as both the filename and the session key
    # linking this upload to the subsequent confirm call.
    receipt_id = str(uuid.uuid4())
    image_path = UPLOADS_DIR / f"{receipt_id}.jpg"
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

    # Save image before OCR — if OCR fails, we still have the image and can
    # show a meaningful error. Cleanup happens in the error handler below.
    async with aiofiles.open(image_path, "wb") as f:
        await f.write(image_bytes)

    service = ReceiptService()
    try:
        result = await service.process_image(image_bytes)
    except Exception as e:
        image_path.unlink(missing_ok=True)  # don't leave orphaned images
        logger.error("OCR failed for receipt %s: %s", receipt_id, e)
        raise HTTPException(
            status_code=500,
            detail="Failed to process image. Make sure the LLM provider is reachable and the vision model is loaded.",


        )

    logger.info(
        "Receipt processed by %s: %s, %.2f %s",
        current_user,
        result.get("merchant", "?"),
        result.get("amount") or 0,
        result.get("date", "?"),
    )

    return ReceiptDraft(
        receipt_id=receipt_id,
        image_url=f"/uploads/{receipt_id}.jpg",
        merchant=result.get("merchant"),
        amount=result.get("amount"),
        date=result.get("date"),
        suggested_category_id=result.get("suggested_category_id"),
        category_source=result.get("category_source", "none"),
        categories=[Category(**c) for c in result.get("categories", [])],
        accounts=[AccountOption(**a) for a in result.get("accounts", [])],
        receipt_type=result.get("receipt_type", "grocery"),
        liters=result.get("liters"),
        price_per_liter=result.get("price_per_liter"),
        fuel_grade=result.get("fuel_grade"),
        vehicles=result.get("vehicles", []),
        suggested_vehicle_id=result.get("suggested_vehicle_id"),
    )


@router.post("/receipts/{receipt_id}/confirm", response_model=ConfirmResponse)

async def confirm_receipt(
    receipt_id: str,
    request: ConfirmRequest,
    current_user: str = Depends(get_current_user),
):
    """
    Save confirmed (and possibly user-edited) receipt data to Actual Budget.
    The image must have been uploaded first via POST /api/receipts.
    """
    if receipt_id != request.receipt_id:
        raise HTTPException(status_code=400, detail="Receipt ID mismatch")

    image_path = UPLOADS_DIR / f"{receipt_id}.jpg"
    if not image_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Receipt image not found. Upload the image first.",
        )

    service = ReceiptService()
    try:
        # User already decided to attach to a specific existing transaction
        # (from a previous possible_match response) — do that, don't create.
        if request.attach_to:
            ok = await service.attach_to_existing(
                financial_id=request.attach_to,
                category_id=request.category_id,
                notes=request.notes or "[receipt photo]",
            )
            if not ok:
                raise HTTPException(status_code=404, detail="Transaction to attach to was not found")
            return ConfirmResponse(success=True, duplicate=False, transaction_id=request.attach_to)

        # First pass (not forcing a new transaction): check for a likely
        # bank-sync match before creating anything (issue #121).
        if not request.force_new:
            match = await service.check_near_duplicate(
                account_id=request.account_id,
                amount=request.amount,
                date=request.date,
            )
            if match:
                return ConfirmResponse(
                    success=True,
                    duplicate=False,
                    transaction_id=None,
                    possible_match=NearDuplicateMatch(**match),
                )

        result = await service.confirm(
            merchant=request.merchant,
            amount=request.amount,
            date=request.date,
            category_id=request.category_id,
            account_id=request.account_id,
            notes=request.notes or "[receipt photo]",
            confirmed_by=current_user,
            create_rule=request.create_rule,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to confirm receipt %s: %s", receipt_id, e)
        raise HTTPException(
            status_code=500,
            detail="Failed to save transaction. Please try again or check the account/category.",
        )

    return ConfirmResponse(
        success=True,
        duplicate=result.get("duplicate", False),
        transaction_id=result.get("transaction_id"),
    )


async def _build_fuel_notes(liters: float, vehicle_id: int) -> str:
    """Build fuel notes with vehicle name lookup via vehicle-manager."""
    try:
        client = VehicleClient(base_url=settings.vehicle_manager.url)
        vehicles = await client.list_vehicles(active_only=True)
        v = next((v for v in vehicles if v["id"] == vehicle_id), None)
        name = v["name"] if v else None
    except Exception:
        name = None
    return f"[fuel] {liters}L — {name}" if name else f"[fuel] {liters}L"


@router.post("/receipts/{receipt_id}/confirm-fuel", response_model=FuelConfirmResponse)
async def confirm_fuel_receipt(
    receipt_id: str,
    request: FuelConfirmRequest,
    current_user: str = Depends(get_current_user),
):
    """
    Confirm a fuel receipt: saves AB transaction + vehicle_log entry.
    Returns post-confirm stats (km since last, consumption, cost/km).
    """
    if receipt_id != request.receipt_id:
        raise HTTPException(status_code=400, detail="Receipt ID mismatch")

    image_path = UPLOADS_DIR / f"{receipt_id}.jpg"
    if not image_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Receipt image not found. Upload the image first.",
        )

    vehicle_client = VehicleClient(base_url=settings.vehicle_manager.url)
    service = ReceiptService()

    # Step 1: Get last fuel entry BEFORE inserting the new one (for stats)
    last_entry = await vehicle_client.get_last_fuel_entry(request.vehicle_id)
    last_odo = last_entry["odo_km"] if last_entry else None

    fuel_notes = request.notes or await _build_fuel_notes(request.liters, request.vehicle_id)

    # Step 2: Save AB transaction using category_name (AB name like "Car Costs")
    # service.confirm() uses category_id which is an internal slug.
    # We pass the category_name directly since ActualBudgetClient.get_or_create_category
    # looks up by name. We'll call _actual.add_transaction directly via service.
    try:
        if request.attach_to:
            ok = await service.attach_to_existing(
                financial_id=request.attach_to,
                category_id=request.category_name,
                notes=fuel_notes,
            )
            if not ok:
                raise HTTPException(status_code=404, detail="Transaction to attach to was not found")
            tx_result = {"duplicate": False, "transaction_id": request.attach_to}
        else:
            if not request.force_new:
                match = await service.check_near_duplicate(
                    account_id=request.account_id,
                    amount=request.total_eur,
                    date=request.date,
                )
                if match:
                    return FuelConfirmResponse(
                        success=True,
                        duplicate=False,
                        possible_match=NearDuplicateMatch(**match),
                    )
            tx_result = await service.confirm(
                merchant=request.station,
                amount=request.total_eur,
                date=request.date,
                category_id=request.category_name,  # category_name is the AB display name
                account_id=request.account_id,
                notes=fuel_notes,
                confirmed_by=current_user,
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to save fuel transaction %s: %s", receipt_id, e)
        raise HTTPException(
            status_code=500,
            detail="Failed to save transaction. Please try again or check the account/category.",
        )

    # Step 3: Insert vehicle_log entry via vehicle-manager
    price_per_liter = request.price_per_liter
    if price_per_liter is None and request.liters > 0:
        price_per_liter = round(request.total_eur / request.liters, 4)

    vehicle_entry = {
        "vehicle_id": request.vehicle_id,
        "date": request.date,
        "odo_km": request.odo_km,
        "entry_type": "fuel",
        "fuel_liters": request.liters,
        "fuel_price_per_liter": price_per_liter,
        "fuel_full_tank": int(request.full_tank),
        "fuel_missed": int(request.missed_fill),
        "cost_total": request.total_eur,
        "cost_currency": "EUR",
        "fuel_grade": request.fuel_grade,
        "notes": request.notes,
        "source": "receipt_photo",
        "fuelio_unique_id": None,
        "financial_id": tx_result.get("transaction_id"),
    }

    try:
        inserted, _ = await vehicle_client.insert_log_entries(request.vehicle_id, [vehicle_entry])
    except VehicleClientError as e:
        logger.error("Vehicle-manager insert failed after AB success: %s", e)
        # Vehicle log failed but AB was saved — return error info
        vehicle_name = await _get_vehicle_name(vehicle_client, request.vehicle_id)
        return FuelConfirmResponse(
            success=True,
            duplicate=tx_result.get("duplicate", False),
            transaction_id=tx_result.get("transaction_id"),
            vehicle_log_id=None,
            km_since_last=None,
            consumption_l100km=None,
            cost_per_km=None,
            odo_warning=False,
            vehicle_name=vehicle_name,
            liters=request.liters,
            price_per_liter=request.price_per_liter,
            fuel_grade=request.fuel_grade,
        )

    # Step 4: Calculate post-confirm stats
    km_since_last = None
    consumption_l100km = None
    cost_per_km = None
    odo_warning = False

    if request.odo_km is not None and last_odo is not None:
        km_since_last = request.odo_km - last_odo
        if km_since_last > 1500:
            odo_warning = True

        if km_since_last > 0:
            cost_per_km = round(request.total_eur / km_since_last, 4)

        # Consumption only if both entries are full_tank and not missed_fill
        if (
            request.full_tank
            and not request.missed_fill
            and last_entry
            and last_entry.get("fuel_full_tank")
            and not last_entry.get("fuel_missed")
            and km_since_last > 0
        ):
            consumption_l100km = round(request.liters / km_since_last * 100, 1)

    # Cleanup the image after successful processing
    try:
        image_path.unlink(missing_ok=True)
    except Exception:
        pass

    vehicle_name = await _get_vehicle_name(vehicle_client, request.vehicle_id)

    return FuelConfirmResponse(
        success=True,
        duplicate=tx_result.get("duplicate", False),
        transaction_id=tx_result.get("transaction_id"),
        vehicle_log_id=None,
        km_since_last=km_since_last,
        consumption_l100km=consumption_l100km,
        cost_per_km=cost_per_km,
        odo_warning=odo_warning,
        vehicle_name=vehicle_name,
        liters=request.liters,
        price_per_liter=request.price_per_liter,
        fuel_grade=request.fuel_grade,
    )


async def _get_vehicle_name(client: VehicleClient, vehicle_id: int) -> str | None:
    """Look up vehicle name by id from vehicle-manager."""
    try:
        vehicles = await client.list_vehicles(active_only=True)
        v = next((v for v in vehicles if v["id"] == vehicle_id), None)
        return v["name"] if v else None
    except Exception:
        return None
