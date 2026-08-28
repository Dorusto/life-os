# Task: Dedicated transactions table UI — bulk view/edit without AI (#184)

## Context

Bulk transaction cleanup (e.g. after a multi-week gap, hundreds of uncategorized
transactions) doesn't work through chat/AI — it's a search/filter/bulk-edit task (#178,
closed as design-rejected rather than patched there). The `Transactions` tab already
exists in the app's 5-tab nav as a placeholder ("coming soon") — this task replaces the
placeholder with the real screen.

## Goal

The user opens the Transactions tab and sees a filterable, sortable list/table of all
their transactions. They can filter (uncategorized-only, date range, account, category,
payee, amount range, expense/income), toggle between a card-list view and a dense table
view, select multiple rows via checkboxes, and set the category for all selected rows in
one bulk action — no AI/chat involved anywhere in this flow.

## Relevant files

| File | What it contains |
|------|-------------------|
| `frontend/src/pages/Transactions.tsx` | Currently a placeholder shell (`PageHeader` + "coming soon" text). Replace its contents entirely with the real screen. |
| `frontend/src/components/BottomSheet.tsx` | Existing shared bottom-sheet shell (backdrop, header with title+close, scrollable body) — reuse this for the Filters sheet, exactly like `frontend/src/components/AddButton.tsx` already does for its method-choice sheet. Don't invent a new sheet shell for this task. |
| `frontend/src/lib/api.ts` | API client functions, `request<T>()` helper + `URLSearchParams` query-string pattern already used by `getTransactions()` (line ~232). Add new functions here, following that exact pattern. |
| `backend/api/transactions.py` | `GET /transactions` endpoint (currently `limit` + `account_id` only) and the `Transaction`/`CategoryItem`/`Account` Pydantic models. Extend the endpoint's query params; add the new bulk-update endpoint here. |
| `backend/core/actual_client/client.py` | `get_recent_transactions()` (~line 2044) already loads all transactions into Python and filters/sorts/slices there — extend this method with new optional filter params rather than writing a parallel method. Also add a new `bulk_update_category()` method here. |

## Changes required

### 1. `backend/core/actual_client/client.py`

Extend `get_recent_transactions()`'s signature with new **optional, default-`None`/`False`**
keyword params so every existing caller (there are 3: `backend/api/transactions.py`,
`backend/tools/finance/actual_budget.py`, and the `FinanceProvider` pass-through in
`backend/core/finance/actual_budget_provider.py`) keeps working unchanged when they don't
pass the new params:

- `offset: int = 0` — apply after the existing sort, before the `[:limit]` slice: change
  `return result[:limit]` to `return result[offset:offset + limit]`.
- `category_id: str | None = None` — keep only transactions where `category_id` matches.
- `payee: str | None = None` — case-insensitive substring match against `merchant`.
- `uncategorized_only: bool = False` — keep only transactions where `category_id is None`.
- `amount_min: float | None = None`, `amount_max: float | None = None` — compare against
  `abs(amount_cents) / 100`.
- `is_expense: bool | None = None` — `None` means both; otherwise filter by the sign of
  `amount_cents` (matches how `backend/api/transactions.py`'s `Transaction.is_expense`
  is already derived: `amount_cents < 0` means expense).

Apply all filters on the `result` list (the list of plain dicts already being built),
right before the existing `result.sort(...)` line — filtering after the dicts are built
is simplest since several filters (payee substring, uncategorized) need the already-
normalized fields, not the raw actualpy `tx` object.

Add a new method:
```python
async def bulk_update_category(self, financial_ids: list[str], category_id: str) -> int:
    """Set the same category on many transactions in one download/commit cycle.
    Returns the number of transactions actually updated (skips ids not found)."""
```
Do **one** `download_budget()` and **one** `commit()` for the whole batch — do NOT loop
calling a per-transaction method that opens its own session each time (that would be one
full download+commit round trip per transaction, far too slow for a bulk operation on
potentially hundreds of rows — this is the whole reason this needs its own method rather
than reusing anything per-transaction). Query `Transactions` filtered by
`Transactions.financial_id.in_(financial_ids)` and `Transactions.tombstone == 0`, set
`category_id` on each match, commit once, return the count of rows actually matched.

### 2. `backend/api/transactions.py`

Extend `GET /transactions`'s query params to match the new `get_recent_transactions()`
params 1:1 (all optional, all passed through) — `offset`, `category_id`, `payee`,
`uncategorized_only`, `amount_min`, `amount_max`, `is_expense`, plus `start_date`/`end_date`
(already supported by `get_recent_transactions`, just not exposed as query params on this
endpoint yet — add them too). Raise the existing `limit`'s cap (`le=100`) to `le=200` so a
full table page can request more rows than the Home/widget callers ever needed.

Add a new endpoint:
```python
class BulkCategoryRequest(BaseModel):
    financial_ids: list[str]
    category_id: str

@router.post("/transactions/bulk-category")
async def bulk_update_category(body: BulkCategoryRequest, current_user: str = Depends(get_current_user)):
```
Same `ActualBudgetClient(url=settings.actual.url, ...)` construction as every other route
in this file (this file talks to `ActualBudgetClient` directly, not through
`get_provider()`/`FinanceProvider` — follow that existing convention, don't introduce
`get_provider()` here). Return `{"updated": <count>}`. If `financial_ids` is empty, `400`.

### 3. `frontend/src/lib/api.ts`

Keep the existing `getTransactions(limit, accountId)` untouched (Dashboard and
AccountDetail call it as-is). Add a new function for the filtered table view:
```ts
export interface TransactionFilters {
  limit?: number
  offset?: number
  accountId?: string
  categoryId?: string
  payee?: string
  uncategorizedOnly?: boolean
  amountMin?: number
  amountMax?: number
  dateFrom?: string  // YYYY-MM-DD
  dateTo?: string
  isExpense?: boolean
}
export async function getTransactionsFiltered(filters: TransactionFilters): Promise<Transaction[]>
export async function bulkUpdateCategory(financialIds: string[], categoryId: string): Promise<{ updated: number }>
```
Build the query string the same way `getTransactions()` already does (`URLSearchParams`,
only set params that are actually provided).

### 4. `frontend/src/pages/Transactions.tsx`

Rebuild as the real screen:
- **List/Table view toggle** — user's explicit choice (a small toggle button in the
  header), not responsive/width-driven. Persist the choice in `localStorage` (same pattern
  as `frontend/src/lib/dashboardWidgets.ts` — read on mount inside a try/catch, write on
  change, never let a `localStorage` failure crash the page). List = card rows (merchant,
  category pill, amount, date — no horizontal scroll risk on mobile). Table = a real
  `<table>` with columns (date, merchant, category, account, amount), horizontal-scrollable
  in a wrapping `div` if it overflows on narrow screens.
- **A persistent "Uncategorized" filter chip** above the list, toggling
  `uncategorizedOnly` directly — this is the primary real use case (#178), don't bury it
  inside the Filters sheet only.
- **Filters sheet** (`BottomSheet`, see file table above) with: date range (two date
  inputs), account (`<select>` populated from `getAccountList()`), category (`<select>`
  populated via the existing `getCategories()` wrapper in `api.ts`, line ~671), payee (text input),
  amount min/max (two number inputs), expense/income (`<select>` with an "any" default).
  "Apply" re-fetches with the selected filters; "Clear" resets all of them.
- **Checkbox per row** + a "select all visible" checkbox in the header. When 1+ rows are
  selected, show a fixed bottom bar: selected count + a category `<select>` + "Apply"
  button calling `bulkUpdateCategory()`, then re-fetching and clearing the selection.
- **Pagination**: fetch with `limit` (e.g. 50) + `offset`; a "Load more" button at the
  bottom increases `offset` by `limit` and appends results, rather than a numbered
  pager — simplest to implement correctly and matches how this app already does
  incremental loading elsewhere.
- Keep `PageHeader`/`StandardHeaderActions` at the top exactly as the placeholder already
  has them — don't restructure the header.

## Critical Rules

- **actualpy amounts are floats in EUR, not cents**, in `create_transaction`/similar calls
  — not directly relevant to this task (no new transactions created), but the
  `amount_cents` field already in `get_recent_transactions()`'s dict output is intentionally
  in cents (see its docstring) — don't change that field's unit, only add new filter params
  around it.
- **Config from the `settings` singleton, never `os.environ` directly.**
- **No financial data in SQLite** — this task doesn't touch SQLite, Actual Budget stays the
  only source of truth for everything read/written here.
- **This is explicitly a no-AI, no-chat feature** — do NOT add a chat tool, do NOT touch
  `backend/tools/registry.py`, `backend/api/chat.py`, or `backend/tools/category_actions.py`.
  The whole point of #184 is a plain CRUD UI outside the chat/LLM path.
- **`backend/api/transactions.py` talks to `ActualBudgetClient` directly, not via
  `get_provider()`** — this is the existing, deliberate convention in this specific file
  (every route in it does `ActualBudgetClient(url=settings.actual.url, password=...,
  sync_id=...)` inline). Follow it for the new endpoint too, don't introduce the
  `FinanceProvider` abstraction here just for this task.

## Gotchas

1. `get_recent_transactions()` currently does `return result[:limit]` after sorting —
   changing this to `result[offset:offset + limit]` is the only change needed to support
   pagination; don't add a second query or a `COUNT(*)`-style total, the "Load more" button
   pattern doesn't need a total count.
2. The uncategorized check must be `category_id is None`, not falsy-string checks —
   `category_id` in the dict is either a real id string or Python `None`, never `""`.
3. Do not loop `update_transaction_category()` (an existing single-transaction method in
   `client.py`) for the bulk endpoint — it opens and commits its own `download_budget()`
   session per call, which would be one full round trip per selected row. This is exactly
   why `bulk_update_category()` needs to be its own method doing one download/commit for
   the whole batch.

## Do NOT touch

- `frontend/src/pages/Dashboard.tsx`'s own "Latest Transactions" widget or
  `getTransactions()`'s existing signature — both must keep working exactly as before.
- `backend/tools/registry.py`, `backend/api/chat.py`, `backend/tools/category_actions.py` —
  out of scope, see Critical Rules.
- Any file under `backend/core/finance/` (`provider.py`, `actual_budget_provider.py`) —
  not needed for this task since `transactions.py` doesn't go through that abstraction.

## Done when

- Transactions tab shows real data from the local dev stack, list/table toggle works and
  persists across reload, the Uncategorized chip and the Filters sheet both actually
  narrow the results (verify against real fixture data, not just that the request fires).
- Selecting several rows and applying a category via the bulk bar updates all of them in
  Actual Budget's own web UI (`localhost:5006`) — confirm there, not just in Majordom's
  own list.
- "Load more" appends further results without duplicating or dropping rows already shown.
- Existing callers of `getTransactions()`/`get_recent_transactions()` (Dashboard, Account
  detail page, the chat tool in `backend/tools/finance/actual_budget.py`) still work
  unchanged — spot-check at least the Dashboard's Latest Transactions widget still renders.
- Test against the **local dev stack's fixture data** — confirm `ACTUAL_BUDGET_URL` in
  `.env` points at the local `actual-budget` container before running anything that writes.

## Circuit breaker
If you hit a decision with real architectural impact that isn't documented in
`decisions.md`/`architecture.md`, stop and describe the situation in your response —
don't pick an undecided variant yourself.
