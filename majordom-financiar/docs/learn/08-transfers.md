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

## Rule-based transfer linking (bank sync, not CSV import)

Different mechanism than the CSV `Code=GT` detection above — applies to bank-synced accounts. AB links a transfer when a transaction's **payee** becomes the other account's name (AB auto-creates one payee per account, not a category). Each side needs its own rule. Rules only auto-apply to transactions imported after the rule exists — the rule editor's "Apply actions" button retroactively applies to already-matching transactions.

**Gotchas, from live reconciliation sessions:**
- Any rule setting payee → account name goes on stage **Post**, always. Don't rely on AB's implicit specificity ordering between Default/Pre rules.
- Before adding a rule on a payee, check it doesn't already have a conflicting rule (can be auto-created by an earlier payee merge) — a more specific Post rule wins over it, doesn't replace it.
- Retroactive "Apply actions" on a previously-untouched sub-account is a real write — check the balance delta looks sane before/after, don't assume a correct target account guarantees a correct result (has produced an unexplained balance swing in practice).
- If one payee text genuinely maps to multiple real destinations (context-dependent self-transfers), don't force a single rule — leave as manual per-transaction judgment.
- Same payee can bill for different owned assets (e.g. one tax collector, car + motorcycle) — disambiguate via a second stable signal in the notes/description field, not payee alone.

**`cleared` is not a uniform trust signal.** Bank-synced account: uncleared ≈ likely a manual placeholder duplicate. Manually-administered account: uncleared just means "never checked off" — a real transaction. Never bulk-act on an "uncleared" filter without checking which regime applies per account.

**Duplicate placeholder pattern:** initiating a transfer conversationally often leaves a manual placeholder (to see the budget update immediately); days later bank sync brings the real transaction in as a new entry, placeholder never removed — same amount, both accounts silently misaligned vs. real bank balance. Any transfer-creation flow should avoid the separate placeholder, or mark it and offer to reconcile once the synced pair arrives.
