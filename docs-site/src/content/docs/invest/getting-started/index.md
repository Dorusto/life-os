---
title: Getting Started
description: Set up Majordom Invest – the standalone portfolio tracker – and take your first steps.
---

Majordom Invest is a standalone portfolio tracker for personal investments. It keeps its own
records of securities, transactions, holdings, costs, returns, allocation, rebalancing,
and goals – all in a dedicated SQLite database that is independent of Actual Budget.

## Opening the app

The web interface runs on its own port (default **3020**). Point your browser to
`http://<host>:3020` (replace `<host>` with the server address). The backend API
listens on port `8020` internally.

## First run

When you open the app for the first time you are prompted to log in with credentials
that belong to this service alone – they are separate from your Majordom Finance login.
Once authenticated, the Dashboard greets you with an empty state that points you to the
**Transactions** page so you can begin populating your portfolio.

## First three things to do

1. **Add a security** – click the *Add security* button on the Transactions page or on
   any screen that offers it. Provide a ticker symbol and a name.

2. **Add or import transactions** – you can enter buy, sell, dividend, and fee
   transactions manually from the **Add transaction** button, or import an XTB
   (eXpress Data) cash‑operations report using the **Import XTB** button.

3. **Set your benchmark and market‑data key** – go to **Settings** and choose a
   benchmark ticker (e.g. `VWCE.DE`) so the app can compare your returns. If you want
   live prices and currency rates, paste a [Twelve Data](https://twelvedata.com) API key
   there as well.

## Main screens

- **Dashboard** – portfolio value, returns, asset allocation, top movers.
- **Holdings** – a detailed view of what you own.
- **Transactions** – every buy, sell, dividend, and fee, newest first.
- **Income** – dividend and interest income records.
- **Rebalancing** – target‑based allocation and drift.
- **Goals** – savings goals with projections.
- **Settings** – benchmark ticker, assumed annual return, and market‑data API key.

## Next steps

- Browse the **Concepts** section for a deeper look at how cost basis, XIRR, TWR,
  and allocation are calculated.
- The **User Guide** describes each screen in detail and explains how to work with
  multiple currencies, the market‑data cache, and the import workflow.
