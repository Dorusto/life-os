# Add / Review Transaction Sheet — spec

> Draft, not yet scheduled. Design inspiration only from Chompass (`codeberg.org/fitguy/chompass`, MIT-licensed calorie tracker) — no code copied, UI pattern reimplemented in this stack.

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
