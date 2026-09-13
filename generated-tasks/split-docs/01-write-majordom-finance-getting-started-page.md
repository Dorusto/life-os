# Task: Write Majordom Finance — Getting Started page

## Source app / repo path
majordom-financiar

## Target doc file(s)
`../docs-site/src/content/docs/finance/getting-started/index.md` — relative to `majordom-financiar/`.
Launch Aider from `majordom-financiar/`; the `../` prefix reaches the sibling `docs-site/` folder at
the monorepo root. All `--read` paths below are relative to `majordom-financiar/`.

## Context
The entry point for the Finance docs: what Majordom Finance is, how it relates to Actual Budget, and
how a user actually opens and starts using it.

## Goal
A reader understands that Majordom Finance is a conversational layer over Actual Budget, knows which
URL/port to open, and knows what happens on first launch.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| README.md | Product positioning, install steps, ports, feature table, prerequisites |
| .env.example | `WEB_PORT`, Actual Budget vars, LLM provider vars, optional service vars |
| frontend/src/pages/Chat.tsx | First-run setup flow (`getSetupStatus` → `SetupBalancesCard`) |
| frontend/src/pages/Dashboard.tsx | Empty-state "Let's get started" card for a brand-new install |
| docs/product-plan.md | Product statement, what the app is for, what it deliberately is not |

## Content required
- One paragraph: what Majordom Finance is — a conversational intelligence layer over Actual Budget;
  you talk to it, it does the rest.
- Where the data lives: Actual Budget is the source of truth for accounts, categories and
  transactions; Majordom Finance reads and writes through it. State this plainly.
- How to open it: web UI on the configured `WEB_PORT` (default 3000); Actual Budget itself on 5006.
  Include the secure-context caveat for Actual Budget (https or localhost, otherwise use an SSH
  tunnel) — it is a real first-run blocker.
- First run: log in with the credentials from `.env`; the Chat tab detects an unconfigured budget and
  shows the balance-entry card; the Dashboard shows a "Let's get started" card when there are no
  accounts yet.
- The main tabs in one short list: Dashboard, Accounts, Transactions, Analytics, Chat, plus Settings.
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
--file ../docs-site/src/content/docs/finance/getting-started/index.md
--read README.md
--read .env.example
--read frontend/src/pages/Chat.tsx
--read frontend/src/pages/Dashboard.tsx
--read docs/product-plan.md

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
