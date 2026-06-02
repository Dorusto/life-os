# 11 — Onboarding state machine

> Note: The 15-question wizard (M2) was cancelled. Current onboarding = one question (name) + SetupBalancesCard. This document explains the state machine pattern used, which is still relevant for understanding the codebase.

## The architecture decision

**Server-side state machine, not LLM-driven.**

Alternative (LLM manages the flow) would be more flexible, but unpredictable — the LLM can skip questions, repeat, hallucinate the current state. The solution: the server always knows which question the user is at (`current_question` in SQLite). The LLM does one thing: parses the free-text answer → structured JSON.

```
User: "around 2000 euros a month"
LLM (parse_prompt): → {"monthly_income": 2000}
Server: saves in SQLite, advances to next step
```

## The current minimal onboarding

```
New user opens app
  → chat.py detects first message or "set up" trigger
  → Returns SetupBalancesCard: lists AB accounts with editable balances + "add account" option
  → User enters current balances → POST /api/setup/complete
  → _ensure_default_categories() → creates 7 standard groups if AB is empty
  → Onboarding done
```

`SetupBalancesCard` is an inline card in chat — same styling as `ProposalCard`. Not a modal/popup overlay.

At any time: `propose_balance_adjustment` tool → editable card → adjust balance in AB.

## Key gotchas from the M2 implementation (for reference)

These are still relevant if onboarding flows are extended:

**1. actualpy imports**
```python
# WRONG — these classes don't exist in actual.database
from actual.database import Category, Schedule, ScheduleValues

# CORRECT
from actual.queries import create_category_group, create_category, create_schedule
from actual.schedules import Schedule as ScheduleConfig
```

**2. `think: false` for qwen3 models**
```python
# Always include in Ollama payload for qwen3/qwen3.5
{"think": False, "temperature": 0.3, ...}
# Without it: model enters thinking mode, response blocked for tens of seconds
```

**3. Multiple JSON objects in one HTTP chunk**
If a streaming endpoint sends two JSON objects in one chunk:
```
{"type":"onboarding_start"}\n{"type":"onboarding_question"...}
```
`JSON.parse()` fails on the combined string. Fix in `handleChatChunk` on frontend:
```javascript
// If parse fails and chunk contains \n, split on lines and process recursively
if (e instanceof SyntaxError && chunk.includes('\n')) {
    chunk.split('\n').filter(Boolean).forEach(handleChatChunk)
    return
}
```
**Important:** do NOT split on `\n` in `api.ts` — it buffers all streaming text and delivers it all at once at the end, breaking the streaming UX.

**4. Auth key in frontend**
```javascript
// WRONG — any hardcoded key
localStorage.getItem('token')
localStorage.getItem('auth_token')

// CORRECT — always use the abstraction
import { getToken, clearAuth } from '../lib/auth'
getToken()  // reads 'majordom_token' key
```

**5. Stale localStorage**
If `onboarding_active=true` stays in localStorage from an old session → the "Answer the question..." placeholder appears on every load. Fix: on mount, verify with `GET /api/onboarding/status` — if backend says `active: false`, clear localStorage.

## ClarificationCard — kept and reused

`ClarificationCard` is a generic mechanism for yes/no or multiple-choice questions in chat. Not tied to onboarding. Used in other flows (e.g. "Did you mean account X or Y?").

Pattern:
```python
# LLM calls propose_clarification(question, options)
# Tool is in _PROPOSAL_TOOLS → yields JSON to frontend
# Frontend renders ClarificationCard with buttons
# User clicks → sends button value as user message → conversation continues
```
