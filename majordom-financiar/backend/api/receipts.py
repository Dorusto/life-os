"""
Receipt endpoints — the core user flow:

  POST /api/receipts          → upload image, run OCR, return extracted data
  POST /api/receipts/{id}/confirm → user confirms/edits → save to Actual Budget

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


class ConfirmRequest(BaseModel):
    receipt_id: str
    merchant: str
    amount: float
    date: str              # ISO format: YYYY-MM-DD
    category_id: str       # e.g. "groceries"
    account_id: str
    notes: Optional[str] = None


class ConfirmResponse(BaseModel):
    success: bool
    duplicate: bool
    transaction_id: Optional[str]


# --- Routes ---

@router.post("/receipts", response_model=ReceiptDraft)
async def upload_receipt(
    file: UploadFile = File(...),
    current_user: str = Depends(get_current_user),
):
    """
    Upload a receipt image (from camera or gallery), run Ollama OCR,
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
            detail="Failed to process image. Make sure Ollama is running and the model is loaded.",
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
        result = await service.confirm(
            merchant=request.merchant,
            amount=request.amount,
            date=request.date,
            category_id=request.category_id,
            account_id=request.account_id,
            notes=request.notes or "[receipt photo]",
            confirmed_by=current_user,
        )
    except Exception as e:
        logger.error("Failed to confirm receipt %s: %s", receipt_id, e)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save transaction: {str(e)}",
        )

    return ConfirmResponse(
        success=True,
        duplicate=result.get("duplicate", False),
        transaction_id=result.get("transaction_id"),
    )
