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
- **Account selection on receipt photo** — if multiple accounts exist, the bot asks before saving
- **12 clean categories** — Food, Restaurants, Transport, Utilities, Health, Clothing, Home & Maintenance, Entertainment & Vacation, Children, Personal Money, Investments & Savings, Other
- **Web UI (PWA) v2** — FastAPI backend + React frontend, JWT authentication, receipt photo flow in browser, monthly spending chart

### 🔲 Up Next

#### Bottom navigation bar
Home / Import / Chat tabs for quick navigation in the PWA.

#### Chat AI assistant (web)
Dedicated page with a conversational financial assistant. Has access to real data (accounts, statistics, transactions). Can answer financial questions and execute actions (create account, add expense).

#### Interactive messages in chat (rich actions)
Equivalent of Telegram buttons, but richer. AI includes structured blocks in the response (e.g., `<action type="category_select" options="..."/>`). The React frontend parses and renders interactive components: category buttons, date picker, transaction confirmation. After the user's action, the result is sent back as a user message.

Requires:
1. Extend `Message` interface with optional `actions` field
2. Parser for structured blocks from stream
3. React components per action type
4. Updated Ollama prompt to generate structured blocks when appropriate

#### CSV import UI (web)
Dedicated page for uploading and processing bank CSV. Port the wizard from Telegram to the web interface.

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

#### Financial profile per user (onboarding)
Each user builds their profile through conversation with Majordom (income, fixed expenses, goals). Reflected as budgets in Actual Budget. Not pre-configured.

**Approach:** conversational chat flow (not a wizard UI) — Majordom asks questions naturally and configures Actual Budget in the background. Two phases:

**Phase 1 — Discovery (chat questions)**

*Block A — Budgeting style*
1. **Budgeting style** → "Do you want to allocate every euro to a category (envelope — more control) or just track spending against a plan (tracking — simpler)?" — recommend envelope; explain that overspending in envelope mode automatically reduces next month's available money

*Block B — Household & income*
2. **Household size** → "How many people are in your household?" → determines category suggestions (Children, per-person personal money)
3. **Monthly net income** → "What's your total monthly take-home pay?" (all sources: salary, rent, freelance) — if freelance/variable: "What's your minimum reliable monthly income?" → budget on that floor
4. **Income regularity** → "Is your income the same every month, or does it vary?" → if variable → recommend "live on last month's income" strategy (holdBudgetForNextMonth)
5. **Partner finances** → "Do you manage finances together with a partner?" → if yes: ask partner's income too; recommend shared Majordom instance (Strategy A); explain contribution split by income percentage; note that multi-user requires OpenID setup

*Block C — Accounts*
6. **Bank accounts** → "What bank accounts do you use? (e.g. ING current, Revolut, savings at ASN)" → for each: current balance; Majordom auto-classifies:
   - Current/checking → on-budget
   - Savings used for expenses → on-budget
   - Investment/ETF/pension → off-budget (tracking only, no budget impact)
   - Mortgage → off-budget
   - Cash → on-budget, create "Cash" account
7. **Credit cards** → "Do you have any credit cards?" → if yes: "Do you pay the full balance each month, or do you carry a balance?" → paying in full: on-budget, no special setup; carrying debt: create "Credit Card Debt" category group + enable rollover overspending
8. **Foreign currency** → "Do you have transactions in currencies other than EUR? (e.g. RON, GBP)" → if yes: set up conversion rules via Rule Action Templating; ask current exchange rate

*Block D — Fixed obligations & recurring transactions*
9. **Recurring transactions** → "What payments happen automatically every month?" (rent/mortgage, subscriptions, insurance, loan payments, salary credit date) → Majordom creates schedules linked to the correct categories
10. **Loans & debts** → "Do you have any loans or outstanding debts besides your mortgage?" → for each: monthly payment + remaining balance → dedicated category + payoff goal template; if credit card debt already captured in Block C, skip here

*Block E — Goals*
11. **Financial goals** → "What do you want to achieve financially? Pick any that apply:"
    - Emergency fund → current amount + target + timeline
    - Vacation → destination + amount + date
    - Car purchase → amount + date
    - House purchase → down payment + date
    - FIRE / early retirement → target age or target portfolio
    - Pay off debt faster → which debt, extra monthly amount
    - Other → free text
    → for each goal: Majordom calculates required monthly contribution and creates the appropriate goal template

*Block F — End-of-month behavior*
12. **Surplus redistribution** → "What should happen to money left over at the end of the month?" → options:
    - Roll it over in each category (default — money stays where it was budgeted)
    - Send everything to emergency fund → `#cleanup sink` on that category
    - Split between savings and personal money → `#cleanup sink` with weights
    - I'll decide manually each month → no automation
13. **Buffer strategy** → "Do you want to build a one-month buffer? (spend this month's income only next month — more financial stability)" → if yes: guide through holdBudgetForNextMonth until buffer is built

*Block G — Historical data*
14. **Past transactions** → "Do you want to import past transactions from your bank? (CSV or OFX/QFX)" → if yes: trigger CSV import flow after onboarding completes; note that OFX/QFX is preferred over CSV for better deduplication
15. **Transfer detection** → after historical import: automatically detect transfer pairs across accounts (same amount, opposite sign, within 3 days) → present to user for confirmation before linking

**Phase 2 — Configuration (executed in Actual Budget)**
1. Create accounts with initial balances (on-budget and off-budget per Block C answers)
2. If credit card debt: create "Credit Card Debt" category group + enable rollover overspending on those categories
3. If foreign currency: create conversion rules via Rule Action Templating with the provided exchange rate
4. Create schedules for all recurring transactions identified in Block D
5. Propose category list based on household profile; user confirms, adds, removes, or renames before Majordom creates anything in Actual Budget
6. If surplus redistribution chosen (Block F): add `#cleanup source` / `#cleanup sink` notes to relevant categories with correct weights
7. Suggest monthly allocations per category based on income; user adjusts inline; zero-sum enforced (To Budget = 0)
8. Create goal templates in category notes per Block E goals. Supported types:
   - `#template AMOUNT` — fixed monthly amount
   - `#template AMOUNT by YYYY-MM` — save toward a goal by date
   - `#template AMOUNT repeat every N weeks/months starting DATE` — periodic
   - `#template N% of CATEGORY` — percentage of income
   - `#template schedule NAME` — based on an existing schedule
   - `#template average N months` — based on spending average
   - `#template copy` — copy budgeted amount from previous month
   - `#template X remainder` — distribute leftover "To Budget" funds with optional weighting
   - `#goal AMOUNT` — override goal indicator to track long-term balance target
9. If buffer strategy chosen (Block F): trigger holdBudgetForNextMonth for the full monthly income amount
10. Summary: X accounts, X schedules, X categories, X goals, X rules created — budget fully allocated
11. If historical import requested (Block G): hand off to CSV/OFX import flow → run transfer detection afterward

**Transfers between accounts**
When money moves between two on-budget accounts (e.g. ING → Revolut), Actual Budget requires it to be recorded as a transfer — not as an expense + income. Transfers between on-budget accounts have no category and don't affect the budget.

Majordom must handle this in three places:
- **Onboarding** — explain to user that moving money between own accounts must be marked as a transfer
- **CSV import** — auto-detect transfer pairs (matching amount, close dates, different accounts) and ask for confirmation before importing: *"This looks like a transfer ING → Revolut. Confirm?"*
- **Manual chat entry** — if user says "I moved 500 EUR from ING to Revolut", create a transfer, not two separate transactions

Special case: transfer between off-budget and on-budget account → requires a category on the on-budget side.

**Edge cases to handle:**
- Variable income (freelance) → budget on minimum monthly income
- Mid-month start → initial balance adjusted, partial month allocation
- CSV import of past transactions → separate flow, triggered after onboarding

**Reference:** [Starting Fresh](https://actualbudget.org/docs/getting-started/starting-fresh), [goal templates](https://actualbudget.org/docs/experimental/goal-templates), [schedules](https://actualbudget.org/docs/schedules), [transfers](https://actualbudget.org/docs/transactions/transfers), [tracking vs envelope](https://actualbudget.org/docs/getting-started/tracking-budget).

#### Split transactions (receipt photo + manual chat)
One transaction split across multiple categories — e.g. a Jumbo receipt with groceries (€45) + cleaning products (€12).

Majordom must handle this in two places:
- **Receipt photo** — Ollama detects items from different categories → Majordom proposes a split and asks for confirmation before saving
- **Manual chat entry** — if user says "I spent €60 at Jumbo, €45 groceries and €15 household", Majordom creates a split transaction in Actual Budget

**Distribute button:** Actual Budget can distribute the remaining unallocated amount across empty splits (even distribution) or proportionally across all splits (useful for distributing VAT proportionally). Majordom should use proportional distribution when splitting receipts that include taxes.

To undo a split: Actual Budget supports "Unsplit transaction" per split or for all at once.

Note: Actual Budget bulk editing does not work correctly with split transactions — avoid bulk edits on splits.

#### Returns and reimbursements
A return from a shop is not income — money must go back to the original spending category.

Majordom must handle two cases:
- **Return/refund** — "I got a €30 refund from H&M" → transaction in the same category (Clothing), not in Income; Majordom asks which category if unsure
- **Work reimbursement** — "My employer will reimburse this €120 expense" → two strategies:
  - Pre-fund: allocate money to a "Reimbursements" category before spending → category goes to zero when refund arrives
  - Post-fund: let the spending category go negative → fill it when the reimbursement arrives; if reimbursement comes next month, enable rollover on that category

Majordom should ask the user which approach they prefer during onboarding.

#### Rules sync with Actual Budget
Actual Budget automatically creates rules when the user renames a payee or categorizes a transaction. Majordom manages its own `merchant_mappings` in SQLite.

These two systems must not conflict:
- When Majordom saves a merchant→category mapping confirmed by the user, also create/update the corresponding rule in Actual Budget → categorization works even outside Majordom
- When importing CSV, Actual Budget rules fire first; Majordom should not overwrite the result unless the user explicitly changes the category
- Do not disable Actual Budget's auto-rule learning — it's complementary to Majordom's mappings

**Reference:** [rules documentation](https://actualbudget.org/docs/budgeting/rules)

#### Rollover and overspending behavior
Actual Budget handles month-to-month budget carry-over automatically:
- **Overspending** — if a category goes negative, the deficit is automatically deducted from next month's "To Budget"; the user starts the new month already behind
- **Surplus** — unspent money in a category rolls over to next month by default (stays in the category)
- **"Copy last month's budget"** — available in the budget sheet; copies all allocated amounts from the previous month; useful for stable monthly budgets

Majordom should:
- Explain rollover behavior during onboarding: "If you overspend a category this month, it automatically reduces next month's available money"
- At start of each new month in chat: offer to copy last month's budget as a starting point, then adjust from there
- When a category goes negative: proactively notify via the notification system

#### Credit card accounts — two strategies
Actual Budget treats credit cards as regular accounts with a negative balance.

**Strategy A — Paying in full each month (recommended):**
- Every purchase categorized immediately to spending categories
- Month-end: pay full statement balance → recorded as transfer (no budget impact)
- Majordom at onboarding: "Do you pay your credit card in full each month?"

**Strategy B — Carrying debt:**
- Create a dedicated category group "Credit Card Debt" with one category per card
- Enable "Rollover Overspending" on these categories to avoid double-counting
- Enter the opening debt balance as a transaction in the Payment column
- Monthly: budget at minimum payment amount; allocate extra toward the highest-rate card first
- Interest charges → categorized to the CC Debt category, not a spending category

Majordom at onboarding: if user has credit card debt → walk through Strategy B setup automatically.

**Reference:** [paying in full](https://actualbudget.org/docs/budgeting/credit-cards/paying-in-full), [carrying debt](https://actualbudget.org/docs/budgeting/credit-cards/carrying-debt)

#### OFX/QFX import (better than CSV)
OFX and QFX formats have unique transaction identifiers → native deduplication in Actual Budget, no need for SHA256 hashing.

Majordom should:
- After onboarding, inform the user: "Check if your bank offers OFX/QFX export — it's more reliable than CSV for deduplication"
- Support OFX/QFX upload in the CSV import UI as an alternative format
- When OFX is available, prefer it over CSV for the same bank

#### Bulk recategorization via chat
Actual Budget supports bulk editing of transactions (select multiple → change category/payee/notes simultaneously).

Majordom should expose this through chat:
- "Move all Netflix transactions to Entertainment" → Majordom queries transactions by payee + executes bulk category update in Actual Budget
- "Recategorize all transactions from last month at Albert Heijn as Groceries" → same flow
- Useful after onboarding when the user reviews past imported transactions

Note: bulk edit does not work on split transactions.

#### Joint budget / couple budget
Two documented strategies for managing finances as a couple:

**Strategy A — Shared budget file:** both partners use the same Actual Budget file (already supported via Majordom multi-user). Contributions calculated as percentage of individual income.

**Strategy B — Joint account in personal budget:** one partner manages the joint account in their own file; partner contributions recorded as income in a dedicated category; split transactions used to fund shared categories.

Majordom should guide the couple during onboarding:
- "Do you manage finances together or separately?" → if together: recommend Strategy A (shared Majordom instance), explain how to add the second user
- Document the contribution calculation: if partner A earns 60% of total income → contributes 60% to shared expenses

**Multi-user setup (technical):** Actual Budget multi-user requires an OpenID Provider. Two roles:
- **Basic** — can create new budgets and collaborate on others' budgets
- **Admin** — all Basic capabilities + manage users directory, transfer budget ownership, enable universal file access

Majordom's multi-user (currently via `TELEGRAM_ALLOWED_USER_IDS`) must eventually integrate with Actual Budget's multi-user model. For now, both users share the same Actual Budget file and Majordom instance.

**Reference:** [multi-user config](https://actualbudget.org/docs/config/multi-user)

#### Reconciliation after CSV import
After importing CSV, Actual Budget allows account reconciliation — the user marks transactions as confirmed against the bank statement, then locks them from accidental edits.

How it works in Actual Budget: user clicks the 🔒 icon on the account → enters the current bank balance → marks each transaction as verified (grey circle → green) → when difference reaches zero, clicks "Lock transactions" to finalize.

Majordom should prompt after each CSV import:
- "Import complete. Do you want to reconcile the account now? Open Actual Budget, click the 🔒 icon on the account, and confirm your transactions against your bank statement."
- Reconciled (locked) transactions cannot be accidentally modified — this is the source of truth for your balance.

#### End of Month Cleanup
Experimental Actual Budget feature that automates redistribution of surplus funds at end of month. Controlled via notes on categories (same mechanism as goal templates):
- `#cleanup source` — this category has surplus; excess is returned to "To Budget" first
- `#cleanup sink [weight]` — this category receives leftover funds; weight controls proportion (default 1)

Execution order: local group surpluses distributed first → global sources returned to "To Budget" → deficits covered → remaining funds distributed to sinks by weight.

Majordom should:
- During onboarding, ask: "Do you want leftover money at end of month to go somewhere automatically? (e.g. extra to emergency fund, or split between savings and personal money)"
- If yes → add `#cleanup sink` to the chosen categories with appropriate weights during Phase 2 setup
- In chat at end of month: "It's the end of the month. Run cleanup to redistribute surplus funds?" → triggers End of Month Cleanup in Actual Budget
- Requires goal templates experimental feature to be enabled

**Reference:** [end of month cleanup](https://actualbudget.org/docs/experimental/monthly-cleanup)

#### ActualQL for Chat AI queries
When the Chat AI needs financial data to answer a question, it must use `runQuery()` with ActualQL — not SQLite, not cached data.

Examples:
- "How much did I spend on groceries last month?" → `q('transactions').filter({category: ..., date: ...}).sum('amount')`
- "What's my balance across all accounts?" → `q('accounts').select(['name', 'balance'])`
- "Show me all transactions over €100 this week" → `q('transactions').filter({amount: {$gt: 10000}, date: ...}).select('*')`

ActualQL supports: `$eq`, `$lt`, `$lte`, `$gt`, `$gte`, `$ne`, `$oneof`, `$regex`, `$like`, `$and`, `$or`. Amounts are integers (value × 100).

The ChatService system prompt must instruct the AI to always call the ActualQL tool when it needs data, never to rely on memory or conversation context for financial figures.

**Reference:** [ActualQL docs](https://actualbudget.org/docs/api/actual-ql)

#### Transaction tags
Actual Budget supports tags as metadata on transactions — stored in the Notes field with `#` prefix.

Syntax rules:
- Format: `#tag` — no spaces (use `#camelCase`, `#dashed-tag`, or `#underscored_tag`)
- Case-sensitive: `#food` ≠ `#Food`
- Multiple tags per transaction allowed
- Use `##` to include a literal `#` without creating a tag
- Managed via sidebar → More → Tags (color assignment, descriptions, delete)

Use cases for Majordom:
- "Tag this as #deductible" → freelance/ZZP expense tracking; filter at year-end for tax purposes
- "Tag as #vacation-greece-2025" → group trip expenses across multiple categories
- "Tag as #shared" → expenses to be split with partner
- Chat AI filters by tag via ActualQL: `q('transactions').filter({'notes': {$like: '%#deductible%'}})`

**Reference:** [tags documentation](https://actualbudget.org/docs/transactions/tags)

#### Merging duplicate transactions
When two transactions are duplicates (same amount, different source), Actual Budget can merge them instead of deleting — preserving the richer data from both.

How it works: select exactly two transactions with matching amounts → press **G** → Actual Budget keeps the "better" one (bank sync > file import > manual) and fills empty fields from the other.

Majordom should use merge instead of delete for duplicates detected during CSV import:
- When SHA256 hash collision is detected and both transactions exist → offer merge, not silent delete
- Useful when user imports CSV from same bank twice, or imports OFX after previously entering manually

**Reference:** [merging transactions](https://actualbudget.org/docs/transactions/merging)

#### Migrate historical transfers (modify-transfers script)
When onboarding a user who imports historical data from multiple accounts, past transfers between accounts will appear as unlinked pairs (debit in one account, credit in another).

Actual Budget provides a SQL script (`modify-transfers`) that retroactively links these pairs as proper transfers. Conditions: same absolute amount, opposite signs, within 3-day window, unique match.

Majordom should:
- After bulk historical import, run transfer detection automatically and present matches for user confirmation: "Found 12 likely transfers between your accounts. Review and confirm?"
- Apply the same logic as the `modify-transfers` script via the API instead of raw SQL

**Reference:** [modify-transfers script](https://actualbudget.org/docs/advanced/scripts/modify-transfers)

#### Rule Action Templating (dynamic rules)
Experimental Actual Budget feature that allows rules to set fields dynamically using Handlebars templates. More powerful than static rules.

Available operations in templates:
- **Math:** `add`, `sub`, `mul`, `div` — e.g. calculate tax-inclusive amounts
- **Text:** `regex`, `replace`, `replaceAll` — clean up imported payee names
- **Dates:** `addDays`, `subMonths`, `format` — adjust transaction dates
- **Variables:** `{{account}}`, `{{payee_name}}`, `{{imported_payee}}`, `{{amount}}`

Use cases for Majordom:
- **Multi-currency (RON workaround):** rule detects RON transaction → template calculates EUR equivalent using stored rate → writes converted amount + rate to notes
- **Payee normalization:** "ALBERT HEIJN 1234 AMSTERDAM" → regex strips store number → becomes "Albert Heijn"
- **Auto-tagging:** rule matches category "Transport" + amount > 50 → appends `#large-expense` to notes

Majordom should create Rule Action Templating rules during onboarding for known cleanup patterns (e.g., bank-specific payee name noise).

**Reference:** [rule templating](https://actualbudget.org/docs/experimental/rule-templating)

#### Multi-currency support (RON workaround)
Actual Budget has no native multi-currency support. The documented workaround uses Rule Action Templating:
1. Create a separate account for the foreign currency (e.g. "Cash RON")
2. Create two rules: one to detect the account, one to convert amount to EUR using a stored rate
3. Rate stored in transaction notes; must be updated manually when rate changes

Limitations: experimental, manual rate updates, conversion not automatic.

Majordom should:
- During onboarding, ask: "Do you have transactions in currencies other than EUR?" → if RON mentioned → set up the conversion rules automatically
- In chat: "Update EUR/RON rate to 5.02" → Majordom updates the rule template with the new rate
- This directly enables the "RON support" item already listed under Low Priority

**Reference:** [multi-currency](https://actualbudget.org/docs/budgeting/multi-currency)

#### Hold budget for next month
Actual Budget supports `holdBudgetForNextMonth()` — reserving money from the current month's "To Budget" for next month. This implements the "live on last month's income" strategy.

Majordom should explain this during onboarding as an advanced option:
- "Do you want to build a one-month buffer? This means you spend this month's income only next month — it's a more stable way to budget."
- If yes → guide the user to hold the full monthly income until the buffer is built

#### Installation README
Step-by-step guide: Docker, Telegram bot token, Actual Budget, `.env` configuration, first start.

#### Automatic bank sync
GoCardless/Nordigen (NL open banking) — **on hold**: access for individual developers in the EU is restricted; monitor PSD2/PSD3 regulation evolution.

---

## Medium Priority

#### FIRE calculator / Crossover Point Report
Actual Budget has a native experimental report for this: **Crossover Point Report** — calculates when passive investment income covers projected expenses, based on "Your Money or Your Life" methodology.

Parameters: expense categories to include post-retirement, investment accounts, safe withdrawal rate (default 4%), projection type (linear trend or Hampel filtered median).

Majordom should use the native Crossover Point Report rather than building a custom FIRE calculator. The Chat AI can explain the result: "At your current savings rate, you reach financial independence in approximately X years (around 20XX)."

**Reference:** [crossover point report](https://actualbudget.org/docs/experimental/crossover-point-report)

#### Savings goals
Progress tracking: emergency fund, vacation, large purchases. Progress visualization in dashboard.

#### Monthly budgets in Actual Budget
Setting limits per category (native Actual Budget feature).

#### Extensible notification system
Generic architecture based on `notification_rules` (SQLite, JSON config per type) + `notification_log` (anti-spam). APScheduler scheduler in FastAPI runs daily at 08:00. Delivery via Telegram (existing) + Web Push (PWA).

Rule types:
- `budget_alert` — triggered after each new transaction and daily; alert when a category exceeds X% of the configured monthly limit
- `goal_risk` — weekly check; calculates if the current contribution pace meets the target (emergency fund, savings goals) on time; alert if the target date risks being delayed
- `vehicle_reminder` — daily check; two subtypes: by date (ITP/APK, service due, X days before) and by km (oil change every N km, based on `vehicle_log`)

Delivery: **Web Push primary** (PWA), Telegram secondary/fallback.

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

**Conversational calculations via AI chat** (not dedicated calculator):
- "How much does a 200km trip cost me?" → AI uses average consumption + distance + current fuel price
- "When do I need to change the oil?" → AI checks last service + current km
- "What is the monthly cost of the motorcycle?" → AI aggregates from vehicle_log

#### Investment monitoring
Integration with [Ghostfolio](https://ghostfol.io) (self-hosted, open source) for ETF portfolio tracking.

#### Freelance income dashboard
ZZP (Netherlands) for YouTube clips/paid activity. Separate deductible expenses.

---

## Low Priority

- **GPU inference Ollama** — currently CPU (~60s/image); revisit with smaller models or quantization optimizations
- **RON support** — transactions in Romanian leu
- **Automatic monthly report** — summary sent via Telegram/web on the 1st of the month
- **Setup wizard via Telegram** — `/setup` command that guides the new user: creates first account, configures preferred categories, tests connection with Actual Budget

