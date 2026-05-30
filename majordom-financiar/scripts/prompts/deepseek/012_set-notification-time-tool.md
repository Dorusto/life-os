# Task D — Chat Tool: set_notification_time

**Context:** Majordom Financiar — self-hosted personal finance assistant. Backend: FastAPI
(Python 3.11), async. Chat tools are defined in `backend/tools/registry.py`. APScheduler
is currently a module-level singleton in `backend/main.py`. Notification config is stored
in SQLite (`notification_rules` table) via `MemoryDB`.

---

## Goal

Allow the user to change the daily notification time by saying something like
"change notification to 21:30" in chat. Majordom calls `set_notification_time`,
updates SQLite, reschedules the APScheduler job immediately (no restart needed),
and confirms to the user.

---

## Files to create/modify

| File | Action |
|---|---|
| `backend/core/scheduler.py` | **Create** — move scheduler singleton here |
| `backend/main.py` | **Modify** — import scheduler from new module |
| `backend/tools/registry.py` | **Modify** — add tool definition + execute_tool handler |
| `backend/tools/settings/__init__.py` | **Create** — empty |
| `backend/tools/settings/notifications.py` | **Create** — tool implementation |

Do NOT touch any other file.

---

## 1. `backend/core/scheduler.py` — new singleton module

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler(timezone="Europe/Amsterdam")
```

That's the entire file. Moving the singleton here avoids circular imports when
tools need to reschedule jobs.

---

## 2. `backend/main.py` — update import

Replace:
```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler
# ...
scheduler = AsyncIOScheduler(timezone="Europe/Amsterdam")
```

With:
```python
from backend.core.scheduler import scheduler
```

No other changes to `main.py`.

---

## 3. `backend/tools/settings/notifications.py` — tool implementation

```python
async def set_notification_time(time: str) -> str:
```

### Validation

```python
import re
if not re.match(r"^\d{2}:\d{2}$", time):
    return "Invalid time format. Use HH:MM, e.g. '21:30'."

hour, minute = map(int, time.split(":"))
if not (0 <= hour <= 23 and 0 <= minute <= 59):
    return "Invalid time. Hour must be 0-23, minute 0-59."
```

### Update SQLite

```python
from backend.core.memory.database import MemoryDB
from backend.core.config import settings

db = MemoryDB(settings.memory.db_path)
db.upsert_notification_rule(
    rule_type="daily_summary",
    enabled=True,
    config={"time": time},
)
```

### Reschedule APScheduler

```python
from backend.core.scheduler import scheduler
from backend.services.notification_service import run_daily_summary

scheduler.reschedule_job(
    "daily_summary",
    trigger="cron",
    hour=hour,
    minute=minute,
)
```

Note: `reschedule_job` updates an existing job. The job was registered at startup
in `main.py` lifespan with `id="daily_summary"`. This is the correct APScheduler
API for in-place rescheduling — no need to remove and re-add.

### Return

```python
return f"Notification time updated to {time}. You will receive your daily summary at {time} from now on."
```

### Error handling

Wrap the body in `try/except Exception as e: return f"Failed to update notification time: {e}"`.

---

## 4. `backend/tools/registry.py` — add to TOOLS list

Add this entry **before** the `propose_transaction` entry (group settings tools before proposal tools):

```python
{
    "type": "function",
    "function": {
        "name": "set_notification_time",
        "description": (
            "Change the time of the daily financial summary notification. "
            "Use when the user asks to change, update, or set the notification time, "
            "e.g. 'change notification to 21:30', 'set daily message at 8am'. "
            "Executes immediately — no confirmation needed."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "time": {
                    "type": "string",
                    "description": "New notification time in HH:MM 24h format, e.g. '21:30', '08:00'.",
                },
            },
            "required": ["time"],
        },
    },
},
```

---

## 5. `backend/tools/registry.py` — add to execute_tool()

Add before the final `return f"Unknown tool: {name}"` line:

```python
if name == "set_notification_time":
    from backend.tools.settings.notifications import set_notification_time
    return await set_notification_time(**arguments)
```

---

## Critical rules

1. `set_notification_time` is **not** a proposal tool — it executes immediately and
   returns a confirmation string. The LLM will use this string to confirm to the user.
   Do NOT add it to `_PROPOSAL_TOOLS` in `chat.py`.

2. `scheduler.reschedule_job()` requires the job to already exist. It was registered
   at startup with `id="daily_summary"`. If the job doesn't exist (e.g. startup failed),
   `reschedule_job` raises `JobLookupError` — the outer try/except handles it.

3. `MemoryDB.upsert_notification_rule()` already exists — no changes to database.py needed.

4. The `backend/tools/settings/` directory is new — create `__init__.py` (empty).

---

## How to verify

After rebuild:

```bash
# 1. In the Majordom chat, type:
"change notification to 21:30"

# Expected: LLM calls set_notification_time("21:30"), backend updates SQLite and
# reschedules APScheduler, LLM confirms to user in chat.

# 2. Verify SQLite was updated:
docker compose exec majordom-api python -c "
from backend.core.memory.database import MemoryDB
db = MemoryDB('/app/data/memory.db')
print(db.get_notification_rule('daily_summary'))
"
# Expected: config = {"time": "21:30"}

# 3. Verify APScheduler job was rescheduled:
docker compose exec majordom-api python -c "
from backend.core.scheduler import scheduler
job = scheduler.get_job('daily_summary')
print(job.next_run_time)
"
# Expected: next run at the new time
```
