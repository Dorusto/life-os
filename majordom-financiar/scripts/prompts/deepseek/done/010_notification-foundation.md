# Task A — Notification Foundation (APScheduler + SQLite tables)

**Context:** Majordom Financiar is a self-hosted personal finance assistant.
Backend: FastAPI (Python 3.11), async throughout. SQLite for user preferences and
conversational memory (never for financial data). Financial data lives in Actual Budget.

This task builds the **foundation for all proactive notifications** (M2-NEW features 2.1–2.4).
No UI, no push sending yet — just the scheduler wired up and the tables in place.

---

## Files to touch

| File | What changes |
|---|---|
| `requirements.backend.txt` | Add `APScheduler[asyncio]` |
| `backend/core/memory/database.py` | Add 3 new tables + CRUD methods |
| `backend/main.py` | Start/stop AsyncIOScheduler in lifespan |

Do NOT touch any other file.

---

## 1. `requirements.backend.txt`

Add one line:
```
APScheduler[asyncio]==3.10.4
```

---

## 2. New SQLite tables in `database.py`

Add to the `_init_db()` executescript (after existing tables):

```sql
CREATE TABLE IF NOT EXISTS notification_rules (
    rule_type   TEXT PRIMARY KEY,
    enabled     INTEGER NOT NULL DEFAULT 1,
    config      TEXT NOT NULL DEFAULT '{}',
    updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_type   TEXT NOT NULL,
    sent_at     TEXT NOT NULL DEFAULT (datetime('now')),
    payload     TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL DEFAULT 'default',
    endpoint    TEXT NOT NULL UNIQUE,
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    user_agent  TEXT NOT NULL DEFAULT '',
    created_at  TEXT DEFAULT (datetime('now'))
);
```

Add these methods to `MemoryDB`:

```python
# --- Notification Rules ---

def get_notification_rule(self, rule_type: str) -> dict | None:
    """Return rule config dict or None if not found."""

def upsert_notification_rule(self, rule_type: str, enabled: bool, config: dict):
    """Insert or update a notification rule."""

def get_all_notification_rules(self) -> list[dict]:
    """Return all rules as list of dicts (rule_type, enabled, config)."""

# --- Notification Log ---

def log_notification(self, rule_type: str, payload: dict):
    """Append a log entry."""

def get_last_notification(self, rule_type: str) -> dict | None:
    """Return the most recent log entry for a rule_type, or None."""

# --- Push Subscriptions ---

def save_push_subscription(self, user_id: str, endpoint: str, p256dh: str, auth: str, user_agent: str):
    """Upsert a Web Push subscription (unique by endpoint)."""

def get_push_subscriptions(self, user_id: str = "default") -> list[dict]:
    """Return all active subscriptions for a user."""

def delete_push_subscription(self, endpoint: str):
    """Remove a subscription by endpoint (called when push returns 410 Gone)."""
```

`config` column stores JSON. Use `json.loads` / `json.dumps` in all methods — never return raw strings.

---

## 3. `main.py` — APScheduler in lifespan

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler(timezone="Europe/Amsterdam")
```

In the `lifespan` context manager, before `yield`:
```python
# Seed default notification rules if not present
db = MemoryDB(settings.memory.db_path)
if not db.get_notification_rule("daily_summary"):
    db.upsert_notification_rule(
        rule_type="daily_summary",
        enabled=True,
        config={"time": "20:00"},
    )

scheduler.start()
logger.info("APScheduler started")
```

After `yield`:
```python
scheduler.shutdown(wait=False)
logger.info("APScheduler stopped")
```

**Do NOT add any jobs yet.** Jobs (daily_summary, etc.) are added in Task C.
The scheduler just needs to start and stop cleanly.

---

## Critical rules (do not break)

1. The backend is fully async. `AsyncIOScheduler` is correct here (not `BackgroundScheduler`).
2. The `scheduler` object must be module-level (defined outside `lifespan`) so future
   tasks in other modules can call `scheduler.add_job(...)` after import.
3. Do not import `scheduler` in `database.py` — no circular deps.
4. `timezone="Europe/Amsterdam"` is correct — the user is in NL.

---

## How to verify (share this with the user)

```bash
docker compose build majordom && docker compose up -d majordom
docker compose logs majordom | grep -E "APScheduler|scheduler|Database"
```

Expected output:
```
INFO  Database initialized: /app/data/memory.db
INFO  APScheduler started
```

Then check tables exist:
```bash
docker compose exec majordom sqlite3 /app/data/memory.db ".tables"
```

Expected: `notification_rules`, `notification_log`, `push_subscriptions` appear in the list.

Check default rule was seeded:
```bash
docker compose exec majordom sqlite3 /app/data/memory.db \
  "SELECT * FROM notification_rules;"
```

Expected: one row — `daily_summary | 1 | {"time": "20:00"}`
