from __future__ import annotations
"""
Parser pentru bonuri românești.

Extrage informații structurate din textul OCR:
- Numele magazinului
- Data tranzacției
- Suma totală
- Articole individuale (opțional)

Bonurile românești au un format relativ standardizat (cerință fiscală),
ceea ce face parsarea cu regex destul de fiabilă.
"""
import re
from datetime import datetime, date
from dataclasses import dataclass, field
import logging

logger = logging.getLogger(__name__)


@dataclass
class ReceiptItem:
    """Un articol de pe bon."""
    name: str
    quantity: float = 1.0
    unit_price: float = 0.0
    total_price: float = 0.0


@dataclass
class ReceiptData:
    """Date structurate extrase dintr-un bon."""
    merchant: str = ""
    date: date | None = None
    total: float = 0.0
    currency: str = "EUR"
    items: list[ReceiptItem] = field(default_factory=list)
    raw_text: str = ""
    cui: str = ""

    @property
    def is_valid(self) -> bool:
        """Un bon e valid dacă are cel puțin magazin și sumă."""
        return bool(self.merchant) and self.total > 0

    def summary(self) -> str:
        """Rezumat human-readable."""
        date_str = self.date.strftime("%d.%m.%Y") if self.date else "?"
        items_str = f", {len(self.items)} articole" if self.items else ""
        return (
            f"🏪 {self.merchant}\n"
            f"📅 {date_str}\n"
            f"💰 {self.total:.2f} RON{items_str}"
        )


class ReceiptParser:
    """
    Parser inteligent pentru bonuri românești.

    Strategia de parsare:
    1. Caută magazinul în primele 5 linii (acolo e mereu)
    2. Caută totalul cu regex pe cuvinte cheie (TOTAL, TOTAL DE PLATA)
    3. Caută data în formate românești comune
    4. Opțional: extrage articole individuale
    """

    # Patterns pentru suma totală
    TOTAL_PATTERNS = [
        # "TOTAL        123.45" sau "TOTAL: 123,45"
        r"TOTAL\s*(?:DE\s+PLATA|LEI)?[\s:]*(\\d+[.,]\\d{2})",
        # "TOTAL        123.45 LEI"
        r"TOTAL\s+(\d+[.,]\d{2})\s*(?:LEI|RON)?",
        # Variante cu SUBTOTAL exclus
        r"(?<!SUB)TOTAL[\s:]+(\d+[.,]\d{2})",
        # "A PLATI: 123.45"
        r"(?:A\s+PLATI|DE\s+PLATA|PLATA)[\s:]+(\d+[.,]\d{2})",
        # Pattern relaxat pentru total pe ultima linie cu sumă
        r"(?:REST|NUMERAR|CARD|CASH)[\s:]+(\d+[.,]\d{2})",
    ]

    # Patterns pentru dată
    DATE_PATTERNS = [
        # DD.MM.YYYY sau DD/MM/YYYY
        r"(\d{2})[./\-](\d{2})[./\-](\d{4})",
        # DD.MM.YY
        r"(\d{2})[./\-](\d{2})[./\-](\d{2})\b",
        # YYYY-MM-DD (ISO)
        r"(\d{4})-(\d{2})-(\d{2})",
    ]

    # Patterns pentru CUI
    CUI_PATTERNS = [
        r"(?:CUI|C\.U\.I\.?|COD\s+FISCAL|CF|CIF)[\s:]*(?:RO)?(\d{6,10})",
        r"RO\s*(\d{6,10})",
    ]

    # Patterns pentru articole
    ITEM_PATTERNS = [
        # "Nume produs    2 x 5.99    11.98"
        r"(.+?)\s+(\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+[.,]\d{2})\s+(\d+[.,]\d{2})",
        # "Nume produs              11.98"
        r"(.{3,40}?)\s{2,}(\d+[.,]\d{2})\s*$",
    ]

    # Magazine cunoscute (ajută la identificarea numelui)
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
        Parsează textul OCR al unui bon.

        Args:
            text: Text brut de la OCR

        Returns:
            ReceiptData cu informațiile extrase
        """
        receipt = ReceiptData(raw_text=text)

        # Normalizează textul
        lines = text.split("\n")
        text_upper = text.upper()

        # 1. Extrage magazinul
        receipt.merchant = self._extract_merchant(lines)

        # 2. Extrage totalul
        receipt.total = self._extract_total(text_upper)

        # 3. Extrage data
        receipt.date = self._extract_date(text)

        # 4. Extrage CUI
        receipt.cui = self._extract_cui(text_upper)

        # 5. Extrage articole (opțional, best-effort)
        receipt.items = self._extract_items(lines)

        # Logging
        if receipt.is_valid:
            logger.info(f"Bon parsat cu succes: {receipt.merchant}, {receipt.total} RON")
        else:
            logger.warning(
                f"Bon incomplet: merchant='{receipt.merchant}', total={receipt.total}"
            )

        return receipt

    def _extract_merchant(self, lines: list[str]) -> str:
        """
        Extrage numele magazinului.
        Strategie: caută în primele 5-7 linii un merchant cunoscut,
        altfel ia prima linie non-goală substanțială.
        """
        # Prima încercare: caută magazine cunoscute
        search_zone = " ".join(lines[:7]).lower()
        for merchant in self.KNOWN_MERCHANTS:
            if merchant in search_zone:
                return merchant.title()

        # A doua încercare: prima linie substanțială (>3 caractere, nu doar cifre)
        for line in lines[:5]:
            cleaned = line.strip()
            if len(cleaned) > 3 and not cleaned.replace(".", "").isdigit():
                # Ignoră linii care par a fi adrese sau CUI
                if not re.match(r"^(STR|BD|CAL|NR|CUI|CF|J\d)", cleaned.upper()):
                    return cleaned

        return "Necunoscut"

    def _extract_total(self, text_upper: str) -> float:
        """Extrage suma totală folosind pattern-uri multiple."""
        for pattern in self.TOTAL_PATTERNS:
            matches = re.findall(pattern, text_upper)
            if matches:
                # Ia ultimul match (pe bon, TOTAL apare de obicei spre final)
                amount_str = matches[-1].replace(",", ".")
                try:
                    amount = float(amount_str)
                    if 0.01 <= amount <= 100000:  # Sanity check
                        logger.debug(
                            f"Total găsit cu pattern '{pattern}': {amount}"
                        )
                        return amount
                except ValueError:
                    continue

        # Fallback: caută cel mai mare număr din ultimele 10 linii
        lines = text_upper.split("\n")
        amounts = []
        for line in lines[-10:]:
            for match in re.findall(r"(\d+[.,]\d{2})", line):
                try:
                    amounts.append(float(match.replace(",", ".")))
                except ValueError:
                    pass

        if amounts:
            # Totalul e de obicei cea mai mare sumă
            total = max(amounts)
            logger.debug(f"Total fallback (max din ultimele linii): {total}")
            return total

        return 0.0

    def _extract_date(self, text: str) -> date | None:
        """Extrage data bonului."""
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

        return date.today()  # Fallback: data de azi

    def _extract_cui(self, text_upper: str) -> str:
        """Extrage Codul Unic de Înregistrare."""
        for pattern in self.CUI_PATTERNS:
            match = re.search(pattern, text_upper)
            if match:
                return match.group(1)
        return ""

    def _extract_items(self, lines: list[str]) -> list[ReceiptItem]:
        """
        Extrage articolele individuale (best-effort).
        Nu toate bonurile sunt suficient de clare pentru asta.
        """
        items = []

        for line in lines:
            line = line.strip()
            if not line or len(line) < 5:
                continue

            # Skip linii cu cuvinte cheie non-articol
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
