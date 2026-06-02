# 12 — Development strategy and collaboration model

## Why this structure exists

Majordom started as a quick Telegram bot, then grew into a multi-service platform. Without a documented architecture, every session started from scratch — Claude would re-derive the same context, make inconsistent decisions, and drift from what was built before.

The current doc structure solves a specific problem: **how do you work efficiently with an AI assistant that has no memory between sessions?**

The answer: instead of explaining everything every time, you maintain files that serve as a precise briefing. CLAUDE.md is the entry point that routes Claude to the right file for each task type. The files are organized so Claude reads only what's relevant, not everything.

## The collaboration model: Claude + DeepSeek

**Why two models?**

Claude (you're reading this) is good at: understanding complex context, making architectural decisions, writing specs with edge cases covered, reviewing code for correctness. It's expensive per token.

DeepSeek is good at: taking a well-defined spec and producing implementation code. It's fast and cheap. It doesn't make architectural decisions — it follows instructions.

**The split in practice:**

```
You describe what you need
    ↓
Claude reads the codebase, identifies the right approach,
designs the solution, writes the spec + DeepSeek prompt
    ↓
DeepSeek implements
    ↓
You test
    ↓
Claude reviews and fixes if needed
    ↓
Commit
```

**When to use Claude directly (skip DeepSeek):**
- The task is a small bugfix or config change (faster to implement directly)
- The task touches >3 tightly coupled files with codebase conventions DeepSeek doesn't know
- You'd spend more time reviewing DeepSeek's output than implementing yourself

**When to use DeepSeek:**
- The spec is clear and self-contained
- The implementation is mechanical (add a field, create an endpoint, new card component)
- Verification is fast (run + check output)

DeepSeek prompts are saved in `scripts/prompts/deepseek/NNN_short-desc.md` — one file per task. This means you can re-use them later or hand them off without Claude being present.

## Why the docs are structured this way

**Problem:** LEARN.md was 1963 lines with two completely different types of content mixed together:
1. Tutorial-style explanations (analogies, diagrams) — for understanding
2. Session logs (what was fixed, what to remember) — for reference

These serve different audiences and different purposes. Reading tutorials to find a lesson from two weeks ago wastes time. Reading session logs to understand how async works also wastes time.

**Solution:**
- `docs/learn/` — tutorials, analogies, deep explanations. Read when you want to understand. Grows slowly (new file when something genuinely new is understood).
- `docs/sessions/` — condensed log, one file per week. Read when you want to know what was built. Grows every session.
- `docs/architecture.md` — stable technical rules. Read when you're about to modify core code.
- `docs/decisions.md` — append-only decisions log. Read before refactoring something that "looks wrong".
- `CLAUDE.md` — session entry point. Always start here.

## How to evolve this structure

The structure is meant to be improved. Signs that something needs changing:

**A learn/ file is outdated:** if a tutorial describes how something worked before a big refactor, update it. Don't keep stale explanations — they mislead.

**A decision needs revisiting:** add a new entry to `docs/decisions.md` with the revised reasoning. Don't delete old decisions — keep the history.

**A new pattern emerges:** if a pattern is used in 3+ places and it's not documented anywhere, add it to `docs/architecture.md` (if it's a rule) or `docs/learn/` (if it needs explanation).

**Sessions log gets too long:** weekly files with 20+ sessions mean too much happened without consolidation. Consider splitting weeks or promoting recurring lessons to learn/ files.

## The guiding principle

**The documentation serves the next session, not the current one.**

Write notes as if you're briefing a colleague who just joined the project and needs to get up to speed in 5 minutes. Not too much detail (they'll read the code), not too little (they'll make the same mistakes you already made).
