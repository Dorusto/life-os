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
import re
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from backend.core.config import settings
from backend.core.finance.provider import get_provider
from backend.core.ocr.vision_engine import VisionEngine
from backend.core.vehicle_client import VehicleClient
from backend.services.refuel_rules import vehicle_refuel_context

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

# Actual Budget category ids are UUIDs ("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx").
# Used to tell a UUID (which needs an AB lookup to resolve to a name) from a slug
# or display name (which don't), so the legacy slug/name paths avoid an extra
# Actual Budget round-trip.
_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


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
        self._provider = get_provider()
        self._vehicle_client = VehicleClient(base_url=settings.vehicle_manager.url)

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

        # One shared deterministic suggestion (#324) — an existing AB rule, then
        # the payee's own categorized history. match_notes=False: OCR text is too
        # noisy to match category names against, but rules may still match on it.
        suggestion = await self._provider.suggest_category(
            merchant, receipt.raw_text or "", match_notes=False
        )
        if suggestion["category_name"]:
            suggested_category_id = suggestion["category_name"]
            source = "history"
        else:
            suggested_category_id = None
            source = "none"

        # Format date as ISO string for JSON serialization
        tx_date = receipt.date
        if isinstance(tx_date, date):
            date_str = tx_date.isoformat()
        else:
            date_str = datetime.now().strftime("%Y-%m-%d")

        # Fetch accounts and categories live from Actual Budget
        accounts, ab_categories = await asyncio.gather(
            self._provider.get_accounts(),
            self._provider.get_categories(),
        )

        # Build base result
        result = {
            "merchant": merchant,
            "amount": receipt.total,
            "date": date_str,
            "suggested_category_id": suggested_category_id,
            "category_source": source,
            # Fuel receipts override category below after receipt_type is known
            "categories": [
                {"id": cat.id, "name": cat.name, "emoji": "📦", "group_name": cat.group_name}
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

        # For fuel receipts: suggested category = the same rule/history
        # suggestion computed above, else none. Never a keyword guess
        # (decisions.md #operator-not-brain) — the card fills it from the
        # vehicle's own last refuel category instead.
        if receipt.receipt_type == "fuel":
            if suggestion["category_name"]:
                result["suggested_category_id"] = suggestion["category_name"]
                result["category_source"] = "history"
            else:
                result["suggested_category_id"] = None
                result["category_source"] = "none"

        # Fuel receipts: enrich the active vehicles with history-based defaults
        # (max litres, last category/account). Never guess a vehicle — the card
        # pre-selects one only when there is exactly one active vehicle.
        if receipt.receipt_type == "fuel":
            try:
                vehicles = await self._vehicle_client.list_vehicles(active_only=True)
                active = [v for v in vehicles if v.get("active", 1)]
                result["vehicles"] = await vehicle_refuel_context(self._vehicle_client, active)
                result["suggested_vehicle_id"] = active[0]["id"] if len(active) == 1 else None
            except Exception as e:
                logger.warning("Vehicle detection failed: %s", e)

        # Resolve the suggested category to its Actual Budget id (UUID) so the
        # frontend's <select> values line up with the categories list above and
        # with the split endpoint's category_id contract (#115). suggested_category_id
        # may be a slug (local categorizer), an AB rule's display name, or a fuel
        # default name — map any of those to the matching category's id.
        if result.get("suggested_category_id"):
            suggested_name = _CATEGORY_BY_ID.get(
                result["suggested_category_id"], {}
            ).get("name", result["suggested_category_id"])
            result["suggested_category_id"] = next(
                (cat.id for cat in ab_categories if cat.name.lower() == suggested_name.lower()),
                None,
            )

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
        create_rule: bool = False,
    ) -> dict:
        """
        Step 2: Save confirmed receipt data to Actual Budget.

        Returns:
          {"duplicate": bool, "transaction_id": str | None}

        Duplicate detection:
          SHA256(date + merchant + amount) → 16-char hex ID stored as financial_id
          in Actual Budget. If the same receipt is submitted twice (e.g. user
          double-taps Confirm), the second save is silently skipped.
          This is the same algorithm used by the Telegram bot and CSV importer —
          deduplication works across all three transports.

        create_rule: if True, also create an Actual Budget rule so future
        receipts from this merchant auto-categorize (#99) — never automatic,
        only when the user explicitly checks the box on the confirmation card.
        """
        # Look up the display name for Actual Budget's get_or_create_category
        category_name = await self._resolve_category_name(category_id)

        # Parse date string to date object for ActualBudgetClient
        try:
            tx_date = datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            tx_date = datetime.now().date()
            logger.warning("Invalid date '%s', using today", date)

        # Save to Actual Budget — returns the transaction ID or None if duplicate
        tx_id = await self._provider.add_transaction(
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

        if create_rule:
            try:
                existing = await self._provider.match_existing_rules([{"payee": merchant, "notes": notes}])
                already_covered = (
                    existing and existing[0]
                    and existing[0].get("category_name", "").lower() == category_name.lower()
                )
                if not already_covered:
                    cats = await self._provider.get_categories()
                    cat = next((c for c in cats if c.name.lower() == category_name.lower()), None)
                    if cat:
                        # merchant is verbatim what the user left in the (editable)
                        # field — no server-side "smart prefix" guess (#99).
                        await self._provider.create_payee_rule(
                            payee_name_prefix=merchant,
                            category_id=cat.id,
                        )
            except Exception as e:
                logger.warning("Failed to create AB rule for receipt merchant '%s': %s", merchant, e)

        logger.info(
            "Receipt confirmed by %s → %s %.2f EUR [%s]",
            confirmed_by, merchant, amount, category_name,
        )

        return {"duplicate": False, "transaction_id": tx_id}

    async def check_near_duplicate(self, account_id: str, amount: float, date: str) -> dict | None:
        """
        Look for an existing uncategorized bank-sync transaction that's
        probably the same real-world purchase as this receipt (issue #121) —
        same account, date within 1 day, amount within 2%. OCR totals and
        card authorization amounts rarely match exactly.
        """
        try:
            tx_date = datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            tx_date = datetime.now().date()
        return await self._provider.find_near_duplicate_transaction(
            account_id=account_id,
            amount=amount,
            date=tx_date,
        )

    async def attach_to_existing(self, financial_id: str, category_id: str, notes: str) -> str | None:
        """Attach OCR details to an existing transaction instead of creating a new one.

        Returns the attached transaction's own primary key (what the split
        endpoint expects), or None if the transaction was not found.
        """
        category_name = await self._resolve_category_name(category_id)
        return await self._provider.attach_receipt_to_transaction(
            financial_id=financial_id,
            category_name=category_name,
            notes=notes,
        )

    async def resolve_transaction(
        self,
        *,
        account_id: str,
        amount: float,
        date: str,
        category_id: str,
        merchant: str,
        notes: str,
        attach_to: Optional[str] = None,
        force_new: bool = False,
        confirmed_by: str = "web",
        create_rule: bool = False,
    ) -> dict:
        """
        Shared attach / near-duplicate-check / create dispatch (#121).

        Every confirm flow that can match against an existing bank-sync
        transaction — confirm_receipt, confirm_fuel_receipt (receipts.py) and
        confirm_vehicle_proposal (vehicle_proposals.py) — must go through this,
        not a fresh copy of the branching. See duplication-prevention.md's
        "extract at the second occurrence" rule; this was already the third
        hand-written copy of the same three-way dispatch before being unified.

        Returns exactly one of:
          {"attach_not_found": True}
          {"possible_match": {...}}                          # see check_near_duplicate()
          {"duplicate": bool, "transaction_id": str | None}   # see confirm()
        """
        if attach_to:
            tx_id = await self.attach_to_existing(financial_id=attach_to, category_id=category_id, notes=notes)
            if not tx_id:
                return {"attach_not_found": True}
            return {"duplicate": False, "transaction_id": tx_id}

        if not force_new:
            match = await self.check_near_duplicate(account_id=account_id, amount=amount, date=date)
            if match:
                return {"possible_match": match}

        return await self.confirm(
            merchant=merchant,
            amount=amount,
            date=date,
            category_id=category_id,
            account_id=account_id,
            notes=notes,
            confirmed_by=confirmed_by,
            create_rule=create_rule,
        )

    async def _resolve_category_name(self, category_id: str) -> str:
        """Resolve a category reference to its Actual Budget display name.

        Accepts three forms and returns the display name that
        ``ActualBudgetClient.add_transaction()`` looks up by:

          - a slug from categories.json (legacy local-categorizer key),
          - an Actual Budget category id / UUID (what the web receipt & split
            flows now send, #115),
          - an Actual Budget display name (pass-through).

        Slugs resolve from the local index (no AB call); UUIDs need one AB
        lookup; names pass through unchanged.
        """
        if category_id in _CATEGORY_BY_ID:
            return _CATEGORY_BY_ID[category_id]["name"]
        if _UUID_RE.match(category_id):
            try:
                cats = await self._provider.get_categories()
            except Exception as e:
                logger.error("Could not fetch categories to resolve id '%s': %s", category_id, e)
                raise ValueError(f"Could not resolve category id '{category_id}' to a name") from e
            for c in cats:
                if c.id == category_id:
                    return c.name
            logger.error("Category id '%s' not found in Actual Budget", category_id)
            raise ValueError(f"Category id '{category_id}' does not exist in Actual Budget")
        return category_id
