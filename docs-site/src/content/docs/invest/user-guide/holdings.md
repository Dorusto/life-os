---
title: Holdings
description: View every position with its cost basis, market value and unrealized gain.
---

The **Holdings** screen lists every open position in your portfolio. For each holding you can see the
average cost, the current market price, the market value in EUR and the unrealised gain or loss.

A set of summary tiles at the top gives you a quick snapshot of your whole portfolio:

- **Market value** – total EUR value of all open positions.
- **Cost basis** – total amount you paid for those positions, in EUR.
- **Unrealized gain** – the gain or loss in EUR, with a percentage next to it.
- **Positions** – number of open positions.

The percentage for unrealized gain is calculated as `total gain / total cost basis`. A green
up‑arrow means the position is in profit; a red down‑arrow means a loss.

## Include closed

By default only positions with a positive share count are listed. Turn on the **Include closed**
checkbox to also see positions you have sold completely. Closed positions show the **realized gain**
(in the security’s native currency) instead of unrealized gain.

## The table

The table has these columns:

| Column | What it shows |
|---|---|
| **Security** | The ticker symbol, an asset‑type pill (stock, ETF, crypto, …) and the full security name |
| **Shares** | The number of units held, with up to six decimal places |
| **Avg cost** | Average cost per unit, in the security’s native currency |
| **Price** | Current market price per unit, in the security’s native currency |
| **Value** | Market value of the position, converted to EUR |
| **Weight** | Percentage of the total market value that this position represents |
| **Gain / loss** | Unrealised gain in EUR (first line) and the corresponding percentage (second line). Closed positions show “closed · realised …” followed by the realised gain in the native currency |

The gain/loss numbers are coloured green for a profit and red for a loss.

## Footnote

Cost basis uses the **average‑cost method**, not FIFO. This is a tracking figure that helps you
monitor your portfolio; it is not intended for tax reporting.

Where a security trades in a currency other than EUR, the average cost and price are displayed in
that native currency. Market value is always shown in EUR.

## Empty state

If you haven’t recorded any transactions yet, the Holdings screen shows an empty state with a link
to the **Transactions** screen where you can start adding buys.
