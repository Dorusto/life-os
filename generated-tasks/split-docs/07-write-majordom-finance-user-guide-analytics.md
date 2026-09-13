# Task: Write Majordom Finance — User Guide: Analytics

## Source app / repo path
majordom-financiar

## Target doc file(s)
`../docs-site/src/content/docs/finance/user-guide/analytics.md` — relative to `majordom-financiar/`.
Launch Aider from `majordom-financiar/`.

## Context
The Analytics tab is four read-only charts built from existing REST endpoints.

## Goal
A reader knows what each of the four charts shows and how to read it.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| frontend/src/pages/Analytics.tsx | The four chart queries and their loading/error states |
| frontend/src/components/Chart.tsx | The shared chart component and its props |
| frontend/src/components/WidgetLoading.tsx | Per-chart loading state |
| frontend/src/lib/api.ts | `getSpendingChartData`, `getBudgetChartData`, `getSpendingTrendData`, `getSavingsRateData` |

## Content required
- One short paragraph: the tab is four charts, each loaded independently, each with its own loading
  and "couldn't load" state.
- One short section per chart: spending breakdown, budget vs actual, spending trend, savings rate —
  what each one answers and how to read it.
- A note that the charts are read-only and that the same chart component is used inside chat
  conversations, so a chart you asked for in chat looks the same here.

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
--file ../docs-site/src/content/docs/finance/user-guide/analytics.md
--read frontend/src/pages/Analytics.tsx
--read frontend/src/components/Chart.tsx
--read frontend/src/components/WidgetLoading.tsx
--read frontend/src/lib/api.ts

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
