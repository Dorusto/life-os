# Task: Write Majordom Invest — Reference page

## Source app or repo path
tools/investment-manager

## Target doc file(s)
`../../docs-site/src/content/docs/invest/reference/index.md` — relative to
`tools/investment-manager/`. Launch Aider from `tools/investment-manager/`.

## Context
The FAQ + glossary page for the Invest docs.

## Goal
A reader can look up a term or a common question without re-reading the whole section.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| README.md | Scope, notes on cost basis and market data |
| docs/standalone-app-plan.md | Data model and API contract |
| app/stats.py | The metric definitions |
| frontend/DESIGN.md | The design vocabulary (statement rule, series colours) |
| frontend/src/pages/Settings.tsx | The settings that exist |

## Content required
- **FAQ**, short question/answer entries, at least:
  - Where is my portfolio data stored? (This app's own database, not Actual Budget.)
  - Why is my portfolio value blank? (No market-data key, or no prices fetched yet.)
  - Why does a price look stale? (Prices refresh at most once a day and stale values are served.)
  - What is the difference between XIRR and TWR? (Money-weighted vs time-weighted.)
  - Why is my cost basis different from my broker's? (Average cost, not FIFO — a tracking figure.)
  - How do I add a security? (Add security on the Transactions screen.)
  - Can I import from my broker? (Yes — the XTB import.)
  - Does Majordom Finance see this data? (Yes, over REST, for coaching and notifications.)
  - How do I change the theme? (The toggle in the nav rail footer.)
- **Glossary**, a table of terms used across the Invest docs: security, ticker, asset type, holding,
  open / closed position, cost basis, average cost, market value, unrealized gain, realized gain,
  XIRR, TWR, benchmark, allocation, weight, drift, target weight, suggested trade, goal projection,
  assumed annual return, base currency, FX rate, stale price, statement rule.
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
--file ../../docs-site/src/content/docs/invest/reference/index.md
--read README.md
--read docs/standalone-app-plan.md
--read app/stats.py
--read frontend/DESIGN.md
--read frontend/src/pages/Settings.tsx

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
