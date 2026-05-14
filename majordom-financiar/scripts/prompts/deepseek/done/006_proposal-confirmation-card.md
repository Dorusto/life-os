# Task: Proposal confirmation card — confirm before adding to Actual Budget

## Context

Majordom is a personal finance assistant (FastAPI + React PWA + Ollama).

The chat endpoint currently uses native Ollama tool calling to call `add_transaction`
directly when the user mentions a purchase. The problem: transactions get added to
Actual Budget immediately, without user confirmation. If the LLM picks the wrong
category, the user has no way to correct it from chat.

**Goal:** Instead of adding immediately, the LLM proposes the transaction. The frontend
renders a confirmation card with two buttons (Confirm / Cancel). Only after the user
taps Confirm does the transaction get added to Actual Budget.

---

## How it works (end-to-end)

1. User: "I spent €44 at BAR32"
2. LLM calls `propose_transaction(merchant, amount, date, category_name, account_id, account_name)`
3. Backend stores proposal in memory (dict), returns JSON to frontend — **no second LLM call**
4. Frontend detects JSON in stream, replaces text bubble with a ProposalCard:

```
┌─────────────────────────────────────┐
│  BAR32                              │
│  €44.00 · Restaurants & Cafes       │
│  10 May 2026 · Checking             │
│                                     │
│  [✓ Confirm]       [✗ Cancel]       │
└─────────────────────────────────────┘
```

5. User taps **Confirm** → `POST /api/proposals/{id}/confirm` → transaction added to AB
   → card replaced with: "Added: BAR32 €44.00 → Restaurants & Cafes"
6. User taps **Cancel** → `POST /api/proposals/{id}/cancel` → proposal discarded
   → card replaced with: "Cancelled."

---

## Proposal JSON format

When `propose_transaction` is called, the backend returns this JSON string as the stream:

```json
{
  "type": "proposal",
  "id": "abc12345",
  "merchant": "BAR32",
  "amount": 44.0,
  "date": "2026-05-10",
  "category_name": "Restaurants & Cafes",
  "account_id": "uuid-of-account",
  "account_name": "Checking",
  "notes": ""
}
```

The frontend detects `type === "proposal"` and renders the card instead of text.

---

## Files to create

### `backend/tools/proposals.py`

In-memory store for pending proposals. Resets on server restart (acceptable — proposals
are ephemeral, user re-sends the message if the server restarts).

```python
"""In-memory store for pending transaction proposals."""
import uuid


_proposals: dict[str, dict] = {}


def create(merchant: str, amount: float, date: str, category_name: str,
           account_id: str, account_name: str, notes: str = "") -> str:
    proposal_id = uuid.uuid4().hex[:8]
    _proposals[proposal_id] = {
        "merchant": merchant,
        "amount": amount,
        "date": date,
        "category_name": category_name,
        "account_id": account_id,
        "account_name": account_name,
        "notes": notes,
    }
    return proposal_id


def get(proposal_id: str) -> dict | None:
    return _proposals.get(proposal_id)


def delete(proposal_id: str) -> None:
    _proposals.pop(proposal_id, None)
```

### `backend/api/proposals.py`

Two endpoints: confirm (adds to AB) and cancel (discards).

```python
"""
Proposal endpoints — confirm or cancel a pending transaction proposal.

POST /api/proposals/{id}/confirm  → add transaction to Actual Budget
POST /api/proposals/{id}/cancel   → discard proposal
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.tools import proposals as proposal_store
from backend.tools.finance.actual_budget import add_transaction as _add_transaction

logger = logging.getLogger(__name__)
router = APIRouter()


class ConfirmResult(BaseModel):
    success: bool
    message: str


@router.post("/proposals/{proposal_id}/confirm", response_model=ConfirmResult)
async def confirm_proposal(
    proposal_id: str,
    current_user: str = Depends(get_current_user),
):
    proposal = proposal_store.get(proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found or already confirmed")

    try:
        result = await _add_transaction(
            merchant=proposal["merchant"],
            amount=proposal["amount"],
            date=proposal["date"],
            category_name=proposal["category_name"],
            account_id=proposal["account_id"],
            notes=proposal.get("notes", ""),
        )
    except Exception as e:
        logger.error("Failed to confirm proposal %s: %s", proposal_id, e)
        raise HTTPException(status_code=500, detail="Failed to add transaction")

    proposal_store.delete(proposal_id)

    duplicate = "already exists" in result
    return ConfirmResult(success=True, message=result)


@router.post("/proposals/{proposal_id}/cancel")
async def cancel_proposal(
    proposal_id: str,
    current_user: str = Depends(get_current_user),
):
    proposal_store.delete(proposal_id)
    return {"cancelled": True}
```

### `frontend/src/components/ProposalCard.tsx`

Card component rendered in the chat when a proposal arrives. Matches the existing dark
design system (bg-surface, border-border, text-white, accent buttons).

```tsx
import { Check, X } from 'lucide-react'
import { confirmProposal, cancelProposal } from '../lib/api'

export interface ProposalData {
  id: string
  merchant: string
  amount: number
  date: string
  category_name: string
  account_name: string
}

interface Props {
  proposal: ProposalData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function ProposalCard({ proposal, onConfirmed, onCancelled }: Props) {
  async function handleConfirm() {
    try {
      const result = await confirmProposal(proposal.id)
      onConfirmed(`Added: ${proposal.merchant} €${proposal.amount.toFixed(2)} → ${proposal.category_name}`)
    } catch {
      onConfirmed('Error: could not add transaction. Try again.')
    }
  }

  async function handleCancel() {
    try {
      await cancelProposal(proposal.id)
    } catch {}
    onCancelled()
  }

  const formattedDate = new Date(proposal.date).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  })

  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[80%] space-y-3">
      <div>
        <p className="text-white font-medium">{proposal.merchant}</p>
        <p className="text-muted text-sm">€{proposal.amount.toFixed(2)} · {proposal.category_name}</p>
        <p className="text-muted text-sm">{formattedDate} · {proposal.account_name}</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors active:scale-95"
        >
          <Check size={14} />
          Confirm
        </button>
        <button
          onClick={handleCancel}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-surface-2 hover:bg-surface-hover border border-border text-muted hover:text-white text-sm font-medium transition-colors active:scale-95"
        >
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  )
}
```

---

## Files to modify

### `backend/tools/finance/actual_budget.py` — add `propose_transaction`

Add this function at the end of the file:

```python
async def propose_transaction(
    merchant: str,
    amount: float,
    date: str,
    category_name: str,
    account_id: str,
    account_name: str,
    notes: str = "",
) -> str:
    """
    Create a pending proposal (does NOT add to Actual Budget yet).
    Returns a JSON string with type='proposal' for the frontend to render as a card.
    """
    import json
    from backend.tools import proposals as proposal_store

    proposal_id = proposal_store.create(
        merchant=merchant,
        amount=amount,
        date=date,
        category_name=category_name,
        account_id=account_id,
        account_name=account_name,
        notes=notes,
    )

    return json.dumps({
        "type": "proposal",
        "id": proposal_id,
        "merchant": merchant,
        "amount": amount,
        "date": date,
        "category_name": category_name,
        "account_id": account_id,
        "account_name": account_name,
        "notes": notes,
    })
```

### `backend/tools/registry.py` — replace `add_transaction` with `propose_transaction`

Replace the entire TOOLS list and execute_tool function:

```python
TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "propose_transaction",
            "description": (
                "Propose adding a new expense or income to Actual Budget. "
                "Use this when the user says they spent money at a store or received money. "
                "The user will confirm or cancel before it is actually saved."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "merchant": {
                        "type": "string",
                        "description": "Store or merchant name, e.g. 'Lidl', 'Shell', 'Albert Heijn'",
                    },
                    "amount": {
                        "type": "number",
                        "description": "Amount in EUR, always positive, e.g. 47.50",
                    },
                    "date": {
                        "type": "string",
                        "description": "Transaction date YYYY-MM-DD. Use today's date if not mentioned.",
                    },
                    "category_name": {
                        "type": "string",
                        "description": "Category name from the available categories list.",
                    },
                    "account_id": {
                        "type": "string",
                        "description": "Account ID from the available accounts list.",
                    },
                    "account_name": {
                        "type": "string",
                        "description": "Account name matching the account_id (for display).",
                    },
                    "notes": {
                        "type": "string",
                        "description": "Optional notes.",
                    },
                },
                "required": ["merchant", "amount", "date", "category_name", "account_id", "account_name"],
            },
        },
    }
]


async def execute_tool(name: str, arguments: dict[str, Any]) -> str:
    if name == "propose_transaction":
        from backend.tools.finance.actual_budget import propose_transaction
        return await propose_transaction(**arguments)

    return f"Unknown tool: {name}"
```

### `backend/api/chat.py` — return proposal JSON directly (no second LLM call)

In `chat_stream()`, inside the `if tool_calls:` block, replace:

```python
# BEFORE (current code):
for tc in tool_calls:
    name = tc.get("function", {}).get("name", "")
    args = tc.get("function", {}).get("arguments", {})
    try:
        result = await execute_tool(name, args)
    except Exception as exc:
        logger.error("Tool execution failed: %s — %s", name, exc)
        result = f"Tool error: {exc}"
    messages.append({"role": "tool", "content": result})

# Second call: streaming confirmation
async def stream_after_tools():
    ...
return StreamingResponse(stream_after_tools(), ...)
```

With:

```python
# AFTER:
for tc in tool_calls:
    name = tc.get("function", {}).get("name", "")
    args = tc.get("function", {}).get("arguments", {})
    try:
        result = await execute_tool(name, args)
    except Exception as exc:
        logger.error("Tool execution failed: %s — %s", name, exc)
        result = f"Tool error: {exc}"

    # propose_transaction returns JSON — send directly to frontend, skip second LLM call
    if name == "propose_transaction":
        async def yield_proposal(r=result):
            yield r
        return StreamingResponse(yield_proposal(), media_type="text/plain", headers=streaming_headers)

    messages.append({"role": "tool", "content": result})

# Second call: streaming confirmation (for future non-proposal tools)
async def stream_after_tools():
    try:
        async for chunk in _stream_ollama_response(messages, ollama_url, model):
            yield chunk
    except HTTPException as e:
        yield f"\n\nError: {e.detail}"
    except Exception as e:
        logger.error("Streaming error after tool execution: %s", e)
        yield "\n\nError: Internal server error"

return StreamingResponse(stream_after_tools(), media_type="text/plain", headers=streaming_headers)
```

### `backend/main.py` — register proposals router

Add import and router registration:

```python
# Add to imports:
from backend.api import auth, receipts, transactions, chat, csv_import, proposals

# Add after existing routers:
app.include_router(proposals.router, prefix="/api")
```

### `frontend/src/lib/api.ts` — add confirmProposal and cancelProposal

Add at the end of the file:

```typescript
// --- Proposals ---

export interface ConfirmResult {
  success: boolean
  message: string
}

export async function confirmProposal(id: string): Promise<ConfirmResult> {
  return request<ConfirmResult>(`/proposals/${id}/confirm`, { method: 'POST' })
}

export async function cancelProposal(id: string): Promise<void> {
  return request<void>(`/proposals/${id}/cancel`, { method: 'POST' })
}
```

### `frontend/src/pages/Chat.tsx` — detect proposal, render ProposalCard

**Change 1:** Extend the Message interface and add ProposalData import:

```typescript
import ProposalCard, { ProposalData } from '../components/ProposalCard'

interface Message {
  role: 'user' | 'assistant' | 'proposal'
  content: string
  proposal?: ProposalData
}
```

**Change 2:** In `sendChatMessageStreaming`, in the `onComplete` callback, detect if the
last assistant message is a JSON proposal and convert it:

```typescript
// onComplete callback (replace the existing one):
() => {
  setMessages(prev => {
    const last = prev[prev.length - 1]
    if (last?.role === 'assistant' && last.content.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(last.content)
        if (parsed.type === 'proposal') {
          return [
            ...prev.slice(0, -1),
            { role: 'proposal' as const, content: '', proposal: parsed as ProposalData },
          ]
        }
      } catch {}
    }
    return prev
  })
  setLoading(false)
},
```

**Change 3:** In the message list render, add a case for `role === 'proposal'`:

```tsx
{messages.map((msg, idx) => (
  <div
    key={idx}
    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
  >
    {msg.role === 'proposal' && msg.proposal ? (
      <ProposalCard
        proposal={msg.proposal}
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
    ) : (
      <div
        className={`
          max-w-[80%] px-4 py-3 text-sm leading-relaxed rounded-2xl
          ${msg.role === 'user'
            ? 'bg-accent text-white rounded-br-sm'
            : 'bg-surface border border-border text-white rounded-bl-sm'
          }
        `}
      >
        {msg.content}
      </div>
    )}
  </div>
))}
```

---

## What NOT to change

- `backend/tools/finance/actual_budget.py` — keep `add_transaction` (used by proposals confirm endpoint)
- Any other files not listed above
- The streaming interface in `api.ts` (`sendChatMessageStreaming`) — keep as-is

---

## Verification

After implementing:

1. Send: "I spent 55 euros at Jumbo"
   → Expected: ProposalCard appears with merchant=Jumbo, category=Groceries & Drinks, two buttons

2. Tap Confirm
   → Expected: card replaced with "Added: Jumbo €55.00 → Groceries & Drinks", transaction visible in Actual Budget

3. Send another message, tap Cancel
   → Expected: card replaced with "Cancelled.", nothing added to Actual Budget
