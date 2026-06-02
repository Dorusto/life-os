# 01 — Why all code is `async`

## The problem

The app can receive messages from multiple users simultaneously (you + your partner, for example).
If processing a receipt takes 60 seconds (Ollama on CPU), without async the server would freeze completely and ignore any other request during that time.

## The solution: async/await

```python
# Without async — server freezes for 60s, no other user can do anything
def handle_photo(update, context):
    result = process_image(photo)  # blocks for 60s

# With async — server "yields" control while waiting
async def handle_photo(update, context):
    result = await process_image(photo)  # "I'll come back when it's ready"
```

**The analogy:** Think of a restaurant waiter. A waiter without async takes your order, goes to the kitchen, and stays there for 20 minutes until the food is ready. An async waiter takes your order, delivers it to the kitchen, and in the meantime serves 5 other tables. When your food is ready, he comes back.

## The golden rule in this codebase

- Every function that **waits for something** (LLM, Actual Budget) uses `await`
- **`actualpy` is sync** (it doesn't know about async) → that's why it runs in `ThreadPoolExecutor`

```python
# actual_client/client.py — why the structure is complex
async def add_transaction(self, ...):
    def _add():          # sync function — actualpy code goes here
        with actual:
            ...
    return await self._run(_add)  # runs sync in a separate thread
                                   # without blocking the server
```

## Why `ThreadPoolExecutor`?

Python's asyncio event loop runs on a single thread. If you call a sync function directly from an async context, it blocks the entire event loop — no other request can be processed. `ThreadPoolExecutor` offloads the sync work to a separate OS thread, while the event loop continues handling other requests.

```python
# backend/core/actual_client/client.py
async def _run(self, fn):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(self._executor, fn)
```

## Summary

| Pattern | Where |
|---------|-------|
| `async def` + `await` | All FastAPI endpoints and service methods |
| `ThreadPoolExecutor` | `ActualBudgetClient._run()` wraps all actualpy calls |
| `await asyncio.sleep()` | Instead of `time.sleep()` in async context |
