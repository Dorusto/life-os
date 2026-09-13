# Task: Write Majordom Invest — User Guide: Goals

## Source app or repo path
tools/investment-manager

## Target doc file(s)
`../../docs-site/src/content/docs/invest/user-guide/goals.md` — relative to
`tools/investment-manager/`. Launch Aider from `tools/investment-manager/`.

## Context
The Goals screen projects the portfolio toward a target value and date, and says whether the current
pace reaches it.

## Goal
A reader can add a goal, read its projection card, and understand which rate the projection used.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| frontend/src/pages/Goals.tsx | The whole screen: goal cards, projection figures, chart, delete |
| frontend/src/components/GoalModal.tsx | The add-goal form |
| frontend/src/components/LineChart.tsx | The projection chart with its target baseline |
| frontend/src/lib/api.ts | `getGoals`, `getGoalProjection`, `deleteGoal` |
| app/stats.py | The projection maths and the rate-source choice |

## Content required
- The "Add goal" action and the add-goal form fields.
- The goal card: the on-track / behind-target pill, the target amount and date.
- The four figures: current value, projected value, rate used, and surplus or shortfall.
- The projection chart and the dashed target line.
- The footnote explaining the two rate sources: this portfolio's own historical XIRR, or the assumed
  annual return from Settings.
- The delete confirmation and what it does and does not remove.
- The empty state.

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
--file ../../docs-site/src/content/docs/invest/user-guide/goals.md
--read frontend/src/pages/Goals.tsx
--read frontend/src/components/GoalModal.tsx
--read frontend/src/components/LineChart.tsx
--read frontend/src/lib/api.ts
--read app/stats.py

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
