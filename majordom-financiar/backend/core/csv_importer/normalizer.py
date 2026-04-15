from __future__ import annotations
"""
Parser și normalizator CSV.

Primește bytes brute din Telegram și returnează NormalizedTransaction[].
Detectează automat encoding și delimiter când nu sunt specificate explicit.
"""
import csv
import io
import logging
from datetime import date, datetime

from .profiles import CsvProfile, NormalizedTransaction

logger = logging.getLogger(__name__)


class CsvNormalizer:

    def detect_encoding(self, raw: bytes) -> str:
        """Încearcă encodings în ordine: UTF-8 BOM, UTF-8, CP1252, Latin-1."""
        for enc in ("utf-8-sig", "utf-8", "cp1252", "iso-8859-1"):
            try:
                raw.decode(enc)
                return enc
            except UnicodeDecodeError:
                continue
        return "utf-8"

    def detect_delimiter(self, text: str) -> str:
        """Detectează delimiterul din primele 5 linii."""
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
        Parsează bytes CSV → (headers, rows).

        Returns:
            headers: lista numelor de coloane
            rows: lista de dict-uri {coloana: valoare}
        """
        enc = encoding or self.detect_encoding(raw)
        text = raw.decode(enc)
        delim = delimiter or self.detect_delimiter(text)

        reader = csv.DictReader(io.StringIO(text), delimiter=delim)
        # Curăță BOM și whitespace din headere
        if reader.fieldnames:
            reader.fieldnames = [f.strip("\ufeff").strip() for f in reader.fieldnames]
        headers = list(reader.fieldnames or [])
        rows = [dict(row) for row in reader]
        return headers, rows

    def normalize(self, rows: list[dict], profile: CsvProfile) -> list[NormalizedTransaction]:
        """Normalizează rânduri → cheltuieli + refund-uri (veniturile pure sunt ignorate)."""
        result = []
        for row in rows:
            try:
                tx = self._normalize_row(row, profile)
                if tx:
                    result.append(tx)
            except Exception as e:
                logger.debug(f"Rând ignorat ({e}): {row}")
        return result

    def normalize_all(self, rows: list[dict], profile: CsvProfile) -> list[NormalizedTransaction]:
        """Normalizează toate rândurile, inclusiv veniturile."""
        result = []
        for row in rows:
            try:
                tx = self._normalize_row(row, profile)
                if tx:
                    result.append(tx)
            except Exception as e:
                logger.debug(f"Rând ignorat ({e}): {row}")
        return result

    def _parse_amount(self, raw: str, decimal_sep: str) -> float:
        """
        Parsează suma indiferent de format:
          - European: "1.234,56" sau "49,95"  (decimal_sep=",")
          - Standard: "1,234.56" sau "49.95"  (decimal_sep=".")
        """
        s = raw.strip().lstrip("+ ")
        if decimal_sep == ",":
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
        return float(s)

    def _normalize_row(self, row: dict, profile: CsvProfile) -> NormalizedTransaction | None:
        # Suma brută
        amount_raw = (row.get(profile.col_amount) or "").strip()
        if not amount_raw:
            return None

        amount_float = self._parse_amount(amount_raw, profile.decimal_sep)

        # Direcție cheltuială vs venit
        if profile.col_direction and profile.expense_indicator:
            direction_val = (row.get(profile.col_direction) or "").strip()
            is_expense = direction_val.lower() == profile.expense_indicator.lower()
        else:
            # Fără coloana de direcție → suma negativă = cheltuiala
            is_expense = amount_float < 0

        amount = abs(amount_float)
        if amount == 0:
            return None

        # Data
        date_raw = (row.get(profile.col_date) or "").strip()
        tx_date = self._parse_date(date_raw, profile.date_format)
        if tx_date is None:
            logger.warning("Could not parse date %r (format: %s) — row skipped", date_raw, profile.date_format)
            return None

        # Merchant
        merchant = (row.get(profile.col_merchant) or "").strip() or "Necunoscut"

        # Monedă
        currency = "EUR"
        if profile.col_currency:
            currency = (row.get(profile.col_currency) or "EUR").strip().upper() or "EUR"

        # Descriere / note
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
        )

    def _parse_date(self, date_str: str, date_format: str) -> date | None:
        if not date_str:
            return None
        # Încearcă formatul specificat în profil
        try:
            return datetime.strptime(date_str, date_format).date()
        except ValueError:
            pass
        # Fallback-uri comune
        clean = date_str[:19]  # taie microsecundele / timezone
        for fmt in (
            "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y",
            "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S",
        ):
            try:
                return datetime.strptime(clean, fmt).date()
            except ValueError:
                continue
        return None
