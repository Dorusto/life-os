from __future__ import annotations
"""
Dataclasses for CSV profiles and normalized transactions.

A CsvProfile describes how to interpret a specific CSV format (ING, crypto.com, etc.).
Once saved in SQLite, it is automatically reused on any future import from the same source.
"""
from dataclasses import dataclass
from datetime import date


@dataclass
class CsvProfile:
    """Profile of a CSV format from a specific source (bank, app)."""
    id: int | None = None
    source_name: str = ""           # "ING", "crypto.com", "Revolut"
    header_sig: str = ""            # MD5 of sorted column names — stable fingerprint
    col_date: str = ""              # Column containing the transaction date
    col_merchant: str = ""          # Column containing the merchant / payee
    col_amount: str = ""            # Column containing the amount
    col_currency: str = ""          # Column containing the currency (or "" if fixed)
    col_direction: str = ""         # Column containing debit/credit direction (or "" if amount is signed)
    col_description: str = ""       # Column containing notes/memo (optional)
    expense_indicator: str = ""     # Value meaning expense ("Af", "Debit", "OUT")
    date_format: str = "%Y-%m-%d"   # strptime format for the date column
    delimiter: str = ","
    decimal_sep: str = "."
    encoding: str = "utf-8"
    confirmed: bool = False         # Was explicitly confirmed by the user


@dataclass
class NormalizedTransaction:
    """Normalized transaction from any CSV source — standard internal format."""
    date: date
    merchant: str
    amount: float       # always positive
    currency: str = "EUR"
    description: str = ""
    is_expense: bool = True
