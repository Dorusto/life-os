# Task: Write Majordom Finance — User Guide: Dashboard

## Source app / repo path
majordom-financiar

## Target doc file(s)
`../docs-site/src/content/docs/finance/user-guide/dashboard.md` — relative to `majordom-financiar/`.
Launch Aider from `majordom-financiar/`.

## Context
The Dashboard is the app's home screen: a configurable set of widgets plus a period selector.

## Goal
A reader can read every widget on the Dashboard, customise which widgets are shown, and change the
period the widgets report on.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| frontend/src/pages/Dashboard.tsx | The whole screen: widgets, customize mode, period picker, bottom bar |
| frontend/src/lib/dashboardWidgets.ts | Widget registry (ids, names, descriptions, columns) |
| frontend/src/lib/netWorthPrefs.ts | Net Worth include/exclude preferences |
| frontend/src/components/GoalsSection.tsx | Goals / FIRE / expense-coverage widget |
| frontend/src/components/BudgetDashboard.tsx | Categories Watchlist widget |
| frontend/src/components/Chart.tsx | Shared chart component used by the pie and line widgets |

## Content required
- The header: date label, title, and the header actions (notifications, settings).
- The notification-permission banner and what enabling it does.
- The "On budget" total at the top of the widget area.
- The empty state for a brand-new install ("Let's get started") and what it links to.
- Each widget, one short paragraph each, describing what it shows:
  - Goals (goals, FIRE, expense coverage)
  - Categories Watchlist (budget period categories, group edit mode)
  - Balance trend (scopes: Total, On-budget, Portfolio, Vehicles; the 30-day history line and the
    "vs 30d ago" delta; which scopes have no data source yet)
  - Latest Transactions (five most recent, link to the Transactions tab)
  - Expenses Structure (pie of the period's spending by category)
  - Cash Flow (currently a placeholder — say so honestly)
  - Vehicle costs (period total, vehicle count, cost per km; the "no vehicles" and "unavailable"
    states)
  - Net Worth (current total, history line, start/now/growth figures, and the Include menu for
    Loan/Vehicle/Rental)
- Customize mode: entering it, removing a widget with the × chip, adding one back from the "Add
  widgets" list, Cancel vs Done, and that the choice is remembered.
- The fixed bottom bar: the Customize button and the period control (previous/next arrows and the
  period picker sheet, which offers the last 12 months grouped by year).

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
--file ../docs-site/src/content/docs/finance/user-guide/dashboard.md
--read frontend/src/pages/Dashboard.tsx
--read frontend/src/lib/dashboardWidgets.ts
--read frontend/src/lib/netWorthPrefs.ts
--read frontend/src/components/GoalsSection.tsx
--read frontend/src/components/BudgetDashboard.tsx

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
