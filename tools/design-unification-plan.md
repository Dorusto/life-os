# Design unification across life-os apps — plan

Commissioned 2026-09-13 (overnight session, continued after Doru woke up mid-loop). Doru's own
framing: majordom-financiar's Dashboard is visibly messy (uneven widget widths, a forced
two-column layout that doesn't fit), and he wants **all three apps** (majordom-financiar,
investment-manager, vehicle-manager) to share one identical visual system — same cards, same
fonts, same menus, same charts — not just similar. Reference for the mobile nav shape:
https://wealthfolio.app/ (bottom tab bar on mobile, explicitly requested).

This is a much bigger job than the token/primitive porting phases already shipped tonight (see
`majordom-financiar/docs/sessions/2026-W37.md`, "Task B" phases 1-2) — those only *added* new,
unused files. This plan *replaces* the visual system every existing page actually renders with,
across three codebases. Treat each phase below as its own delegable unit; verify and merge each
before starting the next. Update this doc's own checkboxes as phases land — don't defer all
status tracking to the session log the way earlier phases did (that gap was corrected once
already tonight, don't reintroduce it here).

## Decided (do not re-litigate)

1. **One shell shape everywhere**: a fixed left rail (248px, investment-manager's existing
   `AppShell.tsx` is the reference) on desktop (`lg:` breakpoint, 1024px+); a **bottom tab bar**
   on mobile (not a drawer/hamburger) — matches Wealthfolio, matches vehicle-manager's own
   already-built `BottomNav.tsx`, matches majordom-financiar's existing (visually different, same
   shape) bottom nav. investment-manager is the one that needs to change here — it currently uses
   a top-bar + slide-over drawer on mobile, no bottom nav at all.
2. **investment-manager's tokens.css + tailwind mapping is the canonical source** — already the
   direction root `CLAUDE.md`'s "Open fork" step 3 settled. majordom-financiar's `token.*`
   namespace (Task B phase 1) stays as the collision-avoidance shim for its own pre-existing flat
   color keys — do not try to flatten majordom-financiar onto bare `bg-brand` etc., the namespace
   is intentional (see that phase's own session-log entry for why).
3. **Card.tsx/PageHeader.tsx (majordom-financiar's old top-level ones) are retired, not kept
   alongside the new ones.** Every one of the ~20 existing card-shaped components migrates to the
   new `components/ui/Card` (or whatever this plan's Phase 3 concludes is the right shared
   primitive) once its page is migrated. No dual system left standing at the end.
4. **Fonts: IBM Plex Sans/Mono only, everywhere, once migration finishes.** Syne/DM Mono
   (majordom-financiar) and any vehicle-manager-specific leftover get removed from `package.json`
   and `main.tsx`/font-import files once the last caller of each is migrated — not before (removing
   a still-used font is a regression, not a cleanup).
5. **No duplicated component logic across the three apps.** If a component (Button, Card, Modal,
   a chart) ends up identical or near-identical in two of the three apps, that's a signal to
   question during a later pass whether it belongs in a shared package — not something to solve in
   this pass (these are three independent deployable services per
   `decisions.md#portfolio-becomes-separate-service`; a shared npm package is a real architecture
   decision of its own, flag to Doru if it comes up rather than introducing one silently).

## Phases

### Phase 0 — this doc + verify current state
- [x] Written 2026-09-13.

### Phase 1 — Shell unification
- [x] **1a. investment-manager** — shipped. New `MobileBottomNav.tsx` (5 tabs: Dashboard,
      Holdings, Transactions, Goals, Settings) + `MoreSheet.tsx` (Income, Rebalancing, via the
      existing `Modal`), `AppShell.tsx`'s old top-bar+drawer removed, desktop `<aside>` untouched.
      Delegated to Aider/Flash, live-verified in browser (bottom nav renders correctly, More sheet
      opens with both items) before merging.
- [x] **1b. vehicle-manager** — shipped, scoped down from the original plan. New
      `AppShell.tsx` (implemented directly, not delegated — a routing-structure decision) adds a
      **desktop-only** left rail (`lg:` and up) around all protected routes in `App.tsx`. Mobile
      is deliberately untouched: each page still renders its own header/BottomNav/full-bleed
      layout exactly as before, zero regression risk. A full per-page teardown so mobile also
      routes through one shared shell (matching investment-manager/majordom-financiar's page
      structure more closely) is a separate, larger follow-up — not done in this pass. Live-
      verified (tsc/build clean, rail hidden at mobile width, rail content correct when
      force-displayed for inspection).
- [x] **1c. majordom-financiar** — shipped. Replaced the old `md:max-w-[480px] md:mx-auto
      md:border-x` phone-frame treatment with a real desktop rail (`AppShell.tsx`, `lg:` and up)
      + a `lg:mx-auto lg:max-w-5xl` centered content column, same shape as the other two apps.
      `BottomNav.tsx` reskinned onto `token-*` colors and given `lg:hidden` (it had no upper
      cutoff before — was rendering under the new rail simultaneously until fixed). Kept
      majordom-financiar's own 5 tabs (Dashboard/Accounts/Transactions/Majordom/Analytics) in
      both the rail and the bottom nav — real, already-decided IA, not investment-manager's tab
      set. Live-verified in browser.

### Phase 2 — Fix the Dashboard grid bug — shipped with 1c
- [x] `Dashboard.tsx`'s two-column widget grid switched from `sm:` (640px) to `lg:` (1024px),
      matching the new rail breakpoint. Live-verified: the two columns (Balance trend / Latest
      Transactions) now read evenly balanced inside the new `max-w-5xl` column — kept the
      `1.15fr_1fr` ratio, it reads fine at this width, no need to flatten to an even split.

### Phase 3 — majordom-financiar color/token migration + Card.tsx/PageHeader.tsx retirement

**Re-scoped after the real inventory (2026-09-13):** only ONE file (`DuplicatesReviewPage.tsx`)
actually imports the old `Card` component. The real duplication is different and bigger — 76
occurrences across 30 files of the same raw Tailwind string repeated ad-hoc
(`bg-surface border border-border rounded-2xl` and close variants), never going through a shared
component at all. Split into two sub-phases so the highest-value, lowest-risk part (visual parity)
ships first, and the deeper de-duplication (actually routing everything through one `<Card>`)
follows once that's proven safe:

**Phase 3a — mechanical color-token rename (visual parity, no structural change).** Old flat key →
new token, per majordom-financiar's own semantic mapping (verify each file's actual usage matches
this semantic, don't blind-`sed` — e.g. `border` collides with `border-hover`/future compound
classes, ordered/longest-match-first replacement only):

| old class | new class | notes |
|---|---|---|
| `bg-background` | `bg-token-paper` | page background |
| `bg-surface` | `bg-token-surface` | card fill |
| `bg-surface-2` | `bg-token-surface-2` | hover/nested |
| `border-border` | `border-token-line` | default border |
| `border-border-hover` | `border-token-line-strong` | |
| `bg-border` | `bg-token-line` | a border color used as a fill (divider bars), same token either way |
| `bg-accent` / `text-accent` / `border-accent` | `bg-token-brand` / `text-token-brand-ink` / `border-token-brand` | brand fill vs. readable accent text/border — check which is meant per call site, they're different tokens |
| `bg-accent-hover` | `bg-token-brand-2` | |
| `text-muted` | `text-token-ink-3` | secondary/caption text |
| `text-muted-2` | `text-token-ink-2` | slightly higher contrast than `muted` |
| `text-white` (as primary text/heading color, not literal white-on-accent) | `text-token-ink` | this app uses literal `text-white` for primary text throughout — the common case. **Confirmed as a real, recurring edge case (2026-09-13 global sweep): `text-white`/`bg-white` used deliberately for contrast ON a colored fill (e.g. white text on a solid brand-colored button, `components/ui/Button.tsx`'s own `primary` variant) must stay bare, NOT migrate** — token-ink is a themed near-white meant for the app's own paper/surface background, not a contrast color for an arbitrary colored fill. Visual impact of getting this wrong is small (token-ink ≈ #E7EDF2, close to white) but tell every future dispatch explicitly to check which case it is, don't rely on this table note alone reaching the model. |
| `bg-success` / `text-success` | `bg-token-gain` / `text-token-gain` | |
| `bg-danger` / `text-danger` | `bg-token-loss` / `text-token-loss` | |
| `bg-positive` / `text-positive` | `bg-token-gain` / `text-token-gain` | same semantic as success, just a second pre-existing name for it |
| `bg-positive-dim` | `bg-token-gain-soft` | |
| `bg-attention` / `text-attention` | `bg-token-warn` / `text-token-warn` | |
| `bg-attention-dim` | `bg-token-warn-soft` | |
| `bg-interactive` / `text-interactive` | `bg-token-brand-ink` / `text-token-brand-ink` | chat/CTA accent — closest existing semantic is the readable brand accent |
| `bg-interactive-dim` | `bg-token-brand-soft` | |
| `font-display` | `font-plex-sans` (headings only — check each use, some may want to just drop the special display face and use body weight/size, judge per component) | |
| `font-mono` (majordom's own DM Mono key) | `font-plex-mono` | |

File groups to delegate (avoid one file-count-blowing task; ~5-6 files per dispatch per
`delegate-by-complexity`'s file-count rule):
- [ ] Group 1 — confirmation cards A: `AccountTransferCard`, `BalanceAdjustmentCard`,
      `BudgetCopyCard`, `BudgetRebalanceCard`, `CategoryActionCard`, `ClarificationCard`
- [ ] Group 2 — confirmation cards B: `CloseAccountCard`, `CsvImportCard`, `FuelReceiptCard`,
      `FuelioImportCard`, `GoalProposalCard`, `IncomeSourceCard`
- [ ] Group 3 — confirmation cards C: `NotificationTimeCard`, `ProposalCard`, `ReachedGoalsCard`,
      `ReceiptCard`, `SetupBalancesCard`, `TransferConversionCard`
- [ ] Group 4 — confirmation cards D + dashboard components: `VehicleLogActionCard`,
      `VehicleReminderCard`, `VehicleStatusCard`, `BudgetOverviewCard`, `CategoryOverviewCard`,
      `GoalsSection`
- [ ] Group 5 — pages: `AccountDetail.tsx`, `Accounts.tsx`, `Chat.tsx`, `ImportPage.tsx`,
      `Settings.tsx`, `Dashboard.tsx` (Dashboard's own ad-hoc card divs, not the widget components
      it renders — those are separate files already covered above)
- [ ] Verify each group visually (live browser, not just `tsc`/`build` — wrong-but-valid Tailwind
      classes compile fine and just look wrong) before merging.

**Groups 1-5 shipped and merged (2026-09-13).** A global sweep after Group 5 found the *real*
scope was bigger than the original per-page inventory — files using old colors outside the
"card"-shaped pattern (buttons, banners, form fields, shared chrome) were never counted. 24 files
done; ~28 more found. Continuing as Groups 6+:
- [ ] Group 6: `components/AbConnectionBanner.tsx`, `ActionCardButtons.tsx`, `AddButton.tsx`,
      `BottomSheet.tsx`, `BudgetDashboard.tsx`, `CategoryFilterTree.tsx`
- [ ] Group 7: `components/Chart.tsx` (core shared — every chart on every page renders through
      this, extra care), `DetailPageSkeleton.tsx`, `IconButton.tsx`, `InfoIcon.tsx`,
      `NewGoalSheet.tsx`, `NotificationBell.tsx`
- [ ] Group 8: `components/TransactionListCard.tsx`, `WidgetLoading.tsx`,
      `components/vehicles/EditVehicleModal.tsx`, `components/vehicles/LinkVehicleSheet.tsx`,
      `components/Card.tsx` (the OLD one — still rendering live via `DuplicatesReviewPage.tsx`
      until Phase 3b retires it; migrate its colors now like any other file, retirement is
      separate), `components/PageHeader.tsx` (same — still rendering live on every page via
      `App.tsx`, migrate colors now, retire the whole component in Phase 3b)
- [ ] Group 9: `pages/AbSetupWizard.tsx`, `Analytics.tsx`, `BudgetRealismReviewPage.tsx`,
      `DuplicatesReviewPage.tsx`, `Login.tsx`, `ReceiptFlow.tsx`
- [ ] Group 10: `pages/RecurringReviewPage.tsx`, `Transactions.tsx`,
      `UncategorizedReviewPage.tsx`, `UnreconciledReviewPage.tsx`
- [ ] After Groups 6-10: re-run the global sweep (`grep -rlE` for old classes across all of
      `frontend/src`, not just the originally-suspected files) to confirm nothing else was missed
      — this is exactly how Groups 6-10 themselves were found, don't skip repeating it.

**Phase 3b — actual de-duplication (route repeated card markup through `components/ui/Card`).**
Only after 3a proves the color migration is safe across all 30 files. Per
`duplication-prevention.md`: extract to the shared primitive at point of touching each file again,
not as a giant separate pass — but explicitly scoped as its own phase here since it's a real,
separate risk profile (structural JSX changes, not just class renames) from 3a's mechanical
rename. `Card.tsx`/`PageHeader.tsx` (the old ones) get deleted only once grep confirms zero
remaining importers of the *old* components — `DuplicatesReviewPage.tsx` is the one file to check.

### Phase 4 — Font cleanup
- [ ] Once Phase 3 fully lands (majordom-financiar) and 1a/1b confirm no app still references
      Syne/DM Mono or any other pre-unification font: remove the unused `@fontsource/*` packages
      and their import lines from `main.tsx` (or equivalent) in each app. Grep for the font-family
      name itself (`font-display`, `font-mono` old keys, `Syne`, `DM Mono`) before removing
      anything — a font key can outlive its font file reference if a Tailwind class still points
      at it.

### Phase 5 — Cross-app consistency pass
- [ ] Once 1-4 land: a live side-by-side check (browser) of the three apps' Dashboard-equivalent
      screens, nav, and one chart each — this is the step that catches "technically migrated but
      doesn't actually look the same" drift a diff can't. Per Doru's own original instructions,
      this kind of visual check happens at the end, not per micro-task.

## Circuit breaker

If a page's existing layout depends on a full-bleed/full-viewport assumption in a way that doesn't
cleanly fit inside a centered max-width column (e.g. a chart that sizes itself off
`window.innerWidth`, a horizontally-scrolling table meant to bleed to the screen edge) — stop and
describe the specific conflict rather than forcing a fit that breaks that page's real function.
