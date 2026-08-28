# Task: Manual entry + receipt split lines in the transaction review flow (#185)

## Context

`frontend/src/pages/ReceiptFlow.tsx` already implements the real "AI proposes, user
reviews/edits, explicit Save writes to Actual Budget" flow for photo receipts — no chat
involved. This task extends that same flow to also cover manual entry (no photo/OCR) and
splitting one transaction across multiple categories, so `AddButton.tsx`'s "Manual entry"
button can stop routing into the chat/LLM conversation, which is only an interim measure
today (see its own comment).

**Scope note — this task deliberately does NOT rebuild the flow as a bottom sheet.**
The original mockup envisioned a shared drag-handle sheet shell for this; that shell
doesn't exist yet as reusable code anywhere in the app. Converting `ReceiptFlow.tsx`
from its current full-page layout into that shell is a separate, larger, purely-visual
task — out of scope here. This task only adds the manual-mode + split-lines *behavior*
to the existing, already-working full-page flow.

**Dependency:** this task calls `POST /api/transactions/{financial_id}/split`, added by
a separate task (#115) that may be landing in parallel. Its exact contract (already fixed,
not something to guess): request body `{"splits": [{"category_id": "...", "amount": 12.34}, ...]}`,
response `{"parent_financial_id": "...", "child_count": N}`, `400` on a mismatched sum or
an unknown id. Build against this contract; if the real endpoint isn't merged into `main`
yet when you start, that's expected — implement against the contract above and note in
your final report that end-to-end split testing is blocked until #115 lands, don't treat
it as your own bug.

## Goal

- Tapping "Manual entry" in the `+ Add` sheet opens the same review screen used for
  photos, but with blank editable fields and no receipt image — no chat involved at all.
- On that same review screen (both photo and manual), the user can tap "+ Add line" to
  split the transaction across multiple categories (e.g. a receipt covering both
  groceries and a small non-food item), each line with its own partial amount and
  category, and Save correctly writes one transaction split across all of them.

## Relevant files

| File | What it contains |
|------|-------------------|
| `frontend/src/pages/ReceiptFlow.tsx` | The full review flow (upload → OCR → review form → confirm → success). Extend this file — add a manual-entry code path and the split-lines UI to the existing form. |
| `frontend/src/components/AddButton.tsx` | The `+ Add` sheet — its "Manual entry" button currently does `navigate('/chat', { state: { prefill: MANUAL_ADD_PREFILL } })`. Change it to `navigate('/receipt', { state: { manual: true } })` instead, and remove the now-unused `MANUAL_ADD_PREFILL` constant if nothing else references it. |
| `frontend/src/lib/api.ts` | Has `uploadReceipt()`, `confirmReceipt()`, and the `ReceiptDraft`/`ConfirmResponse` types (~lines 81-230). Add a new `splitTransaction()` wrapper here, following the same `request<T>()` pattern as every other function in this file. |

## Changes required

### 1. `frontend/src/lib/api.ts`

Add:
```ts
export interface SplitLine {
  category_id: string
  amount: number
}
export async function splitTransaction(financialId: string, splits: SplitLine[]): Promise<{ parent_financial_id: string; child_count: number }> {
  return request(`/transactions/${financialId}/split`, {
    method: 'POST',
    body: JSON.stringify({ splits }),
  })
}
```

### 2. `frontend/src/pages/ReceiptFlow.tsx`

**Manual mode:** read `location.state?.manual` (via `useLocation()` from
`react-router-dom`, already used elsewhere in this app's routes). When true:
- Skip the `useEffect` that reads `pendingReceiptDataUrl` from `sessionStorage` and calls
  `uploadReceipt()` — go straight to `flowState = 'reviewing'` with blank fields
  (`merchant=''`, `amount=''`, `date=today`, `categoryId=''`), and a `draft`-shaped object
  built locally instead of from the OCR response — you still need `categories` and
  `accounts` lists to populate the two `<select>`s; fetch those directly via the existing
  `getCategories()`/`getAccountList()` wrappers in `api.ts` (check their exact return
  shapes — they may not be an exact match for `ReceiptDraft.categories`/`.accounts`,
  which use `{id, name, emoji, group_name}` and `{id, name}` — adapt as needed, e.g. no
  emoji available from `getCategories()`, that's fine, just don't crash if `cat.emoji` is
  undefined in the render).
- Don't render the photo image area (top 45vh section) in manual mode — either collapse
  it to zero height or replace it with a simple header, whichever is the smaller diff.
- `category_source`-dependent hint text ("From your history") doesn't apply — skip it in
  manual mode.

**Split lines**, for both photo and manual mode:
- Replace the single `categoryId` state with an array of lines:
  `{ categoryId: string; amount: string }[]`, starting with one line pre-filled from the
  OCR/manual category + the full amount.
- "+ Add line" button appends a new empty line. Each line beyond the first has a remove
  (×) button. Each line has its own category `<select>` (same options as before) and its
  own amount input.
- Show a running total of the lines vs. the top-level `amount` field — if they don't
  match, disable Confirm and show the difference (e.g. "€3.20 unallocated" or "€1.50 over
  by"), so the user always sees why Save is disabled instead of it silently failing later.
- The **first line's category** replaces the old single `categoryId` field entirely — the
  old single `<select>` for category becomes this first line's `<select>`, not a separate
  field.

**Confirm logic** (`handleConfirm`): keep calling `confirmReceipt()` exactly as before,
with `category_id` = the **first line's** category and `amount` = the full total (sum of
all lines) — this creates the transaction normally, unaffected by whether it's split.
After a successful confirm, if there are 2+ lines, call `splitTransaction()` with the
`transaction_id` from the confirm response and all lines (all of them, not just lines
2+ — see #115's own convention: the split clears the parent's category and puts every
category on a child line, including what was originally the "first" one). If the split
call fails, still treat the save as successful (the transaction exists, just not split) —
show a distinct, less alarming message ("Saved, but couldn't split into categories — you
can split it manually in Actual Budget") rather than the generic error state, since the
money is already safely recorded either way.

## Critical Rules

- **All write tools → confirmation card / explicit user confirm before writing** — this
  flow already satisfies that (OCR/manual proposes, user edits, explicit Save button
  writes) — don't add any auto-save-on-blur or similar shortcut.
- **This is explicitly outside the chat/LLM path** — don't route anything in this task
  through `backend/api/chat.py` or any `finance__*` tool. `AddButton.tsx`'s whole point in
  this task is to stop doing that for manual entry.
- **actualpy amounts are floats in EUR** — all amounts in this UI are already plain euro
  floats (`parseFloat(amount)`), consistent with the rest of this file; don't introduce
  cents anywhere in the frontend.

## Gotchas

1. `confirmReceipt()`'s request type doesn't currently include split info — it stays
   completely unchanged, always describing the *whole* transaction (full amount, one
   category). Splitting is a second, separate API call after the transaction already
   exists, using its `transaction_id` — don't try to pass split lines into `confirmReceipt`.
2. In manual mode there's no `receipt_id`/`draft.receipt_id` from an upload — `confirmReceipt()`
   requires one. Generate a client-side UUID (or check if the backend actually needs a
   real uploaded receipt image behind that id — read `backend/api/receipts.py`'s
   `confirm_receipt` endpoint before assuming; if it requires `image_path.exists()`, manual
   mode can't reuse this endpoint as-is and needs a small backend adjustment — if you hit
   this, treat it as the circuit-breaker case below rather than guessing a workaround).
3. `getAccountList()`/`getCategories()` return types are declared elsewhere in this same
   `api.ts` file — read their actual interfaces before assuming field names match
   `ReceiptDraft`'s `AccountOption`/`Category` shapes exactly.

## Do NOT touch

- `backend/api/receipts.py`, `backend/services/receipt_service.py` — the photo/OCR path
  itself is unaffected by this task; if manual mode turns out to genuinely need a backend
  change (see Gotcha 2), stop and describe it rather than modifying the receipt confirm
  endpoint's contract used by the working photo flow.
- Any sheet-shell/drag-handle redesign — see Scope note above.

## Done when

- Tapping Manual entry from the `+ Add` sheet opens the review screen with blank fields,
  no image, no chat involvement — confirm this by checking the network tab shows no
  `/chat` request during the whole manual-entry path.
- Adding a second line, splitting a test transaction's amount across two categories, and
  confirming produces one Actual Budget transaction correctly shown as split (verify in
  `localhost:5006`'s own UI) — this part is blocked until #115's endpoint is merged; if
  you reach this point before that, note it in your final report instead of guessing at
  a workaround.
- Single-line save (both photo and manual) still works exactly as before — no regression
  on the existing, already-shipped photo flow.

## Circuit breaker
If you hit a decision with real architectural impact that isn't documented in
`decisions.md`/`architecture.md`, stop and describe the situation in your response —
don't pick an undecided variant yourself.
