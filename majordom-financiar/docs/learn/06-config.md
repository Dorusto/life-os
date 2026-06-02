# 06 — Centralized config (settings.py)

## Everything comes from `.env`

All configuration is read once at startup in `backend/core/config/settings.py` → imported as a singleton anywhere needed.

```python
# Any file in the project:
from backend.core.config import settings

url = settings.llm.base_url
model = settings.llm.chat_model
password = settings.actual.password
```

**Why this matters:** if you want to change anything (Ollama URL, model name, currency), change **only in `.env`**. Don't search through 10 files.

## Never use `os.environ` directly

```python
# WRONG — bypasses the settings singleton
import os
url = os.environ["LLM_BASE_URL"]

# CORRECT
from backend.core.config import settings
url = settings.llm.base_url
```

## How to read a bug when it appears

When something doesn't work, first look at:
```bash
docker compose logs majordom --tail=50
```

Structure of a typical log:
```
INFO  api.receipts - Receipt uploaded: /app/data/uploads/abc123.jpg
INFO  core.ocr.vision_engine - Sending image to LLM (gemini-2.5-flash-lite)...
INFO  core.ocr.vision_engine - Receipt extracted: Kaufland, 45.99 EUR
INFO  core.memory.categorizer - Category suggested: Daily Living > Groceries (from_history=True)
INFO  tools.finance.actual_budget - Transaction added: Kaufland 45.99 → tx-id-123
```

If you see `ERROR` or `WARNING`, that line tells you exactly where it broke.

**Note on logging in containers:** `logging.getLogger(__name__)` may not appear in docker logs if the root logger isn't configured (default level is WARNING). For quick debug use `print(..., flush=True)` — it always appears. Or check directly with `docker compose exec`.

## Scheduler singleton

`backend/core/memory/scheduler.py` contains the APScheduler instance. It lives in the FastAPI process. When you run `docker compose exec ... python3 -c "..."`, you create a **new process** with a separate scheduler instance that has no jobs registered. That's expected — test scheduler behavior via HTTP, not via exec.

## Pre-commit hook false positives

The `check-private-data.sh` hook catches patterns like `PASSWORD = <value>`. It may produce false positives for:
- `password=settings.actual.password` — this is a config reference, not a real credential
- Tailwind classes with numbers (`w-52`, `z-50`) — these look like plate numbers to the hook

Known workarounds: `w-[208px]` instead of `w-52`, add `settings\.` to the hook's negative lookahead.
