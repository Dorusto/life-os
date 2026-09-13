---
title: Transactions
description: Browse, filter, and bulk‑categorise your financial transactions.
---

The **Transactions** tab is the central ledger screen where you can view, filter, and bulk‑edit all your transactions. It replaces the earlier “Coming soon” placeholder with a fully functional CRUD interface.

## Toolbar

At the top of the screen you’ll find the view‑switching toolbar:

- **List / Table** – Toggle between a card‑style list and a classic table. Your choice is saved in your browser’s local storage and remembered the next time you visit the page.
- **Select** – Enables checkboxes next to each row, allowing you to pick multiple transactions and apply a bulk action (see below).

Next to the toggle buttons sits the **Filters** button. Click it to open a bottom sheet with all available filter controls (described later in this guide).

## Uncategorized chip

Below the toolbar you’ll see the **Uncategorized** chip button. Tapping it instantly filters the ledger to show only transactions that haven’t yet been assigned a category. This is the fastest path to the most common task on this screen — assigning categories to new or unassigned bank imports.

When the chip is active, a small **X** appears next to the label; clicking the chip again clears the filter and returns to the full list.

## List view

The default view displays transactions as cards grouped by month. Each month group has:

- A **month header** (e.g., “August 2026”) with the group’s net total — the sum of all income and expenses for that month, shown in green for a positive net or the default text colour for a negative net.
- Individual **transaction cards** that include:
  - **Merchant** name (or “Unknown” if not available).
  - **Category chip** – shown only when the category differs from the row immediately above, to reduce visual noise.
  - **Date** of the transaction.
  - **Signed amount** – expenses appear in the default text colour, income appears in green (the gain colour). The amount always carries a sign, so you can instantly tell whether money came in or went out.

## Table view

Switch to **Table** to see the same data in a columnar layout:

| Column     | Content                        |
|------------|--------------------------------|
| Checkbox   | Used when selection mode is on |
| Date       | Transaction date               |
| Merchant   | Merchant name                  |
| Category   | Category name                  |
| Account    | Account name                   |
| Amount     | Signed amount                  |

Like the list view, the table groups rows by month and shows a net total per group in a dedicated header row.

## Selection mode

When you turn on **Select** mode, a checkbox appears beside each transaction (both in list and table views). The toolbar then also shows:

- **Select all / Clear** – A link‑style checkbox in the header toggles all currently visible rows. Unchecking it clears the selection.
- **Count** – The number of selected transactions is displayed in a fixed bar at the bottom of the screen.

### Bulk category update

Once you’ve selected one or more rows, the bottom bar shows:

1. A **category picker** – a dropdown listing all available categories.
2. An **Apply** button – saves the chosen category to all selected transactions that have a `financial_id`.

**Important:** Not every transaction has a `financial_id`. Those that are missing it cannot be updated by this bulk action. The system tells you how many rows were actually updated and how many were skipped (e.g., “Updated 8 of 10 — the rest have no financial_id and can’t be bulk‑edited.”).

After the update succeeds, the selection is cleared and the list refreshes automatically.

## Filters

Click the **Filters** button to open the filter bottom sheet. It contains these controls:

| Control           | Behaviour                                                                          |
|-------------------|------------------------------------------------------------------------------------|
| **From / To**     | Date range (YYYY‑MM‑DD pickers).                                                   |
| **Account**       | Dropdown of all accounts; set to “Any account” by default.                          |
| **Category tree** | A searchable, multi‑select tree of categories grouped by group name. You can search within the tree, select individual categories, or toggle an entire group at once. The number of selected categories is shown beneath the tree, with a **Clear** link to reset. |
| **Payee**         | Free‑text field that searches the merchant/payee name.                              |
| **Min amount / Max amount** | Numeric fields (supports decimals).                                        |
| **Type**          | Dropdown: Any / Expense / Income.                                                   |

At the bottom of the sheet you have two buttons:

- **Clear** – Resets all filters to their defaults and closes the sheet.
- **Apply** – Commits the current draft filters and closes the sheet.

The filter state persists only while you’re on this page; navigating away and coming back resets the filters to the defaults (unless you arrived via a category or date link from another page, in which case those pre‑fill values are used once and then cleared from the navigation state).

## Pagination

The API loads transactions in batches of 50 rows. When there are more rows to fetch, a **Load more** button appears at the bottom of the list. While the next batch is being fetched, the button shows “Loading…” and is disabled.

## Empty and error states

- **While loading** (no rows yet): a spinning loader icon is centred on the screen.
- **Error** (no rows): a red error message is displayed with the server’s response.
- **No results** (no rows, no error): a plain message says “No transactions match the current filters.”
- **Initial load** (no filters applied): the screen shows the most recent transactions, newest first.

## Related API endpoints

The screen relies on two main endpoints:

- `GET /transactions` — accepts all the filter parameters described above plus optional `limit` and `offset` for pagination.
- `POST /transactions/bulk-category` — accepts a list of `financial_ids` and a `category_id`, updates each matching transaction in one request.

Both are wrapped by the front‑end functions `getTransactionsFiltered` and `bulkUpdateCategory` in `src/lib/api.ts`.
