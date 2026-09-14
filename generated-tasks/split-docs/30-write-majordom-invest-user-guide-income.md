# Task: Write Majordom Invest — User Guide: Income

## Source app or repo path
tools/investment-manager

## Target doc file(s)
`../../docs-site/src/content/docs/invest/user-guide/income.md` — relative to
`tools/investment-manager/`. Launch Aider from `tools/investment-manager/`.

## Context
The Income screen is the dividend history, broken down by year and by holding.

## Goal
A reader can see how much income the portfolio has produced and where it came from.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| frontend/src/pages/Income.tsx | The whole screen: summary tiles, two bar lists, history table |
| frontend/src/components/BarList.tsx | The by-year and by-holding breakdowns |
| frontend/src/lib/format.ts | `formatEur`, `formatMoney`, `formatDate` |
| frontend/src/lib/api.ts | `getIncome` and the income shape |

## Content required
- The summary tiles: total received, number of payments, years covered, and the latest year's total.
- The "By year" bar list and the "By holding" bar list.
- The dividend history table: date, security (ticker and name), native amount, EUR amount.
- The empty state and what it says about how dividends get recorded.

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
--file ../../docs-site/src/content/docs/invest/user-guide/income.md
--read frontend/src/pages/Income.tsx
--read frontend/src/components/BarList.tsx
--read frontend/src/lib/format.ts
--read frontend/src/lib/api.ts

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
