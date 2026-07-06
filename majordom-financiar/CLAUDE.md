# Majordom — Claude Code Guide

Self-hosted personal AI finance assistant. Web PWA + FastAPI + Actual Budget + local/cloud LLM.

---

## Start of session

```
1. Read docs/INDEX.md → find what to read for this task type
2. Run: gh issue list
3. Ask what we're working on if not specified
```

---

## Task type → what to read

| Task | Read |
|------|------|
| Bug in backend/api/ or core/ | `docs/architecture.md#critical-technical-rules` + `docs/sessions/` (grep topic) |
| New feature | `docs/roadmap.md` (current milestone) + GitHub labels for issue priority (`#priority-tracking` below) + `docs/architecture.md#main-flows` |
| Refactor | `docs/decisions.md` + `docs/architecture.md` |
| Chat / tool calling | `docs/learn/10-chat-tools.md` + `docs/architecture.md#critical-technical-rules` |
| CSV import | `docs/learn/07-csv-import.md` |
| Actual Budget integration | `docs/learn/04-actual-budget.md` + `docs/architecture.md#critical-technical-rules` |
| Account structure / create_account | `PRIVATE_context.md` |

---

## Critical rules (never break)

Full details in `docs/architecture.md`. Summary:

1. **No financial data in SQLite** — Actual Budget is the source of truth
2. **actualpy order:** `download_budget()` first → operations → `commit()` last
3. **actualpy amounts in EUR** (float), not cents — `create_transaction(amount=45.99)` ✓
4. **Config from settings singleton** — never `os.environ` directly
5. **All write tools → confirmation card** — add to `_PROPOSAL_TOOLS` in `backend/api/chat.py`; card fields must be **editable** (input/select), never static text — user must be able to correct any value before confirming
6. **`think: false`** in Ollama payload for qwen3/qwen3.5 models
7. **`json.loads(args)`** before `**args` for tool calls — OpenAI format returns args as string
8. **`LLM_BASE_URL` without `/v1`** — code appends `/v1/chat/completions` automatically

---

## New dev machine setup

Cloning the repo is not enough on its own — these don't come with `git clone`:

1. **Git auth** — this repo is cloned over HTTPS; the stored credential is per-machine. Run `gh auth login` (or add a fresh token) before the first push from a new machine.
2. **`.env`** — gitignored, never in the repo. Copy `.env.example` → `.env` and fill in credentials (full list in `DEPLOY.md#environment-variable-reference`). For a second dev stack, generate fresh test values rather than copying real ones.
3. **Docker & Docker Compose** — required to run the local stack (`docker compose up -d`). Same `docker-compose.yml` as production — use fixture/test data on a dev machine, and never point `ACTUAL_BUDGET_URL` at the LXC.
4. **Ollama or remote LLM** — either start with `--profile ollama-local` on the new machine, or point `LLM_BASE_URL` at an existing Ollama server reachable over Tailscale.
5. **Local-only files don't transfer** — `.claude/settings.local.json`, and `PLANNING.md` / `PRIVATE_context.md` if they exist, are gitignored. Copy them manually if their content matters on the new machine.

Full deployment steps (LXC / plain Docker / Coolify): see `DEPLOY.md`.

---

## Second Brain sync

La finalizarea oricărui milestone (M complet sau feature major), actualizează **ambele** locații:
1. `docs/roadmap.md` — statusul featurei (✅ / 🔄 / 🔲)
2. `/home/doru/Sync/Obsidian/Second_Brain/10_PROJECTS/10_Life_OS/CLAUDE.md` — secțiunea "Status Majordom"

Fără acest pas, Second Brain rămâne out of sync și sesiunile de strategie YouTube/Business lucrează pe date false.

---

## Priority tracking

**Rule (2026-07-03, do not violate):** issue priority/status lives ONLY on GitHub — never in a hand-maintained markdown file. Two separate incidents the same day (`docs/roadmap.md`'s milestone table and `docs/backlog.md` both independently tracking #41/#42/#138's status and disagreeing; before that, the root `CLAUDE.md` "Current priorities" list drifting from reality for weeks) are why: any doc that duplicates what an issue's own state already says WILL go stale, because nothing forces the two to update together.

**Mechanism:**
- **GitHub Milestones** — big phases (M0-M6, matching `docs/roadmap.md`'s themes). Assign an issue to a milestone when it maps to a specific roadmap phase.
- **GitHub Labels** — tactical priority: `tier-2`, `tier-3` (ready to pick up, by effort), `intelligence-cluster` (proactive budget intelligence, medium priority, after standard functionality), `deferred-local-first` (blocked on switching back to local LLM), `deferred-opportunistic` (not scheduled).

**Query examples:**
```
gh issue list --label tier-2
gh issue list --label intelligence-cluster
gh issue list --milestone "M4 — Smart Alerts"
```

**What CAN live in docs:**
- Narrative that doesn't fit a label — sequencing rationale, "why these are grouped" — goes in the issue's own body/comments, not a separate tracking table.
- `docs/roadmap.md` stays narrative-only: milestone themes, what "done" looks like. No per-item status tables for anything with a live GitHub issue — link to the issue instead (see 4.5/4.7/5.7/5.9/6.1 in the M4/M5/M6 tables for the pattern).
- `docs/feature-ideas.md` is for ideas that AREN'T issues yet. The moment one becomes actionable, open an issue (with the right label/milestone) and remove it from that list.

**Before adding any new priority/status list to a doc:** stop — it almost certainly belongs as a GitHub label or milestone instead.

---

## Duplication & dead-code prevention

**Rule (2026-07-03, do not violate):** when a new flow replaces an old one, delete the old one in the *same task* — not later, not "once things settle." The #93 audit found 4 dead PWA endpoints (`/api/stats`, `/api/budget`, `/api/accounts/goals`, `/api/stats/fire`) that `/api/home` had fully superseded, and 3 near-identical calculation loops copy-pasted across `get_monthly_stats`/`get_budget_status`/`get_home_data` in `client.py`. This wasn't just clutter: one copy (`get_home_data`) silently gained a rollover-aware budget-balance fix that the other two never received, so the chat tool and the Home screen showed different numbers for the same category with no error anywhere to reveal it. See `docs/decisions.md#93-code-audit` and `docs/architecture.md` rule 20.

**Mechanism:**
- **Retiring a flow = deleting it now.** If a new endpoint/tool/screen replaces an old one, remove the old endpoint, its frontend wrapper, and any now-unused model in the same PR. "Leave it in case something still calls it" — check first (grep), don't guess.
- **Before writing a loop over transactions/categories/budgets, check `backend/core/actual_client/client.py` for an existing shared helper** (`_compute_monthly_totals`, `_compute_budget_vs_spent`, `_tombstoned_category_remap` — architecture.md rule 20). If it doesn't cover the new need, extend it — don't copy-paste and let the copies diverge.
- **Extract at the second occurrence, not before and not later.** Don't build a helper speculatively for a hypothetical future need — that guesses the wrong shape before a real second use case exists, and contradicts the root `CLAUDE.md`'s "no speculative code" rule. But the moment you're about to write a *second* copy of a loop/calculation that already exists elsewhere, extract right then — don't wait for a third occurrence or a future audit to catch it. Two occurrences copy-pasted and left alone is exactly how #93's divergence bug happened.
- **DeepSeek prompts for any finance-calculation feature must name the relevant shared helper(s) in "Relevant files"** and say "reuse, don't reimplement" — the helper itself is the spec, per the step-8 "spec not code" rule below.
- **Trust the existing audit triggers already in `docs/roadmap.md`** (10+ new features since the last audit / same bug appearing in multiple places / one change touching many files) and open a new audit issue the moment one fires — don't wait for it to compound into a bigger cleanup later.

---

## Known process gaps (identified 2026-07-04)

Found during an external review of `architecture.md`/`decisions.md` for a course-curriculum project. Reviewed against established practices (ADRs, SRE runbooks, fitness functions) on 2026-07-04 — 3 of 5 fixed same day, 1 given a deliberately light mitigation, 1 left open by choice (see reasoning per item). Full comparison + reasoning: `docs/sessions/` (grep "process gaps").

1. **No regression tests for documented silent-failure gotchas** — **left open, by choice.** `architecture.md` rules 12, 14, 15, 17, 21, 22 all document bugs that failed silently. Writing automated regression tests for each was judged not worth the overhead for a single-user app (same reasoning as decision `#96`). Light mitigation instead: any newly-documented silent-failure gotcha should get a tracked GitHub issue (not a new doc), so it's at least visible/queryable, not purely "hope someone reads the rule."
2. **Architecture audits triggered by symptom, not schedule** — **mitigated, light.** A monthly scheduled check (see the `schedule` skill setup, 2026-07-04) reviews the existing audit triggers in `docs/roadmap.md` and opens a GitHub issue only if one actually fires — doesn't force an audit, just stops the trigger from being missed silently.
3. **`architecture.md` mixed stable design rules with operational/deploy quirks** — **fixed 2026-07-04.** Rules 18-19 (Docker backup, `--build` vs `restart`) tagged inline with `🔧 RUNBOOK` rather than physically moved — a physical split would have orphaned ~15 existing cross-references to those rule numbers in `decisions.md` and `docs/sessions/`. New ops-only rules should get the same tag going forward.
4. **`decisions.md` entries accumulated retroactive updates inline** — **fixed 2026-07-04.** Added an explicit ADR-style immutability rule to the top of `decisions.md`: entries are never edited after the fact, only superseded by a new entry with a one-line marker. Existing violations (e.g. "Sure adoption") are left as-is — rewriting old entries to fit the new rule would itself violate the new rule.
5. **Pre-implementation research had a blind spot mid-implementation** — **fixed 2026-07-04.** "Before any implementation" (below) now states explicitly: if implementation reveals something unexpected, stop and re-verify before continuing — not just a one-time gate before writing code.

---

## Collaboration rules

**Claude = senior/architect:** reads code, designs solution, writes spec and DeepSeek prompt.
**DeepSeek = engineer:** receives prompt, implements. Saves prompts in `scripts/prompts/deepseek/NNN_desc.md`.

- Delegate to DeepSeek only when you save tokens overall (implementation + verification). Simple tasks with expensive verification → implement directly. Complex but well-defined tasks with fast verification → DeepSeek.
- If a task touches >2 tightly coupled frontend files or depends on non-obvious conventions (auth pattern, card structure, Pydantic field names) → implement directly. Verification cost exceeds the gain.
- When unsure about a bug cause — ask, don't assume and don't implement.
- Involve the user — explain what you found, ask for confirmation before implementing.
- New feature session: present plan in 3-5 lines, ask if ok, implement only after explicit confirmation.
- **One feature at a time.**
- **Architecture trade-offs before implementation:** when a feature has meaningful variants (1 generic tool vs N specific tools, library vs pure code, single endpoint vs multiple), present the trade-offs in 2-3 lines and get confirmation BEFORE writing the DeepSeek prompt or any code. Never discover the simpler approach existed after the fact.
- **No auto-memory:** do not save notes to `~/.claude/projects/.../memory/`. Save feedback and decisions in this file or in `docs/decisions.md`.

### Before any implementation (mandatory — Claude or DeepSeek)

**Applies before opening a new GitHub issue too, not just before writing code.** Step 5 (`docs/decisions.md`) especially — #155 was opened as a new "goal proposal" issue without checking decisions.md first, duplicating #110/#111 (which already reframed and split the same idea three days earlier). Cross-check `gh issue list` for existing coverage before creating one.

1. Identify all files the task will touch
2. Consult the "Task type → what to read" table above and read the relevant `docs/learn/` file
3. Grep `docs/sessions/` for recent work on the same files — catches gotchas not yet in architecture.md:
   `grep -rl "filename" docs/sessions/`
4. Check `docs/architecture.md#critical-technical-rules` for rules relevant to those files
5. Check `docs/decisions.md` for relevant decisions
6. If the task involves a loop over transactions/categories/budgets, check whether an existing shared helper in `backend/core/actual_client/client.py` already covers it (see architecture.md rule 20) — extend it instead of writing a new copy

**This check isn't a one-time gate — repeat it mid-implementation.** If the code reveals something unexpected (a mechanism that already half-exists, a structure different from what the pre-implementation check assumed) — stop and re-verify before continuing, don't push through on the original assumption. #99 found the requested mechanism already half-built *mid-implementation*; the pre-implementation check alone hadn't caught it beforehand.

### Additionally, if delegating to DeepSeek

6. Include found rules EXPLICITLY in the prompt under `## Critical Rules` — DeepSeek does not read other files
7. If no rules apply, write: `No specific rules identified for this task.` (proves the step was done, not skipped)
8. **Spec, not code.** Before writing any code block in the prompt, ask: "Can DeepSeek figure this out from a prose spec?" If yes → write prose. Code only for non-obvious quirks (library syntax, wrong field names, operation order). If you find yourself writing a full function → stop and replace with a sentence.

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

**Known gotchas (check relevance before each prompt):**
- `_PROPOSAL_TOOLS` in `backend/api/chat.py` — every write tool must be listed here or the card never renders in frontend
- actualpy in executor: `download_budget()` first → operations → `commit()` last, all inside `def _get(): with self._get_actual() as actual:`
- Frontend auth: use `authFetch()` from `../lib/auth` or `getToken()` — never `localStorage.getItem('auth_token')`, the real key is `'majordom_token'`
- Tool call args: `json.loads(args)` before `**args` — OpenAI format returns args as string, not dict
- `LLM_BASE_URL` must NOT end with `/v1` — code appends `/v1/chat/completions` automatically
- New `ActualBudgetClient` method (`backend/core/actual_client/client.py`) isn't reachable from tool code until it's also added to `ActualBudgetProvider` (`backend/core/finance/actual_budget_provider.py`, a thin pass-through) and declared on the `FinanceProvider` Protocol (`backend/core/finance/provider.py`) — all three, or `get_provider()`'s result raises `AttributeError` (#126)
- **Any flow where the user confirms a merchant→category (or payee→transfer) association → use Actual Budget's native Rules engine, never a new SQLite table.** `client.py` already has `create_payee_rule()`, `create_payee_notes_rule()`, and the transfer-payee mechanism (`create_transfer()`, `Payees.transfer_acct`) — built on `actualpy`'s `Rule`/`Condition`/`Action`/`create_rule`. Already wired into `propose_transaction` (`backend/api/proposals.py`, `create_rule` checkbox) and `propose_categorize_with_rule` (`backend/api/category_actions.py`). Before adding a new confirm flow, check these first — don't reinvent a mapping table (#99 removed `merchant_mappings` for exactly this reason, see `docs/decisions.md#93-code-audit`). Any flow that lets the user pick/confirm a category gets an explicit "save as rule" checkbox — never silent/automatic bulk rule creation (decided for CSV import specifically because the old SQLite-based auto-learn had no opt-out and no visibility; a checkbox matches the pattern already used everywhere else).
- **`vehicle-manager` is optional since 2026-07-05** (`docker compose --profile vehicle-manager up -d`, see `docs/decisions.md#vehicle-manager-optional-profile`) — `majordom-api` has no `depends_on` on it and no code assumes it's reachable. Any new vehicle-related tool/endpoint must handle it being down gracefully (clear error, not a crash) — don't add a hard dependency back.

---

## Commit & push rules

- **Commit only after user verifies and confirms it works**
- **Push to GitHub only when user explicitly asks**
- **After pushing a backend/frontend fix, also rebuild the affected service(s) in the local `docker-compose` stack on this dev machine** (`docker compose build <service> && docker compose up -d <service>`) — the user tests locally (`localhost:5006` for Actual Budget, local chat) instead of waiting on the LXC deploy round-trip each time. Established 2026-07-04 after discovering this dev machine runs its own full local copy of the stack (separate Tailscale host from the LXC, same docker-compose.yml) with direct Docker access from this environment. **This local stack's data is test/fixture data, not real financial data** (the LXC is the only real-data environment) — but don't infer that from how the data looks (test fixtures are deliberately realistic). If unsure, check `.env`'s `ACTUAL_BUDGET_URL` — it must point to the local `actual-budget` container (`http://actual-budget:5006`), never an LXC/remote host.
- All code, comments, commit messages, GitHub issues = **English**
- Discussions with Claude = Romanian

---

## End-of-task protocol

When user confirms something works:

**If task was implemented by Claude directly — self-check before commit:**
1. Re-read the rules found in the pre-implementation steps (architecture.md + decisions.md + sessions/)
2. Verify each rule was applied in the written code — check explicitly, not by assumption
3. If a rule was missed: fix before proceeding

**If task was implemented by DeepSeek — audit diff first (before commit):**
1. Re-read `## Critical Rules` from the DeepSeek prompt
2. Verify each rule was respected in the diff — check explicitly, not by assumption
3. If a rule was violated: fix directly or send back to DeepSeek with the specific observation
4. Only after audit passes → proceed to commit

**Always — do NOT report task as done until all steps below are checked:**
1. Commit with correct timestamp
2. Close GitHub issue: `gh issue list` → find relevant open issue → `gh issue close NNN -c "message"`
3. Update `docs/roadmap.md` if it's a milestone item (mark ✅ done); closing the GitHub issue already updates its priority tracking (label/milestone) automatically — no separate doc to touch. If feature has a spec in `docs/specs/`, update it too
4. Add entry to `docs/sessions/YYYY-WNN.md` (current week's file)
5. Update `docs/sessions/INDEX.md` — add row for the session
6. Check if docs need updating:
   - New technical pattern or unexpected quirk found → add to `docs/architecture.md#critical-technical-rules`
   - Design decision made during session → add to `docs/decisions.md`
   - Rule already documented → no action
7. Fix any outdated notes in this file (CLAUDE.md)

**Sessions log format** (`docs/sessions/YYYY-WNN.md`):
```markdown
## YYYY-MM-DD — short title
### Resolved
### Files modified
### Lessons
### Unresolved
```

If a lesson from this session deserves a detailed explanation with analogies/diagrams (not just a bullet point), add it to `docs/learn/` as a new file or section in an existing one. Sessions log = what happened. Learn/ = how things work.

---

## Current model

- Chat: `deepseek/deepseek-chat` via OpenRouter
- Vision: `google/gemini-2.5-flash-lite` via OpenRouter
- Local Ollama fallback: `qwen3.5:9b` (vision + chat, ~4 min on CPU-only LXC)

---

## Key references

- `docs/architecture.md` — technical rules + flows + project structure
- `docs/decisions.md` — why things are the way they are
- `docs/roadmap.md` — milestones · GitHub Labels/Milestones — issue-level priority (`#priority-tracking` above)
- `docs/feature-ideas.md` — raw ideas not yet turned into issues
- `docs/sessions/INDEX.md` — what was built and when
- `PRIVATE_context.md` — account names, vehicle profiles (gitignored)
