# Task: Fix chat hallucinating "no savings goal configured" on follow-up questions

## Context

Issue #160. Live testing found that asking about a savings goal's balance works correctly, but a follow-up question specifically about progress toward the target ("și cât mai am de economisit până ating targetul?") gets a hallucinated wrong answer: "Din păcate, nu este configurat un obiectiv de economii pentru acest cont" — even though `ActualBudgetClient.get_goals()` confirmed correctly returns the goal for that account when called directly.

Root cause (confirmed by reading the code, not guessed): the LLM never calls `finance__get_goals_chart` for this kind of follow-up — it answers directly from its own (wrong) assumption. This is a tool-selection failure, not a data or parsing bug.

Two contributing factors, both in `backend/api/chat.py`:
1. `_build_system_prompt()` (around line 79) has an explicit instruction + few-shot example for every other tool domain (transactions, vehicle, budget rebalance, categories, etc.) but has **zero mention** of goals or `finance__get_goals_chart` anywhere in the prompt. Every other domain that reliably works has a bullet like "When the user says X → call tool Y immediately" with 1-2 literal example phrasings. Goals are the one domain missing this.
2. The tool's own description (`backend/tools/registry.py` around line 132) says "Show a visual progress chart for all savings goals" — phrased as a UI/visual action ("show a chart"), which nudges the model away from calling it for a plain follow-up question phrased as "how much is left" rather than "show me a chart".

## Decision (already made, do not revisit)

`finance__get_goals_chart` stays in `_PROPOSAL_TOOLS` (`backend/api/chat.py` line ~158) exactly as it is today — calling it renders the existing visual progress-list card, same as every other chart tool (`get_budget_overview`, `list_categories`, etc.). We are **not** adding a new plain-text-only tool for this. The fix is entirely a system-prompt fix: make the LLM reliably call the existing tool for goal-progress questions. The resulting response for a goal-progress question is the visual card (consistent with how the rest of the product already behaves for chart/report tools) — that is the intended, correct outcome, not a bug to work around.

## Goal

Asking about savings goal progress in chat — in any phrasing ("cât mai am de economisit până ating targetul", "how much left until my goal", "progres la obiectivul de economii", "am I on track for my savings goal") — reliably triggers `finance__get_goals_chart` instead of a hallucinated text answer.

## Relevant files

| File | What it contains |
|------|-----------------|
| `backend/api/chat.py` | `_build_system_prompt()` (~line 77-140) — the only file to change |

## Changes required

### 1. `backend/api/chat.py` — `_build_system_prompt()`

In the `## Finance tools` section (around line 101-116), add one bullet in the same style as the existing ones (see the `finance__get_budget_overview` and `finance__list_categories` bullets immediately above/below for the exact tone and format to match):

- Instruct: when the user asks about savings goal progress, how much more is needed to reach a target, or a goal's deadline/timeline — call `finance__get_goals_chart` immediately. Never answer that no goal is configured without calling this tool first.
- Include 2 literal example phrasings covering both English and Romanian, matching the style of the other bullets' inline examples (e.g. the `finance__propose_transaction` bullet's `"spent 50 euro at Lidl" → finance__propose_transaction(...)` pattern) — for example something like:
  - `"cât mai am de economisit până ating targetul?" → finance__get_goals_chart()`
  - `"how much left until my savings goal?" → finance__get_goals_chart()`

## Critical Rules

- Do not touch `_PROPOSAL_TOOLS`, the tool registry, or `get_goals_chart()`'s implementation — this is a prompt-text-only fix. (source: decision above, this file's "Decision" section)
- Match the existing bullet style/tone in `_build_system_prompt()` exactly — imperative instruction + 1-2 literal `"phrase" → tool_call(...)` examples, same as the surrounding bullets. (source: `backend/api/chat.py` existing content, lines ~105-116)
- Romanian discussions but English code/prompt-text is fine either way here — the system prompt already mixes example phrasings in multiple languages (see the vehicle tools section's Romanian examples at lines ~132-133), so including a Romanian example phrase is consistent with existing style, not a rule violation.

## Gotchas

1. This same missing-guidance pattern (a tool with no explicit system-prompt bullet gets skipped by the LLM) is worth double-checking doesn't also apply to any other under-documented tool while you're in this function — but only fix what's in scope for goals here; don't expand scope to other tools without flagging it back for a separate issue instead of silently changing more.

## Do NOT touch

- `finance__get_goals_chart`'s implementation (`backend/tools/finance/actual_budget.py`) — the data and chart rendering are already correct.
- `_PROPOSAL_TOOLS` set — `finance__get_goals_chart` is already correctly listed there.

## Done when

- The new bullet + examples are added to `_build_system_prompt()`.
- Manually testing in chat: asking a goal-balance question, then a goal-progress follow-up in the same conversation, both get correct answers (the second renders the goals progress card, not a hallucinated "no goal configured" text response).
