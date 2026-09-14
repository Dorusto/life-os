---
title: Import CSV
description: How to import bank statements into Majordom Finance using the four‑step wizard or the chat + menu.
---

You can bring transactions from your bank into Majordom in two ways:

- **Import screen** – the dedicated wizard from the sidebar.
- **Chat `+` menu** – tap **Upload CSV** in the conversation, and the same flow appears inline.

Both paths use the same logic, so the steps below apply to either entry point.

---

## Step 1 — Upload

Drag a `.csv` file onto the drop zone or tap to browse your device.

Supported bank formats include **ING**, **Rabobank**, and **crypto.com**.  
Once you have selected a file, tap **Preview transactions**.

The file is sent to the server, parsed into rows, and the next step opens automatically.

---

## Step 2 — Preview

### Account selector

The system tries to match your bank’s name (e.g. “crypto.com”) to one of your Actual Budget accounts using word‑level token overlap. If a match is found, the account is pre‑selected.

If no match is found, you will see a warning and must pick an account from the dropdown. You can also create a new account on the fly by tapping **create a new account**.

### The table

Each row shows:

| Column | What it means |
|---|---|
| **Date** | Month and day (year omitted for readability). |
| **Merchant** | The payee line from your bank. You can edit it in‑place. |
| **Amount** | Expensed amounts appear negative, income amounts positive. Non‑EUR currencies show the original symbol and value. |
| **Category** | A dropdown with all your Actual Budget categories. |

#### Category markers

- A blank category cell highlighted with a **?** means the row **needs a category** (it will import as “Uncategorized” otherwise).
- A yellow **?** with an auto‑filled category means the category was *suggested* – you should verify it before importing.
- Once you confirm a category (by selecting it yourself), the `?` disappears.

#### Manual transfer and new category

Besides picking an existing category you can also:

- **↔ Transfer to… / Transfer from…** – mark the row as an internal transfer to or from another account. After selecting this option you will be asked to choose the destination (or source) account.
- **+ Create new category** – add a brand‑new category on the fly. You will need to type its name and optionally choose a group.

Whenever a category is selected a **Save as rule** checkbox appears. Checking it tells Majordom to remember the payee → category mapping for future imports.

#### Duplicate rows

If a transaction has the same date and amount as one already in Actual Budget, the entire row is dimmed and shows **already imported**. Duplicate rows are skipped during import and count toward the “duplicates skipped” summary.

A **possible duplicate** warning appears when the same date and merchant already exist but with a different amount. The existing amount is shown in a tooltip.

#### Transfer candidates

Rows that look like internal transfers (e.g. moving money between your own accounts) are flagged with a **Transfer?** badge and excluded by default. You can **Include** or **Exclude** them manually.

#### Editing and propagation

Changing a row’s category automatically applies the same category to other rows whose merchant name is at least **50 % similar** in word tokens. This saves time when the bank adds a store number or address suffix.

You can also add an optional **note** to any row.

---

## Step 3 — Confirm

Before the import runs, a summary shows:

- **Transactions to import** – the number of active, non‑duplicate rows.
- **Duplicates skipped** – rows already in Actual Budget.
- **Likely transfers excluded** – rows flagged as internal transfers that were left out.
- **Expenses** and **Income** – total amounts broken down.

If any active row is still uncategorized, you’ll see an orange warning with the count.  
Rows that were auto‑suggested but still need verification are mentioned in a smaller note.

> **This cannot be undone.** After you tap **Import**, the transactions are added to Actual Budget permanently.

---

## Step 4 — Done

The success screen reports:

- How many transactions were **imported**.
- How many category assignments were **updated** (if any).
- How many **duplicates were skipped**.
- How many older transactions were **retroactively categorised** (if the import created new rules that matched past entries).

Tap **Back to Home** to return to the dashboard.

---

## Safe re‑import

Re‑importing the same CSV file is safe. Duplicate detection compares date, merchant, and amount, so rows already present are silently skipped.
