# Task: Close account from chat

## Context

Issue #69. Users currently can only close an Actual Budget account via the AB UI directly (Settings → Accounts → Close account). Add a `propose_close_account` tool following the standard `propose_*` confirmation-card pattern already used throughout the codebase.

This task follows the exact same shape as the existing balance-adjustment flow — use it as the reference implementation for every layer (tool function, registry, in-memory store, confirm/cancel API router, frontend card). Do not invent a different structure.

## Goal

User says "close my ING savings account" → LLM calls `finance__propose_close_account` → a confirmation card shows the account name and current balance (with a warning if balance ≠ 0) → user confirms → the account is closed in Actual Budget (`Accounts.closed = True`).

## Relevant files (reference pattern to mirror)

| File | What it contains |
|------|-----------------|
| `backend/tools/finance/actual_budget.py` | `propose_balance_adjustment()` (line 635-670) — the pattern for validating input, storing a pending proposal, returning JSON for the card |
| `backend/tools/balance_adjustments.py` | In-memory pending-proposal store (`store`/`get`/`delete`) — mirror this exact shape for close-account proposals |
| `backend/api/balance_adjustments.py` | `/confirm` and `/cancel` endpoints — mirror this exact shape |
| `backend/core/actual_client/client.py` | `adjust_account_balance()` (line 855) — shows the pattern for querying `Accounts` by id and committing a change; `get_accounts()` (line 470) shows how accounts are normally listed (excludes closed accounts already, useful for validating the account exists before closing) |
| `backend/tools/registry.py` | Where `finance__propose_balance_adjustment` is registered (schema ~line 517, dispatch ~line 1025) — add the new tool the same way |
| `backend/api/chat.py` | `_PROPOSAL_TOOLS` set (~line 158) and `_build_system_prompt()` `## Finance tools` section (~line 101-116) — both need the new tool added, following the lesson from #160: every proposal/report tool needs an explicit system-prompt bullet + example, or the LLM may not reliably call it |
| `backend/main.py` | Router registration (~line 191, `balance_adjustments.router`) — register the new router the same way |
| `frontend/src/components/BalanceAdjustmentCard.tsx` | The card component to mirror — uses the shared `ActionCardButtons` component (`frontend/src/components/ActionCardButtons.tsx`), not custom buttons |
| `frontend/src/lib/api.ts` | `BalanceAdjustmentData` interface + `confirmBalanceAdjustment`/`cancelBalanceAdjustment` functions (~line 704-720) — mirror this shape |
| `frontend/src/pages/Chat.tsx` | Message `role` union type (~line 30), tool-result handling for `type === 'balance_adjustment'` (~line 411), card rendering (~line 750) — all three need the new role/type added |

## Changes required

### 1. `backend/core/actual_client/client.py`

Add `async def close_account(self, account_id: str) -> str` (near `adjust_account_balance`): query `Accounts` by id (same filter pattern as `adjust_account_balance` — `Accounts.id == account_id, Accounts.tombstone == 0`), raise `ValueError` if not found, set `.closed = True`, commit, return the account name.

### 2. `backend/tools/close_account.py` (new file)

In-memory pending-proposal store, identical shape to `backend/tools/balance_adjustments.py` (`store`/`get`/`delete` functions over a module-level dict).

### 3. `backend/tools/finance/actual_budget.py`

Add `async def propose_close_account(account_name: str) -> str`, mirroring `propose_balance_adjustment`'s structure:
- Fetch accounts via `client.get_accounts()`, match by exact name then partial case-insensitive (same two-step matching as `propose_balance_adjustment`).
- If not found, return the same `{"type": "error", "message": "Account '...' not found. Available: ..."}` shape.
- Store the pending proposal (`account_id`, `account_name`, `balance`) via the new store module.
- Return JSON: `{"type": "close_account", "id": proposal_id, "account_name": ..., "balance": ...}`.

### 4. `backend/api/close_account.py` (new file)

Mirror `backend/api/balance_adjustments.py` exactly: `POST /close-account/{proposal_id}/confirm` calls `client.close_account(account_id)` then deletes the proposal; `POST /close-account/{proposal_id}/cancel` just deletes it. Same try/except/finally structure and error handling.

### 5. `backend/tools/registry.py`

Add tool schema for `finance__propose_close_account`, one required parameter `account_name` (string). Description should make clear this is a destructive action requiring confirmation. Add the dispatch case calling `propose_close_account(**arguments)`.

### 6. `backend/api/chat.py`

- Add `"finance__propose_close_account"` to `_PROPOSAL_TOOLS`.
- Add a bullet to `_build_system_prompt()`'s `## Finance tools` section: "To close an account: call finance__propose_close_account immediately. Never describe it as text." with an example like `"close my ING savings account" → finance__propose_close_account(account_name="ING savings")`.

### 7. `backend/main.py`

Add `close_account` to the import list (~line 19) and `app.include_router(close_account.router, prefix="/api")` (~line 191 area).

### 8. `frontend/src/lib/api.ts`

Add `CloseAccountData` interface (`id`, `account_name`, `balance`) and `confirmCloseAccount(id)` / `cancelCloseAccount(id)` functions, mirroring `BalanceAdjustmentData`/`confirmBalanceAdjustment`/`cancelBalanceAdjustment` exactly (same endpoint-path convention: `/close-account/{id}/confirm`, `/close-account/{id}/cancel`).

### 9. `frontend/src/components/CloseAccountCard.tsx` (new file)

Mirror `BalanceAdjustmentCard.tsx`'s structure: show account name and balance, use `ActionCardButtons` with `variant="danger"` and `confirmLabel="Close Account"` (this is a destructive action — use the danger variant, unlike the default balance-adjustment card). If `balance !== 0`, show a visible warning line (e.g. "This account still has a balance of €X — closing it won't zero it out.") above the buttons.

### 10. `frontend/src/pages/Chat.tsx`

- Add `'close_account'` to the message `role` union type (~line 30).
- Import `CloseAccountCard`.
- Handle `parsed.type === 'close_account'` the same way as `balance_adjustment` (~line 411-412) — push a new message with the parsed data.
- Render `CloseAccountCard` when `msg.role === 'close_account' && msg.closeAccount` (~line 750 area), passing `onConfirmed`/`onCancelled` callbacks the same way `BalanceAdjustmentCard` does.

## Critical Rules

- Follow the standard `propose_*` confirmation-card pattern exactly — do not invent a different flow. (source: `CLAUDE.md` collaboration rules, `architecture.md` write-tool confirmation pattern)
- New proposal tool → must be added to `_PROPOSAL_TOOLS` in `backend/api/chat.py` or the card never renders. (source: `CLAUDE.md` known gotchas)
- New tool needs an explicit system-prompt bullet + example — a tool with no bullet risks being silently skipped by the LLM (confirmed root cause of #160). (source: this session's #160 investigation)
- Confirmation card fields don't need to be editable here (unlike e.g. transaction amount) since there's nothing to correct — account identity and the destructive action itself is what's being confirmed, matching the existing balance-adjustment card's own read-only display style.

## Gotchas

1. `get_accounts()` already filters out closed accounts (line 478-479 `if acc.closed: continue`) — so re-closing an already-closed account will correctly surface as "Account not found" via the existing lookup, no extra check needed.
2. Actualpy's `Accounts.closed` is a plain boolean column — no special helper function exists in `actual.queries` for closing; setting the attribute directly and committing (same session pattern as `adjust_account_balance`) is correct and is how actualpy expects this to be done.

## Do NOT touch

- `adjust_account_balance()` or the balance-adjustment flow — this is a separate, parallel flow, not a modification of the existing one.
- `ActionCardButtons` — reuse it as-is with the `variant="danger"` prop, don't modify the shared component.

## Done when

- Saying "close my [account] account" in chat renders a confirmation card with the account name, balance, and a warning if balance ≠ 0.
- Confirming closes the account in Actual Budget (verify: the account no longer appears in `get_accounts()`/the AB UI).
- Cancelling discards the proposal with no changes to Actual Budget.
