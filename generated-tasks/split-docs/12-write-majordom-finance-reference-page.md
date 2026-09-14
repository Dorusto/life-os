# Task: Write Majordom Finance — Reference page

## Source app / repo path
majordom-financiar

## Target doc file(s)
`../docs-site/src/content/docs/finance/reference/index.md` — relative to `majordom-financiar/`.
Launch Aider from `majordom-financiar/`.

## Context
The FAQ + glossary page for the Finance docs: short answers to the questions the other pages raise,
and a single place where every Finance-specific term is defined.

## Goal
A reader can look up a term or a common question without re-reading the whole section.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| README.md | Feature table, categories list, troubleshooting, tech stack |
| docs/product-plan.md | Product statement, what the app deliberately does not do |
| docs/architecture.md | Internal terms and rules |
| frontend/src/pages/Settings.tsx | Which settings are real vs placeholders |
| frontend/src/pages/Chat.tsx | Card types and the confirm model |

## Content required
- **FAQ**, short question/answer entries, at least:
  - Where is my data stored? (Actual Budget is the source of truth.)
  - Do I need to learn Actual Budget? (No — but you can open it; link to the port.)
  - Why does Actual Budget show a "Fatal Error: SharedArrayBuffer"? (Secure context.)
  - Why is a transaction uncategorized? (Nothing has categorised it yet; use the Uncategorized chip
    or ask in chat.)
  - What happens if I import the same CSV twice? (Duplicates are detected and skipped.)
  - Why does a widget say "coming soon" or "not built"? (It is a deliberate placeholder.)
  - Can I use a cloud LLM instead of the local model? (Yes — see Self-Hosting.)
  - How do I change the theme? (Dark only today.)
  - How do I get a daily summary? (Enable push notifications; the digest is always on.)
- **Glossary**, a table of terms used across the Finance docs: Actual Budget, on-budget / off-budget,
  category group, payee, schedule, transfer, duplicate / near-duplicate, budget period, goal, FIRE,
  expense coverage, net worth, proposal card, clarification card, status line, sync ID.
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
--file ../docs-site/src/content/docs/finance/reference/index.md
--read README.md
--read docs/product-plan.md
--read docs/architecture.md
--read frontend/src/pages/Settings.tsx

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
