# Majordom — product position and development plan

Written 2026-08-30, at the end of the audit session, because development had drifted into
reactive work: fixing what surfaced, adding UI where it seemed missing. This document exists so
that stops. Its job is not to list features — it is to make it **obvious what to say no to**.

Status and priority live on GitHub (`.claude/rules/priority-tracking.md`). This file is narrative
only: what we're building, in what order, and why. No status tables.

---

## 1. The position

### The question that defines it

> *Why would someone use Majordom instead of just pointing Claude Code at Actual Budget?*

Worth answering honestly, because if there's no answer there's no product.

**Claude Code is an agent you drive. Majordom is an agent that watches.**

Claude Code over Actual Budget requires a terminal, a subscription, technical skill, and you
re-explain your situation every session. It answers questions well — but only the questions you
think to ask, at the moment you think to ask them. It has no standing knowledge of your
conventions, no safety pattern for financial writes, no phone, and no reason to ever speak first.

Majordom runs continuously, knows your accounts and rules without being told again, and **speaks
first**. That difference has a name:

> **Everything else in this space stores or displays. Majordom notices.**

### The same answer, against the other alternatives

| Compared to | What they do | What's missing |
|---|---|---|
| **Your bank's app** | Shows one bank, beautifully | Doesn't span accounts, vehicles, investments, cash. Categorises badly. Never says "this is unusual *for you*". |
| **Actual Budget alone** | Excellent ledger and budget, real carryover | Zero initiative. It is a very good filing cabinet. It never tells you anything. |
| **A spreadsheet** | Total control | Everything is manual, and it goes stale the week you get busy. |
| **Claude Code + Actual Budget** | Genuinely capable, on demand | Only when you ask, only from a terminal, no memory of your conventions, never proactive. |

### The product statement

> **Majordom is the intelligence layer between an agent and whatever engine holds the financial
> data.** Any agent in front. Any engine behind. The judgement lives in the middle.

Both halves are already decided: the adapter points outward (#222), MCP points inward (#58). See
#224.

### What "done" feels like

Not "has many screens". The target is a specific feeling:

> **You stop checking. It tells you.**
> Duplicates get noticed and offered for a one-tap confirm. Unusual spending gets mentioned
> before you find it. The month's shape is known without you opening anything. Your investments
> are in the same picture as your spending, and neither lives in a spreadsheet.

Everything below serves that sentence, or it doesn't get built.

---

## 2. The discipline rule

**Before any task is picked up, it must answer this:**

> **Which phase does this serve, and how does it increase what Majordom notices or does on its own?**

If the honest answer is "it doesn't, but it bothered me" → it goes to the parking lot (a GitHub
issue with no milestone). Not refused, not lost — just not now.

Three failure modes this is written against, all observed in this repo:

- **Adding a screen because a screen felt missing.** A new view is not progress unless something
  new is being noticed. Most of what looks like a missing screen is a missing *insight*.
- **Fixing what surfaced instead of what matters.** Real bugs get fixed — but a fix is not a phase
  goal, and a session of fixes is not a step forward.
- **Building the abstraction before the second use case.** `FinanceProvider` was built for a
  migration that never happened and leaked twice (#148, #222). Earn the framework.

When something new comes up mid-flight: say it, and it gets placed in a phase or the parking lot
in that moment. The plan changes deliberately, not by drift.

---

## 3. The phases

Each phase has **one objective**, a **test for whether a task belongs**, and a **done condition**.
They are sequential because each one is the ground the next stands on.

### Phase A — Ground that holds

**Objective:** stop building on sand. The audit found the base leaks in ways that would silently
corrupt anything built on top.

**Belongs here if:** it removes debt that would otherwise be multiplied by everything after it.

- Revoke the orphaned Telegram token, remove the container (#220)
- Measure and fix the chart lag before it distorts an engine decision (#223)
- Wire the enforcement mechanisms in — trackable hook, working scanner path (#213)
- **Finish the adapter** — route the eleven `backend/api/` modules through `get_provider()` (#222)
- Delegable in parallel: the three divergent HTTP layers (#214), the 40 copy-pasted handlers (#215)

**Done when:** changing the budgeting engine means writing one new adapter, not touching eleven
modules — and the checks that keep it that way run without anyone remembering to run them.

**Why first:** every later phase writes against `FinanceProvider`. Doing this last would mean
rewriting the intelligence twice.

---

### Phase B — The Inbox

**Objective:** build the one mechanism the entire product rests on — a standing place where
Majordom puts things it noticed, each with a proposed action and a one-tap confirm.

This is the phase Doru described directly: *"it should solve duplicates itself — after the user
confirms — but it should be something Majordom has in view. The intelligence point."*

**Belongs here if:** it makes Majordom notice something without being asked, and offer an action
for it.

- The Inbox itself: a queue of findings, each with a proposal, a confirm, and a dismiss
- **First occupant: duplicate transactions.** Already a recurring, real problem, and already has
  the pieces (`find_near_duplicate_transaction`, `get_duplicate_transactions_by_month`,
  `merge_duplicate_transaction`, `DuplicatesReviewPage`) — they just don't come to you
- Second occupant: uncategorised transactions grouped by payee, with a "save as rule" confirm
  (the Rules-engine pattern from #99 already does this — it just has to be offered, not requested)
- Dismissals are remembered. Something dismissed does not come back next week.

**Done when:** you open Majordom and the first thing you see is *what it found since last time*,
not a dashboard you have to interpret.

**Why this is the spine:** every intelligent thing Majordom will ever do lands here. Coaching,
alerts, budget checks, unusual spending — all of it is "Majordom noticed something and proposes
an action". Build the channel once, and every later capability is small.

---

### Phase C — Three capabilities, then the pattern

**Objective:** fill the Inbox with genuine judgement, then extract the module shape from what
actually repeats.

**Belongs here if:** it makes Majordom notice something about *your* money that a generic tool
couldn't.

- Pick three from the `intelligence-cluster` (#110, #111, #112, #116, #124, #41, #42) — e.g.
  budget realism per category, sinking-fund detection for large predictable expenses, month-end
  uncategorised/unreconciled sweep
- Build all three the ordinary way. **No plugin framework.**
- While writing the second and third, watch what they genuinely share: how they get data, how a
  finding is shaped, how it reaches the Inbox
- **Then** extract the coach-module pattern from what repeated (#224)

Governed throughout by `decisions.md#coach-not-consultant`: projection inputs stay user-editable,
nothing is presented as advice about specific investments.

**Done when:** adding a fourth capability is a small, obvious piece of work — and the module
pattern was extracted from evidence, not designed from imagination.

---

### Phase D — The whole picture

**Objective:** investments stop living in a spreadsheet. Doru's own words: *this is actually the
point of it.*

**Belongs here if:** it puts investments into the same picture as spending, so coaching can reason
across both.

- Decide the market price data source — the real dependency, and the one that needs a deliberate
  choice (see the closing comment on #4)
- Build the portfolio calculation layer inside Majordom: cost basis, time-weighted and
  money-weighted return, allocation. Bounded, well-documented maths over transactions you already
  have — unlike a budgeting engine, this is a reasonable build
- Charts in Majordom's own UI, not a second app's
- Coaching capabilities gain access to the investment side (Expense Coverage / FIRE, #167, #177)

**Done when:** the spreadsheets are closed and not missed.

**Why after C:** coaching that only sees spending is half a picture — but a portfolio with no
coaching around it is just another chart. C makes D worth having.

---

### Phase E — Someone else can install it

**Objective:** the friction between "I heard about this" and "it's running" is small enough that a
non-expert gets through it.

**Belongs here if:** it removes a step a new user would have to understand rather than just accept.

- Actual Budget becomes invisible: Majordom provisions and configures it, no hand-editing (#190)
- Real HTTPS in front, so no SSH tunnel or manual DNS (#157)
- The capability catalogue (#224) written as the actual pitch — *here is what Majordom notices for
  you*. This is the answer to "why install this", and it can be written before it's all built
- Install path tested cold, by someone who isn't Doru

**Done when:** someone who is not you installs it without asking you a question.

**Why last:** packaging before there's a reason to install is packaging an empty box. Phases B-D
are the reason.

---

## 4. What this plan deliberately does not do

- **No new dashboard widgets** unless they surface something from the Inbox. The Dashboard is
  finished until an insight needs a home.
- **No new engine.** Staying on Actual Budget is not a commitment — Phase A makes leaving cheap,
  which is what makes it safe to stay. Revisit only with a verified reason (#189).
- **No coach framework before Phase C's third capability.**
- **No second backend implementation** until someone other than Doru actually needs one.

---

## 5. How this file is used

- New idea mid-session → placed in a phase or the parking lot, out loud, at that moment.
- Every task starts with: *which phase, and what does it make Majordom notice?*
- Phase boundaries are checkpoints — when a phase's done condition is met, review this file before
  starting the next. Some of it will be wrong by then.
- This file holds **direction**. GitHub holds **status**. They must never both hold the same thing.
