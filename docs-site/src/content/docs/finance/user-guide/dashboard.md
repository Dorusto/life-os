---
title: Dashboard
description: A tour of the Dashboard's widgets, customization, and period control.
---

The Dashboard is the app's home screen — a configurable set of widgets summarizing your finances, plus a period selector that most widgets report against.

## Header

The header shows today's date, the "Dashboard" title, and two shared header actions: the notifications bell and the settings gear.

If your browser hasn't granted notification permission yet, a banner offers to **enable daily notifications** — a daily summary from Majordom at 20:00.

## First run

If you have no accounts connected yet, the Dashboard shows a "Let's get started" card instead of widgets, with three suggestions: upload a CSV export from your bank, take a photo of a receipt, or just ask a question in Chat (e.g. "How much did I spend on groceries?"). A button takes you straight to Chat.

## On budget total

Once you have accounts, the top of the page shows your current **On budget** total — the sum of your on-budget account balances.

## Widgets

- **Financial Goals** — your savings goals, FIRE (financial independence) progress, and expense-coverage runway.
- **Categories Watchlist** — the current period's budget categories with their spent amounts. A pencil icon toggles group-edit mode for reorganizing category groups.
- **Balance trend** — a scope switcher (Total, On-budget, Portfolio, Vehicles) with today's balance and a trailing-30-days history line, plus the change vs. 30 days ago. Total and On-budget show real data from your connected accounts; Portfolio and Vehicles are shown honestly as pending — they need a portfolio data source and vehicle-manager cost data respectively, neither of which exists yet.
- **Latest Transactions** — your five most recent transactions, with a link to the full Transactions list.
- **Expenses Structure** — a pie chart of the current period's spending by category.
- **Cash Flow** — currently a placeholder; it needs an income/expense aggregation endpoint that doesn't exist yet.
- **Vehicle costs** — total cost, vehicle count, and cost per km for the period, once vehicle-manager is connected. Shows "no active vehicles yet" or an unavailable message as appropriate.
- **Net Worth** — your current total net worth with a trailing-30-days history line and start/now/growth figures. An **Include** menu lets you toggle Loan, Vehicle, and Rental account types in or out of the total.

## Customizing widgets

Tap **Customize** in the bottom bar to enter edit mode. Each widget gets a small **×** chip to remove it; removed widgets move to an "Add widgets" list below, where a **+** button brings them back. **Cancel** discards your changes; **Done** saves them — your widget selection is remembered for next time.

## Changing the period

The bottom bar also has a period control: previous/next arrows step one month at a time, and the period label opens a picker sheet listing the last 12 months, grouped by year. Widgets that report on a specific period (Categories Watchlist, Expenses Structure, Cash Flow, Vehicle costs) update to match.
