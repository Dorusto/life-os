# Task: M2 — Onboarding Flow (Phase 1: Discovery + Phase 2: AB Configuration)

## Context

Majordom is a self-hosted personal finance assistant. Backend: FastAPI (Python 3.11). Frontend: React PWA (TypeScript + Tailwind). Finance data lives in Actual Budget (AB) — accessed via `actualpy`. SQLite (`memory.db`) is used only for conversational state and user preferences.

Read these files before touching any code:
- `backend/core/actual_client/client.py` — AB client (already has `create_account`, `set_budget_amount`)
- `backend/core/memory/database.py` — SQLite interface (add onboarding methods here)
- `backend/api/chat.py` — existing chat endpoint (modify to detect onboarding intent)
- `backend/tools/registry.py` — tool registry pattern
- `frontend/src/pages/Chat.tsx` — chat page (modify to handle onboarding mode)
- `backend/main.py` — register the new router here

## What to build

A conversational onboarding flow that:
1. Collects answers to 15 questions (Phase 1 — Discovery)
2. Configures Actual Budget based on those answers (Phase 2 — AB config)

All within the existing chat UI — no new page needed.

---

## Entry / exit

**Trigger:** user sends a message matching onboarding intent in chat (e.g. "set up my budget", "configure my budget", "start onboarding", "onboarding").  
Detection: simple keyword match in `chat.py` BEFORE the Ollama call — if the user's last message matches, return `{"type": "onboarding_start"}` and redirect further messages to `/api/onboarding/message`.

**Frontend mode switch:** `Chat.tsx` checks localStorage for an active onboarding session (`onboarding_active: true`). If active, `POST /api/onboarding/message` instead of `/api/chat`. On `{"type": "onboarding_complete"}` or `{"type": "onboarding_cancelled"}` — clear localStorage, resume normal chat.

**Cancel:** if user writes "stop", "cancel", "exit" during onboarding → backend marks state as cancelled, returns `{"type": "onboarding_cancelled", "message": "Onboarding cancelled. You can restart anytime."}`.

---

## SQLite — new table

Add to `database.py` `_init_db()`:

```sql
CREATE TABLE IF NOT EXISTS onboarding_state (
    id INTEGER PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'default',
    current_question INTEGER NOT NULL DEFAULT 1,
    answers TEXT NOT NULL DEFAULT '{}',
    phase INTEGER NOT NULL DEFAULT 1,
    completed_at TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
```

Add methods to `MemoryDB`:
- `get_onboarding_state(user_id) -> dict | None`
- `save_onboarding_state(user_id, state: dict)` — upsert
- `clear_onboarding_state(user_id)` — delete row

`answers` column stores JSON. Example after Q3: `{"budgeting_style": "envelope", "household_size": 2, "monthly_income": 3500}`.

---

## New file: `backend/services/onboarding_service.py`

This service owns the entire state machine. The LLM is NOT used to drive the flow — only to parse free-form answers into structured data.

### Questions (Phase 1 — Discovery)

Implement all 15 questions in order, grouped in blocks A–G. Skip logic noted per question.

**Block A — Budgeting style**
- Q1: envelope vs tracking budgeting. Store as `budgeting_style: "envelope" | "tracking"`.

**Block B — Household & income**
- Q2: household size (integer). Store as `household_size`.
- Q3: total monthly take-home pay (float, EUR). Store as `monthly_income`.
- Q4: income stable or variable? Store as `income_type: "stable" | "variable"`. If variable → also store `income_minimum` (float).
- Q5: manage finances with a partner? Store as `has_partner: bool`. If yes → `partner_income` (float).

**Block C — Accounts**
- Q6: list of bank accounts with current balance. Parse LLM response into list: `accounts: [{"name": str, "balance": float, "type": "checking"|"savings"|"investment"|"cash"}]`. Auto-classify: investment/pension → `off_budget: true`; rest → `off_budget: false`.
- Q7: credit cards? Store as `credit_cards: [{"name": str, "balance": float, "pays_full": bool}]`. Skip if user says no.
- Q8: transactions in currencies other than EUR? Store as `foreign_currencies: [{"currency": str, "rate": float}]`. Skip if user says no.

**Block D — Fixed obligations**
- Q9: recurring monthly payments (rent, subscriptions, insurance, salary deposit). Parse into `schedules: [{"name": str, "amount": float, "day_of_month": int, "type": "expense"|"income"}]`.
- Q10: loans / debts besides mortgage? Store as `loans: [{"name": str, "monthly_payment": float, "balance": float}]`. Skip if none.

**Block E — Goals**
- Q11: financial goals. Multi-select + free text. Store as `goals: [{"type": str, "amount": float, "target_date": str, "monthly_contribution": float}]`. Supported types: `emergency_fund`, `vacation`, `car`, `house`, `fire`, `debt_payoff`, `other`.

**Block F — End of month**
- Q12: what happens to leftover money? Store as `eom_strategy: "rollover"|"sink_emergency"|"sink_split"|"manual"`.
- Q13: one-month buffer? Store as `wants_buffer: bool`.

**Block G — Historical data**
- Q14: import past transactions? Store as `wants_historical_import: bool`.
- Q15: shown only if Q14 = true. Inform user that transfer detection will run after import. Store as `transfer_detection_acknowledged: bool`.

### Skip logic

- Q7 (credit cards): always ask
- Q8 (foreign currencies): always ask
- Q10 (loans): skip if user says "no" to Q9 or says they have no obligations
- Q11 goals: always ask
- Q15: skip if Q14 = false

### LLM parsing

For each question, after the user replies, call Ollama (non-streaming, same model) with a small parsing prompt to extract the structured answer from the free-form reply. The parsing prompt must:
- Include the question text
- Include the user's reply
- Ask for JSON output matching the field schema above
- Use `temperature: 0.1`, `num_predict: 256`

If parsing fails or returns unexpected JSON → ask the user to clarify (retry the same question, don't advance).

### State machine

```
current_question: 1..15
phase: 1 (discovery) | 2 (ab_config)
```

Blocks (A–G) are conceptual groupings for skip logic only — not stored in state.

On each call to `process_message(user_id, text)`:
1. Load state from SQLite
2. Parse user's answer for `current_question` via LLM
3. Save parsed answer to `answers` JSON
4. Advance to next question (apply skip logic)
5. Return next question text + progress info
6. If all questions done → set `phase = 2`, trigger Phase 2

---

## New file: `backend/api/onboarding.py`

Single endpoint:

```
POST /api/onboarding/message
Body: {"message": str, "user_id": str = "default"}
Auth: JWT (same as chat)
Response: StreamingResponse (text/plain) — same pattern as chat
```

The response is always a plain text stream (question text, confirmation, or final summary). The frontend renders it as a chat bubble, same as any other assistant message.

Special responses are JSON strings on a single line (the frontend already detects `{"type": ...}` patterns in `onChunk`):
- `{"type": "onboarding_question", "question_num": 1, "total": 15, "text": "..."}` — a question
- `{"type": "onboarding_complete", "summary": "..."}` — all done
- `{"type": "onboarding_cancelled"}` — user cancelled

---

## Phase 2 — Actual Budget configuration

Triggered automatically after all 15 questions are answered. Runs sequentially, confirms each step to the user via chat.

Use `actualpy` functions (already available in the codebase — check `backend/core/actual_client/client.py` and the imports at the top of that file for the pattern):

### Step 1 — Accounts
For each account in `answers.accounts`:
```python
create_account(session, name=acc["name"], initial_balance=acc["balance"], off_budget=acc["off_budget"])
```
Add `create_account()` wrapper to `ActualBudgetClient` if not already there (check first — it may exist).

### Step 2 — Category groups + categories
Create sensible category groups based on household profile. Use `create_category_group()` + `create_category()` from `actualpy.queries`.

Suggested groups and categories (adapt based on Q2 household size and Q5 partner):
- **Living:** Rent/Mortgage, Groceries, Utilities, Insurance
- **Transport:** Fuel, Public Transport, Car Maintenance
- **Personal:** Clothing, Health, Personal Money (× household_size if > 1)
- **Leisure:** Restaurants, Entertainment, Vacation
- **Financial:** Investments & Savings, Emergency Fund
- **Children:** (only if household_size > 1 and has kids — ask in Q2 follow-up if needed, default to omit)
- **Income:** (mark as income category group)

### Step 3 — Monthly budget allocations
Based on `monthly_income` and category list, propose a simple allocation. Use `set_budget_amount()` (already in client).

Simple heuristic (adjust proportions to reach ~100% of income):
- Rent/Mortgage: ask user (skip in auto if not known)
- Groceries: 15% of income
- Savings/Emergency: 10% of income
- Personal Money: 5% × household_size
- Distribute remainder proportionally to other categories

### Step 4 — Schedules
For each item in `answers.schedules`, use `actualpy.queries.create_schedule()` with:
- `date` = a `Schedule` object from `actual.schedules` with `frequency="monthly"`, `start=date(year, month, day_of_month)`
- `amount` = the amount
- `amount_operation` = `"isapprox"` for income, `"is"` for fixed expenses
- `payee` = schedule name
- `account` = first matching account

Add `create_schedule()` wrapper to `ActualBudgetClient`.

### Step 5 — Summary
Return a human-readable summary of what was created:
```
Setup complete:
- 3 accounts created
- 6 category groups, 18 categories
- Budget allocated for May 2026
- 4 recurring schedules set up

You can now start using Majordom. Try: "How am I doing this month?"
```

---

## `client.py` additions needed

Add these wrappers to `ActualBudgetClient` (follow existing async/executor pattern):

```python
async def create_category(self, name: str, group_name: str) -> Category: ...
async def create_category_group(self, name: str) -> str: ...  # returns group id
async def create_schedule(self, name: str, amount: float, day_of_month: int, account_id: str, is_income: bool = False) -> str: ...
```

For `create_schedule`, use `actual.schedules.Schedule` with `frequency="monthly"` and `start` set to next occurrence of `day_of_month`.

---

## Frontend changes — `Chat.tsx`

1. On mount: check `localStorage.getItem("onboarding_active")`. If `"true"`, set state `isOnboarding = true`.

2. `sendMessage()`: if `isOnboarding`, POST to `/api/onboarding/message` instead of `/api/chat`.

3. In `onChunk` (where JSON proposal types are already detected): add detection for `onboarding_question` and `onboarding_complete`/`onboarding_cancelled`. On complete/cancelled: `localStorage.removeItem("onboarding_active")`, set `isOnboarding = false`.

4. Show progress indicator when `isOnboarding`: a small line above the chat input like "Setting up your budget — Question 3/15". Read from the last received `onboarding_question` type.

5. In `chat.py`, add keyword detection BEFORE the Ollama call:
```python
ONBOARDING_TRIGGERS = {"set up my budget", "configure my budget", "start onboarding", "onboarding"}
last_user_msg = req.messages[-1].content.lower().strip()
if any(trigger in last_user_msg for trigger in ONBOARDING_TRIGGERS):
    # set localStorage flag via response header or return onboarding_start JSON
    async def _start():
        yield json.dumps({"type": "onboarding_start"})
    return StreamingResponse(_start(), ...)
```
The frontend on receiving `onboarding_start` sets `localStorage.setItem("onboarding_active", "true")` and immediately sends the first onboarding message.

---

## What NOT to do

- Do not store financial amounts or transaction data in SQLite — only onboarding state and parsed answers
- Do not let the LLM drive the question sequence — backend controls the state machine
- Do not create AB objects (accounts, categories) during discovery — only in Phase 2
- Do not implement transfer detection (M2.3) or rules sync (M2.4) — those are separate tasks
- Do not add a new page or route — everything stays in `Chat.tsx`
- Schedule creation for loans (Q10) is out of scope — just save the data, note it in a TODO comment

---

## Rebuild after changes

```bash
docker compose build majordom && docker compose up -d majordom
```

---

## Files to create/modify

| File | Action |
|------|--------|
| `backend/core/memory/database.py` | Add `onboarding_state` table + 3 methods |
| `backend/services/onboarding_service.py` | New — state machine + LLM parsing |
| `backend/api/onboarding.py` | New — `POST /api/onboarding/message` |
| `backend/api/chat.py` | Add onboarding trigger detection |
| `backend/core/actual_client/client.py` | Add `create_category`, `create_category_group`, `create_schedule` |
| `backend/main.py` | Register onboarding router |
| `frontend/src/pages/Chat.tsx` | Onboarding mode switch + progress indicator |
