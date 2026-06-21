# Task: M2.7 — Spending chart inline in chat

## Context

`SpendingChart.tsx` already exists — a pure SVG donut chart + category breakdown component. It takes a `MonthlyStats` prop and renders correctly. It is not used anywhere yet. The goal is to wire it into the chat as a tool the LLM can call.

## Goal

The user can ask "show me my spending for May" or "chart my expenses this month" and see a spending donut chart rendered inline in the chat, with category breakdown.

## Relevant files

| File | What it contains |
|------|-----------------|
| `backend/tools/finance/actual_budget.py` | Tool functions — add `get_spending_chart()` here |
| `backend/tools/registry.py` | TOOLS list + `execute_tool()` dispatcher — register the new tool here |
| `frontend/src/pages/Chat.tsx` | Message type + parser + renderer — wire the new card here |
| `frontend/src/components/SpendingChart.tsx` | Already-built component — do NOT modify |
| `frontend/src/lib/api.ts` | `MonthlyStats` type (line 253) — do NOT modify |

## Changes required

### 1. `backend/tools/finance/actual_budget.py`

Add a new async function `get_spending_chart(month=None, year=None)`:
- Call `await get_provider().get_monthly_stats(month=month, year=year)` — use the same optional month/year pattern as the existing `get_monthly_stats` tool in this file (lines ~240–255).
- The raw `data["categories"]` is a dict keyed by category ID. Transform it into a sorted list: for each value in `data["categories"].values()`, build `{"name": v["name"], "total": round(v["total"], 2), "count": v["count"], "percentage": round(v["total"] / total * 100, 1) if total > 0 else 0}`. Sort by `total` descending.
- Return `json.dumps({"type": "spending_chart", "month": data["month"], "year": data["year"], "total": round(data["total"], 2), "income": round(data.get("income", 0.0), 2), "count": data["count"], "categories": cats})`.

### 2. `backend/tools/registry.py`

**In the TOOLS list** — add a new entry after `get_spending_history`:
```json
{
  "type": "function",
  "function": {
    "name": "get_spending_chart",
    "description": "Show a visual spending chart for a month broken down by category. Call this when the user asks to see a chart, graph, or visual breakdown of their spending.",
    "parameters": {
      "type": "object",
      "properties": {
        "month": {"type": "integer", "description": "Month number 1-12. Omit for current month."},
        "year": {"type": "integer", "description": "Year e.g. 2026. Omit for current year."}
      },
      "required": []
    }
  }
}
```

**In `execute_tool()`** — add a dispatcher case after the `get_spending_history` case (around line 655):
```python
if name == "get_spending_chart":
    from backend.tools.finance.actual_budget import get_spending_chart
    return await get_spending_chart(**arguments)
```

### 3. `frontend/src/pages/Chat.tsx`

Four small changes — do NOT restructure or reorder anything else:

**a) Imports** — add two imports after line 20 (after the last component import):
```typescript
import SpendingChart from '../components/SpendingChart'
import type { MonthlyStats } from '../lib/api'
```

**b) Message interface** (line 24–25) — add `'spending_chart'` to the role union and `chartData` field:
- In the `role` union: append `| 'spending_chart'` at the end
- Add a new optional field: `chartData?: MonthlyStats`

**c) Parser** (after line 357, after the `vehicle_reminder` parser block):
```typescript
if (parsed.type === 'spending_chart') {
  setMessages(prev => [...prev, { role: 'spending_chart' as const, content: '', chartData: parsed as MonthlyStats }])
  return
}
```

**d) Renderer** — add after the `vehicle_reminder` renderer block (after line 707, before the `fuelio_import` block):
```typescript
) : msg.role === 'spending_chart' && msg.chartData ? (
  <SpendingChart stats={msg.chartData} />
```

## Critical Rules

- Use `get_provider()` not `ActualBudgetClient` directly. (source: M5.2 abstraction)
- `json.loads(args)` before `**args` in execute_tool — args from OpenAI format are a string. (source: architecture.md)
- Do NOT add `get_spending_chart` to `_PROPOSAL_TOOLS` in `chat.py` — chart cards are read-only display, not proposals requiring confirmation.

## Gotchas

1. **`data["categories"]` is a dict, not a list** — keys are category UUIDs, values are `{"name", "total", "count"}`. Iterate `.values()`, not the dict directly.

2. **`percentage` must be recalculated** — the raw dict does not include percentage. Formula: `round(v["total"] / total * 100, 1) if total > 0 else 0`. Use `total = data["total"]` (already available).

3. **`MonthlyStats` is already imported in `api.ts`** — do NOT re-export or re-declare it. In Chat.tsx, use `import type { MonthlyStats } from '../lib/api'`.

4. **`SpendingChart` expects `stats: MonthlyStats`** — the JSON returned by the tool must match this shape exactly: `{month, year, total, income, count, categories: [{name, total, count, percentage}]}`.

5. **The renderer is a ternary chain** — each block ends with `) :` before the next condition. Insert the `spending_chart` block in the same pattern. Do not break the chain.

## Do NOT touch

- `frontend/src/components/SpendingChart.tsx` — already correct, no changes needed
- `frontend/src/lib/api.ts` — `MonthlyStats` type already correct
- `backend/api/transactions.py` — `/stats` endpoint untouched
- `_PROPOSAL_TOOLS` in `backend/api/chat.py` — chart is read-only, not a proposal

## Done when

- Typing "show me a spending chart" in chat causes the LLM to call `get_spending_chart`
- The donut chart renders inline in the chat bubble (same style as other cards)
- Optional month/year works: "chart my spending for May 2026" passes `month=5, year=2026`
- No TypeScript errors
