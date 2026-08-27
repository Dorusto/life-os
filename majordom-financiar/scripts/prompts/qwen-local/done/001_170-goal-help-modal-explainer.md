# Task: Help modal — clarify that goal tracking doesn't require moving money

## Context
Closes GitHub issue #170. A goal's target only needs the tracked account's *balance* to
reconcile with reality — it does not require actually transferring money into a separate
bank sub-account. A single real account's balance can be mentally/virtually split across
several goals; only the total has to match what's really in the account. An earlier session
explained this wrong (as requiring an actual transfer), corrected in discussion, but never
written down anywhere the user can re-read.

## Goal
Add a short explainer to Chat's help modal so a user reading it understands: goal tracking is
about the tracked account's balance matching the target amount, not about literally moving
money into a dedicated account.

## Relevant files
| File | What it contains |
|------|-----------------|
| `frontend/src/pages/Chat.tsx` | The help modal. The "Budget & goals" section is around line 581-589 — a `<div>` with a bold section title (`<p className="text-white font-medium mb-2">Budget & goals</p>`) followed by a `<ul>` of example prompts. |

## Changes required
### 1. `frontend/src/pages/Chat.tsx`
Add the explainer inside the existing "Budget & goals" section (do not create a new section) —
either as a short intro paragraph before the `<ul>`, or as a small note after it, whichever
fits the existing visual rhythm of that block best without disrupting the other help sections.
Plain, short, user-facing language (this modal is read by the end user, not a developer) —
one or two sentences is enough. Follow the styling already used by sibling text nodes in that
`<div>` (same font size/color classes as the surrounding `<p>`/`<ul>`), don't invent a new style.

## Critical Rules
- This is a *general* concept explained once here — do NOT also add it inside each individual
  goal's own (i) info popup (`GoalCard` in `frontend/src/pages/Home.tsx`), which should stay
  focused on that specific goal's own description/note. (source: issue #170)
- All UI copy in this repo is English. (source: root `CLAUDE.md`)

## Gotchas
No specific rules identified beyond the above — this is a text-only change in one file.

## Do NOT touch
- `GoalCard` / `Home.tsx` — explicitly out of scope, see Critical Rules.
- Any other help-modal section (`Categories & rules`, `Vehicle tracking`, etc.) — only the
  "Budget & goals" section changes.
- No backend, no data model, no new dependency — this is a pure frontend text addition.

## Done when
A user reading the help modal's "Budget & goals" section understands goal tracking works via
account-balance reconciliation, not a literal money transfer — verify by reading the rendered
modal, not just the diff.
