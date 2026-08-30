# Majordom — Claude Code Guide

Self-hosted personal AI finance assistant. Web PWA + FastAPI + Actual Budget + local/cloud LLM.

---

## Start of session

```
1. Read docs/INDEX.md → find what to read for this task type
2. Run: gh issue list
3. Ask what we're working on if not specified
```

> ### 🧭 Direction — read `docs/product-plan.md` before picking up anything
>
> Development had drifted into reactive work (fix what surfaced, add UI where it felt missing).
> `docs/product-plan.md` holds the product position and the phased plan that stops that. **Every
> task must answer: which phase does this serve, and what does it make Majordom notice or do on
> its own?** If the honest answer is "none, but it bothered me" → parking lot, not now.
> The position in one line: *everything else in this space stores or displays; Majordom notices.*
>
> ### ▶️ Picked-up work — Phase A, start here (set 2026-08-30, remove when done)
>
> **Decided: [#222](https://github.com/Dorusto/life-os/issues/222) — finish the adapter layer.**
> Route the eleven modules under `backend/api/` through `get_provider()`. The reason is no longer
> a Sure hedge: Doru wants Majordom usable by other people, who won't all run Actual Budget
> (candidates now include Beancount, hledger, or his own engine). Staying on Actual Budget for now
> is not a commitment — **finishing the adapter is what makes changing engines cheap later**, which
> is the actual goal. Supersede `decisions.md#financeprovider-abstraction` with this reasoning.
>
> **Run in this order — the first two change what the third looks like:**
>
> 0. ~~**[#220](https://github.com/Dorusto/life-os/issues/220) — revoke the Telegram token**~~
>    **done 2026-08-30** — container stopped/removed, token revoked, confirmed no orphan on the
>    LXC, `--remove-orphans` added to the deploy pipeline. While investigating, also found and
>    fully deleted an unrelated Sure trial stack running on the LXC since 2026-05-31 (containers,
>    volumes, network, images, `/opt/sure` config) — the Sure/Ghostfolio evaluation it supported is
>    already concluded in `decisions.md#sure-budget-parity-evaluation`. The `sure-migration-trigger-check`
>    cloud routine (`/schedule`) has also been stopped by Doru — Sure no longer runs anywhere in
>    this setup, so there's nothing left for that tripwire to watch.
> 1. **[#223](https://github.com/Dorusto/life-os/issues/223) — measure the chart lag** (~30 min).
>    All 67 client methods re-open the budget, with no cache. If that's the cause, Actual Budget
>    isn't slow — Majordom's integration is, and the same pattern would follow any backend. Do
>    this before anything makes the engine look worse than it is.
> 2. **[#213](https://github.com/Dorusto/life-os/issues/213) — wire the mechanisms in** (~1h).
>    Track the pre-commit hook and fix the scanner's path. The audit's highest-leverage finding,
>    and it protects every refactor after it.
> 3. **#222 itself** — the eleven modules. Main work. Not before 1 and 2.
>
> **Good to delegate in parallel** (`/delegate-by-complexity`, Aider): #214 (three HTTP layers,
> divergent 401 handling) and #215 (40 copy-pasted handlers in `Chat.tsx`). Both are self-contained
> and independently verifiable — named in the audit as the best delegation candidates.
>
> **Related, don't attribute to the engine:** [#157](https://github.com/Dorusto/life-os/issues/157)
> (HTTPS/reverse proxy — the connection friction Doru blames on Actual Budget is a deployment gap)
> and [#190](https://github.com/Dorusto/life-os/issues/190) (setup wizard — the one friction that
> *is* real, since a new user shouldn't have to configure Actual Budget by hand).
>
> **Portfolio is core scope now**, not optional — Doru: seeing his investments in Majordom is
> "actually the point of it". Build the calculation layer in Majordom (see the closing comment on
> #4 for why that's a reasonable build, unlike building a budgeting engine). The real dependency
> is market price data, which needs its own decision.

---

## Task type → what to read

| Task | Read |
|------|------|
| Bug in backend/api/ or core/ | `docs/architecture.md#critical-technical-rules` + `docs/sessions/` (grep topic) |
| New feature | `docs/roadmap.md` (current milestone) + GitHub labels for issue priority (`.claude/rules/priority-tracking.md`) + `docs/architecture.md#main-flows` |
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

Cloning the repo is not enough on its own — git auth, `.env`, Docker, Ollama/LLM endpoint, and local-only gitignored files (`.claude/settings.local.json`, `PLANNING.md`, `PRIVATE_context.md`) all need separate setup. Deployment steps (LXC / plain Docker / Coolify): see `DEPLOY.md`.

For backend hot-reload during dev, a local `docker-compose.override.yml` (gitignored, never committed) can bind-mount `backend/` into `majordom-api` and run uvicorn with `--reload` — `docker compose up` picks it up automatically by name, and production is unaffected because the file doesn't exist there. Each dev machine creates its own copy if wanted.

---

## Second Brain sync

On completing any milestone (a full M or a major feature), update **both** locations:
1. `docs/roadmap.md` — the feature's status (✅ / 🔄 / 🔲)
2. `/home/doru/Sync/Obsidian/Second_Brain/10_PROJECTS/10_Life_OS/CLAUDE.md` — the "Status Majordom" section

Skipping this leaves Second Brain out of sync, and YouTube/Business strategy sessions end up working from stale data.

---

## Priority tracking & duplication prevention

Both moved to path-scoped rules (2026-08-28) — load automatically when Claude reads the files they apply to, instead of taking up space in every session:
- **Priority tracking** (`.claude/rules/priority-tracking.md`, loads on `docs/**/*.md`) — issue priority/status lives ONLY on GitHub, never in a hand-maintained doc.
- **Duplication & dead-code prevention** (`.claude/rules/duplication-prevention.md`, loads on `backend/**/*.py`, `frontend/src/**/*.{ts,tsx}`) — retire old flows in the same task, extract shared helpers at the second occurrence.

---

## Known process gaps (identified 2026-07-04)

Found during an external review of `architecture.md`/`decisions.md` for a course-curriculum project. Reviewed against established practices (ADRs, SRE runbooks, fitness functions) on 2026-07-04 — 3 of 5 fixed same day, 1 given a deliberately light mitigation, 1 left open by choice (see reasoning per item). Full comparison + reasoning: `docs/sessions/` (grep "process gaps").

1. **No regression tests for documented silent-failure gotchas** — **left open, by choice.** `architecture.md` rules 12, 14, 15, 17, 21, 22 all document bugs that failed silently. Writing automated regression tests for each was judged not worth the overhead for a single-user app (same reasoning as decision `#96`). Light mitigation instead: any newly-documented silent-failure gotcha should get a tracked GitHub issue (not a new doc), so it's at least visible/queryable, not purely "hope someone reads the rule."
2. **Architecture audits triggered by symptom, not schedule** — **mitigated, light.** A monthly scheduled check (see the `schedule` skill setup, 2026-07-04) reviews the existing audit triggers in `docs/roadmap.md` and opens a GitHub issue only if one actually fires — doesn't force an audit, just stops the trigger from being missed silently.
3. **`architecture.md` mixed stable design rules with operational/deploy quirks** — **fixed 2026-07-04.** Rules 18-19 (Docker backup, `--build` vs `restart`) tagged inline with `🔧 RUNBOOK` rather than physically moved — a physical split would have orphaned ~15 existing cross-references to those rule numbers in `decisions.md` and `docs/sessions/`. New ops-only rules should get the same tag going forward.
4. **`decisions.md` entries accumulated retroactive updates inline** — **fixed 2026-07-04.** Added an explicit ADR-style immutability rule to the top of `decisions.md`: entries are never edited after the fact, only superseded by a new entry with a one-line marker. Existing violations (e.g. "Sure adoption") are left as-is — rewriting old entries to fit the new rule would itself violate the new rule.
5. **Pre-implementation research had a blind spot mid-implementation** — **fixed 2026-07-04.** The `/plan-feature` skill's "Before any implementation" checklist now states explicitly: if implementation reveals something unexpected, stop and re-verify before continuing — not just a one-time gate before writing code.

---

## Collaboration rules

**Claude = senior/architect:** reads code, designs solution, scopes the task.
**DeepSeek = engineer:** implements, via Aider.

- **Default delegation path (corrected 2026-08-29, replacing the old habit below): run the `delegate-by-complexity` skill and dispatch directly through Aider headless** — isolated git worktree, task written per its prompt template (same Context/Goal/Relevant files/Critical Rules/Gotchas/Do NOT touch/Done when shape `plan-feature` already used, plus a Circuit breaker clause), `aider --model deepseek/deepseek-v4-flash` (or `-v4-pro` for Senior-tier tasks) `--message-file <task>`. Claude reviews the diff and requests merge confirmation from Doru — never writes a static prompt file to the repo and stops there. Corrected after Doru flagged the old habit resurfacing despite the skill existing ("nu stiu de ce nu s-a activat skill-ul") — check for `delegate-by-complexity` before defaulting to the manual file habit below.
- **Manual prompt-file path — fallback only, not the default.** `scripts/prompts/deepseek/NNN_desc.md`, one file per task, for when Doru wants to run DeepSeek himself directly, or Claude Code is unavailable. Still uses the same prompt template. Once saved for this reason, stop — Doru runs it manually, same handoff as before, just no longer Claude's default action when Claude itself is doing the delegating.
- **No `scripts/prompts/claude/` files.** DeepSeek prompts are saved to a file because a different tool consumes them later. A "kickoff prompt for the next Claude session" has no such reason — deliver it directly in the open chat, never as a saved file. Removed 2026-08-28: this repo is English-only (root `CLAUDE.md`), and the folder had accumulated 12 Romanian-language files (`scripts/prompts/claude/000`-`011`) before `check-private-data.sh`'s Romanian check (added the prior session) caught it on the next commit — the convention was never a deliberate decision, just Claude repeating its own earlier pattern.
- **`/task-complete`'s final step (2026-08-28, at Doru's request) hands off with a next-session kickoff prompt by default**, not just when asked — delivered in chat per the rule above, factoring in whatever delegation tooling exists (e.g. `/delegate-by-complexity`). Skipped only when this session's context is still light and the next step is pure architecture discussion + delegation dispatch — then just keep going in the same chat instead of suggesting a fresh one. See `.claude/skills/task-complete/SKILL.md` step 3 for the full rule — not duplicated here.
- Delegate to DeepSeek only when you save tokens overall (implementation + verification). Simple tasks with expensive verification → implement directly. Complex but well-defined tasks with fast verification → DeepSeek.
- **Once a task is dispatched (Aider, default path) or a manual prompt file is saved (fallback path), stop asking whether to implement it directly instead.** Superseded 2026-08-29 (see the delegation-path bullets above) but the underlying point stands either way: not a choice to re-confirm each time (corrected 2026-07-07, after asking "should I implement it directly or do you want to run it" for a prompt that was already complete and saved — redundant, since the workflow already answers that). Only offer to implement directly instead if the task turns out to be a poor delegation fit *before* dispatching/writing the prompt (e.g. touches too many coupled files/non-obvious conventions per the rule below) — not as a question tacked on after the fact.
- If a task touches >2 tightly coupled frontend files or depends on non-obvious conventions (auth pattern, card structure, Pydantic field names) → implement directly. Verification cost exceeds the gain.
- When unsure about a bug cause — ask, don't assume and don't implement.
- Involve the user — explain what you found, ask for confirmation before implementing.
- New feature session: present plan in 3-5 lines, ask if ok, implement only after explicit confirmation.
- **Decide pure-technical calls yourself; only surface design/product-direction choices, facts only Doru knows, or real technical risk — and do it in plain, non-technical language, before implementing/delegating, not after.** Established 2026-08-29 after Doru flagged that most mid-task questions that session were technical, not strategic, and had become hard for him to evaluate ("a devenit mult prea tehnice pentru mine"). Concrete split, from that session's own questions: "where does this data live, which account types exist, manual or automatic tagging" needed Doru (facts/preferences only he has); "do I extend the shared budget function or write an isolated one" didn't (zero user-visible consequence, pure implementation-risk tradeoff) — that one should have been decided silently. The corrected flow: do the technical research and investigation as before, make the purely-technical calls without asking, then present ONE consolidated plain-language summary — what's changing and why, in everyday terms, with technical detail underneath for whoever wants to dig in, not jargon leading — *before* dispatching to Aider or implementing, so a wrong call gets caught before wasted implementation cycles, not after. Real technical risk (not just "an implementation choice exists") still gets flagged explicitly, briefly, framed as "going with X because Y — flag me if that's wrong" rather than a multi-option quiz — Doru explicitly asked to stay looped in on those, not be fully cut out of the technical side. **Trial, not settled** — revisit if it isn't working; Doru's own framing: let's see how it goes, and drop it later if it turns out not to be needed.
- **One feature at a time — and this means one task per session, not just "no parallel work."** Corrected 2026-08-27: a single session drifted from "back up before touching data" into fixing the backup cron, filing an ops issue, re-running the duplicate investigation, scoping and speccing a whole new feature (#181), and filing a second unrelated ops issue (#182) — each individually reasonable, but chained without pausing to check in made the session hard to follow and harder to review as one thing. When a session surfaces a second, unrelated task mid-flow (a bug found while investigating something else, a doc gap noticed in passing) — flag it, open an issue if it needs tracking, and ask before continuing into it rather than folding it into the current thread. Doesn't apply to strictly sequential steps of the *same* task (e.g. investigate → spec → DeepSeek prompt for one feature) — those are one task, not several.
- **Architecture trade-offs before implementation:** when a feature has meaningful variants (1 generic tool vs N specific tools, library vs pure code, single endpoint vs multiple), present the trade-offs in 2-3 lines and get confirmation BEFORE writing the DeepSeek prompt or any code. Never discover the simpler approach existed after the fact.
- **No auto-memory:** do not save notes to `~/.claude/projects/.../memory/`. Save feedback and decisions in this file or in `docs/decisions.md`.
- **Before any implementation (mandatory — Claude or DeepSeek), and before opening a new GitHub issue:** run the `/plan-feature` skill (`.claude/skills/plan-feature/SKILL.md`). Covers the file/docs/sessions/decisions/helper checklist, the DeepSeek prompt template, and the known-gotchas list — not optional, and not duplicated here.

---

## Commit & push rules

- **Commit only after user verifies and confirms it works**
- **Push to GitHub only when user explicitly asks**
- **Check `CLAUDE.local.md` for additional, personal workflow rules not shared in this file.**
- **After pushing a backend/frontend fix, also rebuild the affected service(s) in the local `docker-compose` stack on this dev machine** (`docker compose build <service> && docker compose up -d <service>`) — the user tests locally (`localhost:5006` for Actual Budget, local chat) instead of waiting on the LXC deploy round-trip each time. Established 2026-07-04 after discovering this dev machine runs its own full local copy of the stack (separate Tailscale host from the LXC, same docker-compose.yml) with direct Docker access from this environment. **This local stack's data is test/fixture data, not real financial data** (the LXC is the only real-data environment) — but don't infer that from how the data looks (test fixtures are deliberately realistic). If unsure, check `.env`'s `ACTUAL_BUDGET_URL` — it must point to the local `actual-budget` container (`http://actual-budget:5006`), never an LXC/remote host.
- All code, comments, commit messages, GitHub issues = **English**
- Discussions with Claude = Romanian

---

## End-of-task protocol

**When the user confirms something works, before reporting the task as done:** run the `/task-complete` skill (`.claude/skills/task-complete/SKILL.md`). Covers the pre-commit review, commit, issue-closing, roadmap/session-log updates, and the setup-self-improvement check — not optional, and not duplicated here.

**The trigger is "about to run `gh issue close`," not "this was a coding feature."** Missed once (2026-08-30, #220) on an ops task — stop/remove a container, revoke a token — that never passed through an explicit "the user confirms it works" moment the way a feature review does, so the skill's usual trigger phrase didn't fire in the moment. Caught only because the user asked directly. Any session ending in `gh issue close`, coding or not, runs this first.

---

## Current model

Majordom's OWN product LLM config (what the app itself talks to) — distinct from
`delegate-by-complexity`'s dev-tooling model choice (DeepSeek Flash/Pro, Qwen via Aider,
used to develop Majordom, not by Majordom). Confused twice in one session (2026-08-28)
by both Claude and a subagent — check which of the two you actually mean before editing
either.

- Chat: `deepseek/deepseek-chat` via OpenRouter
- Vision: `google/gemini-2.5-flash-lite` via OpenRouter
- Local Ollama fallback: `qwen3.5:9b` (vision + chat, ~4 min on CPU-only LXC)

---

## Key references

- `docs/architecture.md` — technical rules + flows + project structure
- `docs/decisions.md` — why things are the way they are
- `docs/roadmap.md` — milestones · GitHub Labels/Milestones — issue-level priority (`.claude/rules/priority-tracking.md`)
- `docs/feature-ideas.md` — raw ideas not yet turned into issues
- `docs/sessions/INDEX.md` — what was built and when
- `PRIVATE_context.md` — account names, vehicle profiles (gitignored)
- `.claude/rules/` — path-scoped rules, load automatically when Claude touches matching files
- `.claude/skills/` — explicit, invokable workflows (`/plan-feature`, `/task-complete`)
- `.claude/agents/` — subagents (`pre-commit-review`)
