# Task: IncomeSourceCard redesign — transaction context + income/transfer modes

## Context

The current `IncomeSourceCard` shows only the payee name ("I see income from X"). This is
not enough — the user doesn't know which specific transaction they're naming. Also, income
entries might actually be internal transfers (e.g. "Oranje Spaarrekening" = own savings account).

Redesign the card to:
1. Show transaction context (amount, date, payee) at the top
2. Let user choose: **Income** (creates AB category + retroactively categorizes transaction)
   or **Transfer from account** (saves mapping for future auto-detection)

## Files to touch

**Backend:**
- `backend/api/csv_import.py` — replace `unknown_income_payees: list[str]` with `unknown_income_rows`
- `backend/api/income_sources.py` — rewrite to handle income + transfer modes
- `backend/core/actual_client/client.py` — add `off_budget` to `Account`, update `get_accounts()`,
  add `update_uncategorized_by_payee()` method
- `backend/api/accounts.py` — add `GET /api/accounts` route

**Frontend:**
- `frontend/src/lib/api.ts` — update types + `createIncomeSource` + `getAccounts`
- `frontend/src/components/IncomeSourceCard.tsx` — full redesign
- `frontend/src/pages/Chat.tsx` — pass `incomeRow` instead of `incomePayee`

Do NOT touch `CsvImportCard.tsx`, `ImportPage.tsx`, or any other file.

---

## Backend — Part 1: UnknownIncomeRow in csv_import.py

Add new model and update `ImportResult`:

```python
class UnknownIncomeRow(BaseModel):
    payee: str
    amount: float   # always positive
    date: str       # "YYYY-MM-DD"
```

```python
class ImportResult(BaseModel):
    imported: int
    skipped: int
    merged: int = 0
    retroactively_updated: int = 0
    unknown_income_rows: list[UnknownIncomeRow] = []   # replaces unknown_income_payees
```

In `confirm_csv`, replace the `unknown_income_payees` collection with:

```python
seen_payees: set[str] = set()
unknown_income_rows: list[UnknownIncomeRow] = []
for row in body.rows:
    if not row.is_expense and not row.duplicate and not row.category_name:
        if row.merchant not in seen_payees:
            seen_payees.add(row.merchant)
            unknown_income_rows.append(UnknownIncomeRow(
                payee=row.merchant,
                amount=row.amount,
                date=row.date,
            ))
```

In the return statement, replace `unknown_income_payees=...` with `unknown_income_rows=unknown_income_rows`.

Also: in `preview_csv`, when `SmartCategorizer.predict()` returns a `CategoryPrediction`
whose `category_name` starts with `"__transfer__:"`, set `is_transfer_candidate = True`
and clear `category_name` to `""`. Find where `suggested` is applied to the row and add:

```python
if suggested and suggested.startswith("__transfer__:"):
    r = r.model_copy(update={"is_transfer_candidate": True, "category_name": ""})
elif suggested and not r.category_name and not r.duplicate:
    r = r.model_copy(update={"category_name": suggested, "category_confirmed": False})
```

Read `csv_import.py` carefully before editing — find the exact location of the existing
`if suggested ...` block and replace it with the above.

---

## Backend — Part 2: Account model + get_accounts + GET /api/accounts

**In `backend/core/actual_client/client.py`:**

The `Account` dataclass at the top of the file currently has `id, name, balance`.
Add `off_budget: bool = False`:

```python
@dataclass
class Account:
    id: str
    name: str
    balance: float
    off_budget: bool = False
```

In `get_accounts()`, the actualpy `acc` object has an `offbudget` attribute (no underscore).
Update the `Account(...)` instantiation:

```python
result.append(Account(
    id=str(acc.id),
    name=acc.name,
    balance=balance,
    off_budget=bool(acc.offbudget),
))
```

**In `backend/api/accounts.py`:**

Add a GET route that returns all (non-closed) accounts with off_budget distinction.
The file currently only has `POST /accounts/transfer`. Add:

```python
class AccountListItem(BaseModel):
    id: str
    name: str
    balance: float
    off_budget: bool

@router.get("/accounts", response_model=list[AccountListItem])
async def list_accounts(current_user: str = Depends(get_current_user)):
    client = ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )
    accounts = await client.get_accounts()
    return [
        AccountListItem(id=a.id, name=a.name, balance=a.balance, off_budget=a.off_budget)
        for a in accounts
    ]
```

Import `ActualBudgetClient` and `settings` the same way other endpoints do — check
existing imports in the file.

---

## Backend — Part 3: update_uncategorized_by_payee in client.py

Add this method to `ActualBudgetClient`:

```python
async def update_uncategorized_by_payee(self, payee: str, category_name: str) -> int:
    """
    Find all uncategorized transactions whose payee name matches `payee`
    (case-insensitive substring). Set their category to `category_name`.
    Returns count of updated transactions.
    """
    def _update():
        from actual.queries import get_or_create_category
        from actual.database import Transactions, Payees
        with self._get_actual() as actual:
            actual.download_budget()
            cat = get_or_create_category(
                actual.session, category_name, group_name="Income"
            )
            txs = (
                actual.session.query(Transactions)
                .join(Payees, Transactions.payee_id == Payees.id, isouter=True)
                .filter(
                    Payees.name.ilike(f"%{payee}%"),
                    Transactions.category_id == None,
                    Transactions.tombstone == 0,
                    Transactions.is_parent == 0,
                )
                .all()
            )
            count = 0
            for tx in txs:
                tx.category_id = cat.id
                count += 1
            if count:
                actual.commit()
            logger.info(
                "Retroactively categorized %d transaction(s) for payee '%s' → '%s'",
                count, payee, category_name,
            )
            return count
    return await self._run(_update)
```

**Gotcha:** The join syntax above assumes `Payees` is the SQLAlchemy model from
`actual.database`. If the join raises an error (column name mismatch), fall back to:
```python
txs = actual.session.query(Transactions).filter(
    Transactions.tombstone == 0,
    Transactions.is_parent == 0,
    Transactions.category_id == None,
).all()
# Then filter in Python:
payee_lower = payee.lower()
txs = [tx for tx in txs if tx.payee and payee_lower in str(tx.payee).lower()]
```

---

## Backend — Part 4: income_sources.py rewrite

New request + response models:

```python
from typing import Literal

class CreateIncomeSourceRequest(BaseModel):
    payee: str
    type: Literal["income", "transfer"]
    income_name: str | None = None    # required when type="income"
    account_id: str | None = None     # required when type="transfer"

class CreateIncomeSourceResponse(BaseModel):
    category_name: str | None = None
    updated_count: int = 0
```

New endpoint logic:

```python
@router.post("/income/sources", response_model=CreateIncomeSourceResponse)
async def create_income_source(
    body: CreateIncomeSourceRequest,
    current_user: str = Depends(get_current_user),
):
    client = ActualBudgetClient(...)
    db = MemoryDB(db_path=settings.memory.db_path)
    categorizer = SmartCategorizer(db=db)

    if body.type == "income":
        if not body.income_name:
            raise HTTPException(status_code=422, detail="income_name required for type=income")
        await client.create_category(name=body.income_name, group_name="Income")
        categorizer.learn(body.payee.lower(), body.income_name)
        updated = await client.update_uncategorized_by_payee(body.payee, body.income_name)
        return CreateIncomeSourceResponse(category_name=body.income_name, updated_count=updated)

    else:  # type == "transfer"
        if not body.account_id:
            raise HTTPException(status_code=422, detail="account_id required for type=transfer")
        # Save mapping so future CSV imports auto-detect this payee as a transfer
        categorizer.learn(body.payee.lower(), f"__transfer__:{body.account_id}")
        return CreateIncomeSourceResponse(category_name=None, updated_count=0)
```

---

## Frontend — Part 1: api.ts

Add `AccountListItem` type:
```ts
export interface AccountListItem {
  id: string
  name: string
  balance: number
  off_budget: boolean
}
```

Add `getAccounts`:
```ts
export async function getAccounts(): Promise<AccountListItem[]> {
  return request('/accounts')
}
```

Update `ImportResult`:
```ts
// Replace:
unknown_income_payees?: string[]
// With:
unknown_income_rows?: Array<{ payee: string; amount: number; date: string }>
```

Update `createIncomeSource`:
```ts
export async function createIncomeSource(params: {
  payee: string
  type: 'income' | 'transfer'
  income_name?: string
  account_id?: string
}): Promise<{ category_name: string | null; updated_count: number }> {
  return request('/income/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payee: params.payee,
      type: params.type,
      income_name: params.income_name,
      account_id: params.account_id,
    }),
  })
}
```

---

## Frontend — Part 2: IncomeSourceCard.tsx — full redesign

Props:
```ts
interface IncomeSourceCardProps {
  payee: string
  amount: number   // always positive
  date: string     // "YYYY-MM-DD"
  onConfirmed: (message: string) => void
}
```

State:
```ts
const [mode, setMode] = useState<'income' | 'transfer'>('income')
const [incomeName, setIncomeName] = useState('')
const [accountId, setAccountId] = useState('')
const [accounts, setAccounts] = useState<AccountListItem[]>([])
const [loading, setLoading] = useState(false)
const [fetchingAccounts, setFetchingAccounts] = useState(true)
const [error, setError] = useState<string | null>(null)
```

On mount (useEffect, runs once): call `getAccounts()` and set `accounts`. Set
`fetchingAccounts = false` when done (or on error).

**Card layout** (same style as CsvImportCard — `bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[520px] w-full space-y-3`):

**Transaction context bar** (at the top):
```tsx
<div className="flex items-center gap-2 text-sm">
  <span className="text-green-400 font-medium">+€{amount.toFixed(2)}</span>
  <span className="text-muted">·</span>
  <span className="text-white">{payee}</span>
  <span className="text-muted">·</span>
  <span className="text-muted">{date.slice(5).replace('-', '/')}</span>
</div>
```

**Mode toggle** — two buttons side by side:
```tsx
<div className="flex rounded-xl overflow-hidden border border-border text-sm">
  <button
    onClick={() => setMode('income')}
    className={`flex-1 py-1.5 transition-colors ${mode === 'income' ? 'bg-accent text-white' : 'text-muted hover:text-white'}`}
  >Income</button>
  <button
    onClick={() => setMode('transfer')}
    className={`flex-1 py-1.5 transition-colors ${mode === 'transfer' ? 'bg-accent text-white' : 'text-muted hover:text-white'}`}
  >Transfer from account</button>
</div>
```

**Income mode panel** (shown when `mode === 'income'`):
```tsx
<div className="space-y-2">
  <label className="text-xs text-muted">What type of income?</label>
  <input
    type="text"
    value={incomeName}
    onChange={e => setIncomeName(e.target.value)}
    onKeyDown={e => e.key === 'Enter' && handleSave()}
    placeholder="e.g. Salary Doru, Freelance, Rent income…"
    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
    autoFocus
  />
</div>
```

**Transfer mode panel** (shown when `mode === 'transfer'`):
```tsx
<div className="space-y-2">
  <label className="text-xs text-muted">Transfer from:</label>
  {fetchingAccounts ? (
    <div className="flex items-center gap-2 text-muted text-sm">
      <Loader2 size={14} className="animate-spin" /> Loading accounts…
    </div>
  ) : (
    <select
      value={accountId}
      onChange={e => setAccountId(e.target.value)}
      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent transition-colors appearance-none"
    >
      <option value="" disabled>— select account —</option>
      <optgroup label="On budget">
        {accounts.filter(a => !a.off_budget).map(a => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </optgroup>
      <optgroup label="Off budget">
        {accounts.filter(a => a.off_budget).map(a => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </optgroup>
    </select>
  )}
</div>
```

**Error:**
```tsx
{error && <p className="text-red-400 text-xs">{error}</p>}
```

**Save button:**
```tsx
<button
  onClick={handleSave}
  disabled={loading || (mode === 'income' ? !incomeName.trim() : !accountId)}
  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
>
  {loading ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Check size={14} /> Save</>}
</button>
```

**handleSave logic:**
```ts
async function handleSave() {
  setLoading(true)
  setError(null)
  try {
    const result = await createIncomeSource({
      payee,
      type: mode,
      income_name: mode === 'income' ? incomeName.trim() : undefined,
      account_id: mode === 'transfer' ? accountId : undefined,
    })
    if (mode === 'income') {
      const msg = result.updated_count > 0
        ? `Income source saved: ${incomeName}. ${result.updated_count} transaction(s) categorized.`
        : `Income source saved: ${incomeName}.`
      onConfirmed(msg)
    } else {
      onConfirmed('Marked as transfer. Future imports will auto-detect this payee.')
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to save')
  } finally {
    setLoading(false)
  }
}
```

Imports needed: `useState, useEffect` from react; `Loader2, Check` from lucide-react;
`createIncomeSource, getAccounts, AccountListItem` from `../lib/api`.

---

## Frontend — Part 3: Chat.tsx

In the `Message` interface, replace `incomePayee?: string` with:
```ts
incomeRow?: { payee: string; amount: number; date: string }
```

In the `onConfirmed` callback of `CsvImportCard` (where income_source messages are pushed),
replace:
```ts
// OLD:
for (const payee of result.unknown_income_payees ?? []) {
  newMessages.push({ role: 'income_source', content: '', incomePayee: payee })
}
// NEW:
for (const row of result.unknown_income_rows ?? []) {
  newMessages.push({ role: 'income_source' as const, content: '', incomeRow: row })
}
```

Update the render of `income_source` messages:
```tsx
} : msg.role === 'income_source' && msg.incomeRow ? (
  <IncomeSourceCard
    payee={msg.incomeRow.payee}
    amount={msg.incomeRow.amount}
    date={msg.incomeRow.date}
    onConfirmed={(message) => {
      setMessages(prev =>
        prev.map((m, i) => i === idx ? { role: 'status' as const, content: message } : m)
      )
    }}
  />
)
```

---

## Patterns to follow

- Auth: all endpoints use `Depends(get_current_user)`
- Client instantiated per-request (same pattern as other endpoints)
- Tailwind only, TypeScript strict, no `any`
- `SmartCategorizer.learn(merchant, category_id)` — first arg is lowercased merchant,
  second is the category name/id string (can be `__transfer__:{account_id}`)
- `SmartCategorizer.predict(merchant)` — returns `CategoryPrediction` with `.category_name`

## What NOT to do

- Do not retroactively convert existing transactions to AB transfers (issue #72)
- Do not add income category suggestion chips — keep the UI simple with free text input
- Do not change `CsvImportCard.tsx` or `ImportPage.tsx`
- Do not break the existing `GET /accounts/transfer` route when adding `GET /accounts`
