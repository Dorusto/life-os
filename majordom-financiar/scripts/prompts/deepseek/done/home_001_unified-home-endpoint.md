# Task: Unified `/api/home` endpoint — fix slow Home dashboard

## Problem

`Home.tsx` makes **4 separate requests** to Actual Budget on every page load:
- `GET /api/stats` → `client.get_monthly_stats()` → opens AB session + `download_budget()`
- `GET /api/budget` → `client.get_budget_status()` → opens AB session + `download_budget()`
- `GET /api/accounts/goals` → `client.get_goals()` → opens AB session + `download_budget()`
- `GET /api/stats/fire` → `client.get_accounts()` → opens AB session + `download_budget()`

`download_budget()` re-downloads the entire budget from the AB server every time. 4 calls = 4× the latency.

## Fix

1. Add `get_home_data(month, year)` method to `ActualBudgetClient` — one session, one `download_budget()`, all 4 queries sequentially.
2. New `backend/api/home.py` with `GET /api/home` — calls `client.get_home_data()`, does FIRE calculation from the returned accounts, returns combined JSON.
3. Register router in `backend/main.py`.
4. Add `getHomeData()` to `frontend/src/lib/api.ts`.
5. Replace 4 `useQuery` calls in `frontend/src/pages/Home.tsx` with a single one.

---

## Step 1 — `backend/core/actual_client/client.py`

Add this method to `ActualBudgetClient` (after `get_goals`):

```python
async def get_home_data(
    self,
    month: int | None = None,
    year: int | None = None,
) -> dict:
    """Fetch all Home screen data in a single AB session."""

    def _get():
        with self._get_actual() as actual:
            actual.download_budget()  # once only

            # 1. accounts (needed for net worth + FIRE)
            accounts = actual.get_accounts()

            # 2. monthly stats (cashflow)
            from datetime import date as _date
            target_month = month or _date.today().month
            target_year = year or _date.today().year
            stats = self._compute_monthly_stats(actual, target_month, target_year)

            # 3. budget status
            budget = self._compute_budget_status(actual, target_month, target_year)

            # 4. goals
            goals = self._compute_goals(actual, accounts)

        return {
            "accounts": [a.__dict__ for a in accounts],
            "stats": stats,
            "budget": budget,
            "goals": goals,
        }

    return await self._run(_get)
```

**Important:** the helper methods `_compute_monthly_stats`, `_compute_budget_status`, `_compute_goals` already exist as the inner `_get()` functions inside `get_monthly_stats`, `get_budget_status`, `get_goals`. Extract their logic into private methods, then call those methods both from the existing public methods AND from `get_home_data`. Do not duplicate logic.

If extraction is too complex, an acceptable alternative: write `get_home_data` as a single self-contained `_get()` function that contains the logic inline (copy from the 3 existing methods). In this case, do NOT touch the existing methods — leave them working as-is.

---

## Step 2 — `backend/api/home.py` (new file)

```python
"""
GET /api/home — all Home screen data in one AB session.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import date

from backend.api.auth import get_current_user
from backend.core.actual_client import ActualBudgetClient
from backend.core.config import settings

# FIRE constants (same as fire.py — keep in sync if changed)
FIRE_TARGET = 190_000.0
MONTHLY_CONTRIBUTION = 820.0
ANNUAL_RETURN = 0.07
FIRE_YEAR = 2035
FIRE_EXCLUDE = ["house", "mortgage", "hypotheek", "hypotheken", "cory", "wabi sabi"]

router = APIRouter()


def _get_client() -> ActualBudgetClient:
    return ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )


def _calc_fire(accounts: list) -> dict:
    """Calculate FIRE progress from account list. Same logic as fire.py."""
    portfolio = sum(
        a.balance for a in accounts
        if a.off_budget
        and not any(p in a.name.lower() for p in FIRE_EXCLUDE)
    )
    pct = round(portfolio / FIRE_TARGET * 100, 1) if FIRE_TARGET else 0
    months_left = (FIRE_YEAR - date.today().year) * 12 - date.today().month + 1
    fv = portfolio * (1 + ANNUAL_RETURN) ** (months_left / 12)
    fv += MONTHLY_CONTRIBUTION * (((1 + ANNUAL_RETURN / 12) ** months_left - 1) / (ANNUAL_RETURN / 12))
    return {
        "fire_portfolio": round(portfolio, 2),
        "fire_target": FIRE_TARGET,
        "fire_pct": pct,
        "months_remaining": max(months_left, 0),
        "projected_2035": round(fv, 2),
        "on_track": fv >= FIRE_TARGET,
        "monthly_contribution": MONTHLY_CONTRIBUTION,
    }


@router.get("/home")
async def get_home(
    month: int | None = None,
    year: int | None = None,
    current_user: str = Depends(get_current_user),
):
    client = _get_client()
    try:
        data = await client.get_home_data(month=month, year=year)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # FIRE uses already-fetched accounts — no extra AB call
    accounts_raw = data.pop("accounts")

    # Reconstruct Account objects for FIRE (need .off_budget and .name and .balance)
    from types import SimpleNamespace
    accounts = [SimpleNamespace(**a) for a in accounts_raw]

    return {
        **data,
        "fire": _calc_fire(accounts),
    }
```

**Return shape:**
```json
{
  "stats":  { "month": 6, "year": 2026, "total": 1200.0, "income": 3500.0, "count": 45, "categories": [...] },
  "budget": [ { "category_id": "...", "category_name": "...", "group_name": "...", "budgeted": 300.0, "spent": 220.0, "percentage": 73.3 } ],
  "goals":  [ { "id": "...", "name": "...", "balance": 5000.0, "target": 25000.0, "percentage": 20.0 } ],
  "fire":   { "fire_portfolio": 42000.0, "fire_target": 190000.0, "fire_pct": 22.1, ... }
}
```

---

## Step 3 — `backend/main.py`

Add import and registration (same pattern as existing routers):
```python
from backend.api import home   # add to existing import line
app.include_router(home.router, prefix="/api")
```

---

## Step 4 — `frontend/src/lib/api.ts`

Add the combined type and function. The sub-types (`MonthlyStats`, `BudgetCategory`, `Goal`, `FireData`) already exist — reuse them.

```typescript
export interface HomeData {
  stats: MonthlyStats
  budget: BudgetCategory[]
  goals: Goal[]
  fire: FireData
}

export async function getHomeData(month?: number, year?: number): Promise<HomeData> {
  const params = new URLSearchParams()
  if (month) params.set('month', String(month))
  if (year) params.set('year', String(year))
  const qs = params.toString()
  return request<HomeData>(`/home${qs ? `?${qs}` : ''}`)
}
```

---

## Step 5 — `frontend/src/pages/Home.tsx`

Replace the 4 separate `useQuery` calls with one:

```typescript
// REMOVE these 4:
const { data: budgetStatus } = useQuery({ queryKey: ['budget'], queryFn: () => getBudgetStatus(), ... })
const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: () => getMonthlyStats(), ... })
const { data: goals } = useQuery({ queryKey: ['goals'], queryFn: () => getGoals(), ... })
const { data: fireData } = useQuery({ queryKey: ['fire'], queryFn: () => getFire(), ... })

// ADD one:
const { data: homeData } = useQuery({
  queryKey: ['home'],
  queryFn: () => getHomeData(),
  staleTime: 120_000,
})

// Then use:
const budgetStatus = homeData?.budget
const stats = homeData?.stats
const goals = homeData?.goals
const fireData = homeData?.fire
const cashflow = stats ? stats.income - stats.total : null
```

All existing rendering code stays unchanged — only the data source changes.

Remove unused imports: `getBudgetStatus`, `getMonthlyStats`, `getGoals`, `getFire`.

---

## Rules

- Auth: use `getToken()` from `../lib/auth`, never `localStorage.getItem` directly
- No push to GitHub — local commit only, after user confirms it works
- Do not modify any other existing endpoints — they stay working as-is
- Test: open Home screen, verify all 4 sections load (cashflow, budget bars, goals, FIRE widget)
