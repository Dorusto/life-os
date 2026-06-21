# Task: M2.7b — Three additional chart types inline in chat

## Context

M2.7 added `get_spending_chart` — a donut chart for monthly spending breakdown. It works by returning `{type: "spending_chart", ...}` JSON directly to the frontend via `_PROPOSAL_TOOLS`. The frontend renders a `SpendingChart` component.

**Critical lesson from M2.7:** ANY tool that returns a JSON card MUST be added to `_PROPOSAL_TOOLS` in `backend/api/chat.py`. If not, the LLM receives the JSON as a tool result and generates its own text response instead of passing the card to the frontend.

This task adds three more chart types using the same pattern.

## Goal

Three new chart commands work in chat:
- "show me budget vs actual" → horizontal bar chart comparing budgeted vs spent per category
- "show spending trend for 6 months" → vertical bar chart: spending + income per month
- "show my savings goals progress" → horizontal progress bars for each goal with deadline

## Relevant files

| File | What it contains |
|------|-----------------|
| `backend/tools/finance/actual_budget.py` | Add 3 new tool functions here |
| `backend/tools/registry.py` | TOOLS list + execute_tool() dispatcher — add 3 entries |
| `backend/api/chat.py` | `_PROPOSAL_TOOLS` set — add all 3 new tool names here |
| `frontend/src/pages/Chat.tsx` | Message type + parsers + renderers — add 3 entries |
| `frontend/src/components/SpendingChart.tsx` | Style reference — DO NOT MODIFY |

New files to create:
- `frontend/src/components/BudgetChart.tsx`
- `frontend/src/components/TrendChart.tsx`
- `frontend/src/components/GoalsChart.tsx`

## Changes required

---

### Tool 1: `get_budget_chart` — budget vs actual

**`backend/tools/finance/actual_budget.py`** — new async function:
- Call `await get_provider().get_budget_status()` (no args = current month)
- Filter: keep only entries where `budgeted > 0 OR spent > 0`
- Sort by `spent` descending
- Return `json.dumps({"type": "budget_chart", "month": date.today().month, "year": date.today().year, "categories": [{"name", "budgeted", "spent", "percentage"} for each]})`

**`frontend/src/components/BudgetChart.tsx`** — new component:

Props: `{ categories: {name: string, budgeted: number, spent: number, percentage: number}[], month: number, year: number }`

Render:
- Header: "BUDGET vs ACTUAL — MONTH YEAR" in `text-xs text-muted uppercase`
- For each category, two stacked horizontal bars:
  - Background track (full width = budgeted amount): `bg-background h-2 rounded-full`
  - Overlay (width = spent/budgeted * 100%, max 100%): color from `SEGMENT_COLORS` (same array as SpendingChart), `h-2 rounded-full`
  - If `percentage > 100`: color the bar `#FF2D2D` (red), show `⚠️` next to the name
  - Row: category name left, `€spent / €budgeted` right in `text-xs`
- Show `percentage%` as a small badge next to each bar
- Wrapper: `bg-surface rounded-2xl p-4` (same as SpendingChart)

---

### Tool 2: `get_spending_trend` — multi-month spending + income

**`backend/tools/finance/actual_budget.py`** — new async function with param `months: int = 6`:
- Loop from `months-1` down to `0` to build chronological list (oldest first)
- For each step `i`, compute `m = today.month - i`, `y = today.year`; if `m <= 0`: `m += 12; y -= 1`
- Call `await get_provider().get_monthly_stats(month=m, year=y)`
- Build list: `{"month": data["month"], "year": data["year"], "label": f"{month_abbr}-{year_2digit}", "total": data["total"], "income": data["income"]}`
  - `month_abbr`: 3-letter abbreviation (Jan, Feb, … Dec) — use a list `["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]`
  - `year_2digit`: last 2 digits of year as string e.g. `str(year)[-2:]`
- Return `json.dumps({"type": "spending_trend", "months": [...list...]})`

**`frontend/src/components/TrendChart.tsx`** — new component:

Props: `{ months: {month: number, year: number, label: string, total: number, income: number}[] }`

Render a vertical bar chart — pure SVG or div-based (divs preferred, easier):
- For each month entry, show two side-by-side bars:
  - Spending bar: color `#6366F1` (indigo), height proportional to `total`
  - Income bar: color `#22C55E` (green), height proportional to `income`
  - Max height: 80px. Scale: find `maxVal = max of all totals and incomes`, bar height = `value / maxVal * 80`
- Below each pair: month label (`label` field) in `text-xs text-muted text-center`
- Legend above chart: ● Spending (indigo) ● Income (green)
- Wrapper: `bg-surface rounded-2xl p-4`
- If a bar value is 0, render a minimum 2px stub so the bar is visible

---

### Tool 3: `get_goals_chart` — savings goals progress

**`backend/tools/finance/actual_budget.py`** — new async function:
- Call `await get_provider().get_goals()`
- If no goals: return `json.dumps({"type": "goals_chart", "goals": []})`
- Return `json.dumps({"type": "goals_chart", "goals": goals})` — pass through as-is (goals already have the right shape)

**`frontend/src/components/GoalsChart.tsx`** — new component:

Props: `{ goals: {id: string, name: string, balance: number, target: number, percentage: number, deadline: string|null, monthly_needed: number|null, months_remaining: number|null}[] }`

Render:
- Header: "SAVINGS GOALS" in `text-xs text-muted uppercase`
- If `goals.length === 0`: show `"No savings goals set. Add TARGET: amount to an account's notes in Actual Budget."` in `text-muted text-sm`
- For each goal:
  - Name + `percentage.toFixed(0)%` on same line
  - Progress bar: `bg-background h-2 rounded-full` track, fill with `#22C55E` (green) if `percentage < 80`, `#F59E0B` (amber) if `80–99`, `#6366F1` (indigo) if `>= 100`
  - Below bar: `€balance / €target` left, deadline + months_remaining right (if deadline exists): `"deadline (N months)"` in `text-xs text-muted`
  - If `monthly_needed` exists: small line `"Need €X/month"` in `text-xs text-muted`
- Wrapper: `bg-surface rounded-2xl p-4`, `space-y-4` between goals

---

### Registry — `backend/tools/registry.py`

Add 3 entries to TOOLS list after `get_spending_chart`:

```json
{
  "name": "get_budget_chart",
  "description": "Show a visual chart comparing budget vs actual spending per category. Call when user asks to see budget performance, how they're tracking against budget, or wants a budget overview chart.",
  "parameters": {"type": "object", "properties": {}, "required": []}
}
```

```json
{
  "name": "get_spending_trend",
  "description": "Show a multi-month spending and income trend chart. Call when user asks about spending trends, how their spending changed over months, or wants to see income vs expenses over time.",
  "parameters": {"type": "object", "properties": {"months": {"type": "integer", "description": "Number of months to show (default 6, max 12)"}}, "required": []}
}
```

```json
{
  "name": "get_goals_chart",
  "description": "Show a visual progress chart for all savings goals. Call when user asks about savings goals, goal progress, or how close they are to their financial targets.",
  "parameters": {"type": "object", "properties": {}, "required": []}
}
```

Add 3 dispatcher cases in `execute_tool()` following the existing pattern.

### `_PROPOSAL_TOOLS` — `backend/api/chat.py`

Add `"get_budget_chart"`, `"get_spending_trend"`, `"get_goals_chart"` to the `_PROPOSAL_TOOLS` set.

**THIS IS MANDATORY** — without this, the LLM will receive the JSON and generate its own text response instead of passing the card to the frontend.

### `frontend/src/pages/Chat.tsx`

**a) Imports** — add after the SpendingChart import:
```typescript
import BudgetChart from '../components/BudgetChart'
import TrendChart from '../components/TrendChart'
import GoalsChart from '../components/GoalsChart'
```

**b) Message interface** — add `| 'budget_chart' | 'spending_trend' | 'goals_chart'` to the role union, and add fields:
```typescript
budgetChartData?: { categories: {name: string, budgeted: number, spent: number, percentage: number}[], month: number, year: number }
trendData?: { months: {month: number, year: number, label: string, total: number, income: number}[] }
goalsChartData?: { goals: any[] }
```

**c) Parsers** — add after the `spending_chart` parser:
```typescript
if (parsed.type === 'budget_chart') {
  setMessages(prev => [...prev, { role: 'budget_chart' as const, content: '', budgetChartData: parsed }])
  return
}
if (parsed.type === 'spending_trend') {
  setMessages(prev => [...prev, { role: 'spending_trend' as const, content: '', trendData: parsed }])
  return
}
if (parsed.type === 'goals_chart') {
  setMessages(prev => [...prev, { role: 'goals_chart' as const, content: '', goalsChartData: parsed }])
  return
}
```

**d) Renderers** — add after the `spending_chart` renderer, before `fuelio_import`:
```typescript
) : msg.role === 'budget_chart' && msg.budgetChartData ? (
  <BudgetChart {...msg.budgetChartData} />
) : msg.role === 'spending_trend' && msg.trendData ? (
  <TrendChart months={msg.trendData.months} />
) : msg.role === 'goals_chart' && msg.goalsChartData ? (
  <GoalsChart goals={msg.goalsChartData.goals} />
```

## Critical Rules

- `get_provider()` for all AB data — never import ActualBudgetClient directly
- ALL THREE new tools MUST be in `_PROPOSAL_TOOLS` in `chat.py` — this is the mandatory pattern for any tool returning a JSON card
- Year rollover in spending trend loop: `if m <= 0: m += 12; y -= 1`
- Do NOT modify `SpendingChart.tsx` or `api.ts`

## Gotchas

1. **`_PROPOSAL_TOOLS` is the most important change** — this was the bug in M2.7 (chart was working but LLM generated its own response). Add all 3 names.

2. **Bar chart scaling in TrendChart:** find the global max across ALL months' totals AND incomes, then scale each bar relative to that max. Do not scale per-month or bars won't be comparable.

3. **`get_goals()` on the provider already exists** (added in M4.4) — call `await get_provider().get_goals()`, do not re-implement.

4. **Empty states:** `get_goals_chart` may return an empty goals list if no goals are configured — render a helpful message instead of an empty card.

5. **`bg-surface`, `bg-background`, `text-muted`, `text-white`** are the design tokens used in the existing components — use these consistently. Do not use hardcoded Tailwind colors like `bg-zinc-800`.

6. **Ternary chain in Chat.tsx renderer:** each block must start with `) : msg.role === '...' ? (` and end before the next `) :`. Do not break the chain or add extra closing tags.

7. **`date.today()` import in `get_budget_chart`:** `from datetime import date as _date` is already at the top of `actual_budget.py` — use `_date.today()`.

## Do NOT touch

- `frontend/src/components/SpendingChart.tsx`
- `frontend/src/lib/api.ts`
- `backend/api/transactions.py`
- Any existing tool functions

## Done when

- "show budget chart" → BudgetChart renders with horizontal bars, red for over-budget categories
- "show spending trend 6 months" → TrendChart renders with indigo spending bars + green income bars
- "show goals progress" → GoalsChart renders with progress bars and deadline info
- No TypeScript errors in Chat.tsx
- All 3 tools in `_PROPOSAL_TOOLS`
