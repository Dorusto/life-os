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

## Collaboration rules

**Claude = senior/architect:** reads code, designs solution, writes spec and DeepSeek prompt.
**DeepSeek = engineer:** receives prompt, implements. Saves prompts in `scripts/prompts/deepseek/NNN_desc.md`.

- Delegate to DeepSeek only when you save tokens overall (implementation + verification). Simple tasks with expensive verification → implement directly. Complex but well-defined tasks with fast verification → DeepSeek.
- When unsure about a bug cause — ask, don't assume and don't implement.
- Involve the user — explain what you found, ask for confirmation before implementing.
- New feature session: present plan in 3-5 lines, ask if ok, implement only after explicit confirmation.
- **One feature at a time.**

---

## Commit & push rules

- **Commit only after user verifies and confirms it works**
- **Push to GitHub only when user explicitly asks**
- **Commit timestamp** — weekday: between 18:00-23:00; weekend: real time
  ```bash
  GIT_AUTHOR_DATE="YYYY-MM-DD HH:MM:SS +0200" GIT_COMMITTER_DATE="..." git commit -m "..."
  ```
- All code, comments, commit messages, GitHub issues = **English**
- Discussions with Claude = Romanian

---

## End-of-task protocol

When user confirms something works:
1. Commit with correct timestamp
2. Close GitHub issue: `gh issue close NNN -c "message"`
3. Update `docs/roadmap.md` — mark ✅ done if milestone item; if feature has a spec in `docs/specs/`, update it too
4. Add entry to `docs/sessions/YYYY-WNN.md` (current week's file)
5. Update `docs/sessions/INDEX.md` — add row for the session
6. Fix any outdated notes in this file

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
