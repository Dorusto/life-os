---
title: Transactions
description: "Manage your investment ledger: add, import, filter, and delete transactions."
---

# Transactions

The Transactions screen is your investment ledger. Every buy, sell, dividend, and fee appears here, with tools to filter, add, import, and delete entries.

## Header actions

At the top of the screen you have three actions:

- **Import XTB** – opens the XTB import dialog. You can upload a broker report to backfill your history.
- **Add security** – opens a form to create a new security (ticker and name) if it doesn't exist yet.
- **Add transaction** – opens the transaction form to manually record a buy, sell, dividend, or fee.

## Filters

You can narrow the ledger using two filters:

- **By security** – pick a specific security from the dropdown to see only its transactions.
- **By type** – choose All, Buy, Sell, Dividend, or Fee to show only that kind of entry.

## Table columns

The table shows the following columns:

- **Date** – when the transaction occurred.
- **Type** – a pill showing whether it's a buy, sell, dividend, or fee.
- **Security** – the ticker and name of the security involved.
- **Quantity** – the number of shares (or units) for buys and sells.
- **Price** – the price per share at the time of the transaction.
- **Amount** – the total monetary value, signed according to the convention below.
- **Source** – whether the entry came from an XTB import or was entered manually.
- **Delete** – a button to remove the transaction.

## Amount sign convention

- A **positive** amount means money coming in (for example, a dividend or a sell).
- A **negative** amount means money going out (for example, a buy or a fee).

This sign convention is used consistently across the ledger, so you can quickly see the net effect of each entry.

## Delete confirmation

When you click the delete button, a confirmation dialog appears. It asks you to confirm that you want to remove the transaction. After you confirm, the ledger recalculates the affected totals and the entry disappears.

## Empty state

If there are no transactions that match your current filters, the screen shows an empty state. It includes a link to add your first transaction, so you can start building your ledger.

## XTB import

The XTB import feature lets you upload a report from your XTB broker. The app reads the report and backfills your transaction history automatically, so you don't have to enter each trade manually.
