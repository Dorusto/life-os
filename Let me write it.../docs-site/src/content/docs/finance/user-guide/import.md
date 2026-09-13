---
title: Import bank CSV
description: Learn how to import a bank CSV into Majordom Finance, including the four-step wizard, duplicate detection, and transfer handling.
---

# Import bank CSV

You can bring your bank transactions into Majordom Finance in two ways:

- From the **Import** screen in the main navigation.
- From the chat **+** menu, choose **Upload CSV**.

Both entry points use the same four-step wizard.

## Step 1 – Upload

Drag and drop a CSV file onto the upload area, or click **Browse** to select it from your computer.

The supported format is a standard CSV file with columns for date, description, amount, and optionally a category. The file must have a header row.

After you select a file, click **Preview** to move to the next step.

## Step 2 – Preview

The preview shows a table of the rows that will be imported.

At the top you can choose the **account** that the transactions belong to. If the account cannot be matched automatically, you’ll see a warning that no account was matched and you’ll need to pick one manually.

Each row shows:

- **Date** – the transaction date.
- **Description** – the merchant or description text.
- **Amount** – the transaction amount (positive for income, negative for expenses).
- **Category** – a dropdown to assign a category. If a category is missing, you’ll see a `?` marker meaning “needs a category” or “auto-suggested, verify”.
- **Notes** – an optional free‑text field.

Rows that are already in your account are dimmed and marked **“already imported”**. These rows will be skipped when you confirm.

If a row looks like a possible duplicate but the amount differs, you’ll see a warning with the existing amount so you can decide.

Rows that look like transfers between your own accounts get a **transfer‑candidate** badge. You can toggle **Include** or **Exclude** for each transfer row.

When you edit the category of one row, the same category is automatically applied to other rows with a similar merchant description.

## Step 3 – Confirm

The confirm screen shows a summary of what will happen:

- **To import** – the number of new rows that will be added.
- **Duplicates skipped** – rows that were already present.
- **Transfers excluded** – transfer rows you chose to exclude.
- **Expenses** – total amount of expense rows.
- **Income** – total amount of income rows.

If any rows still need a category, you’ll see an **uncategorized** warning. You can either assign categories now or leave them for later.

Majordom may also suggest a note for the import, which you can edit or remove.

The confirm screen reminds you that **this action cannot be undone**.

## Step 4 – Done

After you confirm, the success screen reports:

- How many transactions were imported.
- How many categories were updated.
- How many duplicates were skipped.
- How many older transactions were categorised based on the new data.

You can click **Back to Home** to return to the main dashboard.

## Re‑importing is safe

If you import the same CSV again, the duplicate detection will skip rows that are already in your account. You won’t create duplicate transactions.
