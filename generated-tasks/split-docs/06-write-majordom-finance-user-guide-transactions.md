# Task: Write Majordom Finance — User Guide: Transactions

## Source app / repo path
majordom-financiar

## Target doc file(s)
`../docs-site/src/content/docs/finance/user-guide/transactions.md` — relative to `majordom-financiar/`.
Launch Aider from `majordom-financiar/`.

## Context
The Transactions tab is the plain CRUD screen for the ledger: filter, browse, and bulk-categorise.

## Goal
A reader can filter the ledger down to what they need, switch between list and table views, and
re-categorise a batch of transactions in one action.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| frontend/src/pages/Transactions.tsx | The whole screen: views, filters, selection, bulk update, pagination |
| frontend/src/components/CategoryFilterTree.tsx | Category filter control |
| frontend/src/lib/groupByMonth.ts | Month grouping and per-month totals |
| frontend/src/lib/api.ts | `getTransactionsFiltered`, `bulkUpdateCategory`, filter shape |

## Content required
- The toolbar: List / Table view toggle (and that the choice is remembered), the Select mode toggle,
  and the Filters button.
- The Uncategorized chip: what it does and why it is the fastest path to the common task.
- List view: month headers with a net total, merchant, category chip (hidden when it repeats the row
  above), date, signed amount; income shown in the gain colour.
- Table view: the columns (checkbox, Date, Merchant, Category, Account, Amount) and the same month
  grouping.
- Selection mode: select all / clear, the count, the category picker, Apply, and the note that rows
  without a `financial_id` cannot be bulk-edited (the partial-update notice).
- The Filters sheet: date from/to, account, category tree, payee search, min/max amount, expense vs
  income, and Clear vs Apply.
- Pagination: 50 rows per page and the "Load more" button.
- The empty and error states.

## Style rules
- Starlight/Astro Markdown (.md), frontmatter with `title` and `description`
- Plain English, end-user tone (not developer-facing), matches wealthfolio.app/docs' style: short
  paragraphs, practical, feature-oriented
- No real personal data (names, IPs, hostnames, domains, license plates) — use generic placeholders
- Do not invent features that don't exist in the code

## Do NOT touch
- `docs-site/astro.config.mjs` (sidebar structure, already decided)
- Any other app's doc pages

## Done when
- The target file contains real, accurate content (not the placeholder text), matching what the
  actual code does

## Suggested difficulty tier
Rapid

## Dispatch args
--file ../docs-site/src/content/docs/finance/user-guide/transactions.md
--read frontend/src/pages/Transactions.tsx
--read frontend/src/components/CategoryFilterTree.tsx
--read frontend/src/lib/groupByMonth.ts
--read frontend/src/lib/api.ts

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
