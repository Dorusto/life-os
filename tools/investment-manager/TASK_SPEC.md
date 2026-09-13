# Task: Write Majordom Invest — User Guide: Rebalancing

## Source app or repo path
tools/investment-manager

## Target doc file(s)
`../../docs-site/src/content/docs/invest/user-guide/rebalancing.md` — relative to
`tools/investment-manager/`. Launch Aider from `tools/investment-manager/`.

## Context
The Rebalancing screen is where you set target weights and see the trade that would close each gap.

## Goal
A reader can set targets that sum to 100%, read the drift table, and understand the suggested-trade
formula.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| frontend/src/pages/Rebalancing.tsx | The whole screen: target editor, sum check, drift table, footnote |
| frontend/src/components/Form.tsx | The `TextInput` used by the target rows |
| frontend/src/lib/api.ts | `getTargetAllocation`, `setTargetAllocation`, `getRebalancing` |
| app/stats.py | How drift and the suggested trade are computed |

## Content required
- The summary tiles: portfolio value, targets total (with the "should sum to 100%" hint), tracked
  targets, drifted positions.
- The target weights editor: adding a row, the ticker-or-asset-type key with its suggestions, the
  percentage field, removing a row, and Save targets.
- The 100% rule and what the UI does when the sum is off.
- The drift table columns: target, target %, current %, current value, target value, suggested trade.
- The suggested-trade cell: "Buy …", "Sell …", or "On target" (and the threshold below which it says
  "On target").
- The footnote explaining the formula and the matching rule (ticker first, then asset type).
- The empty state when no targets are set.

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
--file ../../docs-site/src/content/docs/invest/user-guide/rebalancing.md
--read frontend/src/pages/Rebalancing.tsx
--read frontend/src/components/Form.tsx
--read frontend/src/lib/api.ts
--read app/stats.py

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
