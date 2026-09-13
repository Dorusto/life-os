# Task: Write Majordom Transport — Concepts page

## Source app / repo path
tools/vehicle-manager

## Target doc file(s)
`../../docs-site/src/content/docs/transport/concepts/index.md` — relative to
`tools/vehicle-manager/`. Launch Aider from `tools/vehicle-manager/`.

## Context
The mental model for the Transport docs: what a vehicle record holds, what a log entry is, and how
the derived numbers (fuel economy, cost per km, depreciation) are actually computed.

## Goal
A reader understands the data model and can explain how the app arrives at its fuel-economy and
depreciation figures.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| README.md | Database schema summary, endpoint list |
| app/database.py | The `vehicles` and `vehicle_log` tables and their columns |
| app/main.py | The stats/summary endpoints and what they compute |
| frontend/src/lib/entryTypes.ts | Entry types and their labels |
| frontend/src/pages/VehicleDetail.tsx | Depreciation model, salvage floor, override history |
| frontend/src/pages/StatsPage.tsx | Fill-ups / Costs / Distance statistics |

## Content required
- **Source of truth**: this app's own database. Vehicles, fuel entries, cost entries and reminders
  live here, not in Actual Budget. Majordom Finance only reads this data over REST for chat and
  dashboard widgets.
- **Vehicle record**: the fields a vehicle carries — name, make, model, year, plate, fuel type, tank
  capacity, purchase price and date, vehicle class, annual depreciation percentage, salvage floor
  percentage, APK/insurance due dates, service intervals, last service.
- **Log entry**: the entry types (fuel, service, maintenance, insurance, and the generic cost type),
  and the fields each carries (date, odometer, litres, price per litre, total cost, location, notes).
- **Fuel economy**: how L/100km is derived — from the distance and litres between full-tank entries,
  not from every fill-up. Explain why partial fills are excluded.
- **Cost per km**: total cost divided by distance over the same period.
- **Depreciation**: the class-default model vs a custom annual percentage; the salvage floor as a
  lower bound; and the override history as a way to pin a real observed value.
- **Reminders**: date-based (APK, insurance) vs odometer-based (service interval), and how progress
  is shown.
- **Fuelio import**: what a Fuelio sync CSV is and that it is the only creation path.
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
--file ../../docs-site/src/content/docs/transport/concepts/index.md
--read README.md
--read app/database.py
--read app/main.py
--read frontend/src/lib/entryTypes.ts
--read frontend/src/pages/VehicleDetail.tsx

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
