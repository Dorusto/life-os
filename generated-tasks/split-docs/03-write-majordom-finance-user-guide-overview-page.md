# Task: Write Majordom Finance — User Guide overview page

## Source app / repo path
majordom-financiar

## Target doc file(s)
`../docs-site/src/content/docs/finance/user-guide/index.md` — relative to `majordom-financiar/`.
Launch Aider from `majordom-financiar/`.

## Context
The landing page for the Finance User Guide section, which is split across several pages (Dashboard,
Accounts, Transactions, Analytics, Chat, Settings, Import).

## Goal
A reader can see the whole app at a glance and jump straight to the page for the screen they are
looking at.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| frontend/src/pages/Dashboard.tsx | Dashboard screen and its widgets |
| frontend/src/pages/Accounts.tsx | Accounts screen |
| frontend/src/pages/Transactions.tsx | Transactions screen |
| frontend/src/pages/Analytics.tsx | Analytics screen |
| frontend/src/pages/Chat.tsx | Chat screen |
| frontend/src/pages/Settings.tsx | Settings screen and its sub-pages |
| frontend/src/pages/ImportPage.tsx | CSV import flow |

## Content required
- One short paragraph: the app is navigated through a small number of tabs, and this section walks
  through each one.
- A table of the screens with a one-line description and a link to the matching page in this section:
  Dashboard, Accounts, Transactions, Analytics, Chat, Settings, Import.
- A short note on navigation: the bottom tab bar, the header actions (notifications, settings), and
  the Settings sub-page pattern (menu → sub-page with a back button).
- A short note that the Chat tab is the primary way to do things, and the other tabs are for looking
  at and correcting what Majordom has done.

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
--file ../docs-site/src/content/docs/finance/user-guide/index.md
--read frontend/src/pages/Dashboard.tsx
--read frontend/src/pages/Accounts.tsx
--read frontend/src/pages/Transactions.tsx
--read frontend/src/pages/Analytics.tsx
--read frontend/src/pages/Chat.tsx
--read frontend/src/pages/Settings.tsx
--read frontend/src/pages/ImportPage.tsx

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
