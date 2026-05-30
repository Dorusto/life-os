from __future__ import annotations
"""
CSV parser and normalizer.

Receives raw bytes from upload and returns NormalizedTransaction[].
Auto-detects encoding and delimiter when not explicitly specified.
"""
import csv
import io
import logging
from datetime import date, datetime

from .profiles import CsvProfile, NormalizedTransaction

logger = logging.getLogger(__name__)


class CsvNormalizer:

    def detect_encoding(self, raw: bytes) -> str:
        """Try encodings in order: UTF-8 BOM, UTF-8, CP1252, Latin-1."""
        for enc in ("utf-8-sig", "utf-8", "cp1252", "iso-8859-1"):
            try:
                raw.decode(enc)
                return enc
            except UnicodeDecodeError:
                continue
        return "utf-8"

    def detect_delimiter(self, text: str) -> str:
        """Detect delimiter from the first 5 lines."""
        head = "\n".join(text.splitlines()[:5])
        counts = {d: head.count(d) for d in (";", ",", "|", "\t")}
        return max(counts, key=counts.get)

    def parse_csv(
        self,
        raw: bytes,
        delimiter: str | None = None,
        encoding: str | None = None,
    ) -> tuple[list[str], list[dict]]:
        """
        Parse CSV bytes → (headers, rows).

        Returns:
            headers: list of column names
            rows: list of dicts {column: value}
        """
        enc = encoding or self.detect_encoding(raw)
        text = raw.decode(enc)
        delim = delimiter or self.detect_delimiter(text)

        reader = csv.DictReader(io.StringIO(text), delimiter=delim)
        # Clean BOM and whitespace from headers
        if reader.fieldnames:
            reader.fieldnames = [f.strip("\ufeff").strip() for f in reader.fieldnames]
        headers = list(reader.fieldnames or [])
        rows = [dict(row) for row in reader]
        return headers, rows

    def normalize(self, rows: list[dict], profile: CsvProfile) -> list[NormalizedTransaction]:
        """Normalize rows → expenses + refunds (pure income rows are ignored)."""
        result = []
        for row in rows:
            try:
                tx = self._normalize_row(row, profile)
                if tx:
                    result.append(tx)
            except Exception as e:
                logger.debug(f"Row skipped ({e}): {row}")
        return result

    def normalize_all(self, rows: list[dict], profile: CsvProfile) -> list[NormalizedTransaction]:
        """Normalize all rows, including income."""
        result = []
        for row in rows:
            try:
                tx = self._normalize_row(row, profile)
                if tx:
                    result.append(tx)
            except Exception as e:
                logger.debug(f"Row skipped ({e}): {row}")
        return result

    def _parse_amount(self, raw: str, decimal_sep: str) -> float:
        """
        Parse amount regardless of format:
          - European: "1.234,56" or "49,95"  (decimal_sep=",")
          - Standard: "1,234.56" or "49.95"  (decimal_sep=".")
        """
        s = raw.strip().lstrip("+ ")
        if decimal_sep == ",":
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
        return float(s)

    def _get_col(self, row: dict, col_name: str) -> str:
        """
        Case-insensitive column lookup.
        Returns the value of the column matching col_name (case-insensitive),
        or empty string if not found.
        """
        for key, value in row.items():
            if key.lower() == col_name.lower():
                return (value or "").strip()
        return ""

    def _normalize_row(self, row: dict, profile: CsvProfile) -> NormalizedTransaction | None:
        # Raw amount
        amount_raw = (row.get(profile.col_amount) or "").strip()
        if not amount_raw:
            return None

        amount_float = self._parse_amount(amount_raw, profile.decimal_sep)

        # Expense vs income direction
        if profile.col_direction and profile.expense_indicator:
            direction_val = (row.get(profile.col_direction) or "").strip()
            is_expense = direction_val.lower() == profile.expense_indicator.lower()
        else:
            # No direction column → negative amount = expense
            is_expense = amount_float < 0

        # Internal transfer candidate detection
        # transfer_indicator_value="" means "column must be empty" (e.g. ING Counterparty field)
        # transfer_indicator_value="X" means "column must equal X and direction must be Credit"
        is_transfer_candidate = False
        if profile.col_transfer_indicator:
            indicator_raw = self._get_col(row, profile.col_transfer_indicator)
            if profile.transfer_indicator_value == "":
                # Empty counterparty = own ING account transfer (both directions)
                if not indicator_raw:
                    is_transfer_candidate = True
            elif indicator_raw.lower() == profile.transfer_indicator_value.lower() and not is_expense:
                is_transfer_candidate = True

        amount = abs(amount_float)
        if amount == 0:
            return None

        # Date
        date_raw = (row.get(profile.col_date) or "").strip()
        tx_date = self._parse_date(date_raw, profile.date_format)
        if tx_date is None:
            logger.warning("Could not parse date %r (format: %s) — row skipped", date_raw, profile.date_format)
            return None

        # Merchant
        merchant = (row.get(profile.col_merchant) or "").strip() or "Unknown"

        # Currency
        currency = "EUR"
        if profile.col_currency:
            currency = (row.get(profile.col_currency) or "EUR").strip().upper() or "EUR"

        # Description / notes
        description = ""
        if profile.col_description:
            description = (row.get(profile.col_description) or "").strip()

        return NormalizedTransaction(
            date=tx_date,
            merchant=merchant,
            amount=amount,
            currency=currency,
            description=description,
            is_expense=is_expense,
            is_transfer_candidate=is_transfer_candidate,
        )

    def _parse_date(self, date_str: str, date_format: str) -> date | None:
        if not date_str:
            return None
        # Try the profile-specified format first
        try:
            return datetime.strptime(date_str, date_format).date()
        except ValueError:
            pass
        # Common fallback formats
        clean = date_str[:19]  # trim microseconds / timezone
        for fmt in (
            "%Y%m%d",
            "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y",
            "%d.%m.%y", "%m/%d/%Y",
            "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S",
        ):
            try:
                return datetime.strptime(clean, fmt).date()
            except ValueError:
                continue
        return None
