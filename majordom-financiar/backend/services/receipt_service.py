"""
ReceiptService — transport-agnostic business logic for receipt processing.

This is the architectural heart of the v2 refactor. Previously, business logic
(run OCR, categorize, save to Actual Budget) lived inside Telegram handler
functions, mixed with Telegram-specific code (formatting messages, keyboards).

Now it lives here, called by:
  - backend/api/receipts.py  (web UI)
  - bot/handlers.py          (Telegram, after refactor)

Neither transport contains business logic — they only format the result for
their medium (JSON vs Telegram message). This is what "transport-agnostic" means.

If you want to add a third interface (e.g. a mobile app, or a CLI), you just
call ReceiptService() — no copy-pasting logic.
"""
import asyncio
import hashlib
import json
import logging
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from backend.core.actual_client import ActualBudgetClient
from backend.core.config import settings
from backend.core.memory import MemoryDB, SmartCategorizer
from backend.core.ocr.vision_engine import VisionEngine

logger = logging.getLogger(__name__)

# Load categories from JSON once at module level.
# This avoids re-reading the file on every request.
_CATEGORIES_PATH = Path(__file__).parent.parent / "core" / "config" / "categories.json"


def _load_categories() -> list[dict]:
    """Return the full list of category dicts from categories.json."""
    try:
        with open(_CATEGORIES_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("categories", [])
    except FileNotFoundError:
        logger.error("categories.json not found at %s", _CATEGORIES_PATH)
        return []


_CATEGORIES: list[dict] = _load_categories()
# Index for fast lookup: category_id → category dict
_CATEGORY_BY_ID: dict[str, dict] = {c["id"]: c for c in _CATEGORIES}


class ReceiptService:
    """
    Handles the two-step receipt flow:
      1. process_image() — run OCR, return data for user review
      2. confirm()       — save confirmed data to Actual Budget

    Each method is a pure async function: it doesn't know or care whether
    the caller is a web request or a Telegram message.
    """

    def __init__(self):
        # All dependencies are constructed from settings so there's one place
        # to change connection details: the .env file.
        self._vision = VisionEngine(
            llm_url=settings.ollama.base_url,
            model=settings.ollama.model,
            api_key=settings.ollama.api_key,
        )
        self._db = MemoryDB(db_path=settings.memory.db_path)
        self._categorizer = SmartCategorizer(db=self._db)
        self._actual = ActualBudgetClient(
            url=settings.actual.url,
            password=settings.actual.password,
            sync_id=settings.actual.sync_id,
        )

    async def process_image(self, image_bytes: bytes) -> dict:
        """
        Step 1: Run OCR on a receipt image and return structured data.

        Does NOT save anything — that happens in confirm(). The user must
        review the extracted data before it's committed to the budget.

        Returns a dict with keys:
          merchant, amount, date, suggested_category_id, category_source,
          categories (list), accounts (list),
          receipt_type, liters, price_per_liter, fuel_grade, vehicles, suggested_vehicle_id
        """
        # Run vision model — this is the slow step (~30-60s on CPU)
        receipt = await self._vision.extract_from_bytes(image_bytes)

        merchant = receipt.merchant or ""

        # Ask the categorizer for a suggestion based on this merchant.
        # predict() checks (in order): merchant history → keywords → fallback
        prediction = self._categorizer.predict(merchant=merchant)

        # Map category_source so the frontend can show a meaningful label
        # e.g. "From your history" vs "AI guess" vs "Unknown"
        if prediction.from_history:
            source = "history"
        elif prediction.confidence >= 0.7:
            source = "keywords"
        else:
            source = "none"

        # Format date as ISO string for JSON serialization
        tx_date = receipt.date
        if isinstance(tx_date, date):
            date_str = tx_date.isoformat()
        else:
            date_str = datetime.now().strftime("%Y-%m-%d")

        # Fetch accounts and categories live from Actual Budget
        accounts, ab_categories = await asyncio.gather(
            self._actual.get_accounts(),
            self._actual.get_categories(),
        )

        # Build base result
        result = {
            "merchant": merchant,
            "amount": receipt.total,
            "date": date_str,
            "suggested_category_id": prediction.category_id if prediction.confidence > 0 else None,
            "category_source": source,
            # Fuel receipts override category below after receipt_type is known
            "categories": [
                {"id": cat.name, "name": cat.name, "emoji": "📦"}
                for cat in ab_categories
            ],
            "accounts": [
                {"id": acc.id, "name": acc.name}
                for acc in accounts
            ],
            # Fuel fields
            "receipt_type": receipt.receipt_type or "grocery",
            "liters": receipt.liters,
            "price_per_liter": receipt.price_per_liter,
            "fuel_grade": receipt.fuel_grade,
            "vehicles": [],
            "suggested_vehicle_id": None,
        }

        # For fuel receipts: override category to a transport default
        if receipt.receipt_type == "fuel":
            category_names = [cat.name for cat in ab_categories]
            fuel_default = next(
                (n for n in category_names if any(k in n.lower() for k in ("car", "transport", "fuel", "motorbike"))),
                None,
            )
            if fuel_default:
                result["suggested_category_id"] = fuel_default
                result["category_source"] = "keywords"

        # If this is a fuel receipt, detect closest vehicle by ODO
        if receipt.receipt_type == "fuel":
            try:
                vehicles = self._db.get_last_odo_per_vehicle()
                result["vehicles"] = [
                    {"id": v["id"], "name": v["name"], "last_odo": v["last_odo"]}
                    for v in vehicles if v["active"]
                ]

                # If user entered an ODO and we have vehicles, pick closest
                if receipt.liters is not None and result["vehicles"]:
                    # We don't have user-entered ODO at this stage (OCR can't read ODO),
                    # but we pre-select the vehicle with the highest last_odo as a reasonable guess
                    # (user can override in the frontend)
                    sorted_vehicles = sorted(
                        result["vehicles"],
                        key=lambda v: v["last_odo"] if v["last_odo"] is not None else 0,
                        reverse=True,
                    )
                    if sorted_vehicles:
                        result["suggested_vehicle_id"] = sorted_vehicles[0]["id"]
            except Exception as e:
                logger.warning("Vehicle detection failed: %s", e)

        return result

    async def confirm(
        self,
        merchant: str,
        amount: float,
        date: str,               # ISO format: YYYY-MM-DD
        category_id: str,        # e.g. "groceries"
        account_id: str,
        notes: str = "[receipt photo]",
        confirmed_by: str = "web",
    ) -> dict:
        """
        Step 2: Save confirmed receipt data to Actual Budget and update memory.

        Returns:
          {"duplicate": bool, "transaction_id": str | None}

        Duplicate detection:
          SHA256(date + merchant + amount) → 16-char hex ID stored as financial_id
          in Actual Budget. If the same receipt is submitted twice (e.g. user
          double-taps Confirm), the second save is silently skipped.
          This is the same algorithm used by the Telegram bot and CSV importer —
          deduplication works across all three transports.
        """
        # Look up the display name for Actual Budget's get_or_create_category
        category_info = _CATEGORY_BY_ID.get(category_id, {})
        category_name = category_info.get("name", category_id)

        # Parse date string to date object for ActualBudgetClient
        try:
            tx_date = datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            tx_date = datetime.now().date()
            logger.warning("Invalid date '%s', using today", date)

        # Save to Actual Budget — returns the transaction ID or None if duplicate
        tx_id = await self._actual.add_transaction(
            account_id=account_id,
            amount=amount,
            payee=merchant,
            category_name=category_name,
            tx_date=tx_date,
            notes=notes,
        )

        if tx_id is None:
            # add_transaction returns None when a duplicate financial_id is found
            logger.info("Duplicate receipt skipped: %s %.2f on %s", merchant, amount, date)
            return {"duplicate": True, "transaction_id": None}

        # Update the categorizer memory so the next receipt from this merchant
        # is auto-categorized. learn() also updates keyword index in memory.
        self._categorizer.learn(
            merchant=merchant,
            category_id=category_id,
        )

        logger.info(
            "Receipt confirmed by %s → %s %.2f EUR [%s]",
            confirmed_by, merchant, amount, category_name,
        )

        return {"duplicate": False, "transaction_id": tx_id}
