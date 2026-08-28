# Add / Review Transaction Sheet — spec

> **Status: implemented (#185, 2026-08-28).** Shipped narrower than this draft — see
> "What actually shipped" below before reading the screens as current. Kept as-is
> otherwise (design-inspiration history, not rewritten).

> Draft, not yet scheduled. Design inspiration only from Chompass (`codeberg.org/fitguy/chompass`, MIT-licensed calorie tracker) — no code copied, UI pattern reimplemented in this stack.

## What actually shipped (#185)

Deliberately smaller than Screens 1-4 below, to close the highest-value gap (manual
entry routing through chat as an interim, and no way to split a transaction across
categories) without a bigger redesign in the same task:

- **No dedicated bottom-sheet shell.** The shared drag-handle sheet this draft assumes
  doesn't exist yet as reusable code anywhere in the app (see `decisions.md#universal-transaction-ui`,
  which already flagged this). Reused the existing full-page `ReceiptFlow.tsx` instead —
  it already implemented the propose→edit→confirm mechanic for photos — and added a
  manual mode (`location.state.manual`, blank fields, no image/OCR) to the same page.
- **No Photo/Note/Voice/Recent/Copy-from-Day/Search-category tier.** Only two entry
  points exist via `AddButton`: Photo (existing OCR path) and Manual (blank form). Voice,
  Recent & Templates, Copy from Day, and Search category are not built — no issue filed
  for them either; revisit if the need comes up again.
- **Split lines, single-screen.** Screen 3's "+ Add line" shipped, but inline in the one
  review screen rather than as a separate step — each line has category + amount, a
  running total-vs-allocated indicator, Confirm disabled until balanced.
- **Confirm calls plain REST endpoints, not a chat proposal tool.** Screen 4's "calls the
  existing proposal tool" is now stale — transaction entry/editing moved out of chat
  entirely (see `decisions.md#universal-transaction-ui` and #184/#185's own scope notes).
  Save calls `POST /api/transactions` (new, manual-entry) or the existing
  `POST /receipts/{id}/confirm` (photo), then `POST /transactions/{id}/split` (#115) when
  there are 2+ lines — no `_PROPOSAL_TOOLS`/LLM involvement anywhere in this flow.

The rest of this document (Screens 1-4, the Chompass tier structure) is left as
originally written — historical design reference, not a live backlog.

## Why this flow, not a new architecture

`_PROPOSAL_TOOLS` already works in chat — query tools execute immediately, proposal tools require confirmation. This is a second entry point into the same proposal flow, surfaced on Home, not a new architecture. Stays within the "2 tabs, quick actions are bottom sheets" constraint (root `CLAUDE.md` — "New UI page = last resort"): this is a bottom sheet over Home, not a new tab.

## Screen 1 — Trigger

Button on Home (near the Budget accordion, or on the Expense Coverage ring) opens the sheet.

## Screen 2 — "Add Transaction"

**Primary tier** (3 large cards):
- **Photo** — camera/gallery → existing OCR path (VisionEngine), now also reachable outside chat
- **Note** — free text ("coffee 4.5 lei yesterday"), parsed by the model
- **Recent & Templates** — last transactions + recurring templates (ties into the existing "Budget allocation tool" backlog item — confirmed allocations become reusable templates here)

**Secondary tier** ("More ways to log", 2-column grid):
- **Voice** — dictation, parsed the same as the text note
- **Manual Entry** — plain form, no AI (edge-case fallback)
- **Copy from Day** — copy a transaction from a previous day (irregular recurring expenses, e.g. fuel)
- **Search category** — start from category instead of amount

Not carried over from Chompass (no direct equivalent, not forced): barcode scanning, "active burn" / wearable integration.

## Screen 3 — "Review Transaction"

- **Header:** auto-detected emoji/category + total amount
- **Editable fields:** name, amount, category
- **Multiple lines** (receipt split): each line = partial merchant + partial amount + own category, "+ Add line" button
- **"Analyzing..." state:** confirm button disabled, live progress steps shown while the model processes — doubles as debugging visibility into where the model gets it wrong (see `docs/learn/02-ollama-vision.md#accuracy`)
- **Visual lock on AI-generated fields:** fields read as "proposed by AI" until explicitly tapped to edit — visual translation of the `_PROPOSAL_TOOLS` principle

## Screen 4 — Confirm

Final "Save" button calls the existing proposal tool (`propose_categorize_with_rule` or equivalent for new transactions) — no new AB-write code, only new UI over existing logic.

## Explicitly out of scope

Barcode scanning, wearable/"active burn" integration, on-device model fallback (separate backlog item).

## Next step

Basis for a DeepSeek prompt (`scripts/prompts/deepseek/`) — React components `TransactionAddSheet.jsx`, `ReviewTransactionSheet.jsx`, reusing `_PROPOSAL_TOOLS` backend with no API changes.
