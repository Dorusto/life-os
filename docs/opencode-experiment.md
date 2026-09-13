# opencode-61 autonomous development — experiment log

## Why this file exists

2026-09-13: development moved from Claude-Code-drives-step-by-step to `opencode-61`
(self-hosted DeepSeek agents via OpenRouter, direct git push/PR, remote-supervised only —
see the vault's `opencode-agent-system/` guides for the full setup). This is a real
operating-model change, not a one-off task, so it gets tracked here, in the project,
not only in Claude's own memory or the vault — the question this log answers is
concrete and falls due over time: **is this cheaper and better than Claude Code doing
the work directly, or a failed experiment worth reverting?**

Tracked per batch: cost, wall-clock speed, and quality (did the independent review step
pass first try, did anything ship broken that Doru caught later). Append new entries,
don't rewrite old ones — same immutability convention as `majordom-financiar/docs/decisions.md`.

## How to read an entry

- **Cost** — sum of the `[meta] cost=$X` lines opencode itself reports per run.
- **Speed** — wall-clock from dispatch to PR-ready (or push, for the one entry before
  the branch+PR flow existed).
- **Quality** — did `review-diff.sh` (independent, fresh-context review before commit)
  pass on the first try? Anything a human caught afterward that the pipeline missed?

## Entries

### 2026-09-13 — first real test task (pre-review-flow)

- Task: add a Development section to investment-manager's README (single file, docs-only).
- Agent: `senior` (DeepSeek V4.1 Flash via OpenRouter).
- Cost: $0.006. Speed: single short run, no multi-step iteration needed.
- Quality: content was correct, but **the commit had a subject with zero body** — a
  process gap, not a content bug. Fixed same day in `AGENTS.md` on opencode-61 (commit
  messages now require an explanatory body; not tracked in this repo's own history since
  it's an opencode-61 config file, not application code — see the vault's
  `opencode-agent-system/LOG.md`, 2026-09-13 entry).

### 2026-09-13 (evening) — pipeline hardening, no app-code batch yet

Built, not yet exercised on a real multi-issue batch:
- Visual verification (headless screenshot + opencode's own `read` tool) — confirmed
  empirically that an agent can see and correctly describe an image it just produced.
- Independent code review before commit (`review-diff.sh`) — a fresh model context,
  not the implementing session, checks scope/correctness/critical-rule compliance.
- Branch + PR flow for autonomous batches (not direct-to-main) — Doru reviews and
  merges, issues close automatically on merge via `Closes #N`.
- A timing-safe queue for GitHub-side writes (push/PR/issue actions) that respects the
  existing commit-timing privacy convention — queued outside the allowed window,
  flushed automatically by cron once it reopens.
- A dedicated `intake` agent, permission-locked to only creating GitHub issues from a
  live review conversation, never editing code.

No cost/speed/quality numbers yet for a real batch — first one pending Doru's own
review session and the resulting autonomous-fix run.
