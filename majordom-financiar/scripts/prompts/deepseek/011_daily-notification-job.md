# Task C — Daily Notification Job (APScheduler + LLM + Web Push)

**Context:** Majordom Financiar is a self-hosted personal finance assistant.
Backend: FastAPI (Python 3.11), async throughout. Financial data in Actual Budget
(accessed via `ActualBudgetClient`). Notifications sent via Web Push (`PushService`).
APScheduler is already wired into the FastAPI lifespan in `backend/main.py`.

---

## Goal

At 20:00 Europe/Amsterdam daily, Majordom:
1. Fetches today's financial data from Actual Budget
2. Calls the local Ollama LLM to generate a personalized message in Romanian
3. Sends it as a Web Push notification
4. Logs the send to `notification_log`

The notification time (default 20:00) is stored in `notification_rules` table
as `config = {"time": "20:00"}` for `rule_type = "daily_summary"`.

---

## Files to create/modify

| File | Action |
|---|---|
| `backend/services/notification_service.py` | **Create** — all job logic |
| `backend/main.py` | **Modify** — register the APScheduler job at startup |

Do NOT touch any other file.

---

## 1. `backend/services/notification_service.py`

### Entry point

```python
async def run_daily_summary():
    """Called by APScheduler. Fetches data, generates message, sends push."""
```

### Step 1 — Check if enabled and not already sent today

```python
from backend.core.memory.database import MemoryDB
from backend.core.config import settings

db = MemoryDB(settings.memory.db_path)
rule = db.get_notification_rule("daily_summary")
if not rule or not rule["enabled"]:
    return

last = db.get_last_notification("daily_summary")
if last:
    from datetime import date
    last_date = last["sent_at"][:10]  # "YYYY-MM-DD"
    if last_date == date.today().isoformat():
        return  # already sent today
```

### Step 2 — Fetch financial data from Actual Budget

```python
from backend.core.actual_client import ActualBudgetClient

client = ActualBudgetClient()
accounts = await client.get_accounts()          # list of Account objects
today_transactions = await client.get_today_transactions()  # list, may be empty
budget_status = await client.get_budget_status()  # list of BudgetCategory objects
```

**`get_today_transactions()`** — new method needed in `ActualBudgetClient`.
Fetches transactions for today only:

```python
async def get_today_transactions(self) -> list:
    from datetime import date
    def _get():
        with self._get_actual() as actual:
            actual.download_budget()
            today = date.today().isoformat()
            txs = actual.get_transactions()
            return [t for t in txs if str(t.date) == today]
    return await self._run(_get)
```

### Step 3 — Build LLM prompt and call Ollama

Prepare a summary dict:
```python
summary = {
    "date": date.today().strftime("%d %B %Y"),
    "transactions_today": [
        {"payee": t.payee or "Unknown", "amount": t.amount / 100, "category": t.category or ""}
        for t in today_transactions
    ],
    "budget_overview": [
        {"category": b["category_name"], "spent": b["spent"], "budgeted": b["budgeted"],
         "percentage": b["percentage"]}
        for b in budget_status if b["budgeted"] > 0
    ][:5],  # top 5 categories
    "total_balance": sum(a.balance for a in accounts if not a.off_budget) / 100,
}
```

System prompt (in English — LLM responds in Romanian to the user):
```
You are Majordom, a personal finance assistant. Send a short, relevant daily message.

Rules:
- Maximum 2 sentences
- Friendly tone, not formal
- If no transactions today: ask if everything is ok or if the user bought something
- If transactions exist: summarize the day and add a useful budget observation
- Do not repeat raw numbers — interpret and provide context
- If a category exceeds 80% of its budget: mention it
- Always respond in Romanian
```

User message: `json.dumps(summary, ensure_ascii=False)`

LLM call (non-streaming, no tools):
```python
import httpx

payload = {
    "model": settings.ollama.chat_model,
    "messages": [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps(summary, ensure_ascii=False)},
    ],
    "stream": False,
    "think": False,
    "options": {"temperature": 0.7, "num_predict": 150},
}
async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
    resp = await client.post(f"{settings.ollama.url}/api/chat", json=payload)
    message_text = resp.json()["message"]["content"].strip()
```

### Step 4 — Send push + log

```python
from backend.services.push_service import get_push_service

push_svc = get_push_service()
await push_svc.send_to_all(
    user_id="default",
    title="Majordom",
    body=message_text,
    url="/chat",
)

db.log_notification("daily_summary", {
    "message": message_text,
    "transactions_count": len(today_transactions),
})
```

### Error handling

Wrap the entire `run_daily_summary()` body in `try/except Exception as e: logger.error(...)`.
The job must never crash APScheduler.

---

## 2. `backend/main.py` — register job

After `scheduler.start()`, add:

```python
from backend.services.notification_service import run_daily_summary
from backend.core.memory.database import MemoryDB as _MemoryDB
from backend.core.config import settings as _settings

# Read time from notification_rules (default 20:00)
_rule = _MemoryDB(_settings.memory.db_path).get_notification_rule("daily_summary")
_time = (_rule or {}).get("config", {}).get("time", "20:00")
_hour, _minute = map(int, _time.split(":"))

scheduler.add_job(
    run_daily_summary,
    trigger="cron",
    hour=_hour,
    minute=_minute,
    id="daily_summary",
    replace_existing=True,
)
logger.info("Daily summary job scheduled at %s", _time)
```

---

## Critical rules

1. **All ActualBudgetClient calls are async** — `await client.get_*()`. The sync
   `actualpy` code runs inside `_run()` (ThreadPoolExecutor). See existing methods
   in `backend/core/actual_client/client.py` for the pattern.

2. **`actual.download_budget()` always first** in any `with actual:` block.

3. **`think: False`** in every Ollama payload — mandatory for qwen3 models.

4. **Transaction amounts** from actualpy are in cents (integers). Divide by 100 for EUR.
   `t.amount` is negative for expenses (e.g. -4500 = -€45.00).

5. **`run_daily_summary` is async** — APScheduler with AsyncIOScheduler runs async
   jobs natively. Do NOT use `asyncio.run()` inside it.

6. **Do not import `scheduler` from `main.py`** — pass job registration as shown above
   (in `main.py` lifespan, after `scheduler.start()`).

---

## How to verify

**Test immediately** (without waiting for 20:00):

```bash
docker compose exec majordom-api python -c "
import asyncio
from backend.services.notification_service import run_daily_summary
asyncio.run(run_daily_summary())
print('Done')
"
```

Expected: a push notification arrives on the device with a Romanian message about
today's finances. Check `notification_log` table:

```bash
docker compose exec majordom-api python -c "
from backend.core.memory.database import MemoryDB
db = MemoryDB('/app/data/memory.db')
log = db.get_last_notification('daily_summary')
print(log)
"
```
