# Qwen-local prompts (Cline coding test)

Purpose: evaluate a local ~27B-class Qwen model (run via Ollama, driven through the Cline VS
Code extension) as a coding assistant for majordom-financiar — same role DeepSeek plays today,
tested as a cheaper/local alternative given Claude usage cost.

**Not the same thing as majordom's own runtime local LLM** (`qwen3.5:9b`, already configured in
`CLAUDE.md` as the Ollama chat/vision fallback — the model majordom itself calls to read
receipts, answer questions, be the financial coach). That's a separate, later task: making
majordom wake the local model server on demand and let it go to standby after ~5 min idle.
Do not conflate the two — this folder is only about the coding-assistant experiment.

## Setup (Doru does this, not Claude)

1. Confirm the exact Ollama tag for the ~27B coding-focused Qwen model before pulling —
   "Qwen 3.8" isn't a real released version as far as this session could confirm; check
   `ollama.com/library` for the closest match (Qwen2.5-Coder and Qwen3-Coder both have
   large/32B-class coding variants that fit what was described as "very praised by the
   community" for coding). Whichever tag turns out correct, note it here for next time.
2. `ollama pull <confirmed-tag>`
3. Install the Cline extension in VS Code, point it at the local Ollama endpoint with that model.
4. Open this repo in VS Code, feed Cline the prompt file below.

## How to use a prompt file here

Same template as `scripts/prompts/deepseek/` (see `.claude/skills/plan-feature/SKILL.md`) —
spec, not code, Critical Rules extracted explicitly since the local model won't read other
project files on its own the way Claude does mid-session.

## Prompts

Completed prompts move to `done/`, same convention as `scripts/prompts/deepseek/done/` and the
now-removed `scripts/prompts/claude/` (that one was removed entirely 2026-08-28 — Claude session
kickoff prompts don't belong in files at all, see `CLAUDE.md`'s Collaboration rules. This folder
is different: a *different tool* (Cline + local model) consumes these, same reason DeepSeek's do).

- `done/001_170-goal-help-modal-explainer.md` — first test, closes #170: small, single-file,
  low-risk (a help-text addition, not a data-model or write-path change), so a bad first run
  couldn't do real damage. **Result: correct.** Right file, right section, correct placement
  (before the `<ul>`), reused the existing `text-muted` styling instead of inventing a class,
  didn't touch `GoalCard`/`Home.tsx` per the explicit "Do NOT touch." One data point, not a
  verdict on the model in general — worth a few more varied tests before trusting it with
  anything bigger (a real component build, not just a text addition).
