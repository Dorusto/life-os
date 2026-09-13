# Task: Write Majordom Invest — User Guide: Settings

## Source app or repo path
tools/investment-manager

## Target doc file(s)
`../../docs-site/src/content/docs/invest/user-guide/settings.md` — relative to
`tools/investment-manager/`. Launch Aider from `tools/investment-manager/`.

## Context
The Invest Settings screen is small: a benchmark ticker, an assumed annual return, and the market-data
API key.

## Goal
A reader can set the benchmark and the assumed return, and knows how the API key behaves.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| frontend/src/pages/Settings.tsx | The whole screen: performance form, market-data form, configured indicator |
| frontend/src/lib/api.ts | `getSettings`, `updateSettings` |
| app/market_data.py | How the key is used and the daily cache behaviour |
| .env.example | `TWELVE_DATA_API_KEY` and the other service variables |

## Content required
- The Performance card: benchmark ticker (with the hint about a broad index or ETF) and the assumed
  annual return percentage (with the hint about when it is used).
- The Save settings button and the saved/error feedback.
- The Market data card: the Twelve Data API key field, and the important note that it is write-only —
  saving a new key replaces the stored one and the value is never shown again.
- The configured / not-configured indicator and what each state means for prices and totals.
- A short note on the daily refresh and stale-cache behaviour.
- A note that the key can also be set as a server-side environment variable.

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
--file ../../docs-site/src/content/docs/invest/user-guide/settings.md
--read frontend/src/pages/Settings.tsx
--read frontend/src/lib/api.ts
--read app/market_data.py
--read .env.example

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
