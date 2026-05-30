# Task: Balance adjustment from chat (issue #68)

## Context

Majordom is a personal finance assistant. Backend: FastAPI + Python. Frontend: React + TypeScript + Tailwind.
Financial data lives in Actual Budget (AB); accessed via `ActualBudgetClient`.

All write operations follow the **propose_* pattern**:
1. LLM calls tool → backend builds a JSON card + stores a pending proposal in memory → returns JSON to frontend
2. Frontend renders a confirmation card inline in chat
3. User confirms → frontend POSTs to a confirm endpoint → backend executes the real operation

## What to build

Add a `propose_balance_adjustment` tool so the user can say e.g. *"set my ING balance to €2430"* and Majordom creates a balance adjustment transaction in AB after confirmation.

---

## Files to touch

### 1. `backend/tools/balance_adjustments.py` — new file, simple in-memory store

Same pattern as `backend/tools/proposals.py`. Store a dict keyed by `proposal_id`.
Fields to store: `account_id`, `account_name`, `current_balance`, `real_balance`.

### 2. `backend/tools/finance/actual_budget.py` — add `propose_balance_adjustment`

```python
async def propose_balance_adjustment(account_name: str, real_balance: float) -> str:
    import json, uuid
    from backend.tools import balance_adjustments as adj_store

    client = _get_client()
    accounts = await client.get_accounts()

    # match by exact name first, then partial (case-insensitive)
    matched = next((a for a in accounts if a.name.lower() == account_name.lower()), None)
    if not matched:
        matched = next((a for a in accounts if account_name.lower() in a.name.lower()), None)
    if not matched:
        names = ", ".join(a.name for a in accounts)
        return json.dumps({"type": "error", "message": f"Account '{account_name}' not found. Available: {names}"})

    proposal_id = uuid.uuid4().hex[:8]
    adj_store.store(proposal_id, {
        "account_id": matched.id,
        "account_name": matched.name,
        "current_balance": matched.balance,
        "real_balance": real_balance,
    })

    return json.dumps({
        "type": "balance_adjustment",
        "id": proposal_id,
        "account_name": matched.name,
        "current_balance": matched.balance,
        "real_balance": real_balance,
        "diff": round(real_balance - matched.balance, 2),
    })
```

### 3. `backend/tools/registry.py` — two changes

Add tool schema to `TOOLS`:
- name: `propose_balance_adjustment`
- description: "Propose adjusting an account balance to match the real bank balance. Use when the user says the account balance is wrong, or wants to sync/reconcile an account balance."
- parameters: `account_name` (string, required), `real_balance` (number, required — the correct real-world balance in EUR)

Add dispatch in `execute_tool`:
```python
if name == "propose_balance_adjustment":
    from backend.tools.finance.actual_budget import propose_balance_adjustment
    return await propose_balance_adjustment(**arguments)
```

### 4. `backend/api/chat.py` — add to `_PROPOSAL_TOOLS`

**Critical gotcha:** `_PROPOSAL_TOOLS` is the set that tells the chat endpoint to return the tool result directly to the frontend (without another LLM call). If `propose_balance_adjustment` is NOT in this set, the JSON card gets fed back into the LLM instead of being sent to the user.

```python
_PROPOSAL_TOOLS = {
    "propose_transaction",
    "propose_budget_rebalance",
    "propose_account_transfer",
    "propose_clarification",
    "propose_balance_adjustment",   # add this
}
```

### 5. `backend/api/balance_adjustments.py` — new file, confirm/cancel endpoints

```
POST /api/balance-adjustments/{id}/confirm
POST /api/balance-adjustments/{id}/cancel
```

On confirm: call `client.adjust_account_balance(account_id, real_balance)`.

**Gotcha:** `adjust_account_balance(account_id, target_balance)` receives `target_balance` in **EUR** (not cents). Pass `real_balance` directly — no conversion needed.

Return a human-readable message: e.g. `"ING balance adjusted: +€8.73"` or `"Balance already correct, no adjustment needed."`.

Register router in `backend/main.py` with prefix `/api`.

### 6. `frontend/src/lib/api.ts` — add types and functions

```typescript
export interface BalanceAdjustmentData {
  type: 'balance_adjustment'
  id: string
  account_name: string
  current_balance: number
  real_balance: number
  diff: number
}

export async function confirmBalanceAdjustment(id: string): Promise<{ message: string }>
export async function cancelBalanceAdjustment(id: string): Promise<void>
```

Both call `/balance-adjustments/{id}/confirm` and `/balance-adjustments/{id}/cancel` respectively.

### 7. `frontend/src/components/BalanceAdjustmentCard.tsx` — new component

Style: identical to `ProposalCard` — `bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[80%]`.

Display:
- Account name (bold)
- Current AB balance and real balance on one line: `€2,421.40 → €2,430.13`
- Diff with sign and color: green for positive, red for negative (`+€8.73` / `-€8.73`). If diff is 0: "Already in sync"
- Confirm / Cancel buttons (same as ProposalCard)

On confirm: call `confirmBalanceAdjustment(id)` → `onConfirmed(result.message)`.
On cancel: call `cancelBalanceAdjustment(id)` → `onCancelled()`.

### 8. `frontend/src/pages/Chat.tsx` — wire it up

Add `balance_adjustment` to the `Message` union type (role field) and add `balanceAdjustment?: BalanceAdjustmentData`.

In `handleChatChunk`: handle `parsed.type === 'balance_adjustment'` — same pattern as `proposal`.

In the message list renderer: add a case for `msg.role === 'balance_adjustment'` that renders `<BalanceAdjustmentCard>`.

`onConfirmed` and `onCancelled` replace the card with a status message (same as ProposalCard).

---

## What NOT to do

- Do not store anything in SQLite — proposals are in-memory only (server restart clears them, that's fine)
- Do not add any new AB columns or tables
- Do not change `adjust_account_balance` in `client.py` — it already works correctly
