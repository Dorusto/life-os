# Majordom — Roadmap

## Architectural Principle

**Majordom is a conversational interface over Actual Budget — not a financial application in its own right.**

Every financial action goes through Actual Budget's API. Majordom never stores financial data (amounts, balances, categories, dates, transactions) in SQLite or anywhere else. If Actual Budget has a tool for it, Majordom uses that tool — it does not reinvent it.

| Responsibility | Where it lives |
|----------------|---------------|
| Transactions, accounts, balances | **Actual Budget** |
| Categories, groups, budgets | **Actual Budget** |
| Goals, schedules, rules, transfers | **Actual Budget** |
| Reports, net worth, cash flow | **Actual Budget** |
| User preferences, onboarding state | **SQLite (Majordom)** |
| Conversation history | **SQLite (Majordom)** |
| Merchant→category mappings (until synced to AB rules) | **SQLite (Majordom) — temporary** |

SQLite in Majordom exists solely to understand the user and maintain conversation context. Once a merchant mapping is confirmed by the user, it is synced to an Actual Budget rule and the SQLite entry becomes a cache, not the source of truth.

When the Chat AI needs financial data to answer a question, it queries Actual Budget via ActualQL — it does not read from SQLite.

---

## High Priority

### ✅ Implemented

- **Import CSV bank transactions** — upload CSV, format detection with Ollama, saved profiles, deduplication, refunds handled correctly
- **Categories on CSV import** — `actual_budget_id` saved in SQLite on import; category confirmation/change in Telegram automatically propagates to Actual Budget via `update_transaction_category(financial_id)`
- **Intelligent auto-categorization** — only from `merchant_mappings` confirmed by user (`from_history`), not from AI threshold; new merchant → always asked with suggestion
- **Standardized fields** — payee = merchant, notes = `[receipt photo]` / `[/add manual]` / `[import CSV]`
- **Universal anti-duplicate** — receipt photo + /add + CSV use the same SHA256 hash(date+merchant+amount)
- **Account selection on receipt photo (Telegram)** — if multiple accounts exist, the bot asks before saving
- **12 clean categories** — Food, Restaurants, Transport, Utilities, Health, Clothing, Home & Maintenance, Entertainment & Vacation, Children, Personal Money, Investments & Savings, Other
- **Web UI (PWA) v2** — FastAPI backend + React frontend, JWT authentication, receipt photo flow in browser, monthly spending chart

---

### 🔲 Up Next

#### ⚠️ Architecture audit — align existing code with AB principle

The codebase was written before the architectural principle was established (Majordom is an interface over Actual Budget — it does not store or own financial data). The existing Telegram bot code likely violates this in several places.

**Known violations (identified in ARCHITECTURE.md):**
- `transactions` table in SQLite — local copy of transactions; data belongs in Actual Budget
- `budget_limits` table in SQLite — local copy of budget limits; limits belong in Actual Budget
- `SmartCategorizer` uses TF-IDF on local SQLite data — should migrate to Actual Budget rules
- Deduplication code may query local SQLite instead of relying on AB's `imported_id` check

**What to do:**
1. Audit all SQLite reads/writes in `memory/database.py` and `memory/categorizer.py`
2. For each piece of data: does it belong in Actual Budget? If yes, remove from SQLite and query AB instead
3. Verify that `merchant_mappings` confirmed by the user are synced to AB rules (not just stored locally)
4. Remove `transactions` and `budget_limits` tables once their usages are migrated
5. After cleanup: re-test receipt photo flow, CSV import, and auto-categorization end-to-end

This must be done **before implementing new features** — otherwise new code will be built on the same wrong foundation.

---

#### Account selection on web PWA

Port the Telegram account selection flow to the web interface. When the user adds a transaction (receipt photo, manual entry, or CSV import) and has multiple accounts configured, the PWA must ask which account to use — same behavior as the Telegram bot.

Applies to:
- Receipt photo flow in browser
- Manual transaction entry via chat
- CSV import (select target account before processing)

This must be implemented **before** the Actual Budget alignment work below, as it is a prerequisite for correct transaction routing.

---

#### Budget status dashboard (home page)

The home page shows a budget overview for the current month — one row per category, with allocated vs spent visualized as a progress bar. Data comes directly from Actual Budget via ActualQL, nothing stored separately.

**Visual states per category:**
- 🟢 Green — within budget
- 🟡 Yellow — above 80% of allocation
- 🔴 Red — over budget

**Conversational rebalancing:**
When a category goes over budget (detected after each new transaction), Majordom initiates in chat:

*"You've gone over budget on Restaurants by €23. Which category would you like to move money from to cover it?"*

User replies: *"from Personal"* → Majordom moves the funds between categories in Actual Budget via `setBudgetAmount()`. No manual intervention in Actual Budget needed.

This makes active budget management conversational — the user rebalances directly from chat without opening Actual Budget.

**Implementation notes:**
- Query: `q('budgets').filter({month: currentMonth}).select(['category', 'budgeted', 'spent'])` via ActualQL
- Overspend detection: triggered after each transaction import or manual entry
- Rebalancing: `setBudgetAmount(month, categoryId, newAmount)` for both source and destination categories
- `budget_alert` notification rule (from the notification system) feeds into this flow

---

#### Bottom navigation bar
Home / Import / Chat tabs for quick navigation in the PWA.

---

#### Chat AI assistant (web)
Dedicated page with a conversational financial assistant. Has access to real data (accounts, statistics, transactions). Can answer financial questions and execute actions (create account, add expense).

---

#### Interactive messages in chat (rich actions)
Equivalent of Telegram buttons, but richer. AI includes structured blocks in the response (e.g., `<action type="category_select" options="..."/>`). The React frontend parses and renders interactive components: category buttons, date picker, transaction confirmation. After the user's action, the result is sent back as a user message.

Requires:
- Extend `Message` interface with optional `actions` field
- Parser for structured blocks from stream
- React components per action type
- Updated Ollama prompt to generate structured blocks when appropriate

---

#### CSV import UI (web)
Dedicated page for uploading and processing bank CSV. Port the wizard from Telegram to the web interface.

---

#### Document Management System
Upload file (photo/PDF) → Ollama detects the type → user confirms → extracts type-specific fields → saves to SQLite. Storage of original files: deferred (phase 2, when deciding between local storage vs. encrypted DB).

**UI Flow:** upload button → image/PDF preview → card with type detected by AI + extracted fields → user confirms or corrects the type → save.

**Supported document types:**

| Type | Extracted Fields | Action after saving |
|-----|-----------------|----------------------|
| `receipt` | merchant, amount, date, VAT | transaction in Actual Budget |
| `invoice` | merchant, amount, date, invoice number, due date | transaction in Actual Budget |
| `vehicle_document` | VIN, license plate, make, model, year, first registration date, transfer date | populates vehicle profile |
| `vehicle_insurance` | company, policy number, start date, expiration date, premium value | renewal reminder for RCA/insurance |
| `vehicle_inspection` | inspection date, expiration date, km at inspection | inspection due date reminder (ITP/APK) |
| `warranty` | product, serial number, purchase date, warranty expiration date, merchant | warranty expiration reminder |
| `insurance_policy` | type (home/health), company, policy number, expiration date | renewal reminder |
| `medical` | date, doctor, summary (no clear medical data) | archived without financial action |
| `contract` | type, parties, subject, start date, expiration date | expiration reminder |
| `other` | title, date, amount (if present) | archived |

**Security note:** Self-hosted Majordom is more secure than Google Drive for sensitive documents (tenaamstellingsverslag, insurance policies). Data stays local, no third-party cloud.

**SQLite `documents` schema:**
```sql
CREATE TABLE documents (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    doc_type TEXT,           -- receipt, invoice, vehicle_document, etc.
    detected_type TEXT,      -- what AI detected (before user confirmation)
    title TEXT,
    date TEXT,
    amount REAL,
    currency TEXT DEFAULT 'EUR',
    extracted_data TEXT,     -- JSON with all type-specific fields
    vehicle_id INTEGER,      -- FK if it's a vehicle document
    financial_id TEXT,       -- actual_budget transaction id if created
    file_path TEXT,          -- NULL until file storage implementation
    created_at TEXT DEFAULT (datetime('now')),
    notes TEXT
);
```

---

#### Financial profile per user (onboarding)

Each user builds their profile through conversation with Majordom. Majordom configures Actual Budget in the background — the user never touches Actual Budget directly.

**Approach:** conversational chat flow (not a wizard UI). Two phases: Phase 1 collects information, Phase 2 executes the configuration in Actual Budget.

---

### Phase 1 — Discovery

Questions are grouped into blocks. Majordom asks them in order, skipping irrelevant ones based on previous answers.

---

#### Block A — Budgeting style

**Q1. How do you want to budget?**

"Do you want to allocate every euro to a category (envelope — more control) or just track spending against a plan (tracking — simpler)?"

Recommend envelope. Explain: in envelope mode, if you overspend a category this month, the deficit is automatically deducted from next month's available money.

---

#### Block B — Household & income

**Q2. How many people are in your household?**

Determines which categories to suggest (Children category, per-person personal money allocations).

**Q3. What is your total monthly take-home pay?**

All sources: salary, rental income, freelance. If freelance or variable income: "What is your minimum reliable monthly amount?" — budget on that floor, not the average.

**Q4. Is your income the same every month, or does it vary?**

If variable → recommend the "live on last month's income" strategy (`holdBudgetForNextMonth`). Majordom explains: "You save this month's income and live off it next month — more stability when income fluctuates."

**Q5. Do you manage finances together with a partner?**

If yes: ask partner's income too; recommend a shared Majordom instance (Strategy A — shared budget file); explain contribution split proportional to income. Note: multi-user requires OpenID Provider setup.

---

#### Block C — Accounts

**Q6. What bank accounts do you use?**

"For example: ING current account, Revolut, savings at ASN Bank." For each account: name + current balance.

Majordom auto-classifies:
- Current / checking account → **on-budget**
- Savings used for day-to-day expenses → **on-budget**
- Investment / ETF / pension → **off-budget** (tracking only, no budget impact)
- Mortgage → **off-budget**
- Cash → **on-budget**, creates a "Cash" account

Explain: off-budget accounts appear in net worth reports but don't affect monthly budget allocations.

**Q7. Do you have any credit cards?**

If yes: "Do you pay the full balance each month, or do you carry a balance?"

- Paying in full → on-budget account, no special setup needed
- Carrying debt → create a "Credit Card Debt" category group + enable rollover overspending on those categories

**Q8. Do you have transactions in currencies other than EUR?**

"For example: Romanian leu (RON), British pounds (GBP)."

If yes: set up currency conversion rules via Rule Action Templating. Ask for the current exchange rate. Majordom creates two rules per foreign currency: one to detect the account, one to convert and store the EUR equivalent.

---

#### Block D — Fixed obligations & recurring transactions

**Q9. What payments happen automatically every month?**

"For example: rent or mortgage, subscriptions (Netflix, Spotify), insurance, loan payments, salary deposit date."

For each: Majordom creates a schedule linked to the correct category.

For **income schedules** (salary, received rent): the "approximately" option is enabled automatically (±7.5% match tolerance) to handle normal monthly variations. If the actual amount differs from the scheduled amount after CSV import, Majordom notifies via `income_variance` alert: *"Salary received: [actual] EUR (expected [scheduled] EUR, [diff] EUR). Your available budget this month is affected — do you want to adjust any category allocations?"*

**Q10. Do you have loans or outstanding debts besides your mortgage?**

For each: monthly payment + remaining balance → dedicated repayment category + payoff goal template. Skip credit card debt if already captured in Q7.

---

#### Block E — Financial goals

**Q11. What do you want to achieve financially?**

Pick any that apply:
- **Emergency fund** → current saved amount + target amount + target date
- **Vacation** → destination + amount + date
- **Car purchase** → amount + date
- **House purchase** → down payment amount + date
- **FIRE / early retirement** → target age or target portfolio size
- **Pay off debt faster** → which debt, extra monthly amount
- **Other** → free text

For each goal: Majordom calculates the required monthly contribution and creates the appropriate goal template in the category notes.

---

#### Block F — End-of-month behavior

**Q12. What should happen to money left over at the end of the month?**

Options:
- **Roll it over per category** (default — surplus stays in the category for next month)
- **Send everything to emergency fund** → `#cleanup sink` on the emergency fund category
- **Split between savings and personal money** → `#cleanup sink` with weights on both
- **I'll decide manually each month** → no automation

**Q13. Do you want to build a one-month buffer?**

"This means you save this month's income and spend it only next month — more financial stability, especially with variable income."

If yes: guide through `holdBudgetForNextMonth` until the buffer is fully built.

---

#### Block G — Historical data

**Q14. Do you want to import past transactions from your bank?**

"You can upload a CSV or OFX/QFX file. OFX/QFX is preferred — it has unique transaction IDs that prevent duplicates."

If yes: trigger the CSV/OFX import flow after onboarding completes.

**Q15. Transfer detection (automatic, after historical import)**

After bulk import from multiple accounts: automatically detect transfer pairs (same amount, opposite sign, within 3 days) and present them for confirmation: *"Found X likely transfers between your accounts. Review and confirm?"* Majordom links confirmed pairs as proper transfers in Actual Budget.

---

### Phase 2 — Configuration in Actual Budget

Executed after Phase 1 is complete. Majordom performs each step and confirms with the user before moving to the next.

**Step 1 — Accounts**
Create all accounts with their initial balances. On-budget and off-budget per Block C answers.

**Step 2 — Credit card debt setup** *(if applicable)*
Create "Credit Card Debt" category group. Enable rollover overspending on those categories. Enter opening debt balance.

**Step 3 — Currency conversion rules** *(if applicable)*
Create Rule Action Templating rules for each foreign currency using the rate provided in Q8.

**Step 4 — Schedules**
Create schedules for all recurring transactions from Block D. Income schedules use "approximately" matching.

**Step 5 — Categories**
Propose a category list based on the household profile. User confirms, adds, removes, or renames before Majordom creates anything.

**Step 6 — End-of-month automation** *(if applicable)*
Add `#cleanup source` / `#cleanup sink` notes to relevant categories with correct weights per Q12 answer.

**Step 7 — Monthly allocations**
Suggest amounts per category based on income. User adjusts inline. Zero-sum enforced: To Budget must reach 0.

**Step 8 — Goal templates**
Create goal templates in category notes per Block E answers. Supported types:
- `#template AMOUNT` — fixed monthly amount
- `#template AMOUNT by YYYY-MM` — save toward a goal by date
- `#template AMOUNT repeat every N weeks/months starting DATE` — periodic
- `#template N% of CATEGORY` — percentage of income
- `#template schedule NAME` — based on an existing schedule
- `#template average N months` — based on N-month spending average
- `#template copy` — copy budgeted amount from previous month
- `#template X remainder` — distribute leftover "To Budget" with optional weighting
- `#goal AMOUNT` — override goal indicator for long-term balance target

**Step 9 — Buffer** *(if applicable)*
Trigger `holdBudgetForNextMonth` for the full monthly income amount per Q13 answer.

**Step 10 — Summary**
"Setup complete: X accounts, X schedules, X categories, X goals, X rules created. Budget fully allocated."

**Step 11 — Historical import** *(if applicable)*
Hand off to CSV/OFX import flow. Run transfer detection afterward.

---

### Actual Budget integration — supporting features

The following sections describe how Majordom handles specific Actual Budget behaviors. These are implementation requirements, not separate tasks.

---

#### Transfers between accounts

When money moves between two on-budget accounts (e.g. ING → Revolut), it must be recorded as a transfer in Actual Budget — not as an expense + income. Transfers between on-budget accounts have no category and don't affect the budget.

Majordom handles this in three places:
- **Onboarding (Q6)** — explain that moving money between own accounts must be marked as a transfer
- **CSV import** — auto-detect transfer pairs (matching amount, close dates, different accounts) and ask for confirmation: *"This looks like a transfer ING → Revolut. Confirm?"*
- **Manual chat entry** — if user says "I moved 500 EUR from ING to Revolut", create a transfer, not two separate transactions

Special case: transfer between an off-budget and an on-budget account → requires a category on the on-budget side.

**Reference:** [transfers](https://actualbudget.org/docs/transactions/transfers)

---

#### Split transactions

One transaction split across multiple categories — e.g. a Jumbo receipt with groceries (€45) + cleaning products (€12).

Majordom handles this in two places:
- **Receipt photo** — Ollama detects items from different categories → Majordom proposes a split and asks for confirmation before saving
- **Manual chat entry** — if user says "I spent €60 at Jumbo, €45 groceries and €15 household", Majordom creates a split transaction in Actual Budget

**Distribute:** Actual Budget can distribute the unallocated remainder across empty splits (even) or proportionally across all splits (useful for VAT distribution). Majordom uses proportional distribution for receipts that include taxes.

**Unsplit:** Actual Budget supports "Unsplit transaction" per split or for all at once.

Note: bulk editing does not work on split transactions.

---

#### Returns and reimbursements

A return from a shop is not income — money must go back to the original spending category.

Two cases:
- **Return/refund** — "I got a €30 refund from H&M" → transaction in the same category (Clothing), not in Income; Majordom asks which category if unsure
- **Work reimbursement** — "My employer will reimburse this €120 expense" → two strategies:
  - Pre-fund: allocate money to a "Reimbursements" category before spending → fills to zero when refund arrives
  - Post-fund: let the spending category go negative → fill it when the reimbursement arrives; enable rollover if the reimbursement spans months

Majordom asks the user which approach they prefer during onboarding.

---

#### Rollover and overspending

Actual Budget handles month-to-month carry-over automatically:
- **Overspending** — deficit is automatically deducted from next month's "To Budget"
- **Surplus** — unspent money stays in the category and rolls over
- **Copy last month's budget** — copies all allocated amounts from the previous month; useful for stable monthly budgets

Majordom should:
- Explain rollover during onboarding (Q1)
- At the start of each new month: offer to copy last month's budget as a starting point
- When a category goes negative: notify via the notification system

---

#### Credit card accounts — two strategies

**Strategy A — Paying in full (recommended):**
- Every purchase categorized immediately to spending categories
- Month-end: pay full statement balance → recorded as transfer, no budget impact

**Strategy B — Carrying debt:**
- Dedicated "Credit Card Debt" category group, one category per card
- "Rollover Overspending" enabled to avoid double-counting
- Opening debt balance entered as a transaction in the Payment column
- Monthly: budget at minimum payment; allocate extra toward highest-rate card first
- Interest charges → categorized to the CC Debt category, not a spending category

**Reference:** [paying in full](https://actualbudget.org/docs/budgeting/credit-cards/paying-in-full), [carrying debt](https://actualbudget.org/docs/budgeting/credit-cards/carrying-debt)

---

#### Rules sync with Actual Budget

Actual Budget creates rules automatically when the user renames a payee or categorizes a transaction. Majordom also manages `merchant_mappings` in SQLite.

These two systems must not conflict:
- When Majordom saves a merchant→category mapping confirmed by the user, also create/update the rule in Actual Budget → categorization works even outside Majordom
- When importing CSV, Actual Budget rules fire first; Majordom does not overwrite the result unless the user explicitly changes the category
- Do not disable Actual Budget's auto-rule learning — it is complementary to Majordom's mappings

**Reference:** [rules](https://actualbudget.org/docs/budgeting/rules)

---

#### Rule Action Templating (dynamic rules)

Experimental feature. Rules can set fields dynamically using Handlebars templates.

Available operations:
- **Math:** `add`, `sub`, `mul`, `div`
- **Text:** `regex`, `replace`, `replaceAll`
- **Dates:** `addDays`, `subMonths`, `format`
- **Variables:** `{{account}}`, `{{payee_name}}`, `{{imported_payee}}`, `{{amount}}`

Use cases for Majordom:
- **Multi-currency (RON workaround):** rule detects RON account → template calculates EUR equivalent → writes converted amount + rate to notes
- **Payee normalization:** "ALBERT HEIJN 1234 AMSTERDAM" → regex strips store number → "Albert Heijn"
- **Auto-tagging:** rule matches category "Transport" + amount above threshold → appends `#large-expense` to notes

Majordom creates Rule Action Templating rules during onboarding for known cleanup patterns (bank-specific payee name noise, currency conversion).

**Reference:** [rule templating](https://actualbudget.org/docs/experimental/rule-templating)

---

#### Multi-currency support (RON workaround)

Actual Budget has no native multi-currency support. The documented workaround uses Rule Action Templating:
1. Create a separate account for the foreign currency (e.g. "Cash RON")
2. Create two rules: detect the account, convert amount to EUR using a stored rate
3. Rate stored in transaction notes; must be updated when the rate changes significantly

Majordom should:
- During onboarding (Q8): if RON or other currency mentioned → set up conversion rules automatically
- In chat: "Update EUR/RON rate" → Majordom updates the rule template with the new rate

**Reference:** [multi-currency](https://actualbudget.org/docs/budgeting/multi-currency)

---

#### OFX/QFX import (better than CSV)

OFX and QFX formats include unique transaction identifiers → native deduplication in Actual Budget, no SHA256 hashing needed.

Majordom should:
- After onboarding, inform the user: "Check if your bank offers OFX/QFX export — it is more reliable than CSV for deduplication"
- Support OFX/QFX upload in the import UI alongside CSV
- Prefer OFX/QFX over CSV when both are available for the same bank

---

#### Merging duplicate transactions

When two transactions are duplicates from different sources, Actual Budget can merge them instead of deleting — preserving richer data from both.

How it works: select exactly two transactions with matching amounts → press **G** → keeps the "better" one (bank sync > file import > manual) and fills empty fields from the other.

Majordom should use merge instead of silent delete when a duplicate is detected during CSV import.

**Reference:** [merging](https://actualbudget.org/docs/transactions/merging)

---

#### Migrate historical transfers

When importing historical data from multiple accounts, past transfers appear as unlinked pairs (debit in one account, credit in another). Actual Budget provides a `modify-transfers` SQL script to retroactively link them.

Conditions for auto-detection: same absolute amount, opposite signs, within 3-day window, unique match.

Majordom should:
- After bulk historical import, run transfer detection and present matches: *"Found X likely transfers between your accounts. Review and confirm?"*
- Apply the detection logic via the Actual Budget API rather than raw SQL

**Reference:** [modify-transfers](https://actualbudget.org/docs/advanced/scripts/modify-transfers)

---

#### Bulk recategorization via chat

Actual Budget supports bulk editing (select multiple transactions → change category/payee/notes).

Majordom exposes this through chat:
- "Move all Netflix transactions to Entertainment" → query by payee + bulk category update in Actual Budget
- "Recategorize all Albert Heijn transactions last month as Groceries" → same flow

Note: bulk edit does not work on split transactions.

---

#### Reconciliation after CSV import

After importing, Actual Budget allows reconciliation — the user confirms transactions against the bank statement and locks them.

How it works: click the 🔒 icon on the account → enter current bank balance → mark each transaction as verified (grey → green) → when difference reaches zero → click "Lock transactions".

Majordom should prompt after each import: *"Import complete. Do you want to reconcile the account now? Open Actual Budget, click 🔒 on the account, and confirm your transactions against your bank statement."*

Locked transactions cannot be accidentally modified.

---

#### End of Month Cleanup

Experimental feature. Automates surplus redistribution at end of month via notes on categories:
- `#cleanup source` — this category's surplus is returned to "To Budget" first
- `#cleanup sink [weight]` — this category receives leftover funds (default weight: 1)

Execution order: local group surpluses → global sources returned to "To Budget" → deficits covered → remaining funds distributed to sinks by weight.

Majordom should:
- During onboarding (Q12): if user chooses automatic redistribution → add `#cleanup sink` notes with correct weights during Phase 2
- In chat at end of month: *"It's end of month. Run cleanup to redistribute surplus funds?"* → triggers End of Month Cleanup in Actual Budget

Requires goal templates experimental feature to be enabled.

**Reference:** [end of month cleanup](https://actualbudget.org/docs/experimental/monthly-cleanup)

---

#### ActualQL for Chat AI queries

When the Chat AI needs financial data, it must use `runQuery()` with ActualQL — not SQLite, not cached values.

Examples:
- "How much did I spend on groceries last month?" → `q('transactions').filter({category: ..., date: ...}).calculate({$sum: '$amount'})`
- "What's my balance across all accounts?" → `q('accounts').select(['name', 'balance'])`
- "Show me all transactions over €100 this week" → `q('transactions').filter({amount: {$gt: 10000}, date: ...}).select('*')`

Supported operators: `$eq`, `$lt`, `$lte`, `$gt`, `$gte`, `$ne`, `$oneof`, `$regex`, `$like`, `$and`, `$or`. Amounts are integers (value × 100). Dot notation for joins: `category.name`.

The ChatService system prompt must instruct the AI to always call the ActualQL tool for financial data — never rely on memory or conversation context for figures.

**Reference:** [ActualQL](https://actualbudget.org/docs/api/actual-ql/)

---

#### Transaction tags

Tags are stored in the Notes field with `#` prefix.

Syntax:
- Format: `#tag` — no spaces (use `#camelCase`, `#dashed-tag`, or `#under_scored`)
- Case-sensitive: `#food` ≠ `#Food`
- Multiple tags per transaction allowed
- Use `##` to include a literal `#` without creating a tag
- Managed via sidebar → More → Tags (color, description, delete)

Use cases for Majordom:
- "Tag this as #deductible" → ZZP expense tracking; filter at year-end for tax purposes
- "Tag as #vacation-2025" → group trip expenses across categories
- "Tag as #shared" → expenses to be split with partner
- Chat AI filters by tag: `q('transactions').filter({'notes': {$like: '%#deductible%'}})`

**Reference:** [tags](https://actualbudget.org/docs/transactions/tags)

---

#### Hold budget for next month

`holdBudgetForNextMonth()` reserves money from the current month's "To Budget" for next month — implements the "live on last month's income" strategy.

Introduced during onboarding (Q13) as an advanced option. If the user opts in, Majordom guides them through holding the full monthly income until the buffer is built.

---

#### Joint budget / couple budget

Two strategies:

**Strategy A — Shared budget file:** both partners use the same Actual Budget file (already supported via Majordom multi-user). Contributions split proportionally to income.

**Strategy B — Joint account in personal budget:** one partner manages the joint account in their own file; partner contributions recorded as income in a dedicated category; split transactions used to fund shared categories.

Majordom guides the couple during onboarding (Q5):
- "Do you manage finances together or separately?" → if together: recommend Strategy A, explain how to add the second user
- Contribution calculation: partner A earns 60% of total income → contributes 60% to shared expenses

**Multi-user (technical):** Actual Budget multi-user requires an OpenID Provider. Two roles:
- **Basic** — create new budgets, collaborate on others'
- **Admin** — all Basic + manage users directory, transfer budget ownership, enable universal file access

Majordom's current multi-user (via `TELEGRAM_ALLOWED_USER_IDS`) must eventually integrate with Actual Budget's multi-user model.

**Reference:** [multi-user config](https://actualbudget.org/docs/config/multi-user)

---

#### Edge cases

- **Variable income** → budget on minimum reliable monthly income (Q3)
- **Mid-month start** → initial balance adjusted, partial month allocation
- **Reimbursements spanning months** → enable rollover on the affected category
- **CSV import after onboarding** → separate flow, triggered from chat or import page

**Reference:** [Starting Fresh](https://actualbudget.org/docs/getting-started/starting-fresh), [goal templates](https://actualbudget.org/docs/experimental/goal-templates), [schedules](https://actualbudget.org/docs/schedules), [tracking vs envelope](https://actualbudget.org/docs/getting-started/tracking-budget)

---

#### Installation README
Step-by-step guide: Docker, Telegram bot token, Actual Budget, `.env` configuration, first start.

---

#### Automatic bank sync
GoCardless/Nordigen (NL open banking) — **on hold**: access for individual developers in the EU is restricted; monitor PSD2/PSD3 regulation evolution.

---

## Medium Priority

#### FIRE calculator / Crossover Point Report

Actual Budget has a native experimental report for this: **Crossover Point Report** — calculates when passive investment income covers projected expenses, based on the "Your Money or Your Life" methodology.

Parameters: expense categories to include post-retirement, investment accounts, safe withdrawal rate (default 4%), projection type (linear trend or Hampel filtered median).

Majordom should use the native Crossover Point Report rather than building a custom FIRE calculator. The Chat AI explains the result conversationally.

**Reference:** [crossover point report](https://actualbudget.org/docs/experimental/crossover-point-report)

---

#### Savings goals
Progress tracking: emergency fund, vacation, large purchases. Progress visualization in the PWA dashboard.

---

#### Monthly budgets in Actual Budget
Setting limits per category (native Actual Budget feature).

---

#### Extensible notification system

Generic architecture based on `notification_rules` (SQLite, JSON config per type) + `notification_log` (anti-spam). APScheduler runs daily at 08:00 in FastAPI. Delivery: **Web Push primary** (PWA), Telegram secondary/fallback.

Rule types:

**`budget_alert`** — triggered after each new transaction and daily. Alerts when a category exceeds X% of its configured monthly limit.

**`goal_risk`** — weekly check. Calculates whether the current contribution pace will meet the target (emergency fund, savings goals) on time. Alerts if the target date risks being delayed.

**`vehicle_reminder`** — daily check. Two subtypes: by date (ITP/APK, insurance renewal — X days before) and by km (oil change every N km, based on `vehicle_log`).

**`income_variance`** — triggered when a recurring income transaction (matched via schedule) differs from the expected amount. Actual Budget schedules use "approximately" matching (±7.5%). The actual received amount (not the scheduled amount) enters "To Budget" — Majordom notifies: *"Salary received: [actual] EUR (expected [scheduled] EUR, [diff] EUR). Your available budget this month is affected — do you want to adjust any category allocations?"*

---

#### Vehicle Management — complete Fuelio replacement

**Goal:** completely replace Fuelio, including import of existing history.

**Existing vehicles:**
- Car — recently purchased
- Motorcycle — history from 2023 available for import

**SQLite schema:**
```sql
CREATE TABLE vehicles (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    name TEXT,               -- "Motorcycle", "Car"
    make TEXT,               -- "Toyota", "Suzuki", etc.
    model TEXT,              -- "Yaris", "VZ 800", etc.
    year INTEGER,
    vin TEXT,
    plate TEXT,              -- license plate number
    fuel_type TEXT,          -- "petrol", "diesel", "electric"
    tank_capacity REAL,      -- liters
    km_initial INTEGER,      -- km at the time of adding to Majordom
    apk_due TEXT,            -- APK/ITP expiration date (YYYY-MM-DD)
    insurance_due TEXT,      -- RCA expiration date
    active INTEGER DEFAULT 1,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE vehicle_log (
    id INTEGER PRIMARY KEY,
    vehicle_id INTEGER REFERENCES vehicles(id),
    date TEXT,               -- YYYY-MM-DD HH:MM
    odo_km REAL,             -- odometer km at the time of recording
    entry_type TEXT,         -- "fuel", "service", "maintenance", "inspection", "insurance", "other"
    -- fields for fuel:
    fuel_liters REAL,
    fuel_price_per_liter REAL,
    fuel_full_tank INTEGER,  -- 1 = full tank, 0 = partial
    fuel_missed INTEGER,     -- 1 = refueled in between (exclude from consumption calculation)
    -- fields for cost:
    cost_total REAL,
    cost_currency TEXT DEFAULT 'EUR',
    -- fields for reminder:
    remind_odo REAL,         -- km at which to send reminder (e.g., odo+15000)
    remind_date TEXT,        -- date at which to send reminder
    repeat_odo REAL,         -- km interval for recurring reminder
    repeat_months INTEGER,   -- month interval for recurring reminder
    -- general:
    location TEXT,           -- "Oostzaan - Esso" (optional, from receipt or GPS)
    notes TEXT,
    financial_id TEXT,       -- actual_budget transaction id (if the expense was recorded)
    source TEXT,             -- "manual", "photo", "fuelio_import"
    fuelio_unique_id TEXT,   -- original id from Fuelio (for deduplication on import)
    created_at TEXT DEFAULT (datetime('now'))
);
```

**Import Fuelio history:**

Fuelio CSV format (from `sync/vehicle-N-sync.csv`) has 4 sections:
```
## Vehicle     → vehicle profile
## Log         → refuels (Date, Odo, Fuel litres, Full, Price, l/100km, City, Missed)
## CostCategories → expense types (Service=1, Maintenance=2, Insurance=31, etc.)
## Costs       → extra expenses (title, date, Odo, CostTypeID, Cost, RemindOdo, RemindDate, RepeatOdo, RepeatMonths)
```

Mapping `CostTypeID` → `entry_type`:
- 1 (Service) → `service`
- 2 (Maintenance) → `maintenance`
- 4 (Registration) → `other`
- 5 (Parking) → `other`
- 31 (Insurance) → `insurance`

Import sets `source = "fuelio_import"` and `fuelio_unique_id` to prevent duplicates on re-import.

**Automatic calculations:**
- L/100km per refuel: `(liters / (current_odo - previous_odo)) * 100` — only if `full_tank=1` and `missed=0`
- Cost per km: `cost_total / (current_odo - previous_odo)`
- Moving average consumption: last 5 valid refuels

**Charts in PWA (Recharts):**
- Fuel consumption over time — L/100km per refuel + moving average line
- Monthly costs — fuel + other costs per month, stacked bar; filter by cost type
- Monthly distance — km traveled per month
- Cost per km — evolution over time (EUR/km total and fuel only)

**Stats dashboard per vehicle:**
- Fill-ups this year / this month vs. previous year/month
- Total liters this year / this month
- Average consumption / best / worst L/100km
- Average cost per km (fuel only + total)

**Refuel recording flow from photos:**
1. User uploads gas station receipt photo → Ollama extracts: liters, price/liter, total, location (if on receipt)
2. User uploads dashboard photo → Ollama extracts: ODO km
3. User selects the vehicle (if they have multiple)
4. User confirms extracted data → save to `vehicle_log` + transaction in Actual Budget category `transport`

**Reminders (integrated with notification system):**
- APK/ITP annual — 30 days before `apk_due`
- RCA renewal — 30 days before `insurance_due`
- Service/maintenance — when `current_odo >= remind_odo` OR 7 days before `remind_date`
- Calculation of `remind_odo` on save: `current_odo + repeat_odo` (if `repeat_odo > 0`)

**Conversational calculations via AI chat** (not a dedicated calculator):
- "How much does a 200km trip cost me?" → AI uses average consumption + distance + current fuel price
- "When do I need to change the oil?" → AI checks last service + current km
- "What is the monthly cost of the motorcycle?" → AI aggregates from vehicle_log

---

#### Investment monitoring
Integration with [Ghostfolio](https://ghostfol.io) (self-hosted, open source) for ETF portfolio tracking.

---

#### Freelance income dashboard
ZZP (Netherlands) for YouTube clips/paid activity. Separate deductible expenses tracked via `#deductible` tag.

---

## Low Priority

- **Voice input in PWA** — microphone button in chat; audio transcribed locally via Whisper (Ollama) → sent as text message; consistent with privacy-first stack and cross-browser
- **GPU inference Ollama** — currently CPU (~60s/image); revisit with smaller models or quantization optimizations
- **RON support** — enabled via multi-currency workaround (Rule Action Templating); see onboarding Q8
- **Automatic monthly report** — summary sent via Telegram/web on the 1st of the month
- **Setup wizard via Telegram** — `/setup` command that guides the new user: creates first account, configures preferred categories, tests connection with Actual Budget
