# Task: Detect + review manual-entry vs. bank-sync duplicate transactions

## Context
A transaction entered manually (e.g. receipt scan, #121) can get duplicated when the bank sync later imports the same real-world purchase as a separate transaction — #121's dedup check only covers the reverse order. Confirmed live on production: 3 duplicate pairs found, same account, exact amount, one manual/uncleared + one bank-synced/cleared. Full design reasoning: `docs/specs/duplicate-transaction-review.md` — read it before starting, this prompt only summarizes the changes.

## Goal
1. Going forward, syncing accounts (button or chat) silently checks newly-synced transactions against the user's own manual entries and remembers what it finds.
2. The user can open a new screen from Home, see a list of months with a count of suspected duplicate pairs in each, tap a month to see the pairs side by side, and confirm/cancel merging each one individually — never automatic, never bulk.

## Relevant files
| File | What it contains |
|------|-------------------|
| `backend/core/actual_client/client.py` | `run_bank_resync_all()` (~line 1821, per-account bank sync), `delete_transaction()` (~line 861, soft-delete by `financial_id` — reuse, do not reimplement) |
| `backend/core/finance/actual_budget_provider.py` | Thin pass-through — every new `ActualBudgetClient` method needs a matching method here |
| `backend/core/finance/provider.py` | `FinanceProvider` Protocol — every new method needs a matching declaration here too (3-layer requirement, #126 gotcha) |
| `backend/tools/category_actions.py` | Generic in-memory proposal store (`store`/`get`/`delete`), keyed by an id, storing an arbitrary dict with an `"action"` field |
| `backend/api/category_actions.py` | `confirm_category_action` dispatches on `action["action"]` (`"rename"`, `"delete"`, `"create"`, `"set_goal"`, ...) — add a new branch here, do not add a new confirm/cancel endpoint pair |
| `backend/api/home.py` | `_get_client()` helper, existing `/home`, `/home/pending`, `/home/sync` routes — model new routes on these |
| `frontend/src/pages/Home.tsx` | Header icon row (~line 110-136) — add a new `IconButton` next to the existing sync icon, with a badge showing total duplicate count (same badge pattern as the existing `pendingItems` badge) |
| `frontend/src/components/Card.tsx`, `ActionCardButtons.tsx`, `PageHeader.tsx`, `IconButton.tsx` | Shared components — reuse for the new screen, do not build new equivalents |
| `frontend/src/App.tsx` | Route table (~line 85-119) — add `/duplicates` alongside `/import`, `/receipt` (same `ProtectedRoute` wrapper) |
| `frontend/src/lib/api.ts` | `request<T>()` wrapper + existing typed API functions (e.g. `syncAccounts`, `getHomePending`) — add typed functions the same way |

## Changes required

### 1. `backend/core/actual_client/client.py`
- Add one private helper, e.g. `_find_duplicate_candidates(session, account)`, implementing the matching rule from the spec (same account, exact amount, one `cleared == False` + one `cleared == True`, no date window). Returns a list of `{"manual": {...}, "synced": {...}}` dicts (each side: `financial_id`, `date`, `amount`, `payee`, `category_id`, `category_name`, `notes`).
- In `run_bank_resync_all()`: capture the return value of `actual.run_bank_sync(account=acc)` (currently only `len()`'d), and for each account call the new helper, keeping only pairs whose `synced` side's `financial_id` is in that account's newly-synced batch. Add the combined list under a new `duplicate_candidates` key in the returned dict.
- Add `get_duplicate_transactions_by_month() -> dict[str, list[dict]]`: loop bank-linked accounts only (`account_sync_source` set, same filter `run_bank_resync_all()` already uses), call the same helper (no "just synced" restriction this time), group results by the `synced` side's date → `"YYYY-MM"` key.
- Add `merge_duplicate_transaction(manual_financial_id: str, synced_financial_id: str) -> bool`: look up both transactions; if the synced side has no `category_id` and the manual side does, copy it over (same for `notes` — only fill if empty, never overwrite); commit; then call the existing `delete_transaction(manual_financial_id)` for the soft-delete. Do this in one `_get_actual()`/`commit()` block, not two separate calls, so it's one atomic commit.

### 2. `backend/core/finance/actual_budget_provider.py` + `backend/core/finance/provider.py`
- Add pass-through + Protocol declarations for `get_duplicate_transactions_by_month` and `merge_duplicate_transaction`. `run_bank_resync_all` already exists in both — just confirm its return type annotation still matches after adding `duplicate_candidates`.

### 3. `backend/api/home.py`
- `GET /home/duplicates/months` → calls `get_duplicate_transactions_by_month()`, returns `{"months": [{"month": "2026-08", "count": N}, ...]}` (only months with `count > 0`, sorted newest first).
- `GET /home/duplicates/months/{month}` → same underlying data, filtered to the requested month, returns the full pair list. For each pair, create an action via `category_actions.store()` with `{"action": "merge_duplicate", "manual_financial_id": ..., "synced_financial_id": ...}` and include the generated `action_id` in the response so the frontend can confirm/cancel it through the existing `/api/category-actions/{id}/confirm` and `/cancel` endpoints.

### 4. `backend/api/category_actions.py`
- In `confirm_category_action`, add an `elif action["action"] == "merge_duplicate":` branch calling `client.merge_duplicate_transaction(action["manual_financial_id"], action["synced_financial_id"])`, with a result message like `f"Merged duplicate — kept the bank-synced transaction, removed the manual entry."`.

### 5. `frontend/src/lib/api.ts`
- `getDuplicateMonths(): Promise<{ month: string; count: number }[]>` → `GET /home/duplicates/months`.
- `getDuplicatePairs(month: string): Promise<DuplicatePair[]>` → `GET /home/duplicates/months/{month}`, where `DuplicatePair` has `action_id`, `manual: {...}`, `synced: {...}` (mirror the backend shape).
- Confirm/cancel a pair: reuse the existing category-actions confirm/cancel functions if already exported (check the file first) or add thin wrappers calling `/api/category-actions/{id}/confirm` and `/cancel` — do not duplicate the generic proposal-store logic on the frontend either.

### 6. `frontend/src/pages/DuplicatesReviewPage.tsx` (new)
- Single page, two internal states: month list, and month detail (no separate route param — `useState` for selected month is enough, matches the "screen, not a new architecture" framing in the spec).
- `PageHeader` at top (`label="Review" title="Duplicates"` or similar).
- Month list: one row per month with its count, tap to open detail.
- Month detail: list of pairs, each rendered as a `Card` (`variant="list-item"`) showing the manual and synced transaction's date/amount/payee/category/notes side by side, a short warning line ("Verifică toate detaliile înainte de a confirma — se șterge intrarea manuală, categoria/notele se copiază pe cea sincronizată dacă lipsesc"), and `ActionCardButtons` wired to confirm/cancel that pair's `action_id`. On confirm, remove that pair from local state and refetch the month count (React Query invalidate).

### 7. `frontend/src/App.tsx`
- Add `<Route path="/duplicates" element={<ProtectedRoute><DuplicatesReviewPage /></ProtectedRoute>} />`.

### 8. `frontend/src/pages/Home.tsx`
- Add a new `IconButton` next to the sync icon (pick any reasonable lucide-react icon, e.g. `Copy` or `GitCompare`), `onClick={() => navigate('/duplicates')}`, with a badge showing the total duplicate count. Fetch the count via React Query (`queryKey: ['duplicates', 'months']`, calling `getDuplicateMonths()`, summing `count`) the same way `pendingItems` is already fetched on this page — find and mirror that exact query setup, don't invent a new data-fetching pattern.

## Critical Rules
- `download_budget()` first → operations → `commit()` last, inside `def _get(): with self._get_actual() as actual:` (architecture.md critical rule 2)
- actualpy amounts are EUR floats, not cents, when read via `.get_amount()` — but raw `Transactions.amount` (used in the existing `count_uncategorized_by_payee`/`find_near_duplicate_transaction` queries) is cents, divide by 100. Match whichever field you're actually querying against.
- Every new `ActualBudgetClient` method must also be added to `ActualBudgetProvider` AND declared on the `FinanceProvider` Protocol, or `get_provider()`'s result raises `AttributeError` (#126 gotcha, applies to both new methods).
- This feature is screen-driven (REST), not chat-driven — do NOT add a new entry to `_PROPOSAL_TOOLS` or the chat system-prompt tool list in `backend/api/chat.py`. No new chat tool is being added here.
- `_PROPOSAL_TOOLS`-style confirmation discipline still applies to the merge action even though it's not a chat tool: never delete/merge without the user's explicit per-pair Confirm click on the new screen.

## Gotchas
1. `run_bank_resync_all()`'s existing `new_transactions` count (`len()` of the sync result) must keep working exactly as before — you're capturing the same list, not replacing what it's used for.
2. `category_actions.py`'s confirm dispatch uses plain `dict` access (`action["action"]`, `action["category_name"]`, etc.) with no schema validation beyond the existing `GoalOverride` Pydantic model for overrides — follow the same convention, don't introduce a new validation layer just for this branch.
3. Frontend auth: use `authFetch()` from `../lib/auth` or the existing `request<T>()` wrapper in `api.ts` — never read `localStorage` directly (real key is `'majordom_token'`).

## Do NOT touch
- `find_near_duplicate_transaction()` (#121's OCR-tolerance matcher) — different feature, different matching rule, stays as is.
- `#117`'s `propose_balance_adjustment` / `adjust_account_balance` — unrelated, not part of this task.
- `#120` (cross-account transfer linking) — unrelated, not part of this task.
- The envelope/tracking accounts (no `account_sync_source`) — must stay excluded by the existing filter; do not widen matching to accounts without a live bank link.

## Done when
- Live test on the dev stack: manually create a transaction, then trigger a sync that would (in a real scenario) reimport it — or use existing fixture duplicates if the dev stack has any — and confirm the new Home icon's badge count reflects it.
- The `/duplicates` screen lists at least one month with a count, opening it shows the pair with both sides' details, and confirming it removes the manual transaction (verified via `inspect_tx.py` or the AB UI) while the bank-synced one keeps or gains the manual side's category/notes.
- Cancelling a pair leaves both transactions untouched.
- No regression: `run_bank_resync_all()`'s existing `synced_accounts`/`new_transactions`/`failed` behavior is unchanged for callers that don't look at the new `duplicate_candidates` key (the sync icon's existing behavior, chat's `finance__sync_accounts` tool).
