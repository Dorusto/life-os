# 08 — Transfers between accounts — why it's complex

## The concrete case

You transfer €500 from ING to your BUNQ account. They appear in CSV exports:

```
ING CSV:
  20-03-2025 | BUNQ Bank | 500,00 | Af (debit) ← expense?

BUNQ CSV:
  2025-03-20 | Top Up | EUR | 500.00 ← income (filtered out)
```

**The problem:** In ING it appears as money going out — correct from a banking perspective, but **incorrect for the budget**. You didn't spend €500, you moved it.

## How Actual Budget handles transfers

Actual Budget has a special transaction type: **transfer**. It's actually two linked transactions:
- ING account: -500 EUR (outgoing)
- BUNQ account: +500 EUR (incoming)

Both are linked and **don't count as expense in statistics**.

## Transfer detection in CSV — Code=GT (ING)

ING exports a `Code` column. The value `GT` (Geldtransfer) appears on own-account transfers. This is the correct signal.

```python
# builtin_profiles.py — all 3 ING profiles have this
"col_transfer_indicator": "Code",
"transfer_indicator_value": "GT"
```

In `CsvImportCard`, rows with `Code=GT` appear pre-checked as "Transfer?" with an account selector dropdown.

## What NOT to do

**Don't use IBAN regex on description.** ING puts the recipient's IBAN in description for ALL transactions (including iDEAL payments to people, regular purchases). Regex produces false positives inevitably. This was tried and rejected (see `docs/decisions.md`).

## How to record a transfer in actualpy

```python
# Method 1 — create_transfer() directly
# (API may vary — check actualpy docs)

# Method 2 — via payee with transfer_acct
# When a payee has transfer_acct set, set_transaction_payee() automatically
# creates the second side of the transfer
# actualpy handles the linking internally
```

## Transfer between on-budget and off-budget account

Special case: transfer between an off-budget account (e.g. investments) and an on-budget one requires a category on the on-budget side. It's not a pure transfer — it's money entering/leaving the budget.

## Manual workaround (no auto-detection)

If a transfer is imported as an expense (not detected):
1. Open Actual Budget UI
2. Find the transaction
3. Edit → change type from "Expense" to "Transfer"
4. Select the destination account

## Summary table

| Concept | Key point |
|---------|-----------|
| Transfer = 2 linked transactions | Not expense + income |
| Code=GT in ING CSV | The correct detection signal |
| IBAN regex = false positives | Don't use on descriptions |
| Off-budget transfer | Needs a category on the on-budget side |
| `transfer_acct` on payee | actualpy creates the second transaction automatically |
| Pair matching (future) | Cross-account match after import: same amount, opposite signs, ±3 days |
