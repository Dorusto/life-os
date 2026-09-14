# Task: Write Majordom Finance — User Guide: Import

## Source app / repo path
majordom-financiar

## Target doc file(s)
`../docs-site/src/content/docs/finance/user-guide/import.md` — relative to `majordom-financiar/`.
Launch Aider from `majordom-financiar/`.

## Context
The CSV import flow is a four-step wizard. It is also reachable from the chat `+` menu, so the page
should cover both entry points.

## Goal
A reader can import a bank CSV end to end, understand the duplicate and transfer warnings, and know
what the summary means.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| frontend/src/pages/ImportPage.tsx | The four steps, row model, category propagation, transfer handling |
| frontend/src/lib/csvImportUtils.ts | `matchAccountBySource` account auto-matching |
| frontend/src/components/CsvImportCard.tsx | The in-chat variant of the same flow |
| frontend/src/lib/api.ts | `previewCsvImport`, `confirmCsvImport`, `ImportResult` |

## Content required
- The two entry points: the Import screen and the chat `+` → Upload CSV.
- Step 1 — Upload: drag-and-drop or browse, the supported formats note, and the Preview button.
- Step 2 — Preview: the account selector and the "no account matched" warning; the table columns;
  the category dropdown and the `?` marker meaning "needs a category" or "auto-suggested, verify";
  the notes field; the duplicate row (dimmed, "already imported"); the possible-duplicate warning
  with the existing amount; the transfer-candidate badge and the Include/Exclude toggle; and the
  fact that editing one row's category propagates to similar merchants.
- Step 3 — Confirm: the summary rows (to import, duplicates skipped, transfers excluded, expenses,
  income), the uncategorized warning, the auto-suggested note, and the "cannot be undone" line.
- Step 4 — Done: what the success screen reports (imported, categories updated, duplicates skipped,
  older transactions categorised) and the Back to Home button.
- A short note that re-importing the same CSV is safe because duplicates are detected.

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
--file ../docs-site/src/content/docs/finance/user-guide/import.md
--read frontend/src/pages/ImportPage.tsx
--read frontend/src/lib/csvImportUtils.ts
--read frontend/src/components/CsvImportCard.tsx
--read frontend/src/lib/api.ts

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
