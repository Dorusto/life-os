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

## 7a — Implementing directly? Fork instead of blocking the conversation

"Implement directly" (per step 7 / CLAUDE.md's collaboration rules) means Claude does the work instead of DeepSeek — it does not mean doing it inline and going silent on Doru mid-session. Once the plan is confirmed, launch a Claude Code fork (`Agent` tool, `subagent_type: "fork"`) to do the actual implementation in the background, and keep talking with Doru in the main conversation while it runs. Established 2026-08-29 after a live session where Doru asked for exactly this mid-implementation.

- The fork already has the full conversation context (the plan, the research, the file reads) — the prompt only needs to be a clear, self-contained *directive*: exact files, exact patterns/line ranges already found, critical rules already identified in steps 1-6, and a "Done when" checklist. Don't make the fork re-derive research already done in the main thread.
- Explicitly tell the fork not to commit — Doru reviews the diff and confirms it works before any commit, same as any other implementation (`CLAUDE.md`'s commit rule doesn't change just because a fork did the typing).
- This doesn't apply to a DeepSeek delegation (step 8) — that's dispatched via Aider (`delegate-by-complexity`), already async by construction (runs in its own worktree, doesn't block this conversation). It applies specifically to "implement directly" tasks, which otherwise block the whole conversation on tool-call turns until finished.
- **Does not apply to `/task-complete`.** Paused 2026-08-29 (`decisions.md#task-complete-via-fork-paused`) after a fork ran the full end-of-task checklist for a same-session, already-tested, low-risk commit at ~266k tokens / ~5 minutes — the fork's own fixed overhead defeated `task-complete`'s existing conditional-review/batching rules instead of benefiting from them. Run `/task-complete` inline in the main conversation until that's revisited.

## 8 — If delegating to DeepSeek

**Default (corrected 2026-08-29): dispatch via the `delegate-by-complexity` skill, Aider headless.** Run that skill — it handles worktree isolation, model tier selection (Flash default, Pro for Senior-tier), the actual `aider --message-file ...` launch, and the review/merge-confirmation loop. Do not write a static prompt file and stop; that was the old habit (see `decisions.md` for when/why it got corrected) and it silently resurfaced once already despite the skill existing — check for `delegate-by-complexity` explicitly before defaulting to the manual path below.

**Manual prompt-file path — fallback only**, for when Doru wants to run DeepSeek himself or Claude Code is unavailable: save to `scripts/prompts/deepseek/NNN_desc.md` using the template below, then stop — Doru runs it manually. Not the default when Claude itself is doing the delegating.

Either way, the prompt content follows the same rules:

8a. Include every rule found in steps 1-6 EXPLICITLY in the prompt under `## Critical Rules` — DeepSeek does not read other files.
8b. If no rules apply, write: `No specific rules identified for this task.` (proves the step was done, not skipped.)
8c. **Spec, not code.** Before writing any code block in the prompt, ask: "Can DeepSeek figure this out from a prose spec?" If yes → write prose. Code only for non-obvious quirks (library syntax, wrong field names, operation order). If you find yourself writing a full function → stop and replace with a sentence.
8d. Add a **Circuit breaker** clause (see `delegate-by-complexity`'s `references/prompt-template.md`) — Aider doesn't read `decisions.md`/`architecture.md` on its own, so it needs telling: stop and describe the situation rather than picking an undocumented architectural call itself.

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
- New `ActualBudgetClient` method (`backend/core/actual_client/client.py`) isn't reachable from tool code until it's also added to `ActualBudgetProvider` (`backend/core/finance/actual_budget_provider.py`, a thin pass-through) and declared on the `FinanceProvider` Protocol (`backend/core/finance/provider.py`) — all three, or `get_provider()`'s result raises `AttributeError` (#126). Checked mechanically now — run `python3 scripts/check_provider_wiring.py` after adding a method, don't just eyeball it (architecture.md rule 29).
- **Any flow where the user confirms a merchant→category (or payee→transfer) association → use Actual Budget's native Rules engine, never a new SQLite table.** `client.py` already has `create_payee_rule()`, `create_payee_notes_rule()`, and the transfer-payee mechanism (`create_transfer()`, `Payees.transfer_acct`) — built on `actualpy`'s `Rule`/`Condition`/`Action`/`create_rule`. Already wired into `propose_transaction` (`backend/api/proposals.py`, `create_rule` checkbox) and `propose_categorize_with_rule` (`backend/api/category_actions.py`). Before adding a new confirm flow, check these first — don't reinvent a mapping table (#99 removed `merchant_mappings` for exactly this reason, see `docs/decisions.md#93-code-audit`). Any flow that lets the user pick/confirm a category gets an explicit "save as rule" checkbox — never silent/automatic bulk rule creation (decided for CSV import specifically because the old SQLite-based auto-learn had no opt-out and no visibility; a checkbox matches the pattern already used everywhere else).
- **`vehicle-manager` is optional since 2026-07-05** (`docker compose --profile vehicle-manager up -d`, see `docs/decisions.md#vehicle-manager-optional-profile`) — `majordom-api` has no `depends_on` on it and no code assumes it's reachable. Any new vehicle-related tool/endpoint must handle it being down gracefully (clear error, not a crash) — don't add a hard dependency back.
- **"Coach, not consultant" for any `intelligence-cluster` issue (FIRE/Portfolio Independence, Expense Coverage, budget calibration, goal proposals)** — see `docs/decisions.md#coach-not-consultant--principle-for-the-intelligence-module`. Numeric assumptions used in a projection (return rate, inflation, retirement age) are always user-editable inputs, never silently computed or presented as advice/predictions about specific investments. A shown default may be seeded from the user's own historical data, never a forward-looking claim about specific ETFs/securities.
- **A frontend query whose endpoint deliberately returns a permanent 404 as a real answer (not an error) must override `retry: false` (and `refetchInterval: false` if the global default polls on error) at that specific `useQuery` call.** `main.tsx`'s app-wide `QueryClient` default retries every error for ~15s then polls every 5s forever, assuming the backend just hasn't finished booting yet — correct for real transient failures, wrong for an endpoint's own intentional "not configured yet" signal (#208's `value-projection` 404 for "no purchase price set" — found live: the fallback UI never rendered and the browser hammered the backend indefinitely until this was added).
- **Before assuming a new/changed field will reach the frontend once it's on the response model, verify no earlier-registered router already owns that exact `(method, path)` pair.** FastAPI silently uses the first-registered handler for a duplicate route with no error — #208 found `accounts.py`'s real `GET /accounts` (with `account_type`, since #205) had been fully shadowed and unreachable by an older, narrower `GET /accounts` in `transactions.py`, registered earlier in `main.py`'s router list. Grep the exact path string across `backend/api/*.py` before trusting that a field you just added is actually what gets served.
