# investment-manager — standalone app plan

Written 2026-09-12 for a from-scratch build, dispatched directly to DeepSeek Flash v4.1 via
opencode (not through Claude Code's own Aider delegation) — the user runs this himself, start to
finish, in one go. Read this whole file before writing any code. See
`majordom-financiar/docs/decisions.md#portfolio-becomes-separate-service` for why this is a
separate app at all, and `tools/standalone-app-playbook.md` for the reusable process this plan
follows (written after building `vehicle-manager`'s own standalone frontend).

---

## 0. What this app is, in one paragraph

A personal investment/portfolio tracker — holdings, transactions (buy/sell/dividend), cost basis,
performance (XIRR + TWR + benchmark comparison), allocation, rebalancing, and goal projections —
for one person's own brokerage account(s). The full toolset is spelled out in section 1; this is
the one-paragraph summary. Own frontend, own
backend, own SQLite database, own Docker container, own URL. Talks to `majordom-financiar` only
over a REST API (for coaching features like Expense Coverage / FIRE, #167/#177) — never the other
way around, and never sharing a database. Same architectural shape as `tools/vehicle-manager/`,
which you should treat as the reference implementation for every *structural* question (auth
shape, Docker layout, API conventions) — but this app's own *design* should NOT look like
vehicle-manager's. See section 6.

## 1. Scope — read this before writing a single line

**Goal for this build: the essential Wealthfolio-shaped toolset for portfolio tracking, built
completely, end to end, in one pass — not a bare-bones skeleton.** the user's own framing: build the
whole thing autonomously, he reviews after, not a back-and-forth per feature. That means this list
is the actual target, not a "nice to have later":

1. Holdings + transactions (buy/sell/dividend/fee), with XTB report import (section 5).
2. Dashboard — total portfolio value (EUR), period change, top movers.
3. Performance — **both** XIRR (money-weighted) and TWR (time-weighted) returns, plus a benchmark
   comparison against a market index (section 7) — Wealthfolio's own "true time-weighted and
   money-weighted returns, benchmark comparison" is exactly the bar here, not just one number.
4. Allocation — by security and by `asset_type`/currency at minimum; by sector/geography if
   Twelve Data's response actually includes that metadata cheaply (check before committing to it
   — see section 7's note on this), otherwise skip it rather than inventing sector data.
5. Income/dividends — a dedicated view of dividend history + totals (already captured as a
   `transactions` row type; this is a display/aggregation feature on top of data already there).
6. Rebalancing — a settable target allocation (by security or asset type) compared against the
   current one, with a suggested buy/sell amount to close the gap. See section 7.
7. Goals/projections — a target portfolio value + date, with a simple CAGR-based projection line
   (not Monte Carlo — see section 7's note on why that's deliberately out of scope for this pass).

**Explicitly OUT of scope — do not build these, even if they'd be easy or Wealthfolio has them:**
- Net worth aggregation (bank accounts + investments combined). That stays in
  `majordom-financiar`, which already owns budget/spending and will combine it with this app's
  API data for its own coaching layer (#167/#177). Building it here too would duplicate that
  logic in two places.
- Budgeting, spending categorization, bill tracking. `majordom-financiar` + Actual Budget already
  own this entirely.
- **An AI/chat portfolio assistant inside this app.** Wealthfolio has one; this app doesn't get
  one — `majordom-financiar`'s own chat/coaching layer (#167/#177) is the AI-facing surface for
  *every* domain app in this monorepo (already the case for vehicle-manager's data too), reached
  by calling this app's API, not by duplicating a chat UI here.
- **Contribution-limit tracking (IRA/401k/TFSA).** Those are US/Canada tax-advantaged account
  types — not applicable to a EUR-based EU brokerage account. Skip entirely, don't build a
  generic version of it "just in case."
- Monte Carlo retirement simulation — a real Wealthfolio feature, but meaningfully more complex
  than a CAGR projection for not much added value at this stage. Section 7 has the simpler version
  to build instead; this is a reasonable future enhancement, not part of this pass.
- Anything else Wealthfolio does that isn't in the numbered list above. Wealthfolio is a
  **visual and feature-shape reference**, not a spec to replicate wholesale (see section 6) — its
  own scope is broader (net worth, spending, budgeting, an AI assistant, US tax accounts) than
  what this app should copy.

If you find yourself building something that sounds like "and also show total net worth across
everything" or "let's add a chat box" — stop, that's out of scope, leave it to `majordom-financiar`.

## 2. Non-negotiable structural rules (from tools/standalone-app-playbook.md)

These come from real bugs hit building `vehicle-manager` — do not rediscover them the hard way.

1. **Auth and the Nginx `/api/` prefix are already written for you — use the files as-is, do not
   regenerate or "improve" them:**
   - `tools/investment-manager/app/auth.py` — JWT (per-user login) + `X-Service-Token` header
     (majordom-financiar's internal calls), fail-closed on an unset service token,
     `hmac.compare_digest` for the token comparison. Wire it into `main.py` exactly like
     `tools/vehicle-manager/app/main.py` does (`AUTH = Depends(auth.get_current_user_or_service)`
     on every route, a `POST /auth/login` route calling `auth.login`).
   - `tools/investment-manager/frontend/nginx.conf` — backend API lives behind `/api/` (prefix
     stripped before forwarding to `investment-manager:8020`), not bare paths. Read the comment
     in that file — the exact bug it prevents already happened once on vehicle-manager. This app
     will have multiple frontend routes from Phase 1 (Dashboard, Holdings, Transactions, Login),
     so getting this wrong will surface immediately as a broken hard-refresh/deep-link.
   - `tools/investment-manager/frontend/src/lib/auth.ts` — JWT storage (localStorage) +
     `authFetch()` wrapper with automatic 401→redirect-to-login. Use `const BASE = '/api'` in
     `frontend/src/lib/api.ts`, same convention as vehicle-manager's own `api.ts`.
   - `tools/investment-manager/Dockerfile`, `tools/investment-manager/frontend/Dockerfile`,
     `tools/investment-manager/requirements.txt`, `tools/investment-manager/.env.example` — also
     already written, use as-is (add Python packages to `requirements.txt` as needed, don't
     rewrite the Dockerfiles).
2. **Ports** (already wired into `majordom-financiar/docker-compose.yml` under the
   `investment-manager` profile — don't change them): backend `8020` (internal, matches
   `main.py`'s `uvicorn ... --port 8020` in the Dockerfile CMD), frontend `3020`
   (`INVESTMENT_MANAGER_WEB_PORT`, host-published), sqlite-web debug viewer `8890`
   (loopback-only, see the compose file's own comment for why — a real outage happened on
   vehicle-manager's equivalent ports from a `0.0.0.0` vs. `tailscale serve` conflict).
3. **SQLite database** at `/app/data/investments.db` (own file, own volume
   `investment-manager-data`) — this is this app's own source of truth for holdings/transactions,
   completely separate from `majordom-financiar`'s `memory.db` and from Actual Budget. This is
   *not* a violation of "no financial data in SQLite" (that rule is about `majordom-financiar`'s
   own database specifically, where Actual Budget is the source of truth for *budget* data) —
   `vehicle-manager` already established the same pattern for its own domain data.
4. **`GET /health`** endpoint (no auth) — the Dockerfile's healthcheck and docker-compose's
   `healthcheck:` block both call it, matching vehicle-manager's own `/health`.

## 3. Data model

SQLite, `/app/data/investments.db`. Suggested schema (adjust field types/names as needed, but keep
the shape — cost-basis/XIRR math below assumes it):

```sql
CREATE TABLE securities (
    id INTEGER PRIMARY KEY,
    ticker TEXT NOT NULL UNIQUE,      -- Twelve Data symbol format, e.g. "AAPL", "VWCE.DE"
    name TEXT,
    asset_type TEXT,                  -- 'stock' | 'etf' | 'crypto' | ...
    currency TEXT NOT NULL            -- native listing currency, e.g. "USD", "EUR"
);

CREATE TABLE transactions (
    id INTEGER PRIMARY KEY,
    security_id INTEGER NOT NULL REFERENCES securities(id),
    date TEXT NOT NULL,               -- ISO date
    type TEXT NOT NULL,               -- 'buy' | 'sell' | 'dividend' | 'fee'
    quantity REAL,                    -- NULL for dividend/fee rows
    price_per_unit REAL,              -- in the security's own currency
    fees REAL DEFAULT 0,
    currency TEXT NOT NULL,
    notes TEXT,
    source TEXT NOT NULL DEFAULT 'manual',   -- 'manual' | 'csv_import'
    external_id TEXT                  -- broker's own transaction id, for import dedup — see §5
);

CREATE TABLE price_cache (
    ticker TEXT NOT NULL,
    price REAL NOT NULL,
    currency TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (ticker)
);

CREATE TABLE fx_cache (
    pair TEXT NOT NULL,               -- e.g. "USDEUR"
    rate REAL NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (pair)
);

-- Rebalancing (section 1 item 6 / section 7): one row per security or per
-- asset_type the user wants a target weight for. `target_key` holds either
-- a ticker or an asset_type string — pick whichever grouping the Rebalancing
-- page ends up using, just be consistent between write and read.
CREATE TABLE target_allocation (
    target_key TEXT PRIMARY KEY,
    target_percentage REAL NOT NULL   -- 0-100, all rows should sum to ~100
);

-- Goals/projections (section 1 item 7 / section 7): a small number of
-- user-defined targets, e.g. "Retirement", "House deposit".
CREATE TABLE goals (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    target_amount REAL NOT NULL,      -- EUR
    target_date TEXT NOT NULL         -- ISO date
);
```

**Currency handling — do not skip this.** The base/display currency for this whole app is EUR
(matches `majordom-financiar`'s own `DEFAULT_CURRENCY=EUR`). A security traded in USD needs its
value converted to EUR using a same-day (or most-recently-cached) FX rate before it's summed into
any portfolio total — get this wrong and multi-currency portfolios silently show wrong totals.
Cache FX rates the same way as prices (`fx_cache`, refreshed on the same cadence).

## 4. Market data — Twelve Data

Decided 2026-09-12 (see the GitHub issue this app is tracked under, and
`majordom-financiar/docs/decisions.md`'s market-data-source discussion) — Twelve Data's free tier
(800 calls/day) for both security prices and FX rates.

- `GET https://api.twelvedata.com/price?symbol=<ticker>&apikey=<key>` for a security's current
  price (its own listing currency).
- `GET https://api.twelvedata.com/exchange_rate?symbol=<FROM><TO>&apikey=<key>` for FX.
- API key from `TWELVE_DATA_API_KEY` env var (already wired in `.env.example` and
  `docker-compose.yml`) — never hardcoded.
- **Cache, don't call live on every page load.** Refresh once per day per ticker/pair (check
  `price_cache.fetched_at` / `fx_cache.fetched_at` before calling out; only refetch if stale).
  This is a personal dashboard, not a trading terminal — daily refresh is the whole point, and it
  keeps well inside the 800/day limit even with a fair number of holdings.
- Behind a small `market_data.py` module with a plain function boundary
  (`get_price(ticker) -> float`, `get_fx_rate(from_currency, to_currency) -> float`) — not because
  a provider swap is expected soon, but because it's the natural shape for "check cache, else call
  API, else raise" logic anyway.
- If the API call fails (rate limit, network, ticker not found) and a cached price exists (even
  stale), serve the cached value rather than failing the whole page — a personal portfolio
  dashboard showing yesterday's price is fine; a broken dashboard because one API call failed is
  not. Only error out if there's no cached value at all yet.

## 5. Report import — XTB broker

**A real XTB export was inspected once (2026-09-12) to get this section right, then deleted —
never committed, and its real values never appear here.** Real financial data must never be
duplicated into a tracked file (root `CLAUDE.md`) — what follows is the real *structure*
(sheet/column names only), with anonymized sample rows at
`tools/investment-manager/docs/samples/xtb_*_sample.csv` for you to test against.

**Important correction: XTB's export is an `.xlsx` workbook with three sheets, not a plain CSV.**
Use `openpyxl` (add it to `requirements.txt`) to read it, not the `csv` module. The three sheets,
in the real file:

1. **`Cash Operations`** — the one to actually import. Real header row (found at row 5 of the
   sheet, after 4 metadata rows — `Account number`, a title row, `Date from`/`Date to`):
   `Type, Instrument, Ticker, Category, Time, Amount, ID, Comment, Product, Position ID`.
   `Type` values seen: `"Stock sell"`, `"Stock purchase"`, `"Transfer"` (deposits/withdrawals —
   `Instrument`/`Ticker` empty), and dividends appear here too (`Type` containing `"Dividend"`).
   `Amount` is signed (negative = money out, e.g. a purchase; positive = money in, e.g. a sale or
   dividend) — this is the actual per-event ledger, and maps most directly onto this app's own
   `transactions` table. `ID` is XTB's own unique operation id — use it as `external_id` for
   import idempotency (re-importing the same or an overlapping-date file must not duplicate
   rows — check for an existing `external_id` before inserting). Sample:
   `docs/samples/xtb_cash_operations_sample.csv`.
2. **`Closed Positions`** — a derived/aggregate view (one row per fully-closed position, with
   `Open Price`/`Close Price`, `Profit/Loss`, `Position ID`). Useful as a cross-check for your own
   cost-basis math (section 7), not as the primary import source — it's XTB's own computed P&L,
   not raw transaction data. Sample: `docs/samples/xtb_closed_positions_sample.csv`.
3. **`Open Positions`** — current holdings as XTB sees them right now (a summary block first:
   `Product, Metric, Amount, Currency`, then a detail table further down:
   `Product, Instrument/Position, Ticker, Category, Type, Volume, Value, Current price,
   Open price, Open time (UTC), Net Profit %, Net Profit, Gross Profit`). Also useful as a
   cross-check (does this app's own computed current holdings/value match XTB's own numbers for
   the same account?), not as the import source. Sample: `docs/samples/xtb_open_positions_sample.csv`.

**Implementation:** parse `Cash Operations` into `transactions` rows (map `"Stock sell"` → `sell`,
`"Stock purchase"` → `buy`, a `Dividend`-containing `Type` → `dividend`; skip `"Transfer"` rows —
those are cash movements in/out of the brokerage account, not security transactions, and this
app doesn't track cash balance, only holdings). `Ticker` from this sheet is already in a
Twelve-Data-compatible-looking format (e.g. `DEMO.DE`) — verify a few real tickers actually
resolve via Twelve Data's API before assuming the format always matches exactly. Endpoint:
`POST /import/xtb` (multipart `.xlsx` upload, same convention as vehicle-manager's
`/import/fuelio`), auth required. Currency: each row is in the security's own trading currency —
store as-is in `transactions.currency`, convert only at display/aggregation time (section 3).

## 6. Frontend — design direction

**Full creative freedom on visuals and layout — this is deliberate, not an oversight.** the user's own
words: he dislikes the current look of every majordom-financiar-family app and wants this one to
look genuinely good, with Wealthfolio's own screenshots (https://wealthfolio.app/) as the
aesthetic bar. Do NOT copy vehicle-manager's visual style (dark, dense, utilitarian) — that was
never held up as a design reference, it just is what it is.

**Build the design as something portable, not just pretty for this one app.** If this app's look
turns out well, the plan (per the architecture's own "visual polish across the board" phase) is to
reuse it across `majordom-financiar` and `vehicle-manager` too, unifying the whole platform's
look — that only works if the design isn't hard-wired into this app's own components. Concretely:
- Put the actual design decisions — color palette (as CSS custom properties or a Tailwind theme
  `extend`, not scattered hex codes), typography scale, spacing scale, border-radius/shadow
  tokens — in one clearly separated place (e.g. `frontend/src/styles/tokens.css` or
  `tailwind.config.js`'s `theme.extend`), not inlined ad hoc across components.
- Write a short `frontend/DESIGN.md` (a few paragraphs, not a full style guide) documenting the
  palette/typography choices and the reasoning behind them — this is what a later pass reads to
  port the same system into the other two apps, so it needs to exist, even briefly.
- This does not mean over-engineering a "theme system" with runtime theme-switching or similar —
  just don't hardcode a color three different ways across three different components.

- **`tools/investment-manager/.claude/skills/frontend-design/SKILL.md` is already in this repo,
  copied in for exactly this purpose — read it before writing any component or picking a color
  palette.** It covers aesthetic direction, typography, and how to avoid "looks like an AI
  generated it" defaults.
- Use Wealthfolio's public marketing site/screenshots as a feature-shape and visual-tone
  reference — layout ideas, information density, chart style, color mood:
  - https://wealthfolio.app/ — marketing site, feature descriptions.
  - https://github.com/wealthfolio/wealthfolio — README has a real dashboard screenshot
    (`apps/frontend/public/screenshot.webp` in that repo) and a features list.
  Do NOT look at or port any of Wealthfolio's actual source code (it's AGPL-3.0 licensed — see
  the decision entry this app is tracked under for why that matters; feature/visual inspiration
  is fine from the screenshot/marketing copy, code copying is not).
- React + Vite + TypeScript + Tailwind, same base stack as vehicle-manager (for consistency with
  the rest of this monorepo's tooling/CI), but the component structure, color system, and layout
  are yours to design — there's no existing design system in this app to conform to.
- Pages needed (matching section 1's full feature list, not just the minimal skeleton): Login,
  Dashboard (portfolio summary, XIRR/TWR, benchmark comparison, allocation chart), Holdings (list
  of positions with cost basis/gain-loss), Transactions (list + add-transaction form + XTB
  import), Income (dividend history/totals), Rebalancing (target vs. current allocation +
  suggested trades), Goals (target amount/date + CAGR projection line), Settings (the benchmark
  ticker from section 7 — the one user-facing setting this app needs; never expose
  `TWELVE_DATA_API_KEY` itself in the UI, it's a server-side env var only), and whatever
  navigation shell ties them together.

## 7. Cost basis & performance calculations

- **Cost basis method: average cost**, not FIFO/LIFO. This is a personal tracking/coaching tool,
  not a tax-reporting tool (matches the `docs/decisions.md#coach-not-consultant` precedent set
  elsewhere in this project) — average cost is simpler and sufficient. Note this assumption in a
  code comment where the calculation lives, so it's not mistaken for a tax-accurate figure later.
- **XIRR** (money-weighted return) computed directly in Python — no new heavy dependency (no
  `scipy`) needed for this; a standard Newton's-method or bisection implementation over the cash
  flows (buys as negative flows, sells/dividends as positive flows, current portfolio value as a
  final positive flow dated today) is well-documented and short. Put it in its own function with
  a docstring explaining the cash-flow sign convention, since that's the part that's easy to get
  backwards.
- **TWR (time-weighted return)** — the other half of "true time-weighted and money-weighted
  returns" (section 1 item 3). Unlike XIRR, TWR removes the effect of deposit/withdrawal timing —
  compute it by chaining sub-period returns between each cash-flow event (a buy/sell changes the
  invested amount, so it closes one sub-period and opens the next): for each sub-period,
  `(end_value - cash_flow) / start_value`, then multiply all sub-period factors together and
  subtract 1. Put this in its own function next to XIRR with a docstring explaining *why* the two
  numbers can legitimately differ (TWR answers "how did the investments perform," XIRR answers
  "how did investing when I did it perform") — that distinction is the actual point of showing
  both, not just two numbers that happen to be similar.
- **Benchmark comparison** — compute the same TWR calculation for a benchmark index over the same
  period/cash-flow timeline, so "your portfolio vs. the index" is an apples-to-apples comparison,
  not just two unrelated numbers. Default benchmark: a broad world-equity ETF ticker
  (e.g. `VWCE.DE` or `SPY`) resolvable via Twelve Data — make it a configurable setting (a single
  ticker string, e.g. in a small `settings` table or even a `.env` var), not hardcoded, since the
  right benchmark depends on what the portfolio is actually invested in.
- **Rebalancing** — read `target_allocation`, compute current allocation the same way as section
  1 item 4, and for each `target_key` output `(target_percentage - current_percentage) *
  total_portfolio_value` as the EUR amount to buy (positive) or sell (negative) to close the gap.
  Straightforward arithmetic, no new library needed.
- **Goals/projection** — a simple CAGR-based projection: given the portfolio's own historical XIRR
  (or a user-overridable assumed rate, since a short history gives an unreliable XIRR to project
  from), project `current_value * (1 + rate) ^ years_to_target_date` and compare against
  `goals.target_amount`. This is deliberately simpler than Monte Carlo (section 1's own note on
  why) — a single projection line, not a probability distribution.
- Allocation: group current holdings' EUR-converted value by security, and separately by
  `asset_type`/currency, for whatever chart the Dashboard/Holdings page ends up using. Sector/
  geography grouping (section 1 item 4) only if Twelve Data's own response for a security includes
  that metadata without extra calls/cost — check this early (one real API call against a real
  held ticker) rather than assuming it's available; if it's not there cheaply, skip that
  dimension rather than inventing or hardcoding sector labels.

## 8. Suggested phases

Not a rigid checklist to report progress against one by one (the user is running this in one
opencode session, not a phase-by-phase Claude Code loop like vehicle-manager's original build) —
build through all of them in one pass, then stop for review (per
`tools/standalone-app-playbook.md` section 9 — stop at the checkpoint actually asked for, which
here is "the full essential toolset from section 1, built and self-verified," not a partial slice).

1. **Backend foundation:** `app/main.py` wiring the provided `auth.py`, full database schema
   (section 3, including `target_allocation`/`goals`) + `app/database.py` (CRUD), `GET /health`,
   docker-compose already wired — confirm `docker compose --profile investment-manager up -d
   --build` brings up a healthy `investment-manager` container before moving on.
2. **Market data + import:** `app/market_data.py` (Twelve Data + caching), `app/csv_import.py`
   (XTB, after checking for the real sample per section 5), `app/stats.py` (cost basis, XIRR,
   TWR, benchmark comparison, allocation, rebalancing, goal projection — section 7). REST
   endpoints: `GET/POST /securities`, `GET/POST /transactions`, `POST /import/xtb`,
   `GET /portfolio/summary` (value, XIRR, TWR, benchmark comparison),
   `GET /portfolio/allocation`, `GET /income` (dividend history/totals),
   `GET/POST /target-allocation`, `GET /rebalancing` (suggested trades),
   `GET/POST /goals`, `GET /goals/{id}/projection`.
3. **Frontend:** scaffold (Vite + the provided nginx.conf/Dockerfile/auth.ts + the design-token
   setup from section 6), then every page listed in section 6 — Login, Dashboard, Holdings,
   Transactions, Income, Rebalancing, Goals.
4. **Coaching API surface for majordom-financiar:** whatever minimal read-only endpoint(s)
   #167/#177 will need (current total portfolio value in EUR is the obvious first one) — check
   those issues on GitHub for the exact shape expected before finalizing.

## 9. Verifying your own work before calling this done

Per `tools/standalone-app-playbook.md` section 6 — a plausible "done" report isn't the same as a
verified one:
- `docker compose --profile investment-manager up -d --build` from `majordom-financiar/` brings up
  all three containers healthy.
- Load the frontend fresh (a real unauthenticated first request, e.g. a hard refresh on
  `/holdings` directly — not just clicking through from an already-logged-in tab) to catch the
  exact `/api/` prefix bug class described in section 2.
- Add a real transaction through the UI, confirm it persists (reload the page), confirm an XTB
  import doesn't create duplicates on a second run of the same file (test against the sample
  files in `docs/samples/`, not real data).
- Set a target allocation, confirm the Rebalancing page's suggested trades actually match the
  arithmetic in section 7 for at least one hand-checked example.
- Set a goal, confirm the projection line moves sensibly when the target date or assumed rate
  changes.
- Confirm XIRR and TWR show *different* numbers on a portfolio with more than one cash flow at
  different times (if they're identical, something's wrong — that only happens by coincidence).
- `docker exec investment-manager python3 -c "from app import main"` (or equivalent) as a basic
  import sanity check.

## 10. Do NOT touch

Stay entirely inside `tools/investment-manager/`. Specifically, do not edit, "integrate with," or
even read-and-copy-from-for-convenience:
- `majordom-financiar/` (any file) — this app does not call into majordom-financiar's code, its
  database, or its API. The relationship is the other way around (majordom-financiar will call
  *this* app's API later, for #167/#177) — that integration work happens in a separate,
  majordom-financiar-side task, not here.
- `tools/vehicle-manager/` — useful only as a read-only structural reference (already pointed to
  where relevant above). Don't modify anything in it, and don't literally copy its Python/TS files
  wholesale beyond the three files already copied in for you (`auth.py`, `nginx.conf`, `auth.ts`).
- The root `majordom-financiar/docker-compose.yml`'s already-added `investment-manager*` blocks —
  they're already correct (ports, env vars, volumes); if something about them seems wrong once
  you're building, flag it (circuit breaker below) rather than editing them to work around it.
- `.claude/skills/frontend-design/SKILL.md` and the `docs/samples/*.csv` files — read-only
  reference material, not something to regenerate or "fix."

If a task genuinely seems to require touching something outside `tools/investment-manager/` —
stop and flag it rather than doing it, per the circuit breaker below.

## 11. Code organization & quality

Same bar as the rest of this monorepo (see `tools/vehicle-manager/app/` for a concrete example of
the shape expected — small, single-purpose modules, not one giant `main.py`):

- **Backend:** separate modules by responsibility — `app/main.py` (routes only, thin), `database.py`
  (schema + CRUD), `market_data.py` (Twelve Data + caching), `csv_import.py` (XTB parsing),
  `stats.py` (cost basis/XIRR/TWR/allocation/rebalancing/goals math), `models.py` (Pydantic
  request/response models) — `auth.py` is already provided. Don't put database queries, external
  API calls, and route handlers all in the same file.
- **Frontend:** `lib/` for API client + auth + pure calculation/formatting helpers, `components/`
  for reusable pieces (a chart wrapper, a metric tile, a nav shell — extract one the moment it's
  used twice, don't wait), `pages/` for the seven route-level screens. Same shape as
  `tools/vehicle-manager/frontend/src/`.
- **No duplicated logic.** If the same calculation, formatting function, or UI pattern is needed
  in two places, it's a shared helper from the start, not copy-pasted and fixed up twice later.
  This matters especially for currency formatting, date formatting, and the EUR-conversion logic
  (section 3) — those get used on nearly every page.
- **Documentation bar: docstrings on modules and non-trivial functions explaining *why*, not
  narrated inline comments explaining *what* the code already says.** A short module-level
  docstring (what this file is responsible for, like `auth.py`'s own docstring), and a docstring
  on any function whose logic isn't obvious from its name and signature alone (the XIRR/TWR
  functions in particular need one explaining the cash-flow sign convention — see section 7).
  Don't add a comment above every line; do add one wherever a future reader (including the user,
  reading this months from now) would otherwise have to re-derive a non-obvious decision.
- Keep it easy to follow top-to-bottom: a route handler in `main.py` should read as "validate →
  call into database.py/stats.py/market_data.py → return," not have business logic inlined in the
  route function itself.

## 12. Tooling — opencode plugins/MCP worth using for this build

Researched 2026-09-12 specifically for this dispatch (not guessed) — what actually exists and
runs in opencode, not Claude Code's own plugin format (which uses commands/agents/hooks and does
NOT port over; only the `.claude/skills/*/SKILL.md` format does, like `frontend-design` above).

- **Context7 MCP — recommended, install it, low cost.** `npx ctx7 setup --opencode` wires up a
  live-documentation MCP server so DeepSeek pulls current API docs (FastAPI, `openpyxl`,
  `python-jose`, Twelve Data's actual endpoint shapes) instead of guessing from training-time
  knowledge. Directly reduces the risk of a hallucinated/outdated API call in exactly the kind of
  code this plan asks for (an external API integration + a less-common library like `openpyxl`).
  https://context7.com/docs/clients/opencode
- **Ralph Loop for opencode — real, but only worth the setup if a single one-shot session doesn't
  get all the way through section 1's toolset.** `npx @pageai/ralph-loop` sets up a task-list-
  driven loop (`ralph.sh`, `.agent/tasks.json`) that re-runs `opencode run` with a fresh context
  each iteration until a `<promise>COMPLETE</promise>` tag, needs Docker Sandbox CLI (`sbx`) as a
  prerequisite. Not required for a first attempt — this plan doc's own section 8 (phases) and
  section 9 (self-verification) already give DeepSeek a single-session equivalent of "build,
  verify, fix, repeat." Reach for this only as an escalation if the first pass stalls or needs
  many more iterations than one session comfortably holds.
  https://ralphloop.sh/blog/ralph-loop-with-opencode/
- **`opencode-plan-manager` — optional, nice for resumability, not required.** A community plugin
  (`github.com/yurihbm/opencode-plan-manager`) that tracks plan items as files in
  `pending/`/`in_progress/`/`done/` folders, so a session can stop and resume exactly where it
  left off on any machine. Useful if this doesn't finish in one sitting; skip it for a first
  attempt if this doc's own phase list (section 8) is enough to track progress by eye.

None of these are required for DeepSeek to follow this plan — they reduce specific risks
(hallucinated APIs, losing progress across sessions) if the user wants to install them before
starting. Context7 is the one with no real downside.

## 13. Circuit breaker

If something here turns out wrong once you're actually building (the data model doesn't fit a
real XTB export's shape, Twelve Data doesn't cover a ticker you need, the cost-basis math has an
edge case this doc didn't anticipate) — stop and describe the situation rather than silently
picking an undocumented design call, especially for anything touching money math or the
auth/routing files marked "use as-is" above.

---

## 14. Build status — 2026-09-12

Built end to end in one opencode session. Section 8's phases all landed; nothing from section 1's
scope is missing, and nothing from its "out of scope" list was built.

**Backend.** Complete and tested (`18 passed`). Three real defects were found and fixed while
verifying against this plan:

- `market_data.get_price` crashed on the cache-annotation line whenever a caller passed a
  currency string (which `stats.build_holdings` always does) — `(currency or cached or {}).get(…)`
  called `.get` on a `str`. This would have failed every real price fetch with a configured API
  key. Fixed + regression test (`tests/test_market_data.py`).
- XTB rows were persisted with `source='manual'` (the parser never set `source`), so imports
  showed as manual in the UI. Fixed to `'csv_import'` + assertion.
- Imported securities were all forced to `asset_type='stock'`; now the XTB `Category` column maps
  to this app's asset vocabulary (ETF → `etf`, etc.).

Two additions beyond the section 8 endpoint list, both required by frontend screens but absent
from the spec: `GET /holdings` (position detail behind the Holdings page, same data as section 1
item 1) and `GET/PUT /settings` (the benchmark-ticker + assumed-return settings). `asset_type` is
taken from the importer rather than invented, and sector/geography is skipped exactly as section
7 requires (Twelve Data's free endpoints don't provide it).

**Frontend.** Complete: Login, Dashboard, Holdings, Transactions, Income, Rebalancing, Goals,
Settings, plus the nav shell. Vite + React + TS + Tailwind with a dependency-free SVG chart set.
The visual system is a cool "financial almanac" paper / naval-blue palette with IBM Plex
Sans + Mono (tabular figures), fully tokenized in `src/styles/tokens.css` + `tailwind.config.js`
and documented in `frontend/DESIGN.md` for the later platform-wide polish phase. `tsc` and
`vite build` both pass.

**Verified directly (not just "reported done"):**

- `pytest`: 18 passed. XIRR vs TWR asserted to diverge on timed flows; rebalancing arithmetic
  hand-checked (70/30 → −€200/+€200); goal projection uses the assumed rate when XIRR is absent.
- Live uvicorn smoke test: `/health` unauthenticated, JWT login, `X-Service-Token` calls,
  bad-token → 401, create/list security, XTB `.xlsx` import, and a second identical import
  inserting 0 / skipping 5 (idempotency). Holdings output hand-checked against the sample
  (average cost 116, realized 100, dividends 15.5).
- The exact `/api/` + SPA-routing bug class from playbook §2.1, against **real nginx** (Docker is
  not available in this environment, so nginx was installed and run directly): every cold
  `Accept: text/html` request to `/`, `/holdings`, `/transactions`, `/income`, `/rebalancing`,
  `/goals`, `/settings`, `/login` and a bogus deep link returned the SPA shell (200 text/html),
  while `/api/health` → 200, `/api/holdings` → 401 JSON and `/api/securities` → data. Prefix
  stripping and SPA fallback both confirmed.

**Not verified here — needs the user's environment:** `docker compose --profile investment-manager
up -d --build` was not run (no Docker in this sandbox). The Dockerfiles/compose blocks were not
touched, but the image build itself is unconfirmed. A real Twelve Data key was also unavailable,
so live pricing/FX was exercised only through mocks and the graceful-degradation path
(no key → prices blank, pages still load, Settings reports `market_data_configured: false`).

**Follow-ups / notes:**

- `docs/samples/` is git-ignored at the repo root (deliberately, so a real broker export can
  never be committed). The pytest fixtures therefore embed anonymous rows and fall back to the
  on-disk sample only when present, so the suite passes from a fresh clone. Verified with the
  samples directory renamed away.
- Session-log / `INDEX.md` / `architecture.md` updates were **not** made, because section 10 of
  this plan forbids touching `majordom-financiar/`; that documentation pass is left to the
  reviewing/owner side.
- The service folder name (`investment-manager`) remains pending the open #150 naming decision,
  as the plan itself notes.
