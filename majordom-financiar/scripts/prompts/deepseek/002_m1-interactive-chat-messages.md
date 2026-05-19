# M1.2 — Interactive messages in chat

## Context

Majordom is a self-hosted personal finance assistant. The chat uses a tool-calling pattern:
LLM calls a tool → backend returns JSON → frontend renders a confirmation card.

This pattern already works for two tools:
- `propose_transaction` → `ProposalCard` (user confirms/cancels adding a transaction)
- `propose_budget_rebalance` → `BudgetRebalanceCard` (user confirms/cancels budget rebalancing)

**M1.2 extends this pattern with two new tools:**
1. `propose_clarification` — LLM asks a question with clickable choice buttons instead of waiting for free text
2. `propose_account_transfer` — LLM proposes moving money between bank accounts in Actual Budget

---

## Tool 1: propose_clarification

### What it does

When the LLM genuinely cannot proceed without more information (e.g. "which account did you use?", "this month or last month?"), it calls this tool instead of asking as text.

Frontend renders: the question as a message bubble + a row of choice buttons below it.
Clicking a button sends that option text as a new user message (same as if the user typed it).

### JSON shape (returned by backend tool function)

```json
{
  "type": "clarification",
  "question": "Which account did you use?",
  "options": ["ING", "N26", "Cash"]
}
```

### Backend (backend/tools/finance/actual_budget.py)

Add a simple synchronous function — no Actual Budget call needed:

```python
async def propose_clarification(question: str, options: list[str]) -> str:
    import json
    return json.dumps({"type": "clarification", "question": question, "options": options})
```

### Tool definition (backend/tools/registry.py)

```python
{
    "type": "function",
    "function": {
        "name": "propose_clarification",
        "description": (
            "Ask the user a clarifying question with predefined answer options. "
            "Use this when you cannot proceed without more information — for example, "
            "which account to use or which month the user means. "
            "Do NOT use for open-ended questions. Provide 2–5 options maximum."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "question": {"type": "string", "description": "The question to show the user."},
                "options": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "2–5 answer choices the user can click.",
                },
            },
            "required": ["question", "options"],
        },
    },
}
```

### Frontend component (frontend/src/components/ClarificationCard.tsx)

```tsx
interface Props {
  question: string
  options: string[]
  onSelected: (option: string) => void
}
```

Render: question text + a row of pill buttons (one per option). On click → call `onSelected(option)`.

**No confirm/cancel — just the option buttons. No API call needed.**

### Chat.tsx integration

New message role: `'clarification'`

In the `onChunk` handler (same place as proposal detection):
```typescript
if (parsed.type === 'clarification') {
  setMessages(prev => [...prev, {
    role: 'clarification' as const,
    content: '',
    clarification: parsed as ClarificationData
  }])
  return
}
```

When the user clicks an option:
```typescript
onSelected={(option) => {
  // Replace the card with the chosen option as plain text (so it looks answered)
  setMessages(prev => prev.map((m, i) =>
    i === idx ? { role: 'assistant', content: option } : m
  ))
  // Send the chosen option as a new user message
  handleSendText(option)  // see below
}}
```

Add a `handleSendText(text: string)` helper that sets `input` to `text` and calls `handleSend()` — or directly calls the send logic without going through the form. The simplest approach: set the input state and trigger send programmatically.

---

## Tool 2: propose_account_transfer

### What it does

When the user says "I moved 200€ from ING to N26" or "transferred 500 to savings", the LLM calls this tool. The user sees an AccountTransferCard and confirms. The backend creates an actual transfer in Actual Budget (two linked transactions).

### JSON shape

```json
{
  "type": "account_transfer",
  "from_account_id": "abc-123",
  "from_account_name": "ING",
  "to_account_id": "def-456",
  "to_account_name": "N26",
  "amount": 200.0,
  "date": "2026-05-19",
  "notes": ""
}
```

### Backend tool function (backend/tools/finance/actual_budget.py)

```python
async def propose_account_transfer(
    from_account_id: str,
    to_account_id: str,
    amount: float,
    date: str,
    notes: str = "",
) -> str:
    # Resolve account names from context (fetch accounts list)
    # Return JSON with type="account_transfer"
```

Fetch accounts via `ActualBudgetClient.get_accounts()` to resolve names from IDs.
Use `_get_client()` factory (same pattern as budget.py):

```python
from backend.core.actual_client import ActualBudgetClient
from backend.core.config import settings

def _get_client() -> ActualBudgetClient:
    return ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )
```

### Tool definition (backend/tools/registry.py)

Parameters: `from_account_id`, `to_account_id`, `amount`, `date`, `notes` (optional).
Required: `from_account_id`, `to_account_id`, `amount`, `date`.

Description: "Propose a transfer between two bank accounts in Actual Budget. Use when the user says they moved or transferred money between their own accounts."

### ActualBudgetClient method (backend/core/actual_client/client.py)

Add `create_transfer(from_account_id, to_account_id, amount, date, notes)`:

```python
async def create_transfer(
    self,
    from_account_id: str,
    to_account_id: str,
    amount: float,
    date: date,
    notes: str = "",
) -> dict:
    def _transfer():
        from actual.queries import create_transaction, get_account
        with self._get_actual() as actual:
            actual.download_budget()
            # In actualpy, a transfer is two linked transactions.
            # Check actualpy source for create_transaction signature —
            # look for a `transfer_id` or `transfer_account` parameter.
            # If a dedicated transfer API exists, use it.
            # Fallback (if no transfer API): create two transactions and link them manually:
            #   - from_account: negative amount (outgoing)
            #   - to_account: positive amount (incoming)
            #   - set notes to "[Transfer] ..." on both
            actual.commit()
            return {"success": True}
    return await self._run(_transfer)
```

**Important:** Check the actualpy source (`pip show actual-python` → find install path → look at `queries.py`) for transfer support before implementing. The correct approach depends on the library version installed.

### New API endpoint (backend/api/accounts.py — new file)

```python
POST /api/accounts/transfer
Body: { from_account_id, to_account_id, amount, date, notes }
Returns: { message: str }
```

Register in `backend/main.py`: `app.include_router(accounts.router, prefix="/api")`

### Frontend component (frontend/src/components/AccountTransferCard.tsx)

Mirror `BudgetRebalanceCard.tsx` exactly. Show:
- From account name → To account name (with → arrow)
- Amount
- Date
- Confirm / Cancel buttons

On confirm: `POST /api/accounts/transfer` with the transfer data.

### api.ts additions

```typescript
export interface AccountTransferData {
  type: 'account_transfer'
  from_account_id: string
  from_account_name: string
  to_account_id: string
  to_account_name: string
  amount: number
  date: string
  notes: string
}

export async function confirmAccountTransfer(data: AccountTransferData): Promise<{ message: string }> {
  return request('/accounts/transfer', {
    method: 'POST',
    body: JSON.stringify({
      from_account_id: data.from_account_id,
      to_account_id: data.to_account_id,
      amount: data.amount,
      date: data.date,
      notes: data.notes,
    }),
  })
}

export interface ClarificationData {
  type: 'clarification'
  question: string
  options: string[]
}
```

### Chat.tsx additions

Add two new message roles to the `Message` interface:
```typescript
role: 'user' | 'assistant' | 'proposal' | 'budget_rebalance' | 'clarification' | 'account_transfer'
clarification?: ClarificationData
accountTransfer?: AccountTransferData
```

Add render logic in the message map (same pattern as BudgetRebalanceCard):
- `clarification` → `<ClarificationCard>`
- `account_transfer` → `<AccountTransferCard>`

### System prompt update (backend/api/chat.py)

Add to the Rules section:
```
- When the user wants to move money between their bank accounts (not budget categories): 
  ALWAYS call propose_account_transfer. Do NOT write the transfer as text.
- When you genuinely need more information to proceed (e.g. which account, which month):
  call propose_clarification with 2–5 options. Do NOT ask as free text.
```

Also update the `if name in (...)` check:
```python
if name in ("propose_transaction", "propose_budget_rebalance", "propose_account_transfer", "propose_clarification"):
```

---

## Files to modify / create

| File | Action |
|------|--------|
| `backend/tools/registry.py` | Add 2 tool definitions + 2 execute_tool handlers |
| `backend/tools/finance/actual_budget.py` | Add `propose_clarification()` + `propose_account_transfer()` |
| `backend/core/actual_client/client.py` | Add `create_transfer()` method |
| `backend/api/accounts.py` | New file — `POST /api/accounts/transfer` endpoint |
| `backend/main.py` | Register accounts router |
| `backend/api/chat.py` | Update system prompt + extend tool name check |
| `frontend/src/lib/api.ts` | Add `ClarificationData`, `AccountTransferData`, `confirmAccountTransfer()` |
| `frontend/src/components/ClarificationCard.tsx` | New component |
| `frontend/src/components/AccountTransferCard.tsx` | New component |
| `frontend/src/pages/Chat.tsx` | Add new roles + render logic + `handleSendText()` |

---

## Testing

1. **Clarification:** type "I spent 45 euros" (no account info, multiple accounts configured) → LLM should call `propose_clarification` with account options → clicking an option sends it as a message → LLM proceeds to call `propose_transaction`.

2. **Account transfer:** type "I moved 200 euros from ING to N26" → LLM calls `propose_account_transfer` → `AccountTransferCard` appears → Confirm → check Actual Budget that both transactions appear.

3. **Regression:** existing `propose_transaction` and `propose_budget_rebalance` still work as before.

---

## Notes

- `handleSendText(text)` in Chat.tsx: simplest implementation is `setInput(text)` + call `handleSend()` directly with the text, bypassing the form. Be careful not to double-send. Use a `useCallback` or inline logic.
- `ClarificationCard` has no API call — it just calls `onSelected(option)`. No loading state needed.
- After clicking a clarification option, the card should become a plain text bubble showing the chosen option (so the conversation reads naturally). Replace the message in state rather than removing it.
- Keep `propose_clarification` options short (1–4 words each) so they fit as pills on mobile.
