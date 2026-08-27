---
paths:
  - "docs/**/*.md"
---

# Priority tracking

**Rule (2026-07-03, do not violate):** issue priority/status lives ONLY on GitHub — never in a hand-maintained markdown file. Two separate incidents the same day (`docs/roadmap.md`'s milestone table and `docs/backlog.md` both independently tracking #41/#42/#138's status and disagreeing; before that, the root `CLAUDE.md` "Current priorities" list drifting from reality for weeks) are why: any doc that duplicates what an issue's own state already says WILL go stale, because nothing forces the two to update together.

**Mechanism:**
- **GitHub Milestones** — big phases (M0-M6, matching `docs/roadmap.md`'s themes). Assign an issue to a milestone when it maps to a specific roadmap phase.
- **GitHub Labels** — tactical priority: `tier-2`, `tier-3` (ready to pick up, by effort), `intelligence-cluster` (proactive budget intelligence, medium priority, after standard functionality), `deferred-local-first` (blocked on switching back to local LLM), `deferred-opportunistic` (not scheduled).

**Query examples:**
```
gh issue list --label tier-2
gh issue list --label intelligence-cluster
gh issue list --milestone "M4 — Smart Alerts"
```

**What CAN live in docs:**
- Narrative that doesn't fit a label — sequencing rationale, "why these are grouped" — goes in the issue's own body/comments, not a separate tracking table.
- `docs/roadmap.md` stays narrative-only: milestone themes, what "done" looks like. No per-item status tables for anything with a live GitHub issue — link to the issue instead (see 4.5/4.7/5.7/5.9/6.1 in the M4/M5/M6 tables for the pattern).
- `docs/feature-ideas.md` is for ideas that AREN'T issues yet. The moment one becomes actionable, open an issue (with the right label/milestone) and remove it from that list.

**Before adding any new priority/status list to a doc:** stop — it almost certainly belongs as a GitHub label or milestone instead.
