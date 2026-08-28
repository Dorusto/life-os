# Task: Split an existing transaction across multiple categories (#115)

## Context

Majordom currently assumes 1 transaction = 1 category everywhere. A real transaction
(e.g. a festival ticket covering both the event and camping) can legitimately belong to
two or more categories at once, distorting the budget on both sides if forced into one.

**Scope note:** this is backend-only, on purpose. Transaction entry/editing is moving
out of chat entirely into a graphical UI (#184/#185, in progress) — do NOT add a chat
tool, do NOT touch `backend/tools/registry.py`, `backend/api/chat.py`'s `_PROPOSAL_TOOLS`,
or the system-prompt tool guide. This issue only builds the capability + a plain REST
endpoint; the GUI that calls it is separate (#185, not part of this task).

## Goal

`POST /api/transactions/{financial_id}/split` takes an existing transaction and a list of
`{category_id, amount}` lines, and turns it into a parent transaction (no category, marked
as split) with N child transactions, each carrying its own category and amount. Actual
Budget's own UI already shows this natively as a "Split" transaction once the underlying
data is correct.

## Relevant files

| File | What it contains |
|------|-------------------|
| `backend/core/actual_client/client.py` | All actualpy operations. Add `split_transaction()` here. Reuse the existing `_get_actual()`/`_run()`/`download_budget()`-then-`commit()` pattern used throughout this file (e.g. `update_transaction_category`, line ~984). |
| `backend/core/finance/provider.py` | `FinanceProvider` Protocol — every method reachable from the API layer must be declared here too (architecture.md rule about `get_provider()` — see Critical Rules). |
| `backend/core/finance/actual_budget_provider.py` | Thin pass-through from the Protocol to `ActualBudgetClient`. Every new client method needs a matching one-line pass-through here or it's unreachable via `get_provider()`. |
| `backend/api/transactions.py` | Existing REST endpoints for transactions/accounts/categories (`GET /transactions`, `GET /categories`, etc.) — add the new `POST /transactions/{financial_id}/split` endpoint here, same file, same `ActualBudgetClient(...)` construction pattern already used by every other route in this file. |

## Changes required

### 1. `backend/core/actual_client/client.py`

Add a new method `split_transaction(self, financial_id: str, splits: list[dict]) -> dict`.
`splits` is a list of `{"category_id": str, "amount": float}` (amount always positive —
the sign follows the original transaction's direction, the caller doesn't specify it).

actualpy has native support for this via `actual.queries.create_split(session, transaction, amount)`
— it creates one child transaction linked to `transaction.id` via `parent_id`, and you set
`.category_id` on the returned object yourself. This is the *opposite* helper from
`create_splits()` (plural — merges several standalone transactions into one group); don't
use that one.

Convention to follow (matches how Actual Budget's own "Split Transaction" UI behaves —
verify visually against the local AB UI once implemented, not just via the API):
- The original transaction becomes the **parent**: set `is_parent = 1`, clear its
  `category_id` (parents carry no category — the split children carry it instead).
- Create one child per entry in `splits` via `create_split()`, then set `child.category_id`.
- Validate `sum(abs(amount) for splits) == abs(original transaction amount)` within 0.01
  tolerance *before* mutating anything — raise `ValueError` with the mismatch amounts in
  the message if it doesn't balance, so the API layer can turn it into a clear 400.
- Reject if the transaction is already split (`tx.is_parent` already truthy) or not found
  — `ValueError` in both cases, same pattern as other client methods that raise on bad
  input for the API layer to translate into an HTTPException.
- Reject if any `category_id` doesn't match an existing category (check against
  `get_categories()` results, or query directly) — `ValueError` listing the bad id.

Sketch (fill in the exact sign/lookup details, don't copy blindly — verify against
`Transactions.financial_id`/`tombstone` filtering already used in `update_transaction_category`):

```python
async def split_transaction(self, financial_id: str, splits: list[dict]) -> dict:
    def _split():
        from actual.queries import create_split
        from actual.database import Transactions
        with self._get_actual() as actual:
            actual.download_budget()
            tx = actual.session.query(Transactions).filter(
                Transactions.financial_id == financial_id,
                Transactions.tombstone == 0,
            ).first()
            if not tx:
                raise ValueError(f"Transaction not found: {financial_id}")
            if tx.is_parent:
                raise ValueError("Transaction is already split")

            original_amount = tx.get_amount()  # signed Decimal
            sign = 1 if original_amount >= 0 else -1
            requested_total = sum(abs(s["amount"]) for s in splits)
            if abs(requested_total - abs(original_amount)) > 0.01:
                raise ValueError(
                    f"Splits sum to {requested_total:.2f}, transaction total is {abs(original_amount):.2f}"
                )

            tx.is_parent = 1
            tx.category_id = None
            created = []
            for s in splits:
                child = create_split(actual.session, tx, amount=sign * abs(s["amount"]))
                child.category_id = s["category_id"]
                created.append(str(child.id))

            actual.commit()
            return {"parent_financial_id": financial_id, "child_count": len(created)}
    return await self._run(_split)
```

### 2. `backend/core/finance/provider.py`

Add `async def split_transaction(self, financial_id: str, splits: list[dict]) -> dict: ...`
to the `FinanceProvider` Protocol, alongside the other transaction-related methods.

### 3. `backend/core/finance/actual_budget_provider.py`

Add the matching one-line pass-through:
```python
async def split_transaction(self, financial_id: str, splits: list[dict]) -> dict:
    return await self._client.split_transaction(financial_id, splits)
```
(match whatever the existing pass-through methods in this file actually call the wrapped
client instance — `self._client` is a guess, check the real attribute name from an
existing method in this file before writing this.)

### 4. `backend/api/transactions.py`

Add a new endpoint:

```python
class SplitLine(BaseModel):
    category_id: str
    amount: float


class SplitTransactionRequest(BaseModel):
    splits: list[SplitLine]


@router.post("/transactions/{financial_id}/split")
async def split_transaction(
    financial_id: str,
    body: SplitTransactionRequest,
    current_user: str = Depends(get_current_user),
):
    if len(body.splits) < 2:
        raise HTTPException(status_code=400, detail="A split needs at least 2 lines")

    client = ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )
    try:
        result = await client.split_transaction(
            financial_id, [s.model_dump() for s in body.splits]
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to split transaction %s: %s", financial_id, e)
        raise HTTPException(status_code=500, detail="Could not connect to Actual Budget. Is it running?")

    return result
```

No frontend changes in this task — #185 (separate issue, not yet started) will call this
endpoint from the Review sheet's multi-line UI. Don't build any frontend for this.

## Critical Rules

- **actualpy order: `download_budget()` first → operations → `commit()` last**, all inside
  `with self._get_actual() as actual:` (CLAUDE.md rule 2, already followed in the sketch above).
- **actualpy amounts are floats in EUR, not cents** — `create_transaction`/`create_split`
  take `amount` as a plain float (e.g. `45.99`), never multiply by 100 (CLAUDE.md rule 3).
- **Config from `settings` singleton, never `os.environ` directly** (CLAUDE.md rule 4).
- **New `ActualBudgetClient` method must be added to all three layers** — `client.py`,
  `ActualBudgetProvider` (pass-through), and the `FinanceProvider` Protocol — or
  `get_provider()`'s result raises `AttributeError` at call time (architecture.md, prior
  bug #126). This task's step 2/3 above exist specifically to satisfy that rule.
- **No financial data in SQLite** — this doesn't touch SQLite at all, Actual Budget stays
  the sole source of truth. Just confirming this task doesn't violate it.
- **Do NOT register a chat tool for this** — no `registry.py`, no `_PROPOSAL_TOOLS`, no
  system-prompt bullet. This is intentionally chat-free — see Scope note above.

## Gotchas

1. `create_splits()` (plural) is for merging several *already-existing standalone*
   transactions into one split group — completely different use case, do not use it here.
   `create_split()` (singular) is the one that splits a *single* existing transaction, which
   is what this task needs.
2. `tx.get_amount()` returns a signed `Decimal` — negative for an expense. Preserve that
   sign when creating each child via `create_split(..., amount=sign * abs(s["amount"]))`,
   don't pass the raw signed amount from the API request (the API only ever receives
   positive amounts from the caller).
3. Verify the actual pass-through attribute name in `actual_budget_provider.py` before
   copy-pasting the `self._client` guess in step 3 — every existing method in that file
   already shows the real pattern to copy.

## Do NOT touch

- `backend/tools/registry.py`, `backend/api/chat.py`, `backend/tools/category_actions.py`,
  or anything under `frontend/` — out of scope for this task, see Scope note.
- `update_transaction_category()` in `client.py` — noticed to be dead code (no callers)
  while researching this task, but removing it is a separate cleanup, not part of #115.

## Done when

- `POST /api/transactions/{financial_id}/split` with 2+ valid `{category_id, amount}`
  lines summing to the transaction's total succeeds, and the transaction shows as a
  correctly split transaction (parent + children, right categories/amounts) when viewed
  directly in Actual Budget's own web UI (`localhost:5006` on the local dev stack).
- A mismatched sum returns `400` with a clear message, not a server error or a silent wrong write.
- An unknown `financial_id` or an already-split transaction returns `400`, not a crash.
- Test against the **local dev stack's fixture data**, not production — confirm
  `ACTUAL_BUDGET_URL` in `.env` points at the local `actual-budget` container before
  running anything that writes. If working in an isolated git worktree, copy `.env` into
  it first (`docker-compose.override.yml` and root `.env` aren't tracked by git).
