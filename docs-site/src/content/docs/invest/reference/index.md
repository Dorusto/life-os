---
title: FAQ & glossary
description: Common questions and key terms for managing your investments.
---

## FAQ

### Where is my portfolio data stored?

Each investment app has its own SQLite database at `/app/data/investments.db`, entirely
separate from Actual Budget’s database. No real data is shared across apps except when the
coaching layer requests summary information over REST.

### Why is my portfolio value blank?

The app needs a [Twelve Data](https://twelvedata.com) API key to fetch live prices and
exchange rates. Without a key, totals and per‑security market values remain blank. Set the
key on the **Settings** page under “Market data”.

### Why does a price look stale?

Prices refresh at most once per symbol per day. If the API is unavailable (rate limit,
network error, etc.), the last cached price is served. The dashboard will not break because
of a stale price.

### What is the difference between XIRR and TWR?

**XIRR** (money‑weighted return) tells you how your *investment decisions* performed –
buying at good moments vs. bad. **TWR** (time‑weighted return) removes the effect of when
you added or withdrew money, showing how the *underlying investments* performed. They can
differ whenever you move money at different times – that is normal and intentional.

### Why is my cost basis different from my broker’s?

This app uses **average cost**, not FIFO or LIFO. It is a tracking figure for your own
perspective, not a tax‑accurate number. Brokers typically report FIFO for tax purposes.

### How do I add a security?

On the **Transactions** screen, click “Add transaction”. The security picker lets you type
a ticker that does not exist yet – the app will create it automatically.

### Can I import from my broker?

Yes – use the **XTB import** on the Transactions screen. Upload an `.xlsx` file exported
from XTB. The app reads the “Cash Operations” sheet and creates transactions automatically.
Re‑importing the same file will not create duplicates (the import is idempotent).

### Does Majordom Finance see this data?

Yes – over a REST API, the coaching layer can query your current total portfolio value,
XIRR, and summary data. It never reads your transaction details or writes to this database.
No data is sent anywhere else.

### How do I change the theme?

The toggle in the nav rail footer switches between light and dark mode. Your choice is
saved in `localStorage` and respects the system preference on first visit.

---

## Glossary

| Term | Definition |
|------|------------|
| **Security** | A financial instrument you can invest in – typically a stock or ETF identified by a ticker. |
| **Ticker** | The symbol used to identify a security on an exchange, e.g. `AAPL` or `VWCE.DE`. |
| **Asset type** | The broad category of a security: `stock`, `etf`, `crypto`, etc. |
| **Holding** | A position in a particular security that you still own. Also called an *open position*. |
| **Open position** | A holding you currently own. |
| **Closed position** | A security you have fully sold; no longer held. |
| **Cost basis** | The total amount you have spent to acquire your current holdings, including fees. |
| **Average cost** | The method used to calculate cost basis – the total cost divided by the number of shares. Not FIFO/LIFO. |
| **Market value** | The current worth of your holdings, using the most recent price and EUR exchange rate. |
| **Unrealized gain** | The profit (or loss) on an open position: market value minus cost basis. |
| **Realized gain** | The profit (or loss) from a closed sale. |
| **XIRR** | Money‑weighted annualised return. Calculated from all cash flows and the current portfolio value. |
| **TWR** | Time‑weighted return. Removes the effect of deposit/withdrawal timing. |
| **Benchmark** | A broad index or ETF (e.g. `VWCE.DE`) used for comparison. Configurable in Settings. |
| **Allocation** | How your portfolio is distributed among securities, asset types, or currencies. |
| **Weight** | The percentage of your total portfolio value that a given holding or group represents. |
| **Drift** | The difference between your current allocation and your target allocation. |
| **Target weight** | An allocation you want to achieve, settable on the Rebalancing page. |
| **Suggested trade** | A buy or sell amount calculated to move from your current allocation towards your target. |
| **Goal projection** | A simple CAGR‑based forecast showing what your portfolio could be worth at a future date. |
| **Assumed annual return** | The rate used for goal projections when there isn’t enough history for a reliable XIRR. Can be overridden in Settings. |
| **Base currency** | EUR – the currency all totals are displayed in. Securities in other currencies are converted using the latest cached FX rate. |
| **FX rate** | The exchange rate between two currencies used to convert non‑EUR holdings to EUR. |
| **Stale price** | A price that was cached on a previous day and has not been refreshed. The app serves stale prices rather than failing the dashboard. |
| **Statement rule** | A fine double‑line decorative element at the top of the dashboard’s headline panel. It is the only decorative gesture – the rest of the interface stays quiet. |
