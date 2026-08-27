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

**Claude = senior/architect:** reads code, designs solution, writes spec and DeepSeek prompt.
**DeepSeek = engineer:** receives prompt, implements. Saves prompts in `scripts/prompts/deepseek/NNN_desc.md`.

- **No `scripts/prompts/claude/` files.** DeepSeek prompts are saved to a file because a different tool consumes them later. A "kickoff prompt for the next Claude session" has no such reason — deliver it directly in the open chat when asked, never as a saved file. Removed 2026-08-28: this repo is English-only (root `CLAUDE.md`), and the folder had accumulated 12 Romanian-language files (`scripts/prompts/claude/000`-`011`) before `check-private-data.sh`'s Romanian check (added the prior session) caught it on the next commit — the convention was never a deliberate decision, just Claude repeating its own earlier pattern.
- Delegate to DeepSeek only when you save tokens overall (implementation + verification). Simple tasks with expensive verification → implement directly. Complex but well-defined tasks with fast verification → DeepSeek.
- **Once a DeepSeek prompt file is written and saved, stop there.** Doru runs it in DeepSeek himself — that's the default, already-established handoff, not a choice to re-confirm each time (corrected 2026-07-07, after asking "should I implement it directly or do you want to run it" for a prompt that was already complete and saved — redundant, since the workflow already answers that). Only offer to implement directly instead if the task turns out to be a poor DeepSeek fit *before* writing the prompt (e.g. touches too many coupled files/non-obvious conventions per the rule above) — not as a question tacked on after the prompt is already done.
- If a task touches >2 tightly coupled frontend files or depends on non-obvious conventions (auth pattern, card structure, Pydantic field names) → implement directly. Verification cost exceeds the gain.
- When unsure about a bug cause — ask, don't assume and don't implement.
- Involve the user — explain what you found, ask for confirmation before implementing.
- New feature session: present plan in 3-5 lines, ask if ok, implement only after explicit confirmation.
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

---

## Current model

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
