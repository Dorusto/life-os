# CLAUDE.md archive — moved out 2026-09-23

Verbatim text removed from `CLAUDE.md` when it was slimmed down (it had grown to 349 lines,
~35 KB loaded into every session; Anthropic's Claude Code best practices warn that an
over-long CLAUDE.md makes Claude ignore its actual rules). Nothing here is deleted history —
it is the dated "what shipped / why this rule exists" narrative. The rules themselves still
live, condensed, in `CLAUDE.md`. Treat this file like the other session logs: grep it for
context, don't load it by default.

---

## Direction block (phase-by-phase shipping log, 2026-08-30 → 2026-09-11)

> ### 🧭 Direction — read `docs/product-plan.md` before picking up anything
>
> Development had drifted into reactive work (fix what surfaced, add UI where it felt missing).
> `docs/product-plan.md` holds the product position and the phased plan that stops that. **Every
> task must answer: which phase does this serve, and what does it make Majordom notice or do on
> its own?** If the honest answer is "none, but it bothered me" → parking lot, not now.
> The position in one line: *everything else in this space stores or displays; Majordom notices.*
>
> ### ✅ Phase A complete (set 2026-08-30, done 2026-08-30)
>
> All 4 items closed same-day: #220 (Telegram token), #223 (chart lag), #213 (mechanisms wired
> in), #222 (FinanceProvider adapter — all 11 `backend/api/*.py` modules + `tools/finance/vehicle.py`
> now route through `get_provider()`, see `docs/decisions.md#financeprovider-adapter-finished`).
> Full reasoning/history for #222's "why" (portfolio core-scope, adapter-for-modularity-not-Sure)
> is in that decisions.md entry, not repeated here.
>
> **Still open, worth picking up next** (check `gh issue list` for current state): #215 closed
> 2026-09-02 (`Chat.tsx` lookup-table dispatch), #214 closed 2026-09-02 (three HTTP layers,
> divergent 401 handling, unified onto one `authFetch()` transport — see `docs/product-plan.md`'s
> "Refactor debt" section). #157 (HTTPS/reverse proxy) and #190 (setup wizard) — related
> to the Actual-Budget connection friction, not caused by the engine itself. #216, retitled to
> track only its unresolved half (private helpers crossing layers — `_calc_fire`, `_load_fire_model`,
> `rule_match_prefix`, `_financial_id`). **Portfolio** stays core scope (not optional) — the
> calculation layer belongs in Majordom, market price data source is the open dependency.
>
> ### ✅ Phase B complete (closed 2026-08-30)
>
> Both named occupants shipped: duplicate-pair review (persisted dismiss) and uncategorized-by-payee
> (one-tap categorize+dismiss, see `docs/decisions.md#inbox-occupant-2-uncategorized-payee`) — both
> reachable from `NotificationBell` rather than "the Inbox" as one dedicated screen; that pattern
> was a deliberate call, not a shortcut (reasoning in the same decisions.md entry). **The open
> question from that session (whether the bell alone satisfies Phase B's done-condition, or needs
> something more prominent on Home) is now resolved: the bell stays sufficient, no Home banner —
> reasoning in `docs/decisions.md#phase-b-closed-bell-sufficient`.** Phase B is fully closed; do not
> reopen the Home-banner question without new evidence of real friction.
>
> ### ✅ Phase C shipped — re-scoped 2026-08-30 as "Zero-touch administration", closed 2026-09-01
>
> All four items in the ordered sequence (#172 → #241 → #117 → #41 rescoped) shipped 2026-09-01 —
> full reasoning lives in `docs/product-plan.md`'s Phase C, not duplicated here. #117 (assisted
> reconciliation — investigate before offering a balance adjustment) and #41 (recurring-transaction
> create/deactivate lifecycle, not just a review nudge) were the last two; both live-tested end to
> end (#117 via a real chat conversation, #41 via actual browser clicks on both new confirm cards),
> not just a passing build. #41 also surfaced a real bug — the pre-existing, never-used
> `create_schedule()` left new schedules inactive by default (architecture.md rule 36).
>
> **Phase C's own "Done when" (a full month without opening AB directly) is a usage outcome, not
> something a commit can assert** — don't mark it further done, just don't reopen it either without
> new evidence it isn't holding. #113/#124 and the rest of the coaching-shaped cluster (Phase C2)
> are next, once there's been time to see whether administration actually reached zero.
>
> Still open, unrelated to the re-scope: **#245** (opened 2026-09-01, follow-up from
> an unplanned mid-session perf interrupt — Home page load still ~20s, root cause is per-call
> compute in `get_home_data`/`get_budget_status` per #227, not connection overhead; that part's
> already fixed). #242 closed 2026-09-11 (see `docs/sessions/2026-W37.md`).
>
> **#254** (AB reconnect banner, cut from #190's original spec) implemented and live-verified
> 2026-09-11 — reactive detection via `ActualBudgetClient._run()`'s single choke point (no
> polling), see `docs/decisions.md#254-reactive-not-polling` and `architecture.md` rule 40.
> Pushed and closed 2026-09-11 evening (`git push` `84273b3..23edf75`).
>
> **#112** (annual budget pacing, one of Phase C2's coaching-cluster items) implemented and
> live-verified 2026-09-11 — Settings-based editable config, formula extrapolated from elapsed
> months, bell alert only when over pace, see `docs/decisions.md#112-annual-budget-pacing`.
> Pushed and closed 2026-09-11 evening, same push as #254. Remaining Phase C2 items: #111/#42,
> both blocked on real gaps (no live bank-sync for #111, undecided market-data source for #42 —
> see that entry's own dated session note before picking either up).
>
> **#227 fixed and #245 checked against real evidence, both 2026-09-11.** `actualpy`'s
> `get_accumulated_budgeted_balance()` was being called once per zero-budgeted category and
> internally re-deriving the whole budget history every time; hoisted one shared lookup instead,
> 7.86s→0.50s measured, `architecture.md` rule 41. #245's "`budget-period` fetched twice" claim
> was re-checked three independent ways (frontend network trace, a React mount/unmount probe, and
> — the same kind of evidence its original 2026-08-30 report used — real `docker compose logs`
> access-log entries) and does not reproduce on the current code; two earlier same-session
> measurement mistakes along the way (an uncleared network log, then a silently-unfiltered
> `docker logs --since`) are both corrected in `docs/sessions/2026-W37.md`. Both closed 2026-09-11
> evening — #227 on the compute-cost half only (the "fetched twice" claim doesn't reproduce,
> not confirmed fixed), #245 on the doesn't-reproduce finding itself.
>
> **#111** (unprotected savings-goal detection, Phase C2's last coaching item) implemented and
> live-verified 2026-09-11 — re-scoped from "needs live bank sync" (wrong earlier read of the
> issue) to reusing the existing `TARGET:`/`DEADLINE:` account-goal mechanism, conservative
> trigger, see `docs/decisions.md#111-unprotected-goal-detection`. Delegated via Aider/DeepSeek
> Flash — a wrong assumed worktree path made the dispatch land its commit directly on `main`
> instead of the isolated branch (content reviewed after the fact, found correct, kept). Fixed at
> the skill level, `~/.claude/skills/delegate-by-complexity/`, not just noted here — protects
> every future delegation. **Phase C2 is now fully shipped** (#111/#112/#41/#113 all closed or
> implemented) except #42 (still blocked on Phase D's undecided market-data-source question).
>
> **Housekeeping, same session:** `docs/glm-5.3/ui-audit-2026-08-30.md` (source for #231-240)
> translated Romanian→English and committed — had sat untracked 12 days, blocked by the
> English-only rule. Delegated correctly this time (isolated worktree, path verified). **All 7 of
> the audit's own §5 "quick wins" now shipped**: x-axis losing the year on multi-year series
> (§1.2, partial #231), `vehicleQuery` missing `retry: false` (§4.2), 1px-invisible progress bars,
> raw ISO date in Transactions, 6 undersized tap targets + axis label sizes (delegated to Flash
> silently, per the user's standing rule — see `delegate-by-complexity/SKILL.md`), and raw Python
> tool-error text leaking verbatim into Chat (§4.3) — wrapped in a per-occurrence instruction,
> live-verified against the app's real chat LLM with the exact real-world scenario. Medium-effort
> item #8 (chart height ×1.6–2 + Y gridlines) shipped 2026-09-11 evening — see below. Remaining
> medium-effort items (§5's second tier — tooltips/drill-down, skeletons, animations, color
> registry, sticky headers, date grouping, PWA icons) not started, next natural pickup. Live
> pixel-check on a real vehicle chart (§1.2's fix) still pending — no vehicle fixture data exists
> locally right now.
>
> **Chart height + Y gridlines (audit §5 item #8, issue #231) shipped 2026-09-11 evening** — single
> file (`frontend/src/components/Chart.tsx`): donut 72→120px, line chart 100→160px (+3 intermediate
> Y gridlines alongside the existing min/max labels), bar chart 80→140px (+5 Y gridlines with
> `formatCurrency` value labels, bars/x-axis/value rows given a shared `pl-8` offset so the new
> left-side labels don't overlap). Pure SVG/div, no new library, consistent with the #134 decision.
> Live-verified in the browser (not just typecheck) against all three chart_type variants that
> actually render on real pages/chat: the Dashboard's `line` "Balance trend" widget, a `pie`
> spending-breakdown chart, and a `bar` spending-vs-income chart. Commented on #231 (not closed —
> covers more of §1 than just sizing). **Found live while testing:** `finance__get_spending_trend`
> (the bar-chart tool) has no bullet in `_build_system_prompt()`'s tool-guide section, unlike the
> other four chart tools — same #160/#166 pattern, unreliable tool selection. Filed as
> [#255](https://github.com/Dorusto/life-os/issues/255) rather than fixed inline (separate,
> unrelated concern — one feature at a time).
>
> **Chart tap-tooltip (audit §5 item #9, tooltip half only, partial #232) shipped 2026-09-11
> evening** — same file, same session. Scoped down before coding: item #9 bundles tooltip with
> drill-down-to-Transactions, but investigating drill-down first found `Transactions.tsx`'s
> `getInitialFilters()` silently ignores `dateFrom`/`dateTo` whenever `categoryIds` is falsy (a
> date-only drill-down needs `categoryIds: []` explicitly to dodge that), and `get_spending_trend`'s
> bar points carry only a pre-formatted label (`"Aug-26"`), not raw month/year — drill-down needs
> either a fragile label-reparse or a backend contract change. Both flagged in the #232 comment,
> drill-down deferred to its own pass. Tooltip itself: tap a line point or bar column to toggle a
> small value tooltip; larger invisible hit circle on line points (visible dot alone is far below
> the 44px tap-target guideline). Found and fixed live: the first version overflowed the card edge
> on the last bar/point — fixed by reusing the file's own existing first/last axis-label clamping
> pattern. Commented on #232 (not closed) — drill-down and entrance animation still open.
>
> **Detail-page loading skeleton (audit §5 item #10, worst-offender half only, partial #234)
> shipped 2026-09-11 evening.** Scoped from the audit's own §2.4 text: `WidgetLoading`
> (Dashboard spinner+text) already called "good," only `VehicleDetail.tsx`/`AccountDetail.tsx`'s
> literal blank `min-h-dvh` div on first load (the audit's own "most visible before/after"
> example) needed fixing. New shared `frontend/src/components/DetailPageSkeleton.tsx`
> (`animate-pulse` blocks matching both pages' identical header shape, extracted immediately
> since it's exactly 2 occurrences) swapped in for both. Couldn't visually catch the skeleton
> frame locally — fixture queries resolve faster than a screenshot round-trip, the same reason
> this bug was invisible here and only real on the LXC — verified via no-regression screenshots
> of both real pages plus clean `tsc --noEmit` instead. Incidental: a real vehicle fixture
> (`Duster`) now exists locally, used it to confirm the earlier multi-year x-axis fix (`§1.2`,
> part of #231's history) renders correctly on real 12-year projection data — that fix's own
> "pending live pixel-check" note is now closed out. Commented on #234 (not closed) — per-widget
> Dashboard skeletons still open, deferred since `WidgetLoading` is judged adequate there.
>
> **Category color registry (audit §5 item #12, partial #231) shipped 2026-09-11 evening.**
> Investigating first found only 2 of the audit's 5 "fragmented" constants are true
> category-color duplicates (`Chart.tsx`'s `SEGMENT_COLORS`, `Dashboard.tsx`'s
> `EXPENSE_COLORS`); `GROUP_COLORS`/`GOAL_COLORS` are different domains, and the
> percentage-based green→red budget gradient is a semantic state color the audit itself
> says should stay separate. New `frontend/src/lib/chartColors.ts` — one shared palette +
> deterministic `colorForKey(name)` hash, replacing all 4 index-based (`PALETTE[i % n]`)
> arrays; the real root cause was position-based assignment, not just duplicated arrays.
> Live-verified the actual bug fixed (not just the refactor): "Home"/"Groceries" etc. now
> show identical colors on the chat pie chart vs. Dashboard's Expenses Structure widget,
> confirmed via before/after screenshots. **Found and filed separately as
> [#256](https://github.com/Dorusto/life-os/issues/256), scope choice surfaced to the user
> before coding:** `ExpensesStructureWidget` (Dashboard.tsx) is a second, independent
> pie-chart implementation (CSS conic-gradient) duplicating `Chart.tsx`'s `PieChart` — the
> same pattern #134 already solved once, reintroduced after that migration. The user chose
> color-registry-only for this pass; #256 stays open for the duplication itself.
>
> **Sticky page header (audit §5 item #13, page-header half, partial #237) shipped
> 2026-09-11 evening — and a real app-wide bug found along the way.** Added `sticky top-0`
> to the shared `PageHeader.tsx` (13 pages, one fix) — applied correctly (confirmed via
> computed style) but had zero visible effect. Root cause, found live: every page's outer
> wrapper used `min-h-dvh` (a floor, not a cap) combined with `overflow-y-auto` — the div
> grew past the viewport instead of clipping, so its own scroll never engaged and the real
> scroll happened on `document`/`body` instead, leaving `sticky` relative to a container
> that never moves. Scope (identical wrapper string in 15 places across 13 pages) surfaced
> to the user before touching more files; fixed `min-h-dvh` → `h-dvh` everywhere via one
> mechanical replace. Documented as `architecture.md` rule 42 so a new page can't silently
> reintroduce this. Live-verified on 3 pages, no regressions. "Sticky date headers" (this
> item's other half) still needs #14 (date grouping) to exist first — nothing to make
> sticky yet.
>
> **Date grouping + monthly summary (audit §5 item #14, partial #237) shipped 2026-09-11
> evening.** New shared `frontend/src/lib/groupByMonth.ts` (date-sorted list → month buckets
> with a net total) used by both Transactions (list + table views) and Account Detail's
> transaction list. Checked `DuplicatesReviewPage.tsx`'s existing month UI first — different
> shape (backend-paginated drill-down, not client-side grouping), not reusable. **Real
> correctness fix found along the way**: the list view's category-chip dedup was computed
> globally across the flat array, so a chip could wrongly hide right under a new month
> header when the boundary rows shared a category — recomputed per-group instead. Live-
> verified all 3 surfaces (Transactions list/table, Account Detail) against real fixture
> data — correct grouping and net totals, no regressions. The month headers now exist, so
> #13's "sticky date headers" half is buildable as a follow-up (stack under the page
> header per rule 42) — not done this pass.


---

## Known process gaps (identified 2026-07-04) — full text

Found during an external review of `architecture.md`/`decisions.md` for a course-curriculum project. Reviewed against established practices (ADRs, SRE runbooks, fitness functions) on 2026-07-04 — 3 of 5 fixed same day, 1 given a deliberately light mitigation, 1 left open by choice (see reasoning per item). Full comparison + reasoning: `docs/sessions/` (grep "process gaps").

1. **No regression tests for documented silent-failure gotchas** — **left open, by choice.** `architecture.md` rules 12, 14, 15, 17, 21, 22 all document bugs that failed silently. Writing automated regression tests for each was judged not worth the overhead for a single-user app (same reasoning as decision `#96`). Light mitigation instead: any newly-documented silent-failure gotcha should get a tracked GitHub issue (not a new doc), so it's at least visible/queryable, not purely "hope someone reads the rule."
2. **Architecture audits triggered by symptom, not schedule** — **mitigated, light.** A monthly scheduled check (see the `schedule` skill setup, 2026-07-04) reviews the existing audit triggers in `docs/roadmap.md` and opens a GitHub issue only if one actually fires — doesn't force an audit, just stops the trigger from being missed silently.
3. **`architecture.md` mixed stable design rules with operational/deploy quirks** — **fixed 2026-07-04.** Rules 18-19 (Docker backup, `--build` vs `restart`) tagged inline with `🔧 RUNBOOK` rather than physically moved — a physical split would have orphaned ~15 existing cross-references to those rule numbers in `decisions.md` and `docs/sessions/`. New ops-only rules should get the same tag going forward.
4. **`decisions.md` entries accumulated retroactive updates inline** — **fixed 2026-07-04.** Added an explicit ADR-style immutability rule to the top of `decisions.md`: entries are never edited after the fact, only superseded by a new entry with a one-line marker. Existing violations (e.g. "Sure adoption") are left as-is — rewriting old entries to fit the new rule would itself violate the new rule.
5. **Pre-implementation research had a blind spot mid-implementation** — **fixed 2026-07-04.** The `/plan-feature` skill's "Before any implementation" checklist now states explicitly: if implementation reveals something unexpected, stop and re-verify before continuing — not just a one-time gate before writing code.


---

## Collaboration rules — full text with history

**Claude = senior/architect:** reads code, designs solution, scopes the task.
**DeepSeek = engineer:** implements, via Aider.

**Proactively flag system/tooling gaps, not feature implementation (2026-09-19).** If something about the system itself looks wrong or improvable — a skill that exists but isn't being triggered, a repeated manual step that could be automated, an inefficiency in how Claude works this repo — say so and propose a fix, don't wait to be asked. Scope is system/process/tooling only. Feature architecture and implementation choices stay exactly as scoped above (Claude decides pure-technical calls, surfaces only design/product-direction forks) — the user wants to keep working through those himself, not have them handed to him pre-solved.

- **Default delegation path (corrected 2026-08-29, replacing the old habit below): run the `delegate-by-complexity` skill and dispatch directly through Aider headless** — isolated git worktree, task written per its prompt template (same Context/Goal/Relevant files/Critical Rules/Gotchas/Do NOT touch/Done when shape `plan-feature` already used, plus a Circuit breaker clause), `aider --model openrouter/deepseek/deepseek-v4-flash` (or `-v4-pro` for Senior-tier tasks) `--message-file <task>` — OpenRouter is the default vehicle since 2026-09-02, DeepSeek-direct retired (no credit); see `delegate-by-complexity`'s own `SKILL.md` for the current rubric. Claude reviews the diff and requests merge confirmation from the user — never writes a static prompt file to the repo and stops there. Corrected after the user flagged the old habit resurfacing despite the skill existing ("nu stiu de ce nu s-a activat skill-ul") — check for `delegate-by-complexity` before defaulting to the manual file habit below.
- **Manual prompt-file path — fallback only, not the default.** `scripts/prompts/deepseek/NNN_desc.md`, one file per task, for when the user wants to run DeepSeek himself directly, or Claude Code is unavailable. Still uses the same prompt template. Once saved for this reason, stop — the user runs it manually, same handoff as before, just no longer Claude's default action when Claude itself is doing the delegating.
- **No `scripts/prompts/claude/` files.** DeepSeek prompts are saved to a file because a different tool consumes them later. A "kickoff prompt for the next Claude session" has no such reason — deliver it directly in the open chat, never as a saved file. Removed 2026-08-28: this repo is English-only (root `CLAUDE.md`), and the folder had accumulated 12 Romanian-language files (`scripts/prompts/claude/000`-`011`) before `check-private-data.sh`'s Romanian check (added the prior session) caught it on the next commit — the convention was never a deliberate decision, just Claude repeating its own earlier pattern.
- **`/task-complete`'s final step (2026-08-28, at the user's request) hands off with a next-session kickoff prompt by default**, not just when asked — delivered in chat per the rule above, factoring in whatever delegation tooling exists (e.g. `/delegate-by-complexity`). Skipped only when this session's context is still light and the next step is pure architecture discussion + delegation dispatch — then just keep going in the same chat instead of suggesting a fresh one. See `.claude/skills/task-complete/SKILL.md` step 3 for the full rule — not duplicated here.
- Delegate to DeepSeek only when you save tokens overall (implementation + verification). Simple tasks with expensive verification → implement directly. Complex but well-defined tasks with fast verification → DeepSeek.
- **Lean toward DeepSeek Flash more (2026-09-11, the user's explicit request: "delega cat mai mult deepseek flash").** When a task is well-scoped enough to write a clear spec for (even if it touches a few files), default to dispatching it via `delegate-by-complexity` rather than implementing directly — the `>2 tightly coupled files` and `non-obvious conventions` bars below still apply as the real cutoff, but when a task is genuinely borderline, prefer delegating over doing it inline.
- **Once a task is dispatched (Aider, default path) or a manual prompt file is saved (fallback path), stop asking whether to implement it directly instead.** Superseded 2026-08-29 (see the delegation-path bullets above) but the underlying point stands either way: not a choice to re-confirm each time (corrected 2026-07-07, after asking "should I implement it directly or do you want to run it" for a prompt that was already complete and saved — redundant, since the workflow already answers that). Only offer to implement directly instead if the task turns out to be a poor delegation fit *before* dispatching/writing the prompt (e.g. touches too many coupled files/non-obvious conventions per the rule below) — not as a question tacked on after the fact.
- If a task touches >2 tightly coupled frontend files or depends on non-obvious conventions (auth pattern, card structure, Pydantic field names) → implement directly. Verification cost exceeds the gain.
- When unsure about a bug cause — ask, don't assume and don't implement.
- Involve the user — explain what you found, ask for confirmation before implementing.
- New feature session: present plan in 3-5 lines, ask if ok, implement only after explicit confirmation.
- **Decide pure-technical calls yourself; only surface design/product-direction choices, facts only the user knows, or real technical risk — and do it in plain, non-technical language, before implementing/delegating, not after.** Established 2026-08-29 after the user flagged that most mid-task questions that session were technical, not strategic, and had become hard for him to evaluate ("a devenit mult prea tehnice pentru mine"). Concrete split, from that session's own questions: "where does this data live, which account types exist, manual or automatic tagging" needed the user (facts/preferences only he has); "do I extend the shared budget function or write an isolated one" didn't (zero user-visible consequence, pure implementation-risk tradeoff) — that one should have been decided silently. The corrected flow: do the technical research and investigation as before, make the purely-technical calls without asking, then present ONE consolidated plain-language summary — what's changing and why, in everyday terms, with technical detail underneath for whoever wants to dig in, not jargon leading — *before* dispatching to Aider or implementing, so a wrong call gets caught before wasted implementation cycles, not after. Real technical risk (not just "an implementation choice exists") still gets flagged explicitly, briefly, framed as "going with X because Y — flag me if that's wrong" rather than a multi-option quiz — the user explicitly asked to stay looped in on those, not be fully cut out of the technical side. **Trial, not settled** — revisit if it isn't working; the user's own framing: let's see how it goes, and drop it later if it turns out not to be needed.
- **Extended 2026-09-11: the same "decide it yourself" rule also covers sequencing/priority recommendations, not just implementation-shape calls.** the user: "cand ai intrebari pt mine cu recomandari alege tu direct recomandarea, la mine vii cu intrebari esentiale de design arhitectura." Whenever a question would already come with a clear recommendation attached (which backlog item to pick up next, whether to close an issue that's turned out already-resolved, which of two equally-valid orderings to use) — just take the recommendation and proceed, don't stop to ask. Reserve actual questions for genuine design/architecture forks: a product-direction choice, a fact only the user has, or a real technical risk worth flagging before committing to it — same bar as the 2026-08-29 rule above, just stated more broadly so it also catches "which task next" style questions, not only "how do I build this."
- **One feature at a time — and this means one task per session, not just "no parallel work."** Corrected 2026-08-27: a single session drifted from "back up before touching data" into fixing the backup cron, filing an ops issue, re-running the duplicate investigation, scoping and speccing a whole new feature (#181), and filing a second unrelated ops issue (#182) — each individually reasonable, but chained without pausing to check in made the session hard to follow and harder to review as one thing. When a session surfaces a second, unrelated task mid-flow (a bug found while investigating something else, a doc gap noticed in passing) — flag it, open an issue if it needs tracking, and ask before continuing into it rather than folding it into the current thread. Doesn't apply to strictly sequential steps of the *same* task (e.g. investigate → spec → DeepSeek prompt for one feature) — those are one task, not several.
- **Architecture trade-offs before implementation:** when a feature has meaningful variants (1 generic tool vs N specific tools, library vs pure code, single endpoint vs multiple), present the trade-offs in 2-3 lines and get confirmation BEFORE writing the DeepSeek prompt or any code. Never discover the simpler approach existed after the fact.
- **No auto-memory:** do not save notes to `~/.claude/projects/.../memory/`. Save feedback and decisions in this file or in `docs/decisions.md`.
- **Before any implementation (mandatory — Claude or DeepSeek), and before opening a new GitHub issue:** run the `/plan-feature` skill (`.claude/skills/plan-feature/SKILL.md`). Covers the file/docs/sessions/decisions/helper checklist, the DeepSeek prompt template, and the known-gotchas list — not optional, and not duplicated here.


---

## Root `life-os/CLAUDE.md` — sections moved out 2026-09-23 (verbatim)

## Collaboration workflow

**Claude** = senior/architect: reads the code, designs the solution, scopes the task.
**DeepSeek** = engineer: implements.

**Default (2026-08-29, corrected from the old manual-file habit): Claude delegates directly via Aider headless, using the `delegate-by-complexity` skill** — isolated git worktree, `aider --model deepseek/... --message-file <task>`, Claude reviews the diff, merges only with the user's explicit confirmation. Claude does not write a static prompt file and stop.

**Fallback only** — when the user wants to run DeepSeek themselves, or Claude Code isn't available (credit exhausted): a prompt file saved under `majordom-financiar/scripts/prompts/deepseek/` to paste directly into DeepSeek. This is the exception path, not the default.

When the user asks only to note a bug or idea → create a GitHub issue and stop. Do not implement.

**`opencode-61` as a coordination system — tried 2026-09-13, reverted 2026-09-14.** Self-hosted DeepSeek agents via OpenRouter (own git push/PR, remote-supervised only) were evaluated as a parallel track to Aider-based delegation above. Outcome: reverted — the GUI-driven setup turned out to be more friction than the already-working Aider flow, no clear net win. Full reasoning: `~/.claude/skills/delegate-by-complexity/references/decisions.md#opencode-61--openhands-detour-reverted-2026-09-13--2026-09-14`. The `opencode-61` LXC itself is still available for other uses (e.g. as an interactive agent the user drives directly) — that's a separate question from this reverted coordination-system role.

---

## Financial profile

See `majordom-financiar/PRIVATE_context.md` (gitignored, private) for the complete family financial profile, budget breakdown, and personal context. (`majordom-financiar/CLAUDE.md` itself is tracked/public — dev workflow guide only, no financial data.)

---

## Current priorities (2026-07-05)

Full prioritized backlog lives on GitHub as Milestones + Labels (`tier-2`, `tier-3`, `intelligence-cluster`, `deferred-local-first`, `deferred-opportunistic`) — not a doc, see `majordom-financiar/CLAUDE.md#priority-tracking`. Example: `gh issue list --label tier-2`.

1. **Just completed** — #99 (`merchant_mappings` SQLite removed, replaced by Actual Budget's native Rules engine), #93 (code audit), [#138](https://github.com/Dorusto/life-os/issues/138) (extract `vehicle-manager` as independent service)
2. **Next up** — check `gh issue list --label tier-2` / `tier-3` for the current ready-to-pick-up backlog (this list drifts — GitHub is the source of truth, see `#priority-tracking` above)
3. **Proactive budget intelligence** (#41, #42, #110-114, #116, #124) — real but medium priority, grouped, picked up once standard-functionality work runs dry
4. **Deferred to local-first LLM switch-back** — #75, #65, #80/#81/#86 (see `decisions.md#llm-provider`), high priority again once local models are back in active use
5. **M2.5 budget calibration** — reframed from "goal proposal", tracked as [#110](https://github.com/Dorusto/life-os/issues/110)/[#111](https://github.com/Dorusto/life-os/issues/111) (see `majordom-financiar/docs/decisions.md#budget-calibration`)
6. **Sure/Ghostfolio evaluation — decided 2026-07-05, Ghostfolio half superseded 2026-08-28.** All 4 M5 checklist items resolved (MCP server, budget parity, portfolio comparison, all tested live). Original decision: stay on AB + Ghostfolio — Sure lacks true budget carryover and API-level budget/goal writes; Ghostfolio computes portfolio performance natively, Sure's API doesn't yet. **That still holds for AB vs. Sure** (the monthly `sure-migration-trigger-check` cloud routine was stopped 2026-08-30, alongside deleting Sure's own trial deployment — nothing left to watch for). **Ghostfolio itself was dropped 2026-08-28** — never deployed/integrated, confirmed CSV-only; portfolio data source is now open, not decided. See `majordom-financiar/docs/decisions.md#ghostfolio-dropped` and `#sure-budget-parity-evaluation`.

## Open fork: after majordom-financiar stabilizes — resolved 2026-09-12

Superseded the 2026-07-05 framing below once Phase C/C2 (majordom-financiar's own zero-touch-administration + coaching cluster) actually reached "stable," the condition this fork was always waiting on.

**Decision — personal completeness first, packaging-for-others last.** Explicit sequencing, in order:
1. **`vehicle-manager` becomes a real standalone app** — its own frontend with its own charts (Fuelio-style), not pages living inside majordom-financiar's own React app the way they do today (`tools/vehicle-manager/` is currently backend-only). Runs independently; majordom-financiar keeps working standalone too. Majordom-financiar consumes it only through its existing API client for chat/notifications ("intelligence"), same relationship as today, just with a real UI on the other end now. **✅ Built and live-verified standalone 2026-09-12** (`tools/vehicle-manager/docs/standalone-app-plan.md`, #261) — next checkpoint is the user's own review, not a further phase.
2. **A new, separate investment/portfolio-tracking app** (#262) — same shape as (1): its own frontend + backend + database, its own URL, talks to Majordom over API. This **supersedes Phase D's original framing** in `majordom-financiar/docs/product-plan.md` ("build the portfolio calculation layer inside Majordom") — the calculation layer now belongs to this new service instead, not inside majordom-financiar's own codebase. See `majordom-financiar/docs/decisions.md#portfolio-becomes-separate-service` for the full reasoning, and `tools/standalone-app-playbook.md` for the reusable build process extracted from building (1) — read that before starting this one.
3. **Visual polish across the board**, MoneyMatter as the explicit reference (already the direction tonight's Analytics v1 took, and the `frontend-design` skill's kind of pass) — the user's own read of the current state: it looks fairly rough.
4. **Only then**, package for others (the original option 1 below) — generic setup, no Docker knowledge required, installer.

This also resolves (in direction, not in the concrete folder path yet) the still-open #150 naming-convention question for these two new services — they follow the "each service independent" architecture target already stated above, exact naming/location still pending #150 itself.

**Original 2026-07-05 framing, kept for history:**
Two directions competed for what comes after the core (M0-M4) is stable:
1. Package Majordom for others to install/use — generic setup instead of hardcoded personal config (`PRIVATE_context.md` assumptions), an installer that doesn't require Docker knowledge.
2. Keep building new personal capabilities — e.g. a "digital majordom" that ingests documents (insurance cards, warranties), remembers them via RAG, stores the file in Nextcloud, and retrieves it on request. Also a future wellness domain.

The leaning at the time was (1) first; what actually got decided once the moment arrived was a more specific version of (2) — not the RAG/documents idea, but the two standalone-app extractions above — sequenced *before* (1), not after. The RAG/wellness idea from option 2 isn't rejected, just not what got prioritized here.
