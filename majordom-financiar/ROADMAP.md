# Majordom — Roadmap

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

#### Installation README
Step-by-step guide: Docker, Telegram bot token, Actual Budget, `.env` configuration, first start.

#### Automatic bank sync
GoCardless/Nordigen (NL open banking) — **on hold**: access for individual developers in the EU is restricted; monitor PSD2/PSD3 regulation evolution.

---

## Medium Priority

#### FIRE calculator
Financial independence calculation based on user profile: current savings rate, portfolio, target retirement age, 4% rule.

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
- Car — purchased April 2026
- Suzuki VZ 800 motorcycle (2006), license plate `50 MN-VJ`, alias "Suzi" / "Wabi Sabi" — history from 2023 in Fuelio

**SQLite schema:**
```sql
CREATE TABLE vehicles (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    name TEXT,               -- "Suzi", "Car"
    make TEXT,               -- "Suzuki", "..."
    model TEXT,              -- "VZ 800"
    year INTEGER,
    vin TEXT,
    plate TEXT,              -- "50 MN-VJ"
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
- "How much does a trip to Galați cost me?" → AI uses average consumption + distance + current fuel price
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

---

## Post-MVP — Launch & Growth

- **Monetization** — define the model before any promotion (hosted SaaS with free tier? donations/sponsorships open source? one-time fee for managed setup?)
- **Financial consultant feedback** — find a financial consultant (NL or RO) willing to test Majordom and provide structured feedback; potential partnership if synergy exists
- **Content creator review** — after monetization is in place, contact a content creator in the personal finance niche (YouTube/blog) for an honest review
