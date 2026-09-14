# Task: Write Majordom Transport — User Guide: Reminders

## Source app or repo path
tools/vehicle-manager

## Target doc file(s)
`../../docs-site/src/content/docs/transport/user-guide/reminders.md` — relative to
`tools/vehicle-manager/`. Launch Aider from `tools/vehicle-manager/`.

## Context
The Reminders tab shows what is due and lets you edit the dates and intervals that drive it.

## Goal
A reader can read a reminder, understand its progress bar, and edit the underlying dates and
intervals.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| frontend/src/pages/RemindersPage.tsx | The whole screen: edit form, reminder list, progress bars |
| frontend/src/lib/reminders.ts | `reminderHorizon` and the overdue logic |
| frontend/src/lib/api.ts | `getVehicleSummary`, `patchVehicle` |
| frontend/src/components/Form.tsx | The `Field` / `TextInput` primitives used by the edit form |

## Content required
- The header and the vehicle switcher.
- The "Edit reminders" button and the edit form: APK/inspection due, insurance due, service interval
  in km, service interval in months, last service odometer, last service date; Save and Cancel.
- The reminder list: the bell icon and its overdue colour, the label, the due date or due odometer,
  the horizon text, and the progress bar (and what the progress bar measures).
- The "No reminders configured" empty state.
- A short note that reminders are computed from the vehicle's own fields, so editing them here is the
  same as editing the vehicle.

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
--file ../../docs-site/src/content/docs/transport/user-guide/reminders.md
--read frontend/src/pages/RemindersPage.tsx
--read frontend/src/lib/reminders.ts
--read frontend/src/lib/api.ts
--read frontend/src/components/Form.tsx

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
