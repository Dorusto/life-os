# Task: Write Majordom Transport — User Guide: Vehicles and vehicle detail

## Source app / repo path
tools/vehicle-manager

## Target doc file(s)
`../../docs-site/src/content/docs/transport/user-guide/vehicles.md` — relative to
`tools/vehicle-manager/`. Launch Aider from `tools/vehicle-manager/`.

## Context
The Vehicles tab lists every vehicle; the detail page is where value, specs, reminders, charts and
the log for one vehicle live.

## Goal
A reader can find a vehicle, read its detail page top to bottom, and add or delete a log entry.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| frontend/src/pages/VehicleList.tsx | The list, its rows, and the empty state |
| frontend/src/pages/VehicleDetail.tsx | The whole detail page |
| frontend/src/components/LogEntryForm.tsx | The add-entry form |
| frontend/src/components/ChartSection.tsx | The chart wrapper used by the Fuel & Costs section |
| frontend/src/lib/api.ts | `getVehicle`, `getValueProjection`, `getValueHistory`, the chart endpoints, `deleteLogEntry` |

## Content required
- The Vehicles list: each row's name, make/model/year subtitle, current value and last odometer; the
  Import button; the empty state.
- The detail page header: back link, vehicle name, log out.
- The value card: current value, the delta since acquisition, purchase price, depreciation,
  projected value in N years, and the value-over-time chart with the salvage floor line.
- The "no purchase price set" state and what it means.
- The info card: class, year, mileage, depreciation model (class default vs custom), salvage floor
  percentage and amount.
- The Reminders card: APK/inspection due, insurance due, service interval (km and/or months).
- The Override history card: what an override is, the value, date and note, and the empty state.
- The Fuel & Costs section: the five charts (consumption, distance, cost per km, monthly cost,
  mileage) and what each shows.
- The Log section: the 20 most recent entries, the type pill, date, litres and cost for fuel entries,
  cost and notes for others, and the delete button.
- The add-entry form at the bottom: what it records and that it refreshes every chart and card.

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
--file ../../docs-site/src/content/docs/transport/user-guide/vehicles.md
--read frontend/src/pages/VehicleList.tsx
--read frontend/src/pages/VehicleDetail.tsx
--read frontend/src/components/LogEntryForm.tsx
--read frontend/src/components/ChartSection.tsx
--read frontend/src/lib/api.ts

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
