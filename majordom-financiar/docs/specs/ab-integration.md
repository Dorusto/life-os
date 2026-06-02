# Actual Budget — Integration Reference

> How AB handles specific features + what Majordom must do to use them correctly.
> Read this before implementing any feature that touches Actual Budget.

---

## Enable Banking (Automatic Bank Sync)

Enable Banking is a PSD2 aggregator — free for personal use (restricted mode: own accounts only). Covers ING NL, Revolut, BUNQ, and most European banks.

**How it works:**
```
Bank (OAuth) → Enable Banking API → Actual Budget (experimental feature)
```

AB fetches transactions automatically. No more manual CSV upload for supported banks.

**What it does NOT replace:**
- Historical data import (Enable Banking only syncs from the link date forward)
- Banks not covered by Enable Banking
- Manual expense entry via Majordom chat

**Setup requirements:**
- Actual Budget must be publicly accessible (Cloudflare Tunnel recommended)
- OAuth callback endpoint (`/enablebanking/auth_callback`) must bypass any auth proxy
- Enable Banking experimental feature must be enabled in AB Settings
- Re-authentication required every 90–180 days (bank-dependent)

**Status:** Available now. Setup guide in personal notes (contains domain/Cloudflare config). CSV import remains relevant for historical data and unsupported banks.

**Ref:** AB Settings → Experimental Features → Enable Banking sync (EU banks)

---

## Split Transactions

One transaction split across multiple categories — e.g. a Jumbo receipt: groceries (€45) + cleaning products (€12).

**How AB handles it:** `createTransaction` with `subtransactions` field. AB also supports "Distribute" (even or proportional across splits) and "Unsplit" per split or all.

**Majordom implementation plan:**
- Receipt photo: if VisionEngine detects items from different categories → propose split + confirmation before saving
- Chat: "I spent €60 at Jumbo, €45 groceries and €15 household" → split transaction in AB
- UI: show proposed split, allow merge/reassign items before saving

**Implementation note:** currently OCR prompt requests only (merchant, total, currency, date) with `num_predict: 512`. To support splits: restore `items` to prompt + increase `num_predict` to 2048 + second AI pass to group items by category.

**Bulk edit does NOT work on split transactions.**

---

## Returns and Reimbursements

A return from a shop is not income — money goes back to the original spending category.

**Two cases:**
- **Return/refund:** transaction in same category (e.g. Clothing), not Income. Majordom asks which category if unsure.
- **Work reimbursement:** two strategies:
  - Pre-fund: allocate to "Reimbursements" category before spending → fills to zero when refund arrives
  - Post-fund: let spending category go negative → fill when reimbursement arrives; enable rollover if it spans months

**Majordom:** ask user which strategy they prefer (conversationally, no form).

---

## Rollover and Overspending

AB handles month-to-month carry-over automatically:
- **Overspending:** deficit automatically deducted from next month's "To Budget"
- **Surplus:** unspent money stays in category and rolls over
- **Copy last month's budget:** copies all allocations from previous month

**Majordom should:**
- At start of new month: offer to copy last month's budget as starting point
- When category goes negative: notify via notification system

---

## Credit Card Accounts

**Strategy A — Paying in full (recommended):**
- Every purchase categorized immediately to spending categories
- Month-end: pay full statement balance → recorded as transfer, no budget impact

**Strategy B — Carrying debt:**
- Dedicated "Credit Card Debt" category group, one category per card
- "Rollover Overspending" enabled to avoid double-counting
- Opening debt balance entered as transaction in Payment column
- Monthly: budget at minimum payment; allocate extra toward highest-rate card first
- Interest charges → categorized to CC Debt category, NOT a spending category

**Ref:** [paying in full](https://actualbudget.org/docs/budgeting/credit-cards/paying-in-full), [carrying debt](https://actualbudget.org/docs/budgeting/credit-cards/carrying-debt)

---

## Rules and Auto-Categorization Sync

AB creates rules automatically when user renames a payee or categorizes a transaction. Majordom also manages `merchant_mappings` in SQLite. These two systems must not conflict.

**Rules:**
- When Majordom saves a merchant→category mapping confirmed by the user, also create/update the rule in AB → categorization works even outside Majordom
- When importing CSV, AB rules fire first; Majordom does not overwrite unless user explicitly changes
- Do NOT disable AB's auto-rule learning — it's complementary

**Current state:** `merchant_mappings` stored only in SQLite, not synced to AB rules. `categorizer.learn()` must be extended to also create/update the AB rule. Tracked as future work (M2.4 rules sync).

**Ref:** [rules](https://actualbudget.org/docs/budgeting/rules)

---

## Rule Action Templating (Dynamic Rules)

Experimental AB feature. Rules can set fields dynamically using Handlebars templates.

**Available operations:** math (`add`, `sub`, `mul`, `div`), text (`regex`, `replace`), dates (`addDays`, `format`), variables (`{{account}}`, `{{payee_name}}`, `{{amount}}`).

**Use cases for Majordom:**
- **Multi-currency (RON workaround):** rule detects RON account → template calculates EUR equivalent → writes converted amount + rate to notes
- **Payee normalization:** "ALBERT HEIJN 1234 AMSTERDAM" → regex strips store number → "Albert Heijn"
- **Auto-tagging:** rule matches category "Transport" + large amount → appends `#large-expense` to notes

**Ref:** [rule templating](https://actualbudget.org/docs/experimental/rule-templating)

---

## Multi-Currency Support (RON workaround)

AB has no native multi-currency. Documented workaround via Rule Action Templating:
1. Create separate account for foreign currency (e.g. "Cash RON")
2. Create two rules: detect the account, convert amount to EUR using stored rate
3. Rate stored in transaction notes; updated when rate changes significantly

**Majordom should:** if RON or other currency mentioned during setup → offer to set up conversion rules automatically. "Update EUR/RON rate" in chat → Majordom updates the rule template with new rate.

**Ref:** [multi-currency](https://actualbudget.org/docs/budgeting/multi-currency)

---

## OFX/QFX Import

OFX and QFX formats include unique transaction identifiers → native deduplication in AB, no SHA256 hashing needed.

**Majordom should:** after setup, inform user: "Check if your bank offers OFX/QFX export — more reliable than CSV for deduplication." Support OFX/QFX upload alongside CSV. Prefer OFX/QFX when available.

---

## Merging Duplicate Transactions

When two transactions are duplicates from different sources, AB can merge them (not delete) — preserving richer data from both.

**How:** select exactly two transactions with matching amounts → press **G** → keeps the "better" one (bank sync > file import > manual) and fills empty fields from the other.

**Majordom:** use merge instead of silent delete when a duplicate is detected during CSV import.

**Ref:** [merging](https://actualbudget.org/docs/transactions/merging)

---

## Migrate Historical Transfers

When importing historical data from multiple accounts, past transfers appear as unlinked pairs (debit in one account, credit in another). AB provides a `modify-transfers` SQL script to retroactively link them.

**Conditions for auto-detection:** same absolute amount, opposite signs, within 3-day window, unique match.

**Majordom should:** after bulk historical import, run transfer detection and present matches: *"Found X likely transfers between your accounts. Review and confirm?"*

**Ref:** [modify-transfers](https://actualbudget.org/docs/advanced/scripts/modify-transfers)

---

## Bulk Recategorization via Chat

AB supports bulk editing (select multiple transactions → change category/payee/notes).

**Majordom exposes this through chat:**
- "Move all Netflix transactions to Entertainment" → query by payee + bulk category update
- "Recategorize all Albert Heijn transactions last month as Groceries" → same flow

**Note:** bulk edit does NOT work on split transactions.

---

## Reconciliation After CSV Import

After importing, AB allows reconciliation — user confirms transactions against bank statement and locks them. Locked transactions cannot be accidentally modified.

**Majordom should prompt after each import:** *"Import complete. Do you want to reconcile the account? Open AB, click 🔒 on the account, and confirm against your bank statement."*

---

## End of Month Cleanup

Experimental feature. Automates surplus redistribution via notes on categories:
- `#cleanup source` — surplus returned to "To Budget" first
- `#cleanup sink [weight]` — receives leftover funds (default weight: 1)

**Majordom should:** at end of month — *"It's end of month. Run cleanup to redistribute surplus funds?"* → triggers End of Month Cleanup in AB.

Requires goal templates experimental feature enabled.

**Ref:** [end of month cleanup](https://actualbudget.org/docs/experimental/monthly-cleanup)

---

## ActualQL for Chat AI Queries

When Chat AI needs financial data, it must use `runQuery()` with ActualQL — not SQLite, not cached values.

```python
# Examples
q('transactions').filter({category: ..., date: ...}).calculate({$sum: '$amount'})
q('accounts').select(['name', 'balance'])
q('transactions').filter({amount: {$gt: 10000}, date: ...}).select('*')
```

**Supported operators:** `$eq`, `$lt`, `$lte`, `$gt`, `$gte`, `$ne`, `$oneof`, `$regex`, `$like`, `$and`, `$or`.
**Amounts are integers** (value × 100). Dot notation for joins: `category.name`.

**Ref:** [ActualQL](https://actualbudget.org/docs/api/actual-ql/)

---

## Transaction Tags

Tags stored in Notes field with `#` prefix. Case-sensitive. Multiple tags per transaction allowed.

```
Syntax: #tag (no spaces — use #camelCase, #dashed-tag)
Literal #: use ##
```

**Use cases for Majordom:**
- `#deductible` → ZZP expense tracking, filter at year-end for taxes
- `#vacation-2025` → group trip expenses across categories
- `#shared` → expenses to split with partner
- Chat AI filters: `q('transactions').filter({'notes': {$like: '%#deductible%'}})`

**Ref:** [tags](https://actualbudget.org/docs/transactions/tags)

---

## Hold Budget for Next Month

`holdBudgetForNextMonth()` reserves money from current month's "To Budget" for next month — implements "live on last month's income" strategy.

Introduced during onboarding as an advanced option. If user opts in, Majordom guides through holding the full monthly income until the buffer is built.

---

## Joint / Couple Budget

**Strategy A — Shared budget file:** both partners use the same AB file (supported via Majordom multi-user). Contributions split proportionally to income.

**Strategy B — Joint account in personal budget:** one partner manages joint account in their file; partner contributions recorded as income in dedicated category; split transactions used to fund shared categories.

**Multi-user in AB:** requires an OpenID Provider. Two roles: Basic (create/collaborate) and Admin (manage users, transfer ownership).

**Ref:** [multi-user config](https://actualbudget.org/docs/config/multi-user)

---

## Edge Cases

- **Variable income** → budget on minimum reliable monthly income
- **Mid-month start** → initial balance adjusted, partial month allocation
- **Reimbursements spanning months** → enable rollover on the affected category
- **Actual Budget Crossover Point Report** — native experimental report for FIRE calculation (safe withdrawal rate, passive income vs expenses projection). Majordom should use this rather than building a custom calculator.

**Ref:** [crossover point report](https://actualbudget.org/docs/experimental/crossover-point-report)
