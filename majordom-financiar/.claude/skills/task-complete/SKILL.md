---
name: task-complete
description: Runs the mandatory end-of-task protocol for majordom-financiar once the user confirms a change works — pre-commit review subagent, commit, close the GitHub issue, update roadmap/session logs, check whether the setup itself needs a fix, and (unless context is light and the next step is just architecture/delegation) hand off with a next-session kickoff prompt. Use this whenever a task is confirmed working, before reporting it as done. Invoke explicitly as /task-complete.
---

# Task Complete — end-of-task protocol for Majordom

Formalizes the step that used to live as prose in `CLAUDE.md` under "End-of-task protocol." Run this once the user confirms something works, before reporting the task as done.

## 1 — Pre-commit review, before committing anything

Run the `pre-commit-review` subagent (`.claude/agents/pre-commit-review.md`) on the diff — pass it the DeepSeek prompt file path too if the task was implemented by DeepSeek. If it reports a violation: fix directly (Claude-implemented) or send back to DeepSeek with the specific observation (DeepSeek-implemented). Only after it reports "safe to commit" → proceed to step 2.

## 2 — Always, do not report the task as done until all of these are checked

1. Commit with correct timestamp.
2. Close GitHub issue: `gh issue list` → find relevant open issue → `gh issue close NNN -c "message"`.
3. Update `docs/roadmap.md` if it's a milestone item (mark ✅ done); closing the GitHub issue already updates its priority tracking (label/milestone) automatically — no separate doc to touch. If the feature has a spec in `docs/specs/`, update it too.
4. Add an entry to `docs/sessions/YYYY-WNN.md` (current week's file).
5. Update `docs/sessions/INDEX.md` — add a row for the session.
6. Check if the setup itself needs updating:
   - New technical pattern or unexpected quirk found → add to `docs/architecture.md#critical-technical-rules`.
   - Design decision made during session → add to `docs/decisions.md`.
   - **Hit friction this session that a rule/skill/hook would have caught or avoided → implement that setup change now** (new `.claude/rules/` entry, skill update, or GitHub issue if it's bigger than one session), not just a session-log note. The setup should get measurably better every session, not just document what happened.
   - Rule already documented → no action.
7. Fix any outdated notes in `CLAUDE.md`.

## 3 — When reporting the task as done: summary + next-session kickoff prompt

After the summary of what was done, decide whether to also hand off to a fresh session:

- **Default:** give a kickoff prompt for the next session, written to paste directly into a new chat here — never saved to a file (same reasoning as the DeepSeek-prompt-file rule under "Collaboration rules": nothing downstream consumes it). Base it on what actually makes sense to pick up next (open issues, the roadmap, anything flagged `Unresolved` in this session's log entry). Take into account whatever delegation tooling is available now (e.g. `/delegate-by-complexity` for parallel opencode/DeepSeek/qwen-local dispatch) when the next task is a good fit for it — name it in the prompt if so.
- **Exception:** if this session's context isn't heavily loaded yet and the next step is purely architecture discussion + delegation dispatch (no heavy file-reading or implementation work), skip the new-session suggestion — say so, and just continue in the current chat instead. Established 2026-08-28, at Doru's explicit request, as the default going forward — not a one-time note in a session log; codified here since majordom-financiar's own "no auto-memory" rule means workflow preferences live in this file, not `~/.claude/projects/.../memory/`.

## Sessions log format

`docs/sessions/YYYY-WNN.md`:
```markdown
## YYYY-MM-DD — short title
### Resolved
### Files modified
### Lessons
### Unresolved
```

If a lesson from this session deserves a detailed explanation with analogies/diagrams (not just a bullet point), add it to `docs/learn/` as a new file or section in an existing one. Sessions log = what happened. `docs/learn/` = how things work.
