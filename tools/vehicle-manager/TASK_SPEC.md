# Task: Write Majordom Transport — Reference page

## Source app / repo path
tools/vehicle-manager

## Target doc file(s)
`../../docs-site/src/content/docs/transport/reference/index.md` — relative to
`tools/vehicle-manager/`. Launch Aider from `tools/vehicle-manager/`.

## Context
The FAQ + glossary page for the Transport docs.

## Goal
A reader can look up a term or a common question without re-reading the whole section.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| README.md | Endpoint table, schema summary, migration notes |
| app/database.py | The exact table and column names |
| frontend/src/lib/entryTypes.ts | Entry-type labels |
| frontend/src/pages/VehicleDetail.tsx | Depreciation and salvage-floor terms |
| frontend/src/pages/StatsPage.tsx | The statistics terms |

## Content required
- **FAQ**, short question/answer entries, at least:
  - Where is my vehicle data stored? (This app's own database, not Actual Budget.)
  - How do I add a vehicle? (Import a Fuelio CSV — there is no manual form.)
  - Why is my average consumption blank? (It needs two full-tank entries.)
  - What is the salvage floor? (A lower bound on the depreciation curve.)
  - Why does a reminder show as overdue? (The due date or due odometer has passed.)
  - Can I delete a log entry? (Yes, from the Timeline or the vehicle detail log.)
  - Does Majordom Finance see this data? (Yes, over REST, for chat and dashboard widgets.)
  - How do I move my old vehicle data here? (The migration script — see Self-Hosting.)
- **Glossary**, a table of terms used across the Transport docs: vehicle record, log entry, entry
  type, full tank, L/100km, cost per km, odometer, service interval, APK/inspection, salvage floor,
  depreciation model, override, reminder horizon, Fuelio sync CSV, service token.
- Keep entries to one or two sentences each.

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
--file ../../docs-site/src/content/docs/transport/reference/index.md
--read README.md
--read app/database.py
--read frontend/src/lib/entryTypes.ts
--read frontend/src/pages/VehicleDetail.tsx

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
