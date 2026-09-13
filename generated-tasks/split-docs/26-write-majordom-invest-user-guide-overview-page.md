# Task: Write Majordom Invest — User Guide overview page

## Source app / repo path
tools/investment-manager

## Target doc file(s)
`../../docs-site/src/content/docs/invest/user-guide/index.md` — relative to
`tools/investment-manager/`. Launch Aider from `tools/investment-manager/`.

## Context
The landing page for the Invest User Guide section, which is split across Dashboard, Holdings,
Transactions, Income, Rebalancing, Goals and Settings.

## Goal
A reader can see the whole app at a glance and jump to the page for the screen they are on.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| frontend/src/pages/Dashboard.tsx | Dashboard screen |
| frontend/src/pages/Holdings.tsx | Holdings screen |
| frontend/src/pages/Transactions.tsx | Transactions screen |
| frontend/src/pages/Income.tsx | Income screen |
| frontend/src/pages/Rebalancing.tsx | Rebalancing screen |
| frontend/src/pages/Goals.tsx | Goals screen |
| frontend/src/pages/Settings.tsx | Settings screen |

## Content required
- One short paragraph: the app is a small set of screens reached from a left rail (desktop) or a
  drawer (mobile), and this section walks through each.
- A table of the screens with a one-line description and a link to the matching page in this section:
  Dashboard, Holdings, Transactions, Income, Rebalancing, Goals, Settings.
- A short note on navigation: the left rail on desktop, the top bar plus slide-over drawer on mobile,
  and the theme toggle in the rail footer.
- A short note that the Dashboard is the summary and the other screens are where you enter and
  correct data.

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
--file ../../docs-site/src/content/docs/invest/user-guide/index.md
--read frontend/src/pages/Dashboard.tsx
--read frontend/src/pages/Holdings.tsx
--read frontend/src/pages/Transactions.tsx
--read frontend/src/pages/Income.tsx
--read frontend/src/pages/Rebalancing.tsx
--read frontend/src/pages/Goals.tsx
--read frontend/src/pages/Settings.tsx

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
