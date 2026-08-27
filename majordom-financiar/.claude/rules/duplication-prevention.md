---
paths:
  - "backend/**/*.py"
  - "frontend/src/**/*.{ts,tsx}"
---

# Duplication & dead-code prevention

**Rule (2026-07-03, do not violate):** when a new flow replaces an old one, delete the old one in the *same task* — not later, not "once things settle." The #93 audit found 4 dead PWA endpoints (`/api/stats`, `/api/budget`, `/api/accounts/goals`, `/api/stats/fire`) that `/api/home` had fully superseded, and 3 near-identical calculation loops copy-pasted across `get_monthly_stats`/`get_budget_status`/`get_home_data` in `client.py`. This wasn't just clutter: one copy (`get_home_data`) silently gained a rollover-aware budget-balance fix that the other two never received, so the chat tool and the Home screen showed different numbers for the same category with no error anywhere to reveal it. See `docs/decisions.md#93-code-audit` and `docs/architecture.md` rule 20.

**Mechanism:**
- **Retiring a flow = deleting it now.** If a new endpoint/tool/screen replaces an old one, remove the old endpoint, its frontend wrapper, and any now-unused model in the same PR. "Leave it in case something still calls it" — check first (grep), don't guess.
- **Before writing a loop over transactions/categories/budgets, check `backend/core/actual_client/client.py` for an existing shared helper** (`_compute_monthly_totals`, `_compute_budget_vs_spent`, `_tombstoned_category_remap` — architecture.md rule 20). If it doesn't cover the new need, extend it — don't copy-paste and let the copies diverge.
- **Extract at the second occurrence, not before and not later.** Don't build a helper speculatively for a hypothetical future need — that guesses the wrong shape before a real second use case exists, and contradicts the root `CLAUDE.md`'s "no speculative code" rule. But the moment you're about to write a *second* copy of a loop/calculation that already exists elsewhere, extract right then — don't wait for a third occurrence or a future audit to catch it. Two occurrences copy-pasted and left alone is exactly how #93's divergence bug happened.
- **DeepSeek prompts for any finance-calculation feature must name the relevant shared helper(s) in "Relevant files"** and say "reuse, don't reimplement" — the helper itself is the spec, per the "spec not code" rule in the `/plan-feature` skill.
- **Trust the existing audit triggers already in `docs/roadmap.md`** (10+ new features since the last audit / same bug appearing in multiple places / one change touching many files) and open a new audit issue the moment one fires — don't wait for it to compound into a bigger cleanup later.
