# 13 — How to start working on the next task

A practical guide for opening a new Claude session and getting to work efficiently.

---

## Step 1 — Pick the task

Open `docs/roadmap.md`. Find the **current milestone** (the first one without ✅). Within that milestone, pick the first unfinished item. If everything in the milestone is done, the milestone is complete — move to the next.

If you have a bug reported or something broken: that takes priority over roadmap items.

If you have multiple candidates and aren't sure which to pick: ask Claude — "I have these 3 options, which unblocks the most?"

---

## Step 2 — Prepare the session

Open a new Claude Code session. Claude will read CLAUDE.md automatically (it's in project instructions). That's enough to start.

**You don't need to paste files manually.** Claude reads what it needs based on the task. If it doesn't, it will tell you.

What you DO need to tell Claude at the start:
- What you want to work on (one sentence is enough)
- Any relevant context that isn't in the code (e.g. "this worked last week and now it doesn't", "the user reported this on Android Chrome")

---

## Step 3 — Wait for the plan

Before any code is written, Claude will:
1. Read the relevant files
2. Explain what it found (2-3 sentences)
3. Propose an approach

**Don't skip this step.** If the explanation doesn't match what you expected, say so before implementation starts. It's much cheaper to correct the plan than to correct the code.

---

## Task type reference

### Bug
```
You: "X doesn't work — [describe symptom, not cause]"
Claude: reads logs/code, explains root cause, proposes fix
You: confirm or ask questions
Claude: implements, tells you what to test
You: test → confirm → Claude commits
```

### Feature (known milestone item)
```
You: "Let's work on [feature name] from roadmap"
Claude: reads roadmap item + relevant learn/ files + architecture
Claude: presents plan in 3-5 lines (what will change, what risks exist)
You: confirm or redirect
Claude: writes DeepSeek prompt OR implements directly (based on complexity)
You: test → confirm → Claude commits + closes issue + updates roadmap
```

### Refactor
```
You: "I want to clean up [area]"
Claude: reads docs/decisions.md FIRST — there may be a reason it looks the way it does
Claude: proposes what to change and why, what to keep and why
You: confirm scope
Claude: implements
```

### New milestone
```
You: "M[X] is done, let's plan M[X+1]"
Claude: reads docs/roadmap.md, proposes implementation order within the milestone
You: brainstorm — this is the time to change priorities, add context, reconsider scope
Result: clear first task to start
```

---

## Step 4 — During the session

- If Claude asks a clarifying question → answer it before saying "go ahead"
- If something unexpected appears (unfamiliar file, surprising behavior) → ask Claude to investigate before changing anything
- If the session runs long and you need to stop → ask Claude to summarize what's done and what's left; resume next session with that summary

---

## Step 5 — Closing the session

When the task works and you're satisfied:

1. Tell Claude: "This works" or "Confirmed"
2. Claude will:
   - Commit with correct timestamp
   - Close the GitHub issue
   - Update `docs/roadmap.md`
   - Add entry to `docs/sessions/YYYY-WNN.md`
   - Update `docs/sessions/INDEX.md`
3. You verify the commit message looks right
4. Done — next session starts fresh

**Don't rush the close.** The session log and roadmap update are what make the next session fast. Skip them and you'll spend 10 minutes reconstructing context next time.

---

## Common mistakes to avoid

**Starting to implement before the plan is confirmed.** Claude can misunderstand the task. Always read the plan first.

**Working on two things at once.** One feature, one bug, one refactor — per session. Mixing tasks means incomplete commits and unclear session logs.

**Skipping the test.** Claude can't test the UI for you. "Looks right" in code is not a confirmation — run the app and click through the flow.

**Closing the session without updating docs.** The next session will be slower and less accurate without the session log entry.
