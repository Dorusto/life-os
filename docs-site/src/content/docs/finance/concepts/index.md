---
title: Finance concepts
description: Understand the data model behind Majordom Finance — accounts, categories, transactions, and how the conversational layer works.
---

Every feature in Majordom Finance sits on top of [Actual Budget](https://actualbudget.org/). This page explains the ideas you need to know before using any Finance tool.

---

## Source of truth: Actual Budget

Actual Budget is the engine. It owns:

- **Accounts** – your bank accounts, cash, cards, loans, investments, and vehicles.
- **Categories** – the spending buckets you budget into.
- **Category groups** – higher‑level groups that collect related categories.
- **Payees** – merchants or people you transact with.
- **Schedules** – recurring transactions you’ve set up.
- **Budgets** – the amounts you assign to each category each month.
- **Transactions** – every individual inflow or outflow.

Majordom Finance is a conversational layer over this engine. It does **not** keep a second copy of your ledger. Any change you make through chat or the Dashboard is written directly into Actual Budget.

The one exception is a small SQLite database (`memory.db`) that stores Majordom’s own preferences – merchant‑mapping hints, CSV import profiles, and push‑notification subscriptions. No financial data ever lives there.

---

## Accounts

Every account in Actual Budget appears in Majordom. Accounts have two important properties:

### On‑budget vs off‑budget

An **on‑budget** account is included in your monthly budget calculation – money you spend from it is tracked against category budgets. Most checking, savings, and cash accounts are on‑budget.

An **off‑budget** account is tracked for balance purposes only, but spending from it does not affect your budget. Loans and investment accounts are often off‑budget.

### Account types

Majordom recognises several account types, each displayed with its own icon:

| Type | Icon | Behaviour |
|------|------|-----------|
| (default) | Wallet | A standard checking or savings account |
| `Investment` | TrendingUp | Tracks portfolio value (detailed investment tracking lives in the separate Investment Manager app) |
| `Vehicle` | Car | Ties an account to a vehicle‑manager record |
| `Loan` | Landmark | Monitored but excluded from net‑worth by default |
| `Rental` | Home | Rental property account, also excluded from net‑worth by default |

On the **Accounts** screen, vehicle‑type accounts also show make/model/year if linked to a vehicle record. Tap any row to drill into that account’s transaction history.

---

## Categories and groups

A **category** is a spending bucket – Groceries, Restaurants, Rent, etc. Each category belongs to one **category group**.

Actual Budget ships with twelve built‑in categories (listed in the README). You can rename, delete, or create new ones through chat.

### Uncategorized state

Transactions that have not been assigned a category appear as **Uncategorized**. This is a red flag – the transaction exists in your ledger but does not affect any budget. Uncategorized items are surfaced in the Dashboard’s “Needs resolving” section and on the Transactions page’s “Uncategorized” filter.

Majordom helps you clear this backlog by grouping uncategorized transactions by payee and letting you confirm a category (and optionally save a rule for future imports) in one tap.

---

## Transactions

A transaction records money moving in or out of an account. Each transaction has a direction: **expense** (money leaves you) or **income** (money arrives).

### Transfers

A transfer between two on‑budget accounts creates **two linked transactions** – one outgoing from the source account, one incoming to the destination. Both are marked as a transfer in the UI and do not affect category budgets.

When you ask Majordom to “move €200 from ING to Savings”, it creates a transfer proposal card – you review, confirm, and both sides are written in a single operation.

### Duplicates

Every new transaction carries a short hash based on its date, merchant, and amount. Actual Budget rejects any later transaction with the same hash – this is the built‑in deduplication mechanism. When a possible duplicate is detected on the receiving side, Majordom shows a **possible duplicate** warning and lets you review both sides before confirming.

---

## Budget period

The Dashboard displays budget data for a single month. A **period selector** at the bottom of the screen lets you navigate forward or backward month by month. The label shows either “Current month” (when you are viewing the live month) or a short date like “Sep 2026”.

When you switch periods, every widget that depends on the budget period (budget vs actual, spending pie, balance trend) updates to reflect that month’s data.

---

## Goals and FIRE

### Saving goals

You can set a **savings goal** on any on‑budget account. A goal consists of:

- A target amount (e.g. €5,000)
- A deadline month (e.g. December 2027)
- An optional label

Goal tracking works by checking the account’s balance against the target – you do **not** need to move money into a separate “goal” account. Majordom reports progress as a percentage and estimates a monthly contribution needed to reach the target on time.

You can create, edit, and delete goals through chat. After a goal is confirmed, Majordom may offer to adjust your monthly budget to accommodate the required savings.

### FIRE projection

The **Financial Independence / Retire Early** (FIRE) section on the Dashboard is a projection, not a guarantee. It uses:

- Your total portfolio value
- Your estimated monthly expenses
- A configurable annual return rate
- Your current monthly contribution

The projection shows the year you could reach financial independence and what percentage of the way there you are. These figures are based on the data you provide – they are not investment advice.

### Expense coverage

The **Expense Coverage** figure shows how many months of your lifestyle expenses your passive and semi‑passive income could cover today. This is a snapshot, not a forecast.

---

## Net worth

The **Net Worth** widget on the Dashboard calculates your total assets minus liabilities using all on‑budget and off‑budget Actual Budget accounts. The default view includes every account, but you can toggle off **Loan**, **Vehicle**, and **Rental** account types if you prefer a narrower picture.

This is a single‑app view. A combined net‑worth across multiple applications (e.g. including the Investment Manager or Vehicle Manager) is a possible future direction – it does not exist today.

---

## The chat layer: propose, confirm, execute

Every write operation goes through a three‑step flow:

1. **Propose** – Majordom analyses your request and sends a card to the chat with the details it is about to execute. For example, “Add transaction – €45 at Lidl – category Groceries”.
2. **Review** – You see the card in the chat. You can edit any field (date, amount, category, account) before confirming.
3. **Confirm (or Cancel)** – Tap **Confirm** to write the data, or **Cancel** to discard it. Majordom then updates the chat with a status message: operation succeeded, or an error if something went wrong.

This design guarantees you stay in control – nothing happens automatically without your approval. Cards also carry a **proof** of what changed (e.g. old balance vs new balance) so you never need to open Actual Budget to verify.

---

## Glossary

| Term | Definition |
|------|------------|
| Actual Budget | The open‑source personal budgeting engine that stores all financial data. |
| Category | A spending bucket (Groceries, Rent, etc.). |
| Category group | A collection of related categories (e.g. “Fixed costs”). |
| Expense | Money leaving your account (negative). |
| Income | Money arriving in your account (positive). |
| On‑budget account | An account whose spending is tracked against monthly budgets. |
| Off‑budget account | An account tracked for balance only – spending does not affect budgets. |
| Payee | A merchant or person on the other side of a transaction. |
| Proposal card | The editable confirmation card Majordom shows before executing any write. |
| Schedule | A recurring transaction defined in Actual Budget. |
| Transfer | Moving money between two on‑budget accounts – creates linked transactions in both directions. |
| Uncategorized | A transaction that has no assigned category. |
