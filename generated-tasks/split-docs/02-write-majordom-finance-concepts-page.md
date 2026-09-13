# Task: Write Majordom Finance — Concepts page

## Source app / repo path
majordom-financiar

## Target doc file(s)
`../docs-site/src/content/docs/finance/concepts/index.md` — relative to `majordom-financiar/`.
Launch Aider from `majordom-financiar/`.

## Context
The mental model a reader needs before using any Finance feature: what data exists, where it lives,
and the non-obvious terms the rest of the docs use.

## Goal
A reader can explain, in their own words, that Actual Budget holds the budget data and Majordom
Finance is a layer over it, and understands the vocabulary used across the User Guide.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| docs/architecture.md | Internal architecture, provider/adapter model, rules |
| docs/product-plan.md | Product statement, phases, what the app is and is not |
| frontend/src/pages/Dashboard.tsx | Widgets that expose the concepts (on-budget total, net worth, goals, FIRE) |
| frontend/src/pages/Accounts.tsx | Account types, on-budget vs off-budget, vehicle-tagged accounts |
| frontend/src/pages/Transactions.tsx | Category model, uncategorized flow, bulk categorisation |
| frontend/src/pages/Chat.tsx | Card types that map to concepts (proposals, clarifications, transfers) |

## Content required
- **Source of truth**: Actual Budget owns accounts, categories, category groups, payees, schedules
  and transactions. Majordom Finance is a conversational layer on top — it does not keep a second
  copy of the ledger.
- **Accounts**: on-budget vs off-budget; account types (`Investment`, `Vehicle`, `Loan`, `Rental`,
  and the default wallet) and what each type changes in the UI.
- **Categories and groups**: categories belong to groups; the "Uncategorized" state and why it
  matters; the 12 built-in categories listed in the README.
- **Transactions**: expense vs income, transfers between accounts, duplicates and near-duplicates,
  and the "possible duplicate" warning.
- **Budget period**: the month/year period selector on the Dashboard and what "current month" means.
- **Goals and FIRE**: goal tracking works by checking account balances against a target, not by
  moving money into a separate account; FIRE/expense-coverage figures are projections.
- **Net worth**: currently a single-app view built from Actual Budget accounts, with include/exclude
  toggles for Loan/Vehicle/Rental. Note that a combined cross-app net worth view is a possible future
  direction, not something that exists today.
- **The chat layer**: Majordom proposes, you confirm. Every write is a card with a confirm/cancel.
- A short glossary table of the terms introduced on this page.

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
--file ../docs-site/src/content/docs/finance/concepts/index.md
--read docs/architecture.md
--read docs/product-plan.md
--read frontend/src/pages/Accounts.tsx
--read frontend/src/pages/Transactions.tsx
--read frontend/src/pages/Dashboard.tsx

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
