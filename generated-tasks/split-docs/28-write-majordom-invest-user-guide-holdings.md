# Task: Write Majordom Invest — User Guide: Holdings

## Source app or repo path
tools/investment-manager

## Target doc file(s)
`../../docs-site/src/content/docs/invest/user-guide/holdings.md` — relative to
`tools/investment-manager/`. Launch Aider from `tools/investment-manager/`.

## Context
The Holdings screen lists every position with its cost basis, market value and unrealized gain.

## Goal
A reader can read the holdings table, understand the summary tiles, and know what "include closed"
does.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| frontend/src/pages/Holdings.tsx | The whole screen: summary tiles, table, closed positions, footnote |
| frontend/src/components/MetricTile.tsx | The summary tiles |
| frontend/src/components/Delta.tsx | The gain indicator |
| frontend/src/lib/format.ts | `formatEur`, `formatMoney`, `formatShares`, `formatPercentPoints` |
| frontend/src/lib/api.ts | `getHoldings` and the holding shape |

## Content required
- The summary tiles: market value, cost basis, unrealized gain (with its percentage), and the number
  of open positions.
- The "Include closed" checkbox and what changes when it is on.
- The table columns: security (ticker, asset-type pill, name), shares, average cost, price, value,
  weight, gain/loss.
- The gain/loss cell: the amount and the percentage, and the closed-position variant showing the
  realized gain instead.
- The footnote explaining that cost basis uses the average-cost method and is a tracking figure, not
  a tax figure, and that native-currency prices are shown where a security is not in EUR.
- The empty state and what it links to.

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
--file ../../docs-site/src/content/docs/invest/user-guide/holdings.md
--read frontend/src/pages/Holdings.tsx
--read frontend/src/components/MetricTile.tsx
--read frontend/src/components/Delta.tsx
--read frontend/src/lib/format.ts
--read frontend/src/lib/api.ts

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
