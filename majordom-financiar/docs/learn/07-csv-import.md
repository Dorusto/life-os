# 07 — How CSV import works

## Files involved

```
backend/core/csv_importer/
├── profiles.py    ← dataclasses: CsvProfile, NormalizedTransaction
├── normalizer.py  ← CsvNormalizer: encoding/delimiter detection, parse, normalize
├── detector.py    ← CsvProfileDetector: MD5 signature + LLM for new formats
└── __init__.py    ← exports the 3 classes

backend/api/csv_import.py  ← POST /api/import/csv/preview + /confirm
backend/core/memory/builtin_profiles.py  ← pre-seeded profiles for ING, BUNQ, Revolut
backend/core/memory/database.py ← csv_profiles table in SQLite
```

## The problem: every bank exports differently

ING exports with `;` as delimiter, amount `34,20` (comma decimal), `Af Bij` column for direction. crypto.com exports with `,`, amount `34.20` (period decimal), no direction column — negative amount means expense. Revolut is different again.

**Solution used since 2026-05-29:** `bank2ynab` (MIT, pip) — covers 100+ European banks via community profiles. All outputs are in the same fixed format (Date/Payee/Outflow/Inflow). Majordom needs one parser, not per-bank logic.

## Built-in profiles (seeded at startup)

`builtin_profiles.py` contains pre-configured profiles for:
- ING NL (EN semicolon format)
- ING NL (EN comma format)
- ING NL (NL semicolon format)
- BUNQ export
- Revolut

`seed_builtin_profiles()` runs at FastAPI startup — UPSERT by `source_name`. This means corrected profiles automatically overwrite any corrupt Ollama-detected profiles.

## Transfer detection: Code=GT (ING)

ING exports a `Code` column with value `GT` (Geldtransfer) for own-account transfers. This is the correct signal — NOT IBAN regex on descriptions.

```python
# builtin_profiles.py
"col_transfer_indicator": "Code",
"transfer_indicator_value": "GT",
```

Why not IBAN regex? ING puts the recipient's IBAN in the description for **ALL** transactions (including iDEAL payments to people). Regex on descriptions produces false positives inevitably.

## How the import flow works

```
User uploads CSV via + button in chat
    ↓
POST /api/import/csv/preview
    ├── bank2ynab detects format + converts to standard
    ├── For each row: SmartCategorizer.suggest() → category or "?"
    ├── Transfer candidates (Code=GT) → marked as is_transfer_candidate=True
    └── Returns ImportPreview with rows
        ↓
CsvImportCard rendered inline in chat
    ↓
User reviews: confirms categories, assigns transfer accounts, marks income sources
    ↓
POST /api/import/csv/confirm
    ├── Transfer rows → ActualBudgetClient.create_transfer()
    ├── Unknown income rows → IncomeSourceCard (name payee as Income or Transfer)
    ├── Regular rows → ActualBudgetClient.add_transactions_batch()
    │     └── SHA256(date+merchant+amount) as imported_id → AB handles deduplication
    ├── Confirmed categories → SmartCategorizer.learn() (except "Other")
    └── Unconfirmed LLM suggestions → pending_review table
```

## SmartCategorizer rules for import

```python
# 1. Never learn "Other"
if row.category_name and row.category_name != "Other":
    categorizer.learn(row.merchant.lower(), row.category_name)

# 2. "Other" from history → blank (user decides)
ab_name = mapped if mapped != "Other" else ""

# 3. Transactions > €50 → always "?" badge, even with history
category_confirmed = (bool(ab_name) and pred.from_history and ab_name != "Other" and tx.amount <= 50)
```

## Amount normalization

```python
# ING: "34,20" with decimal_sep=","
"34,20" → "34.20" → float(34.20)

# ING with thousands: "1.234,56"
"1.234,56".replace(".", "") → "1234,56" → .replace(",", ".") → "1234.56"

# crypto.com: "-15.99" negative = expense
float("-15.99") → is_expense=True, amount=15.99
```

## Refunds / positive amounts

Refunds (positive amounts) are NOT filtered — they're imported as income transactions in Actual Budget, so the net is correct:
```
Purchase: -5.00 EUR → -5 in AB
Refund:   +5.00 EUR → +5 in AB
Net:       0.00 EUR ✓
```

## Deduplication

`SHA256(source_name + date + merchant + amount)[:16]` as `imported_id`. If you import the same CSV twice, the second run imports 0 transactions — AB handles the dedup check.

## CSV profiles in SQLite

`csv_profiles` table stores detected profiles. A profile is `confirmed=True` if the user confirmed it (or if it's a built-in). Anti-corruption rule: if a confirmed profile exists for a `source_name`, Ollama-detected profiles for the same bank are NOT saved — the confirmed one always wins.

## IncomeSourceCard — naming unknown income

After import, rows that are income (positive amount) and not categorized → `IncomeSourceCard` per row. User chooses:
- **Income**: create category in AB + retroactively categorize all uncategorized transactions from that payee
- **Transfer from account**: save mapping `__transfer__:{account_id}` in SQLite → future imports auto-detect this payee as a transfer candidate

Accounts in the dropdown are separated by On budget / Off budget groups.
