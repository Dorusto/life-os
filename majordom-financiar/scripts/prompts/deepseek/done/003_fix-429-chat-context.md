# Task: Fix 429 too-many-requests on chat context fetch

## Context

Majordom is a personal finance PWA. Backend is FastAPI (Python 3.11). Financial data lives in Actual Budget (self-hosted, running in Docker). The Actual Budget Python client (`actualpy`) opens a sync session for each call.

File to modify: `backend/api/chat.py`
Supporting file (read-only, do not modify): `backend/core/actual_client/client.py`

## Problem

Every chat message triggers `_fetch_financial_context()`, which creates a new `ActualBudgetClient` and makes **3 separate async calls** in sequence:

```python
accounts = await client.get_accounts()       # opens session 1
stats = await client.get_monthly_stats()     # opens session 2
txs = await client.get_recent_transactions() # opens session 3
```

Each call opens its own sync session via `actualpy`. Actual Budget rate-limits concurrent or rapid connections and returns `429 too-many-requests`. Result: the AI receives no financial context and responds with "I don't have access to your account information."

## Root cause

`ActualBudgetClient` wraps `actualpy` sync calls in a `ThreadPoolExecutor`. Each method opens a new `with self._get_actual() as actual:` block — a separate connection. Three calls = three connections in rapid succession = 429.

## Fix

Add a new method `get_full_context()` to `ActualBudgetClient` in `backend/core/actual_client/client.py` that fetches all three data points **inside a single session** (one `with self._get_actual() as actual:` block, three queries).

Then update `_fetch_financial_context()` in `backend/api/chat.py` to call this single method instead of three separate ones.

## Implementation

### 1. Add `get_full_context()` to `ActualBudgetClient` (`backend/core/actual_client/client.py`)

```python
async def get_full_context(
    self,
    month: int | None = None,
    year: int | None = None,
    recent_limit: int = 20,
) -> dict:
    """
    Fetch accounts, monthly stats, and recent transactions in a single session.
    Avoids the 429 rate-limit that occurs when opening three separate sessions.
    """
```

Inside the single `_run()` executor call, open one `with self._get_actual() as actual:` block and:
1. Call `actual.download_budget()` once
2. Fetch accounts (same logic as `get_accounts()`)
3. Fetch monthly stats (same logic as `get_monthly_stats()`)
4. Fetch recent transactions (same logic as `get_recent_transactions()`)
5. Return a dict: `{"accounts": [...], "stats": {...}, "recent_transactions": [...]}`

Copy the existing logic from the three methods — do not call them (that would open separate sessions). Keep the same return shapes so `_build_system_prompt()` works unchanged.

### 2. Update `_fetch_financial_context()` in `backend/api/chat.py`

Replace the three separate `await client.*()` calls with a single:

```python
async def _fetch_financial_context() -> dict:
    """Fetch all financial context from Actual Budget in a single session."""
    client = ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )
    try:
        return await client.get_full_context()
    except Exception as e:
        logger.warning("Could not fetch financial context: %s", e)
        return {}
```

## What NOT to change

- Do not modify the existing `get_accounts()`, `get_monthly_stats()`, or `get_recent_transactions()` methods — they are used elsewhere
- Do not change `_build_system_prompt()` or any other function in `chat.py`
- Do not change the streaming logic or the `/api/chat` endpoint signature
- Do not add caching — the single-session fix is sufficient

## Verification

After the change:
1. Rebuild Docker: `docker compose build majordom && docker compose up -d majordom`
2. Send a chat message: "how much money do I have?"
3. Check logs: `docker logs majordom-api --tail 20`
4. Expected: no `429` errors, AI response includes real account balances
5. Expected log: `"Could not fetch financial context"` should NOT appear
