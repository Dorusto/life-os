# Task: Add `propose_set_category_budget` tool

## Context

Majordom is a self-hosted personal finance assistant (FastAPI backend + React PWA frontend).
It exposes tools to an LLM via OpenAI-compatible tool calling. When the LLM returns a tool call,
`execute_tool()` in `registry.py` dispatches it. Write tools return a JSON proposal card
rendered in the frontend — the user confirms, then a confirm endpoint executes the real action.

**Problem:** There is no tool to set a category's budgeted amount directly.
`propose_budget_rebalance` moves money *between* categories. It cannot handle requests like
"set Public Transport budget to €50". The LLM hallucinates a text response instead of acting.

**Solution:** Add `propose_set_category_budget` — same proposal/confirm pattern as
`rename_category`, `delete_category`, `create_category` (already implemented, follow that pattern exactly).

---

## What already exists (do not reimplement)

- `ActualBudgetClient.set_budget_amount(category_name, new_amount, month)` in
  `backend/core/actual_client/client.py` — already works, already tested. Do NOT touch this file.
- `backend/tools/category_actions.py` — in-memory store (`store`, `get`, `delete`)
- `backend/api/category_actions.py` — confirm/cancel endpoints with a `match action["action"]` switch
- `backend/tools/finance/actual_budget.py` — all existing tool functions (add here)
- `frontend/src/components/CategoryActionCard.tsx` — renders category_action cards (extend here)
- `frontend/src/lib/api.ts` — `CategoryActionData` interface + `confirmCategoryAction` (extend here)

---

## Changes required

### 1. `backend/tools/finance/actual_budget.py`

Add this function at the bottom of the file:

```python
async def propose_set_category_budget(
    category_name: str,
    amount: float,
    month: str = "",
) -> str:
    """
    Propose setting a category's budget to a specific amount for a month.
    Returns JSON with type='category_action', action='set_budget' for the frontend card.
    Does NOT write to Actual Budget yet.
    """
    import uuid
    from difflib import get_close_matches
    from datetime import date as _date
    from backend.tools import category_actions as action_store

    today = _date.today()
    if month:
        try:
            year, m = int(month[:4]), int(month[5:7])
            target_month = _date(year, m, 1)
        except (ValueError, IndexError):
            target_month = today.replace(day=1)
    else:
        target_month = today.replace(day=1)

    client = _get_client()
    budget_status = await client.get_budget_status(
        month=target_month.month,
        year=target_month.year,
    )

    all_names = [item["category_name"] for item in budget_status]
    exact = next((n for n in all_names if n.lower() == category_name.lower()), None)
    resolved = exact or (get_close_matches(category_name, all_names, n=1, cutoff=0.6) or [None])[0]

    if not resolved:
        return json.dumps({
            "type": "error",
            "message": f"Category not found: {category_name!r}. Available: {', '.join(all_names)}",
        })

    current_amount = next(
        (item["budgeted"] for item in budget_status if item["category_name"] == resolved),
        0.0,
    )

    action_id = uuid.uuid4().hex[:8]
    action_store.store(action_id, {
        "action": "set_budget",
        "category_name": resolved,
        "new_amount": amount,
        "current_amount": current_amount,
        "month": target_month.isoformat(),
    })

    return json.dumps({
        "type": "category_action",
        "action": "set_budget",
        "id": action_id,
        "category_name": resolved,
        "current_amount": current_amount,
        "new_amount": amount,
        "month": target_month.strftime("%Y-%m"),
    })
```

---

### 2. `backend/tools/registry.py`

**a) Add to `TOOLS` list** (after the existing category tools — `rename_category`, `delete_category`, `create_category`, `setup_default_groups`):

```python
{
    "type": "function",
    "function": {
        "name": "propose_set_category_budget",
        "description": "Set the budgeted amount for a specific category in a given month. Use this when the user wants to assign a specific euro amount to a category budget (e.g. 'set Groceries to €300', 'put €50 in Transport for June'). Different from propose_budget_rebalance which moves money between two categories.",
        "parameters": {
            "type": "object",
            "properties": {
                "category_name": {"type": "string", "description": "The budget category name to set the amount for."},
                "amount": {"type": "number", "description": "The new budget amount in EUR (e.g. 300.0 for €300)."},
                "month": {"type": "string", "description": "Month in YYYY-MM format. Omit for current month."},
            },
            "required": ["category_name", "amount"],
        },
    },
},
```

**b) Add to `execute_tool()`** (in the same block as the other finance tools):

```python
elif name == "propose_set_category_budget":
    return await finance.propose_set_category_budget(**args)
```

---

### 3. `backend/api/chat.py`

Add `"propose_set_category_budget"` to `_PROPOSAL_TOOLS`:

```python
_PROPOSAL_TOOLS = {
    ...,
    "propose_set_category_budget",
}
```

**Critical:** If this is missing, the JSON goes to the LLM instead of the frontend — the card never appears.

---

### 4. `backend/api/category_actions.py`

**a) Add `amount` field to `GoalOverride`:**

```python
class GoalOverride(BaseModel):
    target: float | None = None
    deadline: str | None = None
    category_name: str | None = None
    group_name: str | None = None
    amount: float | None = None   # ← add this
```

**b) Add `set_budget` case to `confirm_category_action`** (after the `set_goal` branch):

```python
elif action["action"] == "set_budget":
    from datetime import date as _date
    new_amount = override.amount if override.amount is not None else action["new_amount"]
    month_str = action.get("month")
    month = _date.fromisoformat(month_str).replace(day=1) if month_str else None
    result = await client.set_budget_amount(
        category_name=action["category_name"],
        new_amount=new_amount,
        month=month,
    )
    message = (
        f"Budget updated: {result['category_name']} "
        f"€{result['old_amount']:.2f} → €{result['new_amount']:.2f}"
    )
```

---

### 5. `frontend/src/lib/api.ts`

**a) Extend `CategoryActionData`:**

```ts
export interface CategoryActionData {
  id: string
  action: 'rename' | 'delete' | 'create' | 'setup_groups' | 'set_budget'  // ← add set_budget
  category_name: string
  new_name?: string
  group_name?: string
  available_groups?: string[]
  preview?: string
  groups?: [string, string[]][]
  // set_budget fields:
  current_amount?: number
  new_amount?: number
  month?: string
}
```

**b) Extend `confirmCategoryAction` override type:**

```ts
export async function confirmCategoryAction(
  id: string,
  override?: {
    target?: number
    deadline?: string | null
    category_name?: string
    group_name?: string
    amount?: number   // ← add this
  }
): Promise<{ message: string }> {
  // body unchanged
}
```

---

### 6. `frontend/src/components/CategoryActionCard.tsx`

Add `set_budget` state and rendering. The user must be able to edit the amount before confirming.

**State additions** (alongside existing `categoryName`, `groupName`):

```tsx
const [budgetAmount, setBudgetAmount] = useState<string>(
  data.action === 'set_budget' ? String(data.new_amount ?? '') : ''
)
```

**Override in `handleConfirm`:**

```tsx
const overrides =
  data.action === 'create'
    ? { category_name: categoryName || data.category_name, group_name: groupName || data.group_name }
    : data.action === 'set_budget'
    ? { amount: parseFloat(budgetAmount) || data.new_amount }
    : undefined
```

**Render block** (add alongside `isDelete`, `isCreate`, `isSetupGroups`):

```tsx
const isSetBudget = data.action === 'set_budget'
```

Title (in the `<p className="text-white font-medium">` block):

```tsx
{isSetBudget ? 'Set budget amount?' : ...existing...}
```

Body (below the title block, before the `{isCreate && ...}` block):

```tsx
{isSetBudget && (
  <div className="space-y-2">
    <p className="text-muted text-sm">
      <span className="text-white">{data.category_name}</span>
      {data.month && <span className="text-muted"> · {data.month}</span>}
    </p>
    <div className="space-y-1">
      <p className="text-muted text-xs">
        Current: €{(data.current_amount ?? 0).toFixed(2)} → New amount (€)
      </p>
      <input
        type="number"
        min="0"
        step="0.01"
        value={budgetAmount}
        onChange={e => setBudgetAmount(e.target.value)}
        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-accent"
      />
    </div>
  </div>
)}
```

Confirm button label:

```tsx
{isDelete ? 'Delete' : isCreate ? 'Create' : isSetupGroups ? 'Create all' : isSetBudget ? 'Set budget' : 'Rename'}
```

Confirm button disabled condition:

```tsx
disabled={loading || (isCreate && !categoryName) || (isSetBudget && !budgetAmount)}
```

---

## Files to touch (summary)

| File | Change |
|------|--------|
| `backend/tools/finance/actual_budget.py` | Add `propose_set_category_budget()` |
| `backend/tools/registry.py` | Add tool schema + dispatcher |
| `backend/api/chat.py` | Add to `_PROPOSAL_TOOLS` |
| `backend/api/category_actions.py` | Add `amount` to `GoalOverride` + `set_budget` case |
| `frontend/src/lib/api.ts` | Extend `CategoryActionData` + override type |
| `frontend/src/components/CategoryActionCard.tsx` | Add `set_budget` rendering |

## Do NOT

- Do not modify `backend/core/actual_client/client.py`
- Do not add tests
- Do not push to GitHub — commit locally only
- Do not change the confirm/cancel endpoint URL or auth
