# Task: Write Majordom Invest — User Guide: Dashboard

## Source app or repo path
tools/investment-manager

## Target doc file(s)
`../../docs-site/src/content/docs/invest/user-guide/dashboard.md` — relative to
`tools/investment-manager/`. Launch Aider from `tools/investment-manager/`.

## Context
The Invest Dashboard is the portfolio summary: headline figures, a value chart, allocation, and top
movers.

## Goal
A reader can read every figure on the Dashboard and knows what the period selector changes.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| frontend/src/pages/Dashboard.tsx | The whole screen: period selector, statement panel, charts, top movers |
| frontend/src/components/LineChart.tsx | The portfolio value chart |
| frontend/src/components/DonutChart.tsx | The allocation donut |
| frontend/src/components/BarList.tsx | The allocation breakdown list |
| frontend/src/components/Delta.tsx | The change indicator used throughout |
| frontend/src/lib/api.ts | `getPortfolioSummary`, `getPortfolioAllocation`, `getPortfolioHistory` |

## Content required
- The period selector (1M, 3M, 6M, 1Y, 2Y, 5Y, All) and that it drives the summary and the history
  chart.
- The statement panel: portfolio value, the period change (amount and percentage), cost basis,
  unrealized gain, XIRR, TWR, the benchmark return, and portfolio vs benchmark.
- The portfolio value chart and its "in EUR, daily" note.
- The allocation card: the three views (Asset type, Holding, Currency), the donut with its centre
  total, and the breakdown list below it.
- The top movers card: what it ranks by, and the empty state when there are no priced positions.
- The empty state for a portfolio with no holdings, and what it links to.

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
--file ../../docs-site/src/content/docs/invest/user-guide/dashboard.md
--read frontend/src/pages/Dashboard.tsx
--read frontend/src/components/LineChart.tsx
--read frontend/src/components/DonutChart.tsx
--read frontend/src/components/BarList.tsx
--read frontend/src/lib/api.ts

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
