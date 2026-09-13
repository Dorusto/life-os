# Task: Write Majordom Invest — User Guide: Transactions

## Source app or repo path
tools/investment-manager

## Target doc file(s)
`../../docs-site/src/content/docs/invest/user-guide/transactions.md` — relative to
`tools/investment-manager/`. Launch Aider from `tools/investment-manager/`.

## Context
The Transactions screen is the ledger: every buy, sell, dividend and fee, with filters, manual entry,
security creation, XTB import and delete.

## Goal
A reader can add a transaction, import an XTB report, filter the ledger, and delete a mistake.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| frontend/src/pages/Transactions.tsx | The whole screen: filters, table, actions, delete confirm |
| frontend/src/components/TransactionModal.tsx | The add-transaction form |
| frontend/src/components/SecurityModal.tsx | The add-security form |
| frontend/src/components/XtbImportModal.tsx | The XTB import flow |
| frontend/src/lib/transactions.ts | `transactionSignedAmount` and the sign convention |
| frontend/src/lib/api.ts | `getTransactions`, `deleteTransaction`, `getSecurities` |

## Content required
- The three header actions: Import XTB, Add security, Add transaction.
- The filters: by security and by type (all, buy, sell, dividend, fee).
- The table columns: date, type pill, security (ticker and name), quantity, price, amount, source
  (XTB vs Manual), and the delete action.
- The amount sign convention: what a positive and a negative amount mean.
- The delete confirmation dialog and what it recalculates.
- The empty state and what it links to.
- A short note that the XTB import backfills history from a broker report.

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
--file ../../docs-site/src/content/docs/invest/user-guide/transactions.md
--read frontend/src/pages/Transactions.tsx
--read frontend/src/components/TransactionModal.tsx
--read frontend/src/components/SecurityModal.tsx
--read frontend/src/components/XtbImportModal.tsx
--read frontend/src/lib/transactions.ts

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
