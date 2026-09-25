# Majordom — Claude Code Guide

Self-hosted personal AI finance assistant. Web PWA + FastAPI + Actual Budget + local/cloud LLM.

Rules only. Dated history of why each rule exists lives in `docs/decisions.md` and
`docs/sessions/claude-md-archive.md` — keep it out of this file (it is loaded every session;
a long file gets its rules ignored).

---

## Start of session

1. Open issues + uncommitted changes are injected automatically (`SessionStart` hook in
   `.claude/settings.json`) — don't re-run `gh issue list` unless you need a filter
2. Read `docs/INDEX.md` → find what to read for this task type
3. Ask what we're working on if not specified

**Direction:** read `docs/product-plan.md` before picking up anything. Every task must answer:
which phase does this serve, and what does it make Majordom notice or do on its own? If the
honest answer is "none, but it bothered me" → parking lot, not now. Phases A, B, C and C2 are
shipped (C2 except #42, blocked on the undecided market-data source). Current state: `gh issue
list` + the latest `docs/sessions/` file — not this file.

---

## Task type → what to read

| Task | Read |
|------|------|
| Bug in backend/api/ or core/ | `docs/architecture.md#critical-technical-rules` + `docs/sessions/` (grep topic) |
| New feature | `docs/roadmap.md` + GitHub labels (`.claude/rules/priority-tracking.md`) + `docs/architecture.md#main-flows` |
| Refactor | `docs/decisions.md` + `docs/architecture.md` |
| Chat / tool calling | `docs/learn/10-chat-tools.md` + `docs/architecture.md#critical-technical-rules` |
| CSV import | `docs/learn/07-csv-import.md` |
| Actual Budget integration | `docs/learn/04-actual-budget.md` + `docs/architecture.md#critical-technical-rules` |
| Account structure / create_account | `PRIVATE_context.md` |
| Vehicle data / vehicle-manager | `life-os/tools/vehicle-manager/` — **outside this directory**, at the monorepo root. Plus `docs/architecture.md` (Platform Architecture) + `docs/decisions.md#vehicle-manager-standalone-frontend` |

---

## Critical rules (never break)

Full details in `docs/architecture.md`.

1. **No financial data in SQLite** — Actual Budget is the source of truth
2. **actualpy order:** `download_budget()` first → operations → `commit()` last
3. **actualpy amounts in EUR** (float), not cents — `create_transaction(amount=45.99)` ✓
4. **Config from settings singleton** — never `os.environ` directly
5. **All write tools → confirmation card** — add to `_PROPOSAL_TOOLS` in `backend/api/chat.py`; card fields must be **editable** (input/select), never static text
6. **`think: false`** in Ollama payload for qwen3/qwen3.5 models
7. **`json.loads(args)`** before `**args` for tool calls — OpenAI format returns args as string
8. **`LLM_BASE_URL` without `/v1`** — code appends `/v1/chat/completions` automatically
9. **Every page wrapper uses `h-dvh`, not `min-h-dvh`** — see `architecture.md` rule 42
10. **No personal data in tracked files** (names, account names, IPs, domains) — the repo is public; `scripts/check-private-data.sh` enforces it

---

## Verification — run before saying "done"

- **`scripts/smoke-test.sh`** — backend syntax, provider wiring, frontend typecheck, then login +
  read-only GETs against the local stack (~10s). Exit 0 = pass. Run it after any backend/frontend
  change and after reviewing any delegated (Aider) diff. Show its output as evidence rather than
  asserting success. `--no-frontend` skips the typecheck.
- UI changes: also check the real page in the browser (screenshot), not just the typecheck.
  Prefer the delegation pipeline's visual check (`pages:`/`flow:` in the spec — GLM reads the
  screenshots) and read its verdict, instead of driving Chrome from Claude — saves tokens. Drive
  the browser directly only for what the pipeline can't reach (e.g. a flow that needs a file upload).
- The local stack is **fixture data**; the LXC is the only real-data environment. Don't infer this
  from how the data looks — check `.env`'s `ACTUAL_BUDGET_URL` points at the local `actual-budget`
  container (the smoke test refuses to run otherwise).
- After a backend/frontend change, rebuild the affected local service:
  `docker compose build <service> && docker compose up -d <service>`.

---

## Collaboration rules

**Claude = senior/architect** (reads code, designs, scopes). **DeepSeek = engineer** (implements, via Aider).

**Delegation**
- **Default: the `delegate-by-complexity` skill** — isolated git worktree, Aider headless via
  OpenRouter, task written from its prompt template. Claude reviews the diff, runs the smoke test,
  asks the user before merging. Never write a static prompt file and stop.
- Manual prompt file (`scripts/prompts/deepseek/NNN_desc.md`) — fallback only, when the user wants
  to run DeepSeek directly or Claude Code is unavailable. Then stop.
- Lean toward DeepSeek Flash when a task can be specced clearly. Implement directly instead when it
  touches >2 tightly coupled frontend files or depends on non-obvious conventions (auth pattern,
  card structure, Pydantic field names).
- **The "non-obvious conventions" exception is not self-certifying — name it out loud before
  invoking it, don't just silently decide to implement directly.** Corrected 2026-09-23: Claude
  implemented a small (~10-line), single-file backend fix directly, reasoning it needed
  `decisions.md`/`architecture.md` context to avoid breaking a fragile invariant — the user pushed
  back live ("trebuie sa delegi"), it hadn't been surfaced as a choice. Once the fix is precisely
  specced (exact diagnosis known, not still exploratory), it's usually delegable even if it started
  as direct investigation — don't let "I did the diagnosis myself" default into "so I'll also do the
  fix myself."
- Once dispatched, don't ask again whether to implement it directly.
- Kickoff prompts for the next Claude session go in chat, never into a saved file.

**What to ask vs. decide**
- Decide pure-technical calls and "which task next"-style recommendations yourself — don't ask.
- Ask only for: product/design-direction forks, facts only the user has, or real technical risk
  ("going with X because Y — flag me if wrong").
- Before implementing/delegating a new feature: one plain-language summary (what changes and why,
  everyday terms first, technical detail underneath), then wait for confirmation.
- Meaningful architecture variants (1 generic tool vs N, library vs own code): 2-3 lines of
  trade-offs before any code.
- Unsure about a bug's cause → ask, don't assume.

**Scope**
- One task per session. A second, unrelated task found mid-flow → flag it, open an issue if needed,
  ask before continuing into it. Sequential steps of the same task are fine.
- Proactively flag system/tooling gaps (a skill not triggering, a repeatable manual step, a hook
  that should exist) and propose a fix — system/process only, not feature design.

**Workflows (mandatory)**
- **Before any implementation, and before opening a new issue:** `/plan-feature`.
- **When the user confirms something works, or before any `gh issue close`:** `/task-complete`
  (pre-commit review subagent, commit, issue close, session log, setup check, kickoff prompt).
- User asks only to note a bug or idea → create a GitHub issue and stop.
- Majordom decisions and feedback go in this file or `docs/decisions.md`, not auto-memory.

---

## Commit & push rules

- Commit only after the user verifies and confirms it works
- Push only when the user explicitly asks — `git push` deploys to the real-data LXC
- Also check `CLAUDE.local.md` (private workflow rules)
- All code, comments, commits, issues = **English**; discussions with Claude = Romanian

---

## Priority tracking & duplication prevention

Path-scoped rules, load automatically:
- `.claude/rules/priority-tracking.md` (on `docs/**/*.md`) — priority/status lives only on GitHub
- `.claude/rules/duplication-prevention.md` (on backend/frontend code) — retire old flows in the
  same task, extract shared helpers at the second occurrence

---

## New dev machine setup

Cloning is not enough — git auth, `.env`, Docker, the LLM endpoint and gitignored files
(`.claude/settings.local.json`, `CLAUDE.local.md`, `PRIVATE_context.md`) need separate setup. Deploy: `DEPLOY.md`.

- `git config core.hooksPath scripts/hooks` (repo root) — activates the tracked pre-commit hook
  (timestamp check, provider wiring, private-data scanner)
- Optional backend hot-reload: a gitignored `docker-compose.override.yml` bind-mounting `backend/`
  with `uvicorn --reload`

---

## Current model (the app's own LLM — not the dev-tooling models in `delegate-by-complexity`)

- Chat: `deepseek/deepseek-chat` via OpenRouter
- Vision: `google/gemini-2.5-flash-lite` via OpenRouter
- Local Ollama fallback: `qwen3.5:9b` (vision + chat, ~4 min on CPU-only LXC)

---

## Key references

- `docs/architecture.md` — technical rules, flows, structure
- `docs/decisions.md` — why things are the way they are (ADR-style, entries immutable)
- `docs/product-plan.md` — product position and phases
- `docs/roadmap.md` — milestones; issue priority on GitHub
- `docs/sessions/INDEX.md` — what was built and when; `claude-md-archive.md` — old CLAUDE.md history
- `docs/feature-ideas.md` — raw ideas not yet issues
- `.claude/rules/`, `.claude/skills/` (`/plan-feature`, `/task-complete`), `.claude/agents/` (`pre-commit-review`)
