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
| New feature | `docs/roadmap.md` (current milestone) + `docs/architecture.md#main-flows` |
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

## Second Brain sync

La finalizarea oricărui milestone (M complet sau feature major), actualizează **ambele** locații:
1. `docs/roadmap.md` — statusul featurei (✅ / 🔄 / 🔲)
2. `/home/doru/Sync/Obsidian/Second_Brain/10_PROJECTS/10_Life_OS/CLAUDE.md` — secțiunea "Status Majordom"

Fără acest pas, Second Brain rămâne out of sync și sesiunile de strategie YouTube/Business lucrează pe date false.

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

### Before any implementation (mandatory — Claude or DeepSeek)

1. Identify all files the task will touch
2. Consult the "Task type → what to read" table above and read the relevant `docs/learn/` file
3. Grep `docs/sessions/` for recent work on the same files — catches gotchas not yet in architecture.md:
   `grep -rl "filename" docs/sessions/`
4. Check `docs/architecture.md#critical-technical-rules` for rules relevant to those files
5. Check `docs/decisions.md` for relevant decisions

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

---

## Commit & push rules

- **Commit only after user verifies and confirms it works**
- **Push to GitHub only when user explicitly asks**
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
3. Update `docs/roadmap.md` — mark ✅ done if milestone item; if feature has a spec in `docs/specs/`, update it too
4. Add entry to `docs/sessions/YYYY-WNN.md` (current week's file)
5. Update `docs/sessions/INDEX.md` — add row for the session
6. Check if docs need updating:
   - New technical pattern or unexpected quirk found → add to `docs/architecture.md#critical-technical-rules`
   - Design decision made during session → add to `docs/decisions.md`
   - Rule already documented → no action
7. Fix any outdated notes in this file (CLAUDE.md)
8. **YouTube / learning check** — ask: "Is this concept interesting enough for a YouTube video or worth understanding deeper?" If yes, suggest the user open a Second Brain session to document it as a potential video topic. Criteria: new architecture pattern, non-obvious technical decision, visible user-facing feature, or something the user asked "how does this work?" about during the session.

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
- `docs/roadmap.md` — milestones + backlog
- `docs/sessions/INDEX.md` — what was built and when
- `PRIVATE_context.md` — account names, vehicle profiles (gitignored)
