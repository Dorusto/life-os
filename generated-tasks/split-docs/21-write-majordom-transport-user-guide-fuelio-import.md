# Task: Write Majordom Transport — User Guide: Fuelio import

## Source app or repo path
tools/vehicle-manager

## Target doc file(s)
`../../docs-site/src/content/docs/transport/user-guide/import.md` — relative to
`tools/vehicle-manager/`. Launch Aider from `tools/vehicle-manager/`.

## Context
The Fuelio import screen is the only way a vehicle gets created in this app.

## Goal
A reader can import a Fuelio sync CSV and understand the result summary.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| frontend/src/pages/FuelioImport.tsx | The whole screen: file picker, import, result card |
| frontend/src/lib/api.ts | `importFuelio` and `FuelioImportResult` |
| app/csv_import.py | How the Fuelio CSV is parsed and what is skipped |
| README.md | The `/import/fuelio` endpoint and the migration script |

## Content required
- What a Fuelio sync CSV is and where to export it from Fuelio.
- The file picker and the Import button, including the disabled and "Importing…" states.
- The error state.
- The result card: vehicle name, fuel entries imported and skipped, cost entries imported and
  skipped, and the Back to vehicles button.
- A note that importing the same file again updates the existing vehicle rather than creating a
  duplicate.
- A short note that this is the only creation path — there is no manual add-vehicle form.

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
--file ../../docs-site/src/content/docs/transport/user-guide/import.md
--read frontend/src/pages/FuelioImport.tsx
--read frontend/src/lib/api.ts
--read app/csv_import.py
--read README.md

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
