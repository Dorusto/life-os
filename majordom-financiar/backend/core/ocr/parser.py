from __future__ import annotations
"""
Parser for Romanian receipts.

Extracts structured information from OCR text:
- Store/merchant name
- Transaction date
- Total amount
- Individual items (optional)

Romanian receipts have a fairly standardized format (fiscal requirement),
which makes regex parsing quite reliable.
"""
import re
from datetime import datetime, date
from dataclasses import dataclass, field
import logging

logger = logging.getLogger(__name__)


@dataclass
class ReceiptItem:
    """A single receipt item."""
    name: str
    quantity: float = 1.0
    unit_price: float = 0.0
    total_price: float = 0.0


@dataclass
class ReceiptData:
    """Structured data extracted from a receipt."""
    merchant: str = ""
    date: date | None = None
    total: float = 0.0
    currency: str = "EUR"
    items: list[ReceiptItem] = field(default_factory=list)
    raw_text: str = ""
    cui: str = ""
    # Fuel receipt fields
    receipt_type: str = "grocery"       # "fuel" | "grocery"
    liters: float | None = None
    price_per_liter: float | None = None
    fuel_grade: str | None = None

    @property
    def is_valid(self) -> bool:
        """A receipt is valid if it has at least a merchant and a total."""
        return bool(self.merchant) and self.total > 0

    def summary(self) -> str:
        """Human-readable summary."""
        date_str = self.date.strftime("%d.%m.%Y") if self.date else "?"
        items_str = f", {len(self.items)} items" if self.items else ""
        return (
            f"🏪 {self.merchant}\n"
            f"📅 {date_str}\n"
            f"💰 {self.total:.2f} RON{items_str}"
        )


class ReceiptParser:
    """
    Smart parser for Romanian receipts.

    Parsing strategy:
    1. Look for the merchant in the first 5 lines (always there)
    2. Search for the total with regex on keywords (TOTAL, TOTAL DE PLATA)
    3. Look for the date in common Romanian formats
    4. Optionally: extract individual items
    """

    # Patterns for the total amount
    TOTAL_PATTERNS = [
        # "TOTAL        123.45" or "TOTAL: 123,45"
        r"TOTAL\s*(?:DE\s+PLATA|LEI)?[\s:]*(\\d+[.,]\\d{2})",
        # "TOTAL        123.45 LEI"
        r"TOTAL\s+(\d+[.,]\d{2})\s*(?:LEI|RON)?",
        # Variants excluding SUBTOTAL
        r"(?<!SUB)TOTAL[\s:]+(\d+[.,]\d{2})",
        # "A PLATI: 123.45"
        r"(?:A\s+PLATI|DE\s+PLATA|PLATA)[\s:]+(\d+[.,]\d{2})",
        # Relaxed pattern for total on the last line with amount
        r"(?:REST|NUMERAR|CARD|CASH)[\s:]+(\d+[.,]\d{2})",
    ]

    # Patterns for date
    DATE_PATTERNS = [
        # DD.MM.YYYY or DD/MM/YYYY
        r"(\d{2})[./\-](\d{2})[./\-](\d{4})",
        # DD.MM.YY
        r"(\d{2})[./\-](\d{2})[./\-](\d{2})\b",
        # YYYY-MM-DD (ISO)
        r"(\d{4})-(\d{2})-(\d{2})",
    ]

    # Patterns for CUI (fiscal code)
    CUI_PATTERNS = [
        r"(?:CUI|C\.U\.I\.?|COD\s+FISCAL|CF|CIF)[\s:]*(?:RO)?(\d{6,10})",
        r"RO\s*(\d{6,10})",
    ]

    # Patterns for items
    ITEM_PATTERNS = [
        # "Nume produs    2 x 5.99    11.98"
        r"(.+?)\s+(\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+[.,]\d{2})\s+(\d+[.,]\d{2})",
        # "Nume produs              11.98"
        r"(.{3,40}?)\s{2,}(\d+[.,]\d{2})\s*$",
    ]

    # Known merchants (helps identify the name)
    KNOWN_MERCHANTS = [
        "kaufland", "lidl", "mega image", "carrefour", "auchan",
        "penny", "profi", "cora", "selgros", "metro", "la doi pasi",
        "petrom", "omv", "mol", "rompetrol", "lukoil",
        "dedeman", "hornbach", "leroy merlin", "ikea",
        "catena", "sensiblu", "helpnet", "dona", "dr.max",
        "h&m", "zara", "reserved", "decathlon",
        "mcdonald", "kfc", "subway", "starbucks",
        "emag", "altex", "flanco", "media galaxy",
    ]

    def parse(self, text: str) -> ReceiptData:
        """
        Parse the OCR text of a receipt.

        Args:
            text: Raw OCR text

        Returns:
            ReceiptData with extracted information
        """
        receipt = ReceiptData(raw_text=text)

        # Normalize text
        lines = text.split("\n")
        text_upper = text.upper()

        # 1. Extract merchant
        receipt.merchant = self._extract_merchant(lines)

        # 2. Extract total
        receipt.total = self._extract_total(text_upper)

        # 3. Extract date
        receipt.date = self._extract_date(text)

        # 4. Extract CUI
        receipt.cui = self._extract_cui(text_upper)

        # 5. Extract items (optional, best-effort)
        receipt.items = self._extract_items(lines)

        if receipt.is_valid:
            logger.info(f"Receipt parsed successfully: {receipt.merchant}, {receipt.total} RON")
        else:
            logger.warning(
                f"Incomplete receipt: merchant='{receipt.merchant}', total={receipt.total}"
            )

        return receipt

    def _extract_merchant(self, lines: list[str]) -> str:
        """
        Extract the merchant/store name.
        Strategy: look for a known merchant in the first 5-7 lines,
        otherwise take the first substantial non-empty line.
        """
        # First attempt: look for known merchants
        search_zone = " ".join(lines[:7]).lower()
        for merchant in self.KNOWN_MERCHANTS:
            if merchant in search_zone:
                return merchant.title()

        # Second attempt: first substantial line (>3 chars, not just digits)
        for line in lines[:5]:
            cleaned = line.strip()
            if len(cleaned) > 3 and not cleaned.replace(".", "").isdigit():
                # Skip lines that look like addresses or CUI
                if not re.match(r"^(STR|BD|CAL|NR|CUI|CF|J\d)", cleaned.upper()):
                    return cleaned

        return "Unknown"

    def _extract_total(self, text_upper: str) -> float:
        """Extract the total amount using multiple patterns."""
        for pattern in self.TOTAL_PATTERNS:
            matches = re.findall(pattern, text_upper)
            if matches:
                # Take the last match (on receipts, TOTAL usually appears near the end)
                amount_str = matches[-1].replace(",", ".")
                try:
                    amount = float(amount_str)
                    if 0.01 <= amount <= 100000:  # Sanity check
                        logger.debug(
                            f"Total found with pattern '{pattern}': {amount}"
                        )
                        return amount
                except ValueError:
                    continue

        # Fallback: look for the largest number in the last 10 lines
        lines = text_upper.split("\n")
        amounts = []
        for line in lines[-10:]:
            for match in re.findall(r"(\d+[.,]\d{2})", line):
                try:
                    amounts.append(float(match.replace(",", ".")))
                except ValueError:
                    pass

        if amounts:
            # The total is usually the largest amount
            total = max(amounts)
            logger.debug(f"Total fallback (max from last lines): {total}")
            return total

        return 0.0

    def _extract_date(self, text: str) -> date | None:
        """Extract the receipt date."""
        for pattern in self.DATE_PATTERNS:
            match = re.search(pattern, text)
            if match:
                groups = match.groups()
                try:
                    if len(groups[0]) == 4:  # YYYY-MM-DD
                        return date(int(groups[0]), int(groups[1]), int(groups[2]))
                    else:
                        year = int(groups[2])
                        if year < 100:
                            year += 2000
                        return date(year, int(groups[1]), int(groups[0]))
                except (ValueError, IndexError):
                    continue

        return date.today()  # Fallback: today's date

    def _extract_cui(self, text_upper: str) -> str:
        """Extract the Unique Registration Code (CUI)."""
        for pattern in self.CUI_PATTERNS:
            match = re.search(pattern, text_upper)
            if match:
                return match.group(1)
        return ""

    def _extract_items(self, lines: list[str]) -> list[ReceiptItem]:
        """
        Extract individual items (best-effort).
        Not all receipts are clear enough for this.
        """
        items = []

        for line in lines:
            line = line.strip()
            if not line or len(line) < 5:
                continue

            # Skip lines with non-item keywords
            skip_keywords = [
                "TOTAL", "SUBTOTAL", "TVA", "FISCAL", "CASA", "BON",
                "PLATA", "REST", "NUMERAR", "CARD", "CUI", "NR.",
            ]
            if any(kw in line.upper() for kw in skip_keywords):
                continue

            # Pattern: "produs  qty x price  line_total"
            match = re.match(self.ITEM_PATTERNS[0], line)
            if match:
                items.append(ReceiptItem(
                    name=match.group(1).strip(),
                    quantity=float(match.group(2).replace(",", ".")),
                    unit_price=float(match.group(3).replace(",", ".")),
                    total_price=float(match.group(4).replace(",", "."))
                ))
                continue

            # Pattern: "produs     price"
            match = re.match(self.ITEM_PATTERNS[1], line)
            if match:
                name = match.group(1).strip()
                price = float(match.group(2).replace(",", "."))
                if 0.01 <= price <= 10000 and len(name) > 2:
                    items.append(ReceiptItem(
                        name=name,
                        total_price=price
                    ))

        return items
