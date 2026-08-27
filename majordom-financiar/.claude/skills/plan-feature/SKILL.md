---
name: plan-feature
description: Runs the mandatory pre-implementation checklist for majordom-financiar — identify touched files, check docs/learn, grep docs/sessions/ for gotchas, check architecture.md and decisions.md, check for an existing shared helper in client.py, then (if delegating) write a DeepSeek prompt from the template. Use this at the start of any new feature, bug fix, or refactor in this repo, before touching code, and before opening a new GitHub issue. Invoke explicitly as /plan-feature.
---

# Plan Feature — pre-implementation checklist for Majordom

Formalizes the step that used to live as prose in `CLAUDE.md` under "Before any implementation." Run this before writing any code, and before opening a new GitHub issue (issue-duplication check is step 5).

Whether to delegate the resulting plan to DeepSeek at all is decided by the "Collaboration rules" section in `CLAUDE.md` (token-cost trade-off, >2 coupled files, non-obvious conventions) — this skill assumes that decision is either already made or about to be made in step 7 below.

## 1 — Identify all files the task will touch

## 2 — Consult the "Task type → what to read" table in `CLAUDE.md`
Read the relevant `docs/learn/` file for the task type.

## 3 — Grep `docs/sessions/` for recent work on the same files
Catches gotchas not yet promoted into `architecture.md`:
```
grep -rl "filename" docs/sessions/
```

## 4 — Check `docs/architecture.md#critical-technical-rules`
For rules relevant to the identified files.

## 5 — Check `docs/decisions.md`
Also cross-check `gh issue list` for existing coverage before opening a new issue — #155 was opened as a new "goal proposal" without this check, duplicating #110/#111 which had already reframed the same idea three days earlier.

## 6 — Check for an existing shared helper
If the task involves a loop over transactions/categories/budgets, check whether `backend/core/actual_client/client.py` already covers it (`_compute_monthly_totals`, `_compute_budget_vs_spent`, `_tombstoned_category_remap` — architecture.md rule 20). Extend it instead of writing a new copy.

## Not a one-time gate

Repeat this check mid-implementation. If the code reveals something unexpected — a mechanism that already half-exists, a structure different from what the pre-implementation check assumed — stop and re-verify before continuing. Don't push through on the original assumption. #99 found the requested mechanism already half-built *mid-implementation*; the pre-implementation check alone hadn't caught it beforehand.

## 7 — Architecture trade-offs, before writing a DeepSeek prompt or any code

If the feature has meaningful variants (1 generic tool vs N specific tools, library vs pure code, single endpoint vs multiple), present the trade-offs in 2-3 lines and get confirmation before proceeding. Never discover the simpler approach existed after the fact.

## 8 — If delegating to DeepSeek

8a. Include every rule found in steps 1-6 EXPLICITLY in the prompt under `## Critical Rules` — DeepSeek does not read other files.
8b. If no rules apply, write: `No specific rules identified for this task.` (proves the step was done, not skipped.)
8c. **Spec, not code.** Before writing any code block in the prompt, ask: "Can DeepSeek figure this out from a prose spec?" If yes → write prose. Code only for non-obvious quirks (library syntax, wrong field names, operation order). If you find yourself writing a full function → stop and replace with a sentence.

Save the prompt to `scripts/prompts/deepseek/NNN_desc.md`, using the template below. Once saved, stop — Doru runs it in DeepSeek himself; that's the default handoff, not a choice to re-confirm each time.

### DeepSeek prompt template

```markdown
# Task: <short title>

## Context
<1-2 sentences: what problem, why now>

## Goal
<what the user can do after this — user perspective>

## Relevant files
| File | What it contains |
|------|-----------------|
| path/to/file.py | brief description |

## Changes required
### 1. `path/to/file.py`
<bullet points per file; inline code ONLY for gotchas and non-obvious snippets>

## Critical Rules
<!-- Extracted from architecture.md + decisions.md for the files above -->
- <rule> (source: architecture.md#section)
- <rule> (source: decisions.md#section)
<!-- If none apply: "No specific rules identified for this task." -->

## Gotchas
<!-- Code conventions DeepSeek cannot deduce from reading the files -->
1. <quirk with inline example if needed>

## Do NOT touch
- <file or logic that must remain unchanged>

## Done when
- <verifiable acceptance criterion>
```

### Known gotchas (check relevance before each prompt)

- `_PROPOSAL_TOOLS` in `backend/api/chat.py` — every write tool must be listed here or the card never renders in frontend
- **Every new tool needs an explicit bullet + example in `_build_system_prompt()`'s tool-guide section (`backend/api/chat.py`) — not just schema registration.** A tool with no bullet is unreliable: confirmed root cause of #160 (silently skipped, LLM hallucinates an answer instead) and #166 (worse — the model emitted its raw internal function-call tokens, e.g. `tool_sep`, as literal chat text instead of a structured call, because nothing steered it toward using the tool confidently). Bit twice now — always add the bullet in the same DeepSeek prompt/commit that registers the tool, never as a follow-up. Also keep the tool's own JSON `description` field terse (one short paragraph) — examples belong in the system-prompt bullet, not stacked into the description too (#166's first draft had 4 quoted examples crammed into the description, which didn't help and may have made the format-following worse).
- actualpy in executor: `download_budget()` first → operations → `commit()` last, all inside `def _get(): with self._get_actual() as actual:`
- Frontend auth: use `authFetch()` from `../lib/auth` or `getToken()` — never `localStorage.getItem('auth_token')`, the real key is `'majordom_token'`
- Tool call args: `json.loads(args)` before `**args` — OpenAI format returns args as string, not dict
- `LLM_BASE_URL` must NOT end with `/v1` — code appends `/v1/chat/completions` automatically
- New `ActualBudgetClient` method (`backend/core/actual_client/client.py`) isn't reachable from tool code until it's also added to `ActualBudgetProvider` (`backend/core/finance/actual_budget_provider.py`, a thin pass-through) and declared on the `FinanceProvider` Protocol (`backend/core/finance/provider.py`) — all three, or `get_provider()`'s result raises `AttributeError` (#126)
- **Any flow where the user confirms a merchant→category (or payee→transfer) association → use Actual Budget's native Rules engine, never a new SQLite table.** `client.py` already has `create_payee_rule()`, `create_payee_notes_rule()`, and the transfer-payee mechanism (`create_transfer()`, `Payees.transfer_acct`) — built on `actualpy`'s `Rule`/`Condition`/`Action`/`create_rule`. Already wired into `propose_transaction` (`backend/api/proposals.py`, `create_rule` checkbox) and `propose_categorize_with_rule` (`backend/api/category_actions.py`). Before adding a new confirm flow, check these first — don't reinvent a mapping table (#99 removed `merchant_mappings` for exactly this reason, see `docs/decisions.md#93-code-audit`). Any flow that lets the user pick/confirm a category gets an explicit "save as rule" checkbox — never silent/automatic bulk rule creation (decided for CSV import specifically because the old SQLite-based auto-learn had no opt-out and no visibility; a checkbox matches the pattern already used everywhere else).
- **`vehicle-manager` is optional since 2026-07-05** (`docker compose --profile vehicle-manager up -d`, see `docs/decisions.md#vehicle-manager-optional-profile`) — `majordom-api` has no `depends_on` on it and no code assumes it's reachable. Any new vehicle-related tool/endpoint must handle it being down gracefully (clear error, not a crash) — don't add a hard dependency back.
- **"Coach, not consultant" for any `intelligence-cluster` issue (FIRE/Portfolio Independence, Expense Coverage, budget calibration, goal proposals)** — see `docs/decisions.md#coach-not-consultant--principle-for-the-intelligence-module`. Numeric assumptions used in a projection (return rate, inflation, retirement age) are always user-editable inputs, never silently computed or presented as advice/predictions about specific investments. A shown default may be seeded from the user's own historical data, never a forward-looking claim about specific ETFs/securities.
