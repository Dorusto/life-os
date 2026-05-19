# Task: M1.1 — Budget conversational rebalancing

## Context

Majordom is a self-hosted personal finance assistant built with FastAPI (Python 3.11) + React
(TypeScript). It acts as a conversational layer over Actual Budget (actualpy library).

The chat already works: user sends a message → FastAPI fetches financial context from Actual Budget
→ injects it into the Ollama system prompt → LLM responds or calls a tool. Tool `propose_transaction`
already exists: LLM calls it → returns JSON `{type: "proposal", ...}` → React renders a
`ProposalCard` → user confirms → POST to backend → saved in Actual Budget.

## Feature to implement

**Budget conversational rebalancing (M1.1)**

When a user wants to move budget money between categories, Majordom handles it entirely in chat:

1. User says: "I overspent on Restaurants, move €50 from Personal"
2. LLM calls the `propose_budget_rebalance` tool
3. Backend returns JSON `{type: "budget_rebalance", ...}` (NOT saved yet)
4. React renders a `BudgetRebalanceCard` with Confirm / Cancel
5. User confirms → POST `/api/budget/rebalance` → backend sets new allocations in Actual Budget

This is the same pattern as `propose_transaction`. Do NOT deviate from this pattern.

---

## Architecture rules (do NOT violate)

- All budget data lives in Actual Budget. Do NOT store budget amounts in SQLite.
- `ActualBudgetClient` is sync inside async: all sync actualpy code goes inside `def _inner():`
  and runs via `await self._run(_inner)`. See existing methods in client.py for the pattern.
- actualpy operation order: `actual.download_budget()` first, `actual.commit()` last (for writes).
- Config always from `from backend.core.config import settings`, never from `os.getenv()`.
- actualpy `create_budget(session, month, category_name, amount)` — this is the correct call
  to set (upsert) a budget allocation. It creates a new entry if none exists, updates if it does.
  `month` must be a `datetime.date` object for any day in the target month (e.g. `date(2026, 5, 1)`).

---

## Files to modify

### 1. `backend/core/actual_client/client.py`

Add a new method at the end of the `ActualBudgetClient` class:

```python
async def set_budget_amount(
    self,
    category_name: str,
    new_amount: float,
    month: date | None = None,
) -> dict:
    """
    Upsert the budget allocation for a category in the given month.
    Returns {"category_name": ..., "old_amount": ..., "new_amount": ...}
    """
    from datetime import date as _date
    target_month = month or _date.today().replace(day=1)

    def _set():
        from actual.queries import create_budget, get_budget, get_category
        with self._get_actual() as actual:
            actual.download_budget()
            cat = get_category(actual.session, category_name)
            if not cat:
                raise ValueError(f"Category not found: {category_name}")
            existing = get_budget(actual.session, target_month, cat)
            old_amount = float(existing.amount) / 100 if existing and existing.amount else 0.0
            create_budget(actual.session, target_month, cat, new_amount)
            actual.commit()
            return {"category_name": category_name, "old_amount": old_amount, "new_amount": new_amount}

    return await self._run(_set)
```

### 2. `backend/tools/finance/actual_budget.py`

Add a new function at the end (after `propose_transaction`):

```python
async def propose_budget_rebalance(
    source_category: str,
    destination_category: str,
    amount: float,
    month: str = "",
) -> str:
    """
    Create a pending budget rebalance proposal (does NOT modify Actual Budget yet).
    Fetches current budget allocations for both categories, then returns a JSON
    string with type='budget_rebalance' for the frontend to render as a card.
    """
    import json
    from datetime import date as _date

    today = _date.today()
    # month param is "YYYY-MM" or empty (defaults to current month)
    if month:
        try:
            year, m = int(month[:4]), int(month[5:7])
            target_month = _date(year, m, 1)
        except (ValueError, IndexError):
            target_month = today.replace(day=1)
    else:
        target_month = today.replace(day=1)

    client = _get_client()

    # Fetch current budget allocations to compute new amounts
    budget_status = await client.get_budget_status(
        month=target_month.month,
        year=target_month.year,
    )

    source_budgeted = 0.0
    dest_budgeted = 0.0
    for item in budget_status:
        name = item["category_name"]
        if name.lower() == source_category.lower():
            source_budgeted = item["budgeted"]
            source_category = name  # normalize to exact name from AB
        elif name.lower() == destination_category.lower():
            dest_budgeted = item["budgeted"]
            destination_category = name  # normalize

    new_source = round(source_budgeted - amount, 2)
    new_destination = round(dest_budgeted + amount, 2)

    return json.dumps({
        "type": "budget_rebalance",
        "source_category": source_category,
        "destination_category": destination_category,
        "amount": amount,
        "month": target_month.strftime("%Y-%m"),
        "current_source_budget": source_budgeted,
        "current_destination_budget": dest_budgeted,
        "new_source_budget": new_source,
        "new_destination_budget": new_destination,
    })
```

### 3. `backend/tools/registry.py`

Add the tool definition to the `TOOLS` list (after `propose_transaction`):

```python
{
    "type": "function",
    "function": {
        "name": "propose_budget_rebalance",
        "description": (
            "Propose moving budget money from one category to another. "
            "Use this when the user wants to rebalance their budget — for example: "
            "'I overspent on Restaurants, move €50 from Personal', or "
            "'decrease Personal budget by fifty and add it to Restaurants'. "
            "The user will see a confirmation card before any change is made."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "source_category": {
                    "type": "string",
                    "description": "Category to take money FROM (must match an existing category name).",
                },
                "destination_category": {
                    "type": "string",
                    "description": "Category to add money TO (must match an existing category name).",
                },
                "amount": {
                    "type": "number",
                    "description": "Amount in EUR to move between categories, always positive.",
                },
                "month": {
                    "type": "string",
                    "description": "Month to rebalance in YYYY-MM format. Omit for the current month.",
                },
            },
            "required": ["source_category", "destination_category", "amount"],
        },
    },
},
```

Add execution to `execute_tool()`:

```python
    if name == "propose_budget_rebalance":
        from backend.tools.finance.actual_budget import propose_budget_rebalance
        return await propose_budget_rebalance(**arguments)
```

And in the `chat_stream` handler (in `backend/api/chat.py`), add a check for this tool alongside
the existing `propose_transaction` check:

```python
            if name in ("propose_transaction", "propose_budget_rebalance"):
                async def yield_proposal(r=result):
                    yield r
                return StreamingResponse(yield_proposal(), media_type="text/plain", headers=streaming_headers)
```

(Replace the existing `if name == "propose_transaction":` block with this.)

### 4. `backend/api/chat.py` — system prompt update

In `_build_system_prompt()`, add a budget rebalancing rule to the `## Rules` section:

```
- When the user wants to move budget money between categories: ALWAYS call propose_budget_rebalance immediately. Never write the proposed change as text — call the tool. The user will confirm via the UI.
```

Add it after the existing `propose_transaction` rule.

### 5. `backend/api/budget.py` (NEW FILE)

```python
"""
Budget management endpoints.
POST /api/budget/rebalance — apply a confirmed budget rebalance.
"""
import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core.actual_client import ActualBudgetClient
from backend.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


class RebalanceRequest(BaseModel):
    source_category: str
    destination_category: str
    amount: float
    month: str = ""       # "YYYY-MM" or empty for current month
    new_source_budget: float
    new_destination_budget: float


@router.post("/budget/rebalance")
async def apply_rebalance(
    req: RebalanceRequest,
    current_user: str = Depends(get_current_user),
):
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    if req.month:
        try:
            year, m = int(req.month[:4]), int(req.month[5:7])
            target_month = date(year, m, 1)
        except (ValueError, IndexError):
            target_month = date.today().replace(day=1)
    else:
        target_month = date.today().replace(day=1)

    # Use the shared client factory — same pattern as tools/finance/actual_budget.py
    from backend.tools.finance.actual_budget import _get_client
    client = _get_client()

    try:
        await client.set_budget_amount(req.source_category, req.new_source_budget, target_month)
        await client.set_budget_amount(req.destination_category, req.new_destination_budget, target_month)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error("Budget rebalance failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to apply rebalance")

    return {
        "message": (
            f"Moved €{req.amount:.2f} from {req.source_category} to {req.destination_category}. "
            f"New allocations: {req.source_category} €{req.new_source_budget:.2f}, "
            f"{req.destination_category} €{req.new_destination_budget:.2f}."
        )
    }
```

### 6. `backend/main.py`

Add the budget router. In the imports line:

```python
from backend.api import auth, receipts, transactions, chat, csv_import, proposals, budget
```

And register it:

```python
app.include_router(budget.router, prefix="/api")
```

(Place after `proposals.router`.)

### 7. `frontend/src/lib/api.ts`

Add a new function (near the end of the file):

```typescript
export interface BudgetRebalanceData {
  type: 'budget_rebalance'
  source_category: string
  destination_category: string
  amount: number
  month: string
  current_source_budget: number
  current_destination_budget: number
  new_source_budget: number
  new_destination_budget: number
}

export async function confirmBudgetRebalance(data: BudgetRebalanceData): Promise<{ message: string }> {
  return apiFetch('/api/budget/rebalance', {
    method: 'POST',
    body: JSON.stringify({
      source_category: data.source_category,
      destination_category: data.destination_category,
      amount: data.amount,
      month: data.month,
      new_source_budget: data.new_source_budget,
      new_destination_budget: data.new_destination_budget,
    }),
  })
}
```

### 8. `frontend/src/components/BudgetRebalanceCard.tsx` (NEW FILE)

```tsx
import { useState } from 'react'
import { ArrowRight, Check, X } from 'lucide-react'
import { confirmBudgetRebalance, type BudgetRebalanceData } from '../lib/api'

interface Props {
  data: BudgetRebalanceData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function BudgetRebalanceCard({ data, onConfirmed, onCancelled }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      const result = await confirmBudgetRebalance(data)
      onConfirmed(result.message)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      onConfirmed(`Error: could not rebalance budget (${msg}). Try again via chat.`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[80%] space-y-3">
      <div>
        <p className="text-white font-medium text-sm">Budget rebalance</p>
        <p className="text-muted text-xs mt-0.5">{data.month}</p>
      </div>

      {/* Source → Destination */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-white">{data.source_category}</span>
          <span className="text-muted">€{data.current_source_budget.toFixed(2)} → <span className="text-red-400">€{data.new_source_budget.toFixed(2)}</span></span>
        </div>
        <div className="flex items-center gap-1 text-muted text-xs">
          <ArrowRight size={12} />
          <span>€{data.amount.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-white">{data.destination_category}</span>
          <span className="text-muted">€{data.current_destination_budget.toFixed(2)} → <span className="text-green-400">€{data.new_destination_budget.toFixed(2)}</span></span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors active:scale-95 disabled:opacity-40"
        >
          <Check size={14} />
          {loading ? 'Saving…' : 'Confirm'}
        </button>
        <button
          onClick={onCancelled}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-surface-2 hover:bg-surface-hover border border-border text-muted hover:text-white text-sm font-medium transition-colors active:scale-95 disabled:opacity-40"
        >
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  )
}
```

### 9. `frontend/src/pages/Chat.tsx`

**Step A — Update the `Message` interface** to add the budget rebalance type:

```typescript
import type { BudgetRebalanceData } from '../components/BudgetRebalanceCard'

export interface Message {
  role: 'user' | 'assistant' | 'proposal' | 'budget_rebalance'
  content: string
  proposal?: ProposalData
  budgetRebalance?: BudgetRebalanceData
}
```

**Step B — Update the streaming completion handler** (the `onComplete` callback inside `sendChatMessageStreaming`) to also detect `type === "budget_rebalance"`:

```typescript
    () => {
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant') {
          const trimmed = last.content.trim()
          const jsonStart = trimmed.indexOf('{')
          if (jsonStart !== -1) {
            try {
              const parsed = JSON.parse(trimmed.slice(jsonStart))
              if (parsed.type === 'proposal') {
                return [
                  ...prev.slice(0, -1),
                  { role: 'proposal' as const, content: '', proposal: parsed as ProposalData },
                ]
              }
              if (parsed.type === 'budget_rebalance') {
                return [
                  ...prev.slice(0, -1),
                  { role: 'budget_rebalance' as const, content: '', budgetRebalance: parsed as BudgetRebalanceData },
                ]
              }
            } catch {}
          }
        }
        return prev
      })
      setLoading(false)
    },
```

**Step C — Import `BudgetRebalanceCard` and render it** in the message list, inside the existing
`messages.map(...)`. Add the new case alongside the `proposal` case:

```tsx
            {msg.role === 'budget_rebalance' && msg.budgetRebalance ? (
              <BudgetRebalanceCard
                data={msg.budgetRebalance}
                onConfirmed={(message) => {
                  setMessages(prev =>
                    prev.map((m, i) =>
                      i === idx
                        ? { role: 'assistant', content: message }
                        : m
                    )
                  )
                }}
                onCancelled={() => {
                  setMessages(prev =>
                    prev.map((m, i) =>
                      i === idx
                        ? { role: 'assistant', content: 'Cancelled.' }
                        : m
                    )
                  )
                }}
              />
            ) : msg.role === 'proposal' && msg.proposal ? (
              <ProposalCard ... />   {/* existing code unchanged */}
            ) : (
              <div ...>{/* existing text message rendering unchanged */}</div>
            )}
```

---

## Constraints — do NOT change these

- Do NOT modify `backend/tools/proposals.py` — it's only for transaction proposals.
- Do NOT add SQLite tables or queries. No budget data in SQLite.
- Do NOT change the existing `propose_transaction` flow.
- Do NOT add validation logic in the LLM layer — if source budget would go negative after the
  move, that's the user's decision. The backend applies what was confirmed.
- Do NOT implement auto-detection of overspend or automatic triggering — only user-initiated
  rebalancing through chat.
- The `BudgetRebalanceCard` must NOT have dropdowns or editable fields. The user sees exactly
  what the LLM proposed. If they want different amounts/categories, they cancel and type again.

---

## Expected result after implementation

1. User types in chat: "I overspent on Restaurants this month, move 50 euros from Personal"
2. LLM calls `propose_budget_rebalance(source_category="Personal", destination_category="Restaurants", amount=50)`
3. Chat shows a `BudgetRebalanceCard`:
   - "Personal: €200 → €150"
   - "→ €50"
   - "Restaurants: €73 → €123"
   - Confirm / Cancel
4. User clicks Confirm
5. POST `/api/budget/rebalance` is called
6. Both category budgets updated in Actual Budget
7. Card replaced with: "Moved €50 from Personal to Restaurants. New allocations: Personal €150.00, Restaurants €123.00."

## Files summary

| File | Action |
|------|--------|
| `backend/core/actual_client/client.py` | Add `set_budget_amount()` method |
| `backend/tools/finance/actual_budget.py` | Add `propose_budget_rebalance()` function |
| `backend/tools/registry.py` | Add tool definition + execution handler |
| `backend/api/chat.py` | Update system prompt + check for budget_rebalance tool |
| `backend/api/budget.py` | NEW — POST /api/budget/rebalance endpoint |
| `backend/main.py` | Register budget router |
| `frontend/src/lib/api.ts` | Add `BudgetRebalanceData` type + `confirmBudgetRebalance()` |
| `frontend/src/components/BudgetRebalanceCard.tsx` | NEW — confirmation card component |
| `frontend/src/pages/Chat.tsx` | Handle budget_rebalance message type |
