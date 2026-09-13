# Task: Write Majordom Transport — User Guide overview page

## Source app / repo path
tools/vehicle-manager

## Target doc file(s)
`../../docs-site/src/content/docs/transport/user-guide/index.md` — relative to
`tools/vehicle-manager/`. Launch Aider from `tools/vehicle-manager/`.

## Context
The landing page for the Transport User Guide section, which is split across Dashboard, Vehicles,
Timeline, Stats, Reminders and Import.

## Goal
A reader can see the whole app at a glance and jump to the page for the screen they are on.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| frontend/src/pages/Dashboard.tsx | Dashboard screen |
| frontend/src/pages/VehicleList.tsx | Vehicles tab |
| frontend/src/pages/VehicleDetail.tsx | Vehicle detail page |
| frontend/src/pages/TimelinePage.tsx | Timeline tab |
| frontend/src/pages/StatsPage.tsx | Stats tab |
| frontend/src/pages/RemindersPage.tsx | Reminders tab |
| frontend/src/pages/FuelioImport.tsx | Import screen |

## Content required
- One short paragraph: the app is a small number of tabs plus a detail page, and this section walks
  through each.
- A table of the screens with a one-line description and a link to the matching page in this section:
  Dashboard, Vehicles, Vehicle detail, Timeline, Stats, Reminders, Import.
- A short note on navigation: the bottom tab bar, the vehicle switcher at the top of most tabs, and
  the fact that the detail page and the import screen are reached from the Vehicles tab.
- A short note that every tab is scoped to the currently selected vehicle.

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
--file ../../docs-site/src/content/docs/transport/user-guide/index.md
--read frontend/src/pages/Dashboard.tsx
--read frontend/src/pages/VehicleList.tsx
--read frontend/src/pages/VehicleDetail.tsx
--read frontend/src/pages/TimelinePage.tsx
--read frontend/src/pages/StatsPage.tsx
--read frontend/src/pages/RemindersPage.tsx
--read frontend/src/pages/FuelioImport.tsx

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
