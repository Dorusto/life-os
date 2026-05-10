# Task: Budget status dashboard on Home page

## Context

Majordom is a personal finance PWA. Backend is FastAPI (Python 3.11). Financial data lives in Actual Budget via the `actualpy` library. The frontend is React 18 + TypeScript + Tailwind CSS (dark theme).

The Home page (`frontend/src/pages/Home.tsx`) currently shows a spending distribution chart (`SpendingChart`) — how much was spent per category as a percentage of total spending. This is NOT the same as a budget dashboard.

The budget dashboard shows **budgeted vs spent** per category — how much was allocated in the budget and how much has been used. These are fundamentally different views.

## What to build

### Visual states per category row:
- 🟢 Green — spent < 80% of budgeted
- 🟡 Yellow — spent 80–100% of budgeted
- 🔴 Red — spent > 100% of budgeted (over budget)

### Layout per row:
```
[Category name]          [€spent / €budgeted]
[━━━━━━━━━━░░░░░░░░░░░]   62%
```

Progress bar fills proportionally. Color matches the state above. If no budget is set for a category, show the category with spent amount only (no progress bar, neutral color).

---

## Backend changes

### 1. Add `get_budget_status()` to `ActualBudgetClient` (`backend/core/actual_client/client.py`)

This method fetches budgeted and spent amounts per category for a given month from Actual Budget.

```python
async def get_budget_status(
    self,
    month: int | None = None,
    year: int | None = None,
) -> list[dict]:
    """
    Return budget vs spent per category for the given month.

    Each item: {
        "category_id": str,
        "category_name": str,
        "budgeted": float,   # amount allocated in budget (EUR)
        "spent": float,      # amount actually spent (EUR, always positive)
        "percentage": float, # spent / budgeted * 100 (0 if budgeted == 0)
    }
    """
```

**Implementation guidance for actualpy:**

Inside the `_run()` executor, open one session:
```python
with self._get_actual() as actual:
    actual.download_budget()
    # Query budget allocations
    # Query transactions for the month
```

To get budget allocations, query the `zero_budgets` table in the local SQLite that actualpy downloads. This table has columns: `id` (month as int YYYYMM), `category` (category id), `amount` (budgeted amount in cents).

To get actual spending, query transactions for the month (same logic as `get_monthly_stats()`) and group by category.

Month format for `zero_budgets`: integer YYYYMM (e.g. May 2026 = 202605).

If `zero_budgets` is not accessible via `actual.session`, fall back to querying the `reflect_budgets` table or use `actual.session.execute("SELECT * FROM zero_budgets WHERE id LIKE '202605%'")`.

Return only categories that have either a budget allocation OR at least one transaction in the month. Skip empty categories.

### 2. Add `GET /api/budget` endpoint (`backend/api/transactions.py`)

Add to the existing `transactions.py` router (it already has `/stats` and `/accounts`):

```python
class BudgetCategory(BaseModel):
    category_id: str
    category_name: str
    budgeted: float
    spent: float
    percentage: float

@router.get("/budget", response_model=list[BudgetCategory])
async def budget_status(
    month: Optional[int] = None,
    year: Optional[int] = None,
    current_user: str = Depends(get_current_user),
):
```

Sort the result: over-budget categories first, then by percentage descending.

### 3. Add `getBudgetStatus()` to `frontend/src/lib/api.ts`

```typescript
export interface BudgetCategory {
  category_id: string
  category_name: string
  budgeted: number
  spent: number
  percentage: number
}

export async function getBudgetStatus(month?: number, year?: number): Promise<BudgetCategory[]> {
  const params = new URLSearchParams()
  if (month) params.set('month', String(month))
  if (year) params.set('year', String(year))
  const qs = params.toString()
  return request<BudgetCategory[]>(`/budget${qs ? `?${qs}` : ''}`)
}
```

---

## Frontend changes

### 4. Create `frontend/src/components/BudgetDashboard.tsx`

New component that replaces `SpendingChart` on the Home page.

**Props:**
```typescript
interface Props {
  categories: BudgetCategory[]
  month: number
  year: number
}
```

**Layout:**
```
┌─────────────────────────────────────┐
│ May 2026          Budget            │
│                                     │
│ 🔴 Restaurants    €87 / €100        │
│ ████████████████████░  87%          │
│                                     │
│ 🟡 Groceries      €940 / €1200      │
│ ████████████████░░░░░  78%          │
│                                     │
│ 🟢 Transport      €120 / €350       │
│ ███████░░░░░░░░░░░░░░  34%          │
└─────────────────────────────────────┘
```

**Color logic:**
```typescript
function getColor(percentage: number, budgeted: number): string {
  if (budgeted === 0) return '#71717A'   // neutral — no budget set
  if (percentage > 100) return '#EF4444' // red
  if (percentage >= 80) return '#F59E0B' // yellow
  return '#22C55E'                        // green
}
```

**Categories with no budget set** (budgeted === 0): show name + spent amount, no progress bar, muted color. Place them below the budgeted categories.

Match the existing card style from `SpendingChart`: `bg-surface rounded-2xl p-4`.

### 5. Update `frontend/src/pages/Home.tsx`

Replace the `SpendingChart` section with `BudgetDashboard`:

- Import `getBudgetStatus` from `../lib/api`
- Import `BudgetDashboard` from `../components/BudgetDashboard`
- Replace the `stats` query with a `budgetStatus` query:
```typescript
const { data: budgetStatus } = useQuery({
  queryKey: ['budget'],
  queryFn: () => getBudgetStatus(),
  staleTime: 120_000,
})
```
- Replace `{stats && <SpendingChart stats={stats} />}` with:
```typescript
{budgetStatus && budgetStatus.length > 0 && (
  <BudgetDashboard
    categories={budgetStatus}
    month={new Date().getMonth() + 1}
    year={new Date().getFullYear()}
  />
)}
```

Remove the `stats` query and `getMonthlyStats` import if no longer used.

---

## What NOT to change

- Do not modify `SpendingChart.tsx` — keep it, just stop using it on Home for now
- Do not touch `ReceiptFlow.tsx`, `Chat.tsx`, `ImportPage.tsx`
- Do not change the receipt upload buttons or recent transactions section in `Home.tsx`
- Do not add new npm packages

---

## Verification

1. Rebuild: `docker compose build majordom && docker compose up -d majordom`
2. Open the Home page — should show budget progress bars instead of the donut chart
3. Categories over budget should appear in red at the top
4. Categories with no budget set should appear below in neutral color
5. Check logs: `docker logs majordom-api --tail 20` — no errors on `/api/budget`

## Important note on actualpy budget tables

If `zero_budgets` is not available, try these alternatives in order:
1. `actual.session.execute("SELECT * FROM zero_budgets WHERE id LIKE ?", (f"{year}{month:02d}%",))`
2. Query `reflect_budgets` table with the same structure
3. If neither works, return only the spending data (budgeted=0 for all) and log a warning — do not crash

The endpoint must always return something useful even if budget allocations are unavailable.
