---
title: Getting Started
description: Learn how to open Majordom Invest, where your data lives, and what to do first.
---

Majordom Invest is a standalone portfolio tracker that helps you manage your investments. It tracks holdings, transactions, cost basis, returns, allocation, rebalancing, and goals. The app has its own frontend and backend, so it runs independently from Majordom Finance.

Your portfolio data lives in Majordom Invest's own SQLite database. This database is the source of truth for securities, transactions, holdings, and performance. It is not stored in Actual Budget.

To open the app, go to the standalone web app on its own port (default 3020). The backend runs on port 8020.

On your first run, log in with this service's own credentials, which are separate from Majordom Finance's. The Dashboard will show an empty state that points you to the Transactions page.

Here are the first three things to do:

1. Add a security.
2. Add or import transactions.
3. Set the benchmark and (optionally) the market-data API key in Settings.

The main screens are:

- Dashboard
- Holdings
- Transactions
- Income
- Rebalancing
- Goals
- Settings

For more details, see the Concepts and User Guide sections.
