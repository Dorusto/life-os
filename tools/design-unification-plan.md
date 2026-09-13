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
- [ ] **1a. investment-manager**: replace the mobile top-bar+drawer in `AppShell.tsx` with a
      bottom tab bar (own component, matching vehicle-manager's `BottomNav.tsx` shape/token
      usage). Keep the existing desktop rail untouched. Decide bottom-tab set: investment-manager
      has 7 nav items (Dashboard/Holdings/Transactions/Income/Rebalancing/Goals/Settings) — too
      many for one bottom bar. Use a 5-tab bar (Dashboard, Holdings, Transactions, Goals,
      Settings) + a 6th "More" tab opening a small bottom sheet with Income + Rebalancing — a
      standard, well-understood mobile pattern, not a novel one. `ConfirmDialog`/`SecurityModal`/
      `GoalModal`/`TransactionModal`/`XtbImportModal` are unaffected (they're not nav).
- [ ] **1b. vehicle-manager**: audited — confirmed it has NO shell wrapper at all. `App.tsx` routes
      straight to each page component; `<BottomNav />` is rendered individually inside 5 of the 7
      pages (`VehicleList`, `Dashboard`, `StatsPage`, `RemindersPage`, `TimelinePage` — not
      `VehicleDetail`/`FuelioImport`/`Login`, which are full-screen flows by design, matching
      majordom-financiar's own "hidden on full-screen flows" convention). Adding a desktop rail
      properly means introducing a real `AppShell.tsx` wrapper (like investment-manager's) around
      the nav-bearing routes in `App.tsx`, and removing each page's own individual `<BottomNav />`
      call in favor of the shell rendering nav centrally once. **This is a routing-structure
      change, not a mechanical port — do this part directly (Claude), then delegate only the
      mechanical "remove the now-shell-owned `<BottomNav />` call from these 5 page files" cleanup
      to Aider afterward**, per `delegate-by-complexity`'s own rule that routing/layout-structure
      decisions aren't a good blind-delegation fit.
- [ ] **1c. majordom-financiar**: currently has ONLY a mobile-width-constrained bottom nav (even
      on desktop it just centers at `max-w-[480px]`, no rail). Add the desktop rail (reusing the
      same `AppShell.tsx` structure/pattern), reskin the existing bottom nav onto the new token
      colors (keep majordom-financiar's own 5 tabs: Dashboard/Accounts/Transactions/Majordom/
      Analytics — these map to real, already-decided IA, not investment-manager's tab set).
      **This phase also needs each page's own root wrapper changed** — pages currently assume
      they own the full viewport width (`h-dvh`, full-bleed); once a desktop rail exists, content
      needs a `max-w-*` centered column inside `<main>`, matching investment-manager's
      `mx-auto max-w-6xl` pattern. Do this as part of 1c, not deferred to Phase 3 (every page
      re-skin in Phase 3 would otherwise redo this wrapper change piecemeal).

### Phase 2 — Fix the Dashboard grid bug (isolated, can run in parallel with Phase 1)
- [ ] `Dashboard.tsx`'s `sm:grid sm:grid-cols-[1.15fr_1fr]` (line ~226) switches to two columns at
      640px — too narrow for a genuinely two-column layout, producing the uneven/cramped look
      Doru flagged. Change the breakpoint to `lg:` (1024px, matching the new rail breakpoint from
      Phase 1c) and re-evaluate the column ratio once Phase 1c's max-width content column exists
      (an even `1fr 1fr` may read better than `1.15fr 1fr` inside a narrower centered column —
      judge visually once 1c lands, don't guess blind).

### Phase 3 — Migrate majordom-financiar's pages/components off Card.tsx/PageHeader.tsx
- [ ] Inventory every one of the ~20 components using the old `Card` (grep
      `from '../components/Card'` / `from './Card'`) and group by page, so each delegated task is
      "one page's worth of cards," not one card at a time (too small/fragmented) or the whole app
      (too big for Flash, per `delegate-by-complexity`'s file-count rule).
- [ ] Per page/group: swap old `Card`/`PageHeader` usage for the new `components/ui/` primitives
      + token classes, verify visually (screenshot or live browser check) before merging — this is
      exactly the kind of change a passing `tsc`/`build` won't catch (wrong-but-valid Tailwind
      classes render, they just look wrong).
- [ ] Delete `components/Card.tsx`/`PageHeader.tsx` only once grep confirms zero remaining
      importers — matches `duplication-prevention.md`'s "retire the old flow in the same task"
      rule, just sequenced across several tasks instead of one, since one task can't safely touch
      all ~20 call sites at once.

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
