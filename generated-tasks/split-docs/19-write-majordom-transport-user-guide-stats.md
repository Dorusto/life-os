# Task: Write Majordom Transport — User Guide: Stats

## Source app or repo path
tools/vehicle-manager

## Target doc file(s)
`../../docs-site/src/content/docs/transport/user-guide/stats.md` — relative to
`tools/vehicle-manager/`. Launch Aider from `tools/vehicle-manager/`.

## Context
The Stats tab is three switchable views — Fill-ups, Costs, Distance — plus a cost-categories chart.

## Goal
A reader can switch between the three views and read every figure in each.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| frontend/src/pages/StatsPage.tsx | The whole screen: tabs, figures, include-fuel toggle |
| frontend/src/components/Segmented.tsx | The tab control |
| frontend/src/components/ChartSection.tsx | The cost-categories chart |
| frontend/src/lib/api.ts | `getVehicleStatsDetail`, `getCostCategories` |

## Content required
- The header and the vehicle switcher.
- The three tabs and what each covers.
- Costs view: total costs, this year, this month, previous year, previous month; lowest and highest
  bill; best and worst price per litre; average cost per km; average cost per day.
- Fill-ups view: fill-up count, average consumption, total fuel, total fuel cost.
- Distance view: total distance, this year, this month, average per month, average per day.
- The cost-categories chart and the "Include fuel" checkbox — what changes when it is toggled.
- The empty state when there is no statistics data yet.

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
--file ../../docs-site/src/content/docs/transport/user-guide/stats.md
--read frontend/src/pages/StatsPage.tsx
--read frontend/src/components/Segmented.tsx
--read frontend/src/components/ChartSection.tsx
--read frontend/src/lib/api.ts

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
