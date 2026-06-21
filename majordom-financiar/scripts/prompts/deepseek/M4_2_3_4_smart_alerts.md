# Task: M4.2 + M4.3 + M4.4 — Smart Alerts

## Context

Majordom already has a daily digest system (`notification_service.py`) where `_check_*()` functions return `str | None` and `run_daily_digest()` bundles results into one Web Push. M4.2 is an immediate post-transaction alert; M4.3 and M4.4 plug into the existing daily digest.

## Goal

After this task:
- M4.2: When a category goes over budget after a transaction is added, the user gets an immediate push notification (not bundled in the daily digest).
- M4.3: The daily digest warns if this month's income is significantly lower than the 3-month average.
- M4.4: The daily digest warns (at most weekly) if a savings goal is at risk of missing its deadline.

## Relevant files

| File | What it contains |
|------|-----------------|
| `backend/services/notification_service.py` | Digest orchestrator + all `_check_*` functions — add three new functions here |
| `backend/tools/finance/actual_budget.py` | Tool function `add_transaction()` — call the budget alert here after success |
| `backend/core/finance/provider.py` | `FinanceProvider` Protocol — add `get_goals()` signature |
| `backend/core/finance/actual_budget_provider.py` | `ActualBudgetProvider` — add `get_goals()` delegation |
| `backend/main.py` | Startup: seeds notification rules via `db.upsert_notification_rule()` — add 3 new rules |

## Changes required

### 1. `backend/core/finance/provider.py`

Add `async def get_goals(self) -> list[dict]: ...` to the `FinanceProvider` Protocol. No other changes.

### 2. `backend/core/finance/actual_budget_provider.py`

Add `async def get_goals(self) -> list[dict]:` that delegates to `self._client().get_goals()`. Follow the exact pattern of every other method in this file (one-liner delegation).

### 3. `backend/services/notification_service.py`

#### 3a. `check_budget_alert(category_name, db)` — M4.2

This is NOT a `_check_*` checker. It is a standalone `async` function, called from the tool layer after a transaction is confirmed. It must send the push and log it itself (it does not participate in the digest).

Logic:
- Read notification rule `"budget_alert"` from `db`. If disabled or not found, return immediately.
- Anti-spam: call `db.get_last_notification(f"budget_alert_{category_name}")` — if the result's `sent_at` date is today's date, return immediately.
- Call `get_provider().get_budget_status()` (current month, no args). Find the entry where `category_name` matches (case-insensitive). If not found or `budgeted == 0`, return.
- If `spent >= budgeted`: build text `"⚠️ Budget alert: {category_name} is at {percentage:.0f}% ({spent:.2f} / {budgeted:.2f} €). Budget exceeded."`. If `100 <= percentage < 110` use a mild tone; if `>= 110` use `"⚠️⚠️"`.
- Send push via `get_push_service().broadcast(title="Majordom", body=text, url="/chat")`.
- Log via `db.log_notification(f"budget_alert_{category_name}", {"category": category_name, "percentage": percentage})`.
- Wrap entire function body in `try/except` — log error but never raise (must not break the transaction confirmation flow).

#### 3b. `_check_income_variance(db)` — M4.3

Standard `_check_*` pattern: returns `str | None`, no side effects.

Logic:
- Read rule `"income_variance"` from `db`. If disabled, return None.
- Anti-spam: check `db.get_last_notification("income_variance")` — if today, return None.
- Get today's date. Build a list of the last 3 calendar months (excluding current). For each, call `await get_provider().get_monthly_stats(month=m, year=y)` and collect `stats["income"]`.
  - Handle year rollover: if `today.month - i <= 0`, subtract from year accordingly.
- Also get current month stats via `await get_provider().get_monthly_stats()`.
- If fewer than 2 historical months have `income > 0`, return None (not enough data).
- Calculate `historical_avg = sum of historical incomes / count`.
- If `today.day < 10`, return None — too early in the month to judge income.
- `threshold = db.get_notification_rule("income_variance")["config"].get("threshold", 0.8)`.
- If `current_income < historical_avg * threshold`: return `f"⚠️ Income alert: only €{current_income:.2f} recorded this month vs average €{historical_avg:.2f}. Is this expected?"`.
- Return None otherwise.

#### 3c. `_check_goal_risk(db)` — M4.4

Standard `_check_*` pattern: returns `str | None`, no side effects.

Logic:
- Read rule `"goal_risk"` from `db`. If disabled, return None.
- Call `goals = await get_provider().get_goals()`. Filter: keep only goals where `goal["deadline"]` is not None and `goal["months_remaining"]` is not None and `goal["months_remaining"] > 0`.
- For each goal, check anti-spam: `db.get_last_notification(f"goal_risk_{goal['id']}")` — if sent within the last 7 days, skip this goal.
- Determine if at risk:
  - `months_remaining <= 3` AND `percentage < 90` → urgent
  - `months_remaining <= 6` AND `percentage < 60` → at risk
  - Otherwise → skip
- Build one alert string per at-risk goal: `f"🎯 Goal '{goal['name']}': {goal['percentage']:.0f}% done, deadline {goal['deadline']} ({goal['months_remaining']} months left). Need €{goal['monthly_needed']:.0f}/month."`.
- If `months_remaining <= 3` prefix with `"⚠️ "`.
- If there are at-risk goals, return them joined with `"\n"`. Otherwise return None.
- Note: logging for goal_risk happens in `run_daily_digest` (not inside this checker), following the existing pattern.

#### 3d. Wire M4.3 + M4.4 into `run_daily_digest()`

In `run_daily_digest()`:
1. Add `income_variance_text = await _check_income_variance(db)` and append to `parts` if not None.
2. Add `goal_risk_text = await _check_goal_risk(db)` and append to `parts` if not None.
3. In the logging section after push is sent: log `"income_variance"` if `income_variance_text`, and log `f"goal_risk_{goal['id']}"` for each at-risk goal if `goal_risk_text`.
   - Problem: `_check_goal_risk` only returns a combined string, not the individual goal IDs. Simplification: log one `"goal_risk"` entry per day, not per goal. Anti-spam inside `_check_goal_risk` already handles per-goal weekly rate-limiting.
   - After the push: `if goal_risk_text: db.log_notification("goal_risk", {})`.
   - `if income_variance_text: db.log_notification("income_variance", {})`.

### 4. `backend/tools/finance/actual_budget.py`

In the `add_transaction()` tool function, after the `if tx_id:` branch (successful transaction, non-duplicate):

- Import `asyncio` at the top of the function (or at the top of the file).
- After building the success return string, fire the budget check as a background task using `asyncio.ensure_future(check_budget_alert(category_name, MemoryDB(settings.memory.db_path)))`.
- Import `check_budget_alert` from `backend.services.notification_service`.
- Import `MemoryDB` from `backend.core.memory.database`.
- Do NOT await it — this would block the chat response by ~3 seconds.
- Return the success string immediately (the push arrives a few seconds later).

### 5. `backend/main.py`

In the startup `lifespan()` function, after the existing `upsert_notification_rule` blocks, add three new ones using the same pattern:

```python
if not db.get_notification_rule("budget_alert"):
    db.upsert_notification_rule("budget_alert", enabled=True, config={})
if not db.get_notification_rule("income_variance"):
    db.upsert_notification_rule("income_variance", enabled=True, config={"threshold": 0.8})
if not db.get_notification_rule("goal_risk"):
    db.upsert_notification_rule("goal_risk", enabled=True, config={})
```

## Critical Rules

- All finance data comes from `get_provider()`, never import `ActualBudgetClient` directly. (source: architecture.md#critical-technical-rules, M5.2 abstraction)
- `_check_*` functions return `str | None` with no side effects — logging and push happen in `run_daily_digest()` after the push is sent. (source: notification_service.py docstring at line 1)
- `check_budget_alert` is NOT a `_check_*` function — it is standalone (does its own push + log). (source: M4.2 spec — fires immediately from tool layer, not from digest)
- Config from `settings` singleton, never `os.environ` directly. (source: architecture.md)

## Gotchas

1. **`get_spending_history()` on `ActualBudgetClient` does NOT exist.** The provider delegates to it, but the client has no such method. Do NOT call `get_provider().get_spending_history()`. For M4.3, use `get_monthly_stats(month=m, year=y)` in a loop.

2. **Year rollover for monthly history loop.** When computing months before the current one:
   ```python
   today = date.today()
   m = today.month - i  # i = 1, 2, 3
   y = today.year
   if m <= 0:
       m += 12
       y -= 1
   ```

3. **`asyncio.ensure_future` in `add_transaction` tool.** Do NOT `await check_budget_alert(...)` — it makes an AB call (3s+ delay). Use `asyncio.ensure_future(...)` to fire-and-forget.

4. **`get_budget_status()` field names:** `"category_name"`, `"spent"`, `"budgeted"`, `"percentage"`. Match `category_name` case-insensitively.

5. **`get_goals()` return shape:** `{"id", "name", "balance", "target", "percentage", "deadline", "monthly_needed", "months_remaining"}`. `deadline` is `"YYYY-MM"` string or None. `monthly_needed` is None if no deadline.

6. **Anti-spam key for budget_alert is per-category:** `f"budget_alert_{category_name}"` — so going over budget in "Restaurants" and "Groceries" on the same day sends two separate pushes (one per category, max one per day each).

7. **`check_budget_alert` must not raise** — wrap entire body in `try/except Exception as e: logger.error(...)`. The tool caller (`add_transaction`) does not handle exceptions from this call.

## Do NOT touch

- `_check_financial_summary`, `_check_import_nudge`, `_check_pending_review`, `_check_uncategorized_transactions`, `_check_vehicle_reminders` — existing checkers, no changes
- `run_daily_digest` guard logic and push flow — only extend (add calls + log blocks), don't restructure
- Any frontend files
- `backend/core/actual_client/client.py` — existing `get_goals()` is already implemented there, only wire it up the stack

## Done when

- `check_budget_alert` is importable from `notification_service` and callable from the tool
- `_check_income_variance` and `_check_goal_risk` are wired into `run_daily_digest()`
- `get_goals()` appears in `FinanceProvider` protocol and `ActualBudgetProvider`
- Three new notification rules seeded in `main.py`
- `add_transaction` tool fires `check_budget_alert` as a background task after success
- No existing tests broken, no existing checker modified
