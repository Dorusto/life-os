# Task: First-launch setup flow in chat (M2-NEW 2.0)

## Context

Majordom is a personal finance assistant (FastAPI backend + React PWA frontend) built on Actual Budget.
The chat uses Ollama (qwen3:14b) with tool calling. Tool definitions are in `backend/tools/registry.py`.
The chat endpoint is `backend/api/chat.py`. The frontend chat is `frontend/src/pages/Chat.tsx`.

The backend already has (built before this task — do not rewrite):
- `MemoryDB.get_preference(key)` / `set_preference(key, value)` in `backend/core/memory/database.py`
- `ActualBudgetClient.adjust_account_balance(account_id, target_balance) -> float` in `backend/core/actual_client/client.py`
- `GET /api/setup/status` and `POST /api/setup/complete` endpoints in `backend/api/setup.py`
  - `GET /api/setup/status` returns `{completed: bool, accounts: [{id, name, balance}]}`
  - `POST /api/setup/complete` body: `{path: "today"|"history", balances: [{account_id, real_balance}]}`
    - For `path="today"`: creates balance adjustment transactions in AB and marks setup done
    - For `path="history"`: just marks setup done, no balance changes
- The setup flag key is `"setup_complete"` in `user_preferences` SQLite table

The frontend already has `getSetupStatus()` and `completeSetup()` in `frontend/src/lib/api.ts`.

## What to implement

**Goal:** when the user opens the Majordom chat tab for the first time (setup not complete), Majordom automatically displays a welcome message with two choices. The entire flow happens in chat — no separate page, no wizard.

---

## Change 1 — `backend/api/chat.py`

Add setup context to the system prompt when setup is not complete.

In `_build_system_prompt()`, add a `setup_complete` parameter (bool). When `False`, prepend this block to the prompt:

```
## SETUP MODE
You are helping the user configure Majordom for the first time.
The user has chosen to start tracking from today.
Your job: ask for the real balance of each account listed below, then call complete_setup with all balances.
Be warm and concise. Ask for all balances in one message. After calling complete_setup, confirm what was adjusted and say Majordom is ready.

Accounts to configure:
{account_list}
```

Where `{account_list}` is a bullet list of `name (current AB balance: €X)` for each on-budget account.

In `chat_stream()`:
- At the start of the function, check `MemoryDB.get_preference("setup_complete")`
- If not `"1"`, fetch accounts via `ActualBudgetClient.get_accounts()` and pass them into `_build_system_prompt(setup_complete=False, accounts=accounts)`
- Otherwise use `_build_system_prompt(setup_complete=True)` (current behavior, no account list needed)

---

## Change 2 — `backend/tools/registry.py`

Add a new tool `complete_setup` to `TOOLS` and handle it in `execute_tool()`.

Tool definition:
```python
{
    "type": "function",
    "function": {
        "name": "complete_setup",
        "description": (
            "Call this when the user has provided the real balance for all their accounts. "
            "Pass the list of account IDs and the real balances as stated by the user. "
            "This creates balance adjustment transactions in Actual Budget and marks setup as complete."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "balances": {
                    "type": "array",
                    "description": "List of account balance entries.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "account_id": {"type": "string", "description": "Account ID from the accounts list."},
                            "real_balance": {"type": "number", "description": "Real balance in EUR as stated by the user."},
                        },
                        "required": ["account_id", "real_balance"],
                    },
                }
            },
            "required": ["balances"],
        },
    },
}
```

In `execute_tool()`, handle `complete_setup`:
```python
if name == "complete_setup":
    from backend.tools.finance.actual_budget import complete_setup
    return await complete_setup(**arguments)
```

**Important:** `complete_setup` is NOT a proposal tool — it executes immediately. Do NOT add it to `_PROPOSAL_TOOLS`.

---

## Change 3 — `backend/tools/finance/actual_budget.py`

Add the `complete_setup` function:

```python
async def complete_setup(balances: list[dict]) -> str:
    """
    Adjust account balances in AB to match user-provided real values.
    Marks setup as complete in user_preferences.
    Returns a summary string for the LLM to use in its response.
    """
    from backend.core.actual_client import ActualBudgetClient
    from backend.core.config import settings
    from backend.core.memory.database import MemoryDB

    client = ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )

    # Fetch account names for the summary
    accounts = await client.get_accounts()
    account_name_map = {a.id: a.name for a in accounts}

    results = []
    for entry in balances:
        account_id = entry["account_id"]
        real_balance = float(entry["real_balance"])
        try:
            diff = await client.adjust_account_balance(account_id, real_balance)
            name = account_name_map.get(account_id, account_id)
            if abs(diff) >= 0.01:
                results.append(f"{name}: adjusted {'+' if diff > 0 else ''}€{diff:.2f}")
            else:
                results.append(f"{name}: balance matches, no adjustment needed")
        except Exception as e:
            results.append(f"{account_id}: error — {e}")

    db = MemoryDB(db_path=settings.memory.db_path)
    db.set_preference("setup_complete", "1")

    if results:
        return "Setup complete. Adjustments:\n" + "\n".join(f"• {r}" for r in results)
    return "Setup complete. All balances already matched — no adjustments needed."
```

---

## Change 4 — `frontend/src/pages/Chat.tsx`

On component mount, check setup status. If not complete, insert the welcome ClarificationCard as the first message — WITHOUT waiting for user input.

**Where to add:** add a new `useEffect` after the existing onboarding `useEffect` (around line 59).

```typescript
// Check first-launch setup — if not complete, inject welcome ClarificationCard
useEffect(() => {
  getSetupStatus().then(status => {
    if (!status.completed) {
      setMessages([{
        role: 'clarification',
        content: '',
        clarification: {
          question: "Bun venit în Majordom! Înainte să începem, o singură întrebare:",
          options: ["Pornesc tracking de azi", "Am date istorice de importat"],
        },
      }])
    }
  }).catch(() => {}) // on error, show normal chat
}, [])
```

**Import to add** at the top of Chat.tsx:
```typescript
import { getSetupStatus } from '../lib/api'
```

**ClarificationCard behavior** (already implemented, no changes needed):
- When the user clicks "Pornesc tracking de azi" → `handleSendText("Pornesc tracking de azi")` is called
- The LLM, with setup context in its system prompt, knows to ask for account balances
- After the user provides balances, the LLM calls `complete_setup`
- `complete_setup` is NOT a proposal tool, so chat continues normally after it executes

- When the user clicks "Am date istorice de importat" → `handleSendText("Am date istorice de importat")` is called
- The LLM explains the correct process (import CSV first, then Majordom reconciles) and marks setup done by calling `complete_setup` with empty balances... 

  **Wait** — for the "history" path, the LLM should call `complete_setup` with `balances=[]` just to mark setup done, OR the frontend should call `POST /api/setup/complete` directly with `{path: "history"}`.
  
  **Simpler approach for "history" path:** handle it in the LLM conversation. Add to the system prompt (visible only in setup mode):
  ```
  If the user chooses "Am date istorice de importat":
  - Explain: import CSV first, then Majordom will reconcile balances after each import.
  - Call complete_setup with balances=[] to mark setup as done.
  - Do NOT ask for balances.
  ```
  With `balances=[]`, the `complete_setup` function just marks setup done and returns a summary string.

---

## Change 5 — `frontend/src/lib/api.ts` (minor, already has the functions — verify only)

The functions `getSetupStatus()` and `completeSetup()` should already exist from prior work. 
If missing, add:
```typescript
export async function getSetupStatus(): Promise<{ completed: boolean; accounts: { id: string; name: string; balance: number }[] }> {
  return request('/setup/status')
}
```

---

## Files to modify

| File | Change |
|------|--------|
| `backend/api/chat.py` | Setup check at start of `chat_stream`, setup context in `_build_system_prompt` |
| `backend/tools/registry.py` | Add `complete_setup` tool definition and dispatch |
| `backend/tools/finance/actual_budget.py` | Add `complete_setup()` function |
| `frontend/src/pages/Chat.tsx` | Add `useEffect` that injects welcome ClarificationCard on first launch |
| `frontend/src/lib/api.ts` | Verify `getSetupStatus` exists (should be there already) |

Do NOT modify: `backend/api/setup.py`, `backend/core/memory/database.py`, `backend/core/actual_client/client.py` — these are already implemented.

---

## Critical rules (from ARCHITECTURE.md and LEARN.md)

1. **Async/sync**: all `ActualBudgetClient` methods are async; sync actualpy code runs in `ThreadPoolExecutor` via `_run()`. Never call sync actualpy code directly in an async function.
2. **actualpy operation order**: always `actual.download_budget()` first, `actual.commit()` last for any write.
3. **Never store financial data in SQLite** — SQLite is only for preferences and conversation memory.
4. **Config**: always from `from backend.core.config import settings`, never `os.getenv()`.
5. **Ollama payload**: always include `"think": false` to prevent thinking mode from blocking.
6. **`complete_setup` is not a proposal tool** — it executes immediately and returns a result string. The LLM uses the result to compose its response.

---

## How to test

After implementation, to reset the setup flag and test the flow:

```bash
docker exec majordom-api python3 -c "
import sqlite3
conn = sqlite33.connect('/app/data/memory.db')
conn.execute(\"DELETE FROM user_preferences WHERE key='setup_complete'\")
conn.commit()
conn.close()
print('Setup flag cleared.')
"
```

Then open the Majordom chat tab → should see the welcome ClarificationCard immediately.

Expected flow:
1. ClarificationCard appears with "Pornesc tracking de azi" and "Am date istorice de importat"
2. Click "Pornesc tracking de azi" → Majordom lists all accounts and asks for real balances
3. User provides balances in one message (e.g. "ING current 2430.13, ING savings 22457, ...")
4. LLM calls `complete_setup` → AB adjusted → Majordom confirms adjustments
5. After step 4, the ClarificationCard no longer appears on next app open (setup is done)

---

## After implementation

Rebuild and restart:
```bash
docker compose build majordom-api majordom-web && docker compose up -d majordom-api majordom-web
```
