# Task: Write Majordom Finance — User Guide: Settings

## Source app / repo path
majordom-financiar

## Target doc file(s)
`../docs-site/src/content/docs/finance/user-guide/settings.md` — relative to `majordom-financiar/`.
Launch Aider from `majordom-financiar/`.

## Context
Settings is a menu of sub-pages. Some are real and live, some are deliberately inert placeholders —
the page must say which is which.

## Goal
A reader can find the setting they need, and is not misled by a row that looks interactive but is not.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| frontend/src/pages/Settings.tsx | The whole screen: menu groups, every sub-page, row primitives |
| frontend/src/lib/api.ts | `syncAccounts`, `getPayees`, `getSchedules`, `getBackupStatus`, `getCategories`, `getCategoryGroups`, budget-pacing config |
| frontend/src/lib/push.ts | `requestAndSubscribe` used by the Notifications page |

## Content required
- The menu structure, group by group: Personal (Appearance, Language, General, Security & backup),
  Workspace (Currencies, Categories, Payees, Scheduled payments, Import & Export, AI, AI
  Integrations, Annual budget pacing), Connections, Notifications, About.
- The "Sync accounts" button at the top and what it refreshes.
- The "Log out" button.
- For each sub-page, what it actually does today, and explicitly flag the inert rows:
  - Appearance: Dark is the only theme; Light and System are not built.
  - Language: English only.
  - General: all three rows are placeholders.
  - Security & backup: shows the last backup date; change password / run backup / restore are
    placeholders.
  - Currencies: an explanatory note (Actual Budget tracks one currency per budget file).
  - Categories: a live count of categories and groups, plus a link into chat.
  - Payees: a live list with transaction counts.
  - Scheduled payments: a live list with active/inactive state.
  - Import & Export: links into chat for CSV import; export is a placeholder.
  - AI: the configured chat, vision and local-fallback models (read-only).
  - AI Integrations: placeholder.
  - Annual budget pacing: the real editor — annual income, fixed expense categories, sinking-fund
    categories, the mutual-exclusion rule between the two, and Save.
  - Connections: links to Actual Budget, Vehicle Manager, Investment Manager, and the local-only
    Majordom Memory viewer.
  - Notifications: push notifications toggle (with the browser-permission states) and the always-on
    daily digest.
  - About: version and a placeholder disconnect row.
- A short note that the app is dark-theme only today.

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
--file ../docs-site/src/content/docs/finance/user-guide/settings.md
--read frontend/src/pages/Settings.tsx
--read frontend/src/lib/api.ts
--read frontend/src/lib/push.ts

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
