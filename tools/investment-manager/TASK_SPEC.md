# Task: Write Majordom Invest — Getting Started page

## Source app / repo path
tools/investment-manager

## Target doc file(s)
`../../docs-site/src/content/docs/invest/getting-started/index.md` — relative to
`tools/investment-manager/`. Launch Aider from `tools/investment-manager/`; the `../../` prefix
reaches the sibling `docs-site/` folder at the monorepo root. All `--read` paths below are relative
to `tools/investment-manager/`.

## Context
The entry point for the Invest docs: what the app is, that it is a separate service with its own
database, and how to open it.

## Goal
A reader understands that portfolio data lives in this app's own database (not Actual Budget), knows
the URL/port, and knows what to do first.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| README.md | Architecture, layout, run instructions, notes |
| .env.example | Login, JWT secret, service token, Twelve Data key |
| frontend/src/pages/Dashboard.tsx | The home screen and its empty state |
| frontend/src/pages/Transactions.tsx | The add-transaction / import-XTB entry points |
| frontend/src/pages/Settings.tsx | The benchmark and API-key settings |

## Content required
- One paragraph: what Majordom Invest is — a standalone portfolio tracker (holdings, transactions,
  cost basis, returns, allocation, rebalancing, goals) with its own frontend and backend.
- Where the data lives: this app's own SQLite database is the source of truth for securities,
  transactions, holdings and performance. It is not stored in Actual Budget. State this plainly.
- How to open it: the standalone web app on its own port (default 3020); the backend runs on 8020.
- First run: log in with this service's own credentials (separate from Majordom Finance's); the
  Dashboard shows an empty state pointing at Transactions.
- The first three things to do: add a security, add or import transactions, then set the benchmark
  and (optionally) the market-data API key in Settings.
- The main screens in one short list: Dashboard, Holdings, Transactions, Income, Rebalancing, Goals,
  Settings.
- A short "next steps" pointer to the Concepts and User Guide sections.

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
--file ../../docs-site/src/content/docs/invest/getting-started/index.md
--read README.md
--read .env.example
--read frontend/src/pages/Dashboard.tsx
--read frontend/src/pages/Transactions.tsx
--read frontend/src/pages/Settings.tsx

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
