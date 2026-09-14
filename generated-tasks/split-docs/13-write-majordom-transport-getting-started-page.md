# Task: Write Majordom Transport — Getting Started page

## Source app / repo path
tools/vehicle-manager

## Target doc file(s)
`../../docs-site/src/content/docs/transport/getting-started/index.md` — relative to
`tools/vehicle-manager/`. Launch Aider from `tools/vehicle-manager/`; the `../../` prefix reaches the
sibling `docs-site/` folder at the monorepo root. All `--read` paths below are relative to
`tools/vehicle-manager/`.

## Context
The entry point for the Transport docs: what the app is, that it is a separate service with its own
database, and how to open it.

## Goal
A reader understands that vehicle data lives in this app's own database (not Actual Budget), knows
the URL/port, and knows the one way vehicles get created.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| README.md | Architecture, ports, endpoints, migration notes |
| .env.example | Login, JWT secret, service token, callback URL |
| frontend/src/pages/Dashboard.tsx | The home screen and its empty state |
| frontend/src/pages/VehicleList.tsx | The vehicle list and its "no vehicles yet" state |
| frontend/src/pages/FuelioImport.tsx | The only vehicle-creation path |

## Content required
- One paragraph: what Majordom Transport is — a standalone vehicle log (fuel, costs, mileage,
  reminders, depreciation) with its own frontend and backend.
- Where the data lives: this app's own SQLite database is the source of truth for vehicles, fuel
  logs, costs and reminders. It is not stored in Actual Budget. State this plainly.
- How to open it: the standalone web app on its own port (default 3010); the backend runs on 8010.
- First run: log in with this service's own credentials (separate from Majordom Finance's); with no
  vehicles yet, the Dashboard and the Vehicles tab both point at the Fuelio import.
- The one creation path: vehicles are created by importing a Fuelio sync CSV — there is no manual
  "add vehicle" form.
- The main tabs in one short list: Dashboard, Vehicles, Timeline, Stats, Reminders.
- A short "next steps" pointer to the Concepts and User Guide sections.

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
--file ../../docs-site/src/content/docs/transport/getting-started/index.md
--read README.md
--read .env.example
--read frontend/src/pages/Dashboard.tsx
--read frontend/src/pages/VehicleList.tsx
--read frontend/src/pages/FuelioImport.tsx

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
