from __future__ import annotations
"""
Dataclass-uri pentru profiluri CSV și tranzacții normalizate.

Un CsvProfile descrie cum să interpreți un CSV specific (ING, crypto.com, etc.).
Odată salvat în SQLite, este reutilizat automat la orice import viitor din aceeași sursă.
"""
from dataclasses import dataclass
from datetime import date


@dataclass
class CsvProfile:
    """Profilul unui format CSV de la o sursă specifică (bancă, app)."""
    id: int | None = None
    source_name: str = ""           # "ING", "crypto.com", "Revolut"
    header_sig: str = ""            # MD5 pe coloanele sortate — fingerprint stabil
    col_date: str = ""              # Coloana cu data tranzacției
    col_merchant: str = ""          # Coloana cu merchantul / payee-ul
    col_amount: str = ""            # Coloana cu suma
    col_currency: str = ""          # Coloana cu moneda (sau "" dacă e fixă)
    col_direction: str = ""         # Coloana cu direcția Af/Bij (sau "" dacă suma are semn)
    col_description: str = ""       # Coloana cu note/memo (opțional)
    expense_indicator: str = ""     # Valoarea care înseamnă cheltuială ("Af", "Debit", "OUT")
    date_format: str = "%Y-%m-%d"   # Format strptime pentru coloana de dată
    delimiter: str = ","
    decimal_sep: str = "."
    encoding: str = "utf-8"
    confirmed: bool = False         # A fost confirmat explicit de utilizator


@dataclass
class NormalizedTransaction:
    """Tranzacție normalizată din orice sursă CSV — format intern standard."""
    date: date
    merchant: str
    amount: float       # întotdeauna pozitiv
    currency: str = "EUR"
    description: str = ""
    is_expense: bool = True
