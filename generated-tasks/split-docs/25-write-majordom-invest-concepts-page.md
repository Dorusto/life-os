# Task: Write Majordom Invest — Concepts page

## Source app / repo path
tools/investment-manager

## Target doc file(s)
`../../docs-site/src/content/docs/invest/concepts/index.md` — relative to
`tools/investment-manager/`. Launch Aider from `tools/investment-manager/`.

## Context
The mental model for the Invest docs: what the app tracks, where it lives, and the metrics a reader
will meet on every screen.

## Goal
A reader understands the data model and can explain what XIRR, TWR, cost basis, allocation and
rebalancing drift actually mean.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| README.md | Scope, data model summary, notes on cost basis and market data |
| docs/standalone-app-plan.md | The spec: data model, API contract, scope boundaries |
| app/stats.py | Cost basis, XIRR, TWR, allocation, rebalancing, projections |
| app/market_data.py | Prices, FX, daily caching, stale-value behaviour |
| frontend/src/pages/Dashboard.tsx | Where the metrics surface |
| frontend/src/pages/Holdings.tsx | The average-cost note and the closed-position state |

## Content required
- **Source of truth**: this app's own database. Securities, transactions, holdings and performance
  live here, not in Actual Budget. Majordom Finance only reads this data over REST.
- **Securities and transactions**: the transaction types (buy, sell, dividend, fee), the fields each
  carries, and the manual vs XTB-import source.
- **Holdings**: how a holding is derived from transactions; open vs closed positions.
- **Cost basis**: the average-cost method, and the explicit caveat that it is a tracking figure, not
  a tax figure.
- **Currency**: EUR is the base/display currency; non-EUR securities are converted at a cached FX
  rate before being summed.
- **XIRR (money-weighted return)**: what it measures and when it is the right number to look at.
- **TWR (time-weighted return)**: what it measures, and how it differs from XIRR.
- **Benchmark**: what the benchmark ticker is for and how the comparison is made.
- **Allocation**: the three views (by asset type, by holding, by currency) and the fixed series
  colour order.
- **Rebalancing**: target weights, drift, and the suggested-trade formula.
- **Goals**: target value + date, the compounded projection, and the two rate sources (historical
  XIRR vs the assumed annual return from Settings).
- **Market data**: prices refresh at most once per symbol per day and stale cached values are served
  if the API is unavailable, so a failed call never breaks a page.
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
--file ../../docs-site/src/content/docs/invest/concepts/index.md
--read README.md
--read docs/standalone-app-plan.md
--read app/stats.py
--read app/market_data.py
--read frontend/src/pages/Dashboard.tsx
--read frontend/src/pages/Holdings.tsx

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
