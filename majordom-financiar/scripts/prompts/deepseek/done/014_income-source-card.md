# Task: Income source card in chat after CSV import

## Context

After CSV import completes, income transactions from unknown payees appear in chat as
`IncomeSourceCard` cards. The user names each income source (e.g. "Salary Doru"), and
Majordom creates the AB category + saves the mapping so future imports auto-categorize it.

Stack: FastAPI backend (Python 3.11, async), React PWA (TypeScript + Tailwind).

## Files to touch

**Backend:**
- `backend/api/csv_import.py` — extend `ImportResult`, detect unknown income payees
- `backend/main.py` — register the new router (if in a new file)

Create new file:
- `backend/api/income_sources.py` — `POST /api/income/sources` endpoint

**Frontend:**
- `frontend/src/pages/Chat.tsx` — handle `income_source` message role, trigger cards after import
- `frontend/src/components/IncomeSourceCard.tsx` — new component
- `frontend/src/lib/api.ts` — add `createIncomeSource` function

## Backend — Part 1: extend ImportResult

In `backend/api/csv_import.py`, add field to `ImportResult`:

```python
class ImportResult(BaseModel):
    imported: int
    skipped: int
    merged: int = 0
    retroactively_updated: int = 0
    unknown_income_payees: list[str] = []   # ← new
```

In `confirm_csv`, after the import loop, collect payees of income rows that have no
`category_name` set:

```python
unknown_income_payees = list({
    row.merchant
    for row in body.rows
    if not row.is_expense and not row.duplicate and not row.category_name
})
```

Add to the return value:
```python
return ImportResult(..., unknown_income_payees=unknown_income_payees)
```

## Backend — Part 2: new endpoint

Create `backend/api/income_sources.py`:

```
POST /api/income/sources
Body: { payee: str, income_name: str }
Response: { category_name: str }
```

Logic:
1. In AB: call `client.create_category(name=income_name, group_name="Income")`.
   `create_category` is already on `ActualBudgetClient` — it calls `get_or_create_category`
   internally with the given group name. Check the existing implementation at
   `backend/core/actual_client/client.py` line ~547.
2. In SQLite: save the mapping via `SmartCategorizer.learn(payee.lower(), income_name)`.
   `learn()` writes to `merchant_mappings` — same mechanism used by CSV confirm.
3. Return `{"category_name": income_name}`.

Use the standard async pattern (same as other endpoints):
```python
from backend.core.actual_client import ActualBudgetClient
from backend.core.config import settings
from backend.core.memory.database import MemoryDB
from backend.core.memory.categorizer import SmartCategorizer

client = ActualBudgetClient(url=..., password=..., sync_id=...)
await client.create_category(name=body.income_name, group_name="Income")
db = MemoryDB(db_path=settings.memory.db_path)
SmartCategorizer(db=db).learn(body.payee.lower(), body.income_name)
```

Register in `backend/main.py` with prefix `/api`.

## Frontend — Part 1: api.ts

Add to `frontend/src/lib/api.ts`:

```ts
export async function createIncomeSource(payee: string, incomeName: string): Promise<{ category_name: string }> {
  return request('/income/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payee, income_name: incomeName }),
  })
}
```

Add to `ImportResult` interface:
```ts
unknown_income_payees?: string[]
```

## Frontend — Part 2: IncomeSourceCard component

Create `frontend/src/components/IncomeSourceCard.tsx`.

Props:
```ts
interface IncomeSourceCardProps {
  payee: string
  onConfirmed: (message: string) => void
}
```

UI: a card (same style as ProposalCard — `bg-surface border border-border rounded-2xl p-4`)
with:
- Text: `"I see income from **[payee]**. What is this income?"`
- Input field (text, placeholder: `"e.g. Salary, Freelance, Rent income…"`)
- Submit button: `"Save"` — disabled when input is empty or loading
- On submit: calls `createIncomeSource(payee, inputValue)`, then calls
  `onConfirmed(\`Income source saved: ${inputValue}\`)`
- Error state: show error message below the input if the API call fails

Follow the existing card pattern in `ProposalCard.tsx` for styling and loading state.

## Frontend — Part 3: Chat.tsx integration

**Add new message role:**

In the `Message` interface, add:
```ts
role: '...' | 'income_source'
// and
incomePayee?: string
```

**After import overlay closes** (`onDone` callback), after the summary message, append one
`income_source` message per unknown payee:

```ts
onDone={(result) => {
  setImportFile(null)
  // summary message (already exists)
  const parts = [...]
  const newMessages: Message[] = [{ role: 'assistant', content: parts.join(' ') }]
  // income source cards
  for (const payee of result.unknown_income_payees ?? []) {
    newMessages.push({ role: 'income_source', content: '', incomePayee: payee })
  }
  setMessages(prev => [...prev, ...newMessages])
}}
```

**Render the card** in the messages list (same pattern as ProposalCard):

```tsx
} : msg.role === 'income_source' && msg.incomePayee ? (
  <IncomeSourceCard
    payee={msg.incomePayee}
    onConfirmed={(message) => {
      setMessages(prev =>
        prev.map((m, i) => i === idx ? { role: 'status' as const, content: message } : m)
      )
    }}
  />
)
```

## Patterns to follow

- All backend endpoints use `Depends(get_current_user)` for auth
- `ActualBudgetClient` is instantiated per-request (not singleton yet)
- Tailwind only — no CSS modules, no inline styles
- TypeScript strict — no `any`
- Card components are self-contained — they call the API themselves on confirm
