# Task: Write Majordom Transport — User Guide: Dashboard

## Source app / repo path
tools/vehicle-manager

## Target doc file(s)
`../../docs-site/src/content/docs/transport/user-guide/dashboard.md` — relative to
`tools/vehicle-manager/`. Launch Aider from `tools/vehicle-manager/`.

## Context
The Transport Dashboard is the at-a-glance summary for the selected vehicle.

## Goal
A reader can read every card on the Dashboard and knows what the vehicle switcher does.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| frontend/src/pages/Dashboard.tsx | The whole screen: switcher, four cards, reminders |
| frontend/src/components/VehicleSwitcher.tsx | The vehicle selector |
| frontend/src/lib/useSelectedVehicle.ts | How the selected vehicle is stored and shared |
| frontend/src/lib/reminders.ts | `reminderHorizon` and the overdue text |
| frontend/src/components/MetricTile.tsx | The metric tile used by every card |

## Content required
- The header and the vehicle switcher: what it does and that the choice carries across tabs.
- The "View vehicle details →" link.
- The Fuel economy card: average L/100km, last fill L/100km, last price per litre with its date.
- The Costs card: this month, this year, all time.
- The Distance card: odometer, this month, this year.
- The Reminders section: the top two reminders, the "View all" link, the due date or due odometer,
  and the horizon text (including the overdue state).
- The empty state when there are no vehicles, and the error state when the summary fails to load.

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
--file ../../docs-site/src/content/docs/transport/user-guide/dashboard.md
--read frontend/src/pages/Dashboard.tsx
--read frontend/src/components/VehicleSwitcher.tsx
--read frontend/src/lib/useSelectedVehicle.ts
--read frontend/src/lib/reminders.ts

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
