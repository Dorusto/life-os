"""
Shared transaction/payee text helpers.

Relocated from backend/core/actual_client/client.py (#216) — pure functions
with no dependency on the Actual Budget client/session, used across the
tool and API layers.
"""
from __future__ import annotations

import hashlib


def rule_match_prefix(payee_name: str) -> str:
    """
    Default suggestion for an AB rule's CONTAINS-match text: first word if it's
    specific enough (>=4 alphanumeric chars) — generalizes across store-number
    suffixes, e.g. "Lidl Amsterdam 1234" -> "Lidl" also matches "Lidl Rotterdam
    5678" on a future import. Falls back to the full name otherwise.

    Only a *suggestion* — flows that let the user edit the merchant/payee text
    before confirming (CSV import, receipts) use whatever ends up in that field
    verbatim instead of calling this again, so the user stays in control of
    what a rule actually matches on (#99). Flows without a per-row editable
    field at confirm time (bulk uncategorized-groups action, chat proposal
    notes-rule) still rely on this as the actual value.
    """
    first_word = payee_name.split()[0] if payee_name else ""
    return first_word if len(first_word) >= 4 and first_word.isalnum() else payee_name


def financial_id(date_str: str, merchant: str, amount: float) -> str:
    """
    SHA256(date+merchant+amount)[:16] — cross-transport deduplication key.
    Identical for every import path (CSV, receipt scan, /add command), so a
    transaction imported once is never re-imported via another transport.
    """
    sig = f"{date_str}{merchant}{amount:.4f}"
    return hashlib.sha256(sig.encode()).hexdigest()[:16]
