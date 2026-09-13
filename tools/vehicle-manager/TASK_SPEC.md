# Task: Write Majordom Transport — User Guide: Timeline

## Source app or repo path
tools/vehicle-manager

## Target doc file(s)
`../../docs-site/src/content/docs/transport/user-guide/timeline.md` — relative to
`tools/vehicle-manager/`. Launch Aider from `tools/vehicle-manager/`.

## Context
The Timeline tab is the full chronological log for the selected vehicle, grouped by month.

## Goal
A reader can scan the history, spot the reminders banner, and delete an entry.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| frontend/src/pages/TimelinePage.tsx | The whole screen: grouping, icons, reminders banner, delete |
| frontend/src/lib/entryTypes.ts | `categoryLabel` and the entry-type labels |
| frontend/src/components/LogEntryForm.tsx | The add-entry form at the bottom |
| frontend/src/lib/api.ts | `getVehicleLog`, `deleteLogEntry`, `getVehicleSummary` |

## Content required
- The header and the vehicle switcher.
- The reminders banner: when it appears, what it shows, and that it links to the Reminders tab.
- The month grouping: newest month first, the month label, and the entries inside.
- Each entry row: the icon by entry type, the type label, the cost, the date and odometer, and the
  fuel-specific line (litres, price per litre, location) or the notes line.
- The delete button and what it refreshes.
- The empty state and the add-entry form.

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
--file ../../docs-site/src/content/docs/transport/user-guide/timeline.md
--read frontend/src/pages/TimelinePage.tsx
--read frontend/src/lib/entryTypes.ts
--read frontend/src/components/LogEntryForm.tsx
--read frontend/src/lib/api.ts

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
