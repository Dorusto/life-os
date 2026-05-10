# Task: Remove legacy `transactions` and `budget_limits` tables from SQLite

## Context

Majordom is a personal finance assistant. Financial data lives in **Actual Budget** (via `actualpy`).
SQLite (`memory.db`) is for conversational memory only: merchant→category mappings, keywords, CSV profiles.

Two legacy tables violate this rule:
- `transactions` — local copy of transactions; data belongs in Actual Budget
- `budget_limits` — local copy of budget limits; limits belong in Actual Budget

The web backend (`backend/`) does NOT use these tables at all — they were only used by the Telegram bot (`bot/`), which is now in maintenance mode (no new features).

The bot has stale inline imports (`from memory.database import TransactionRecord`) that are already broken because the module moved to `backend.core.memory.database`. These need to be fixed too.

---

## Scope of changes

### 1. `backend/core/memory/database.py`

**Remove entirely:**
- `TransactionRecord` dataclass (lines ~20–33)
- `transactions` table + its 3 indexes from `_init_db`
- `budget_limits` table from `_init_db`
- Methods: `save_transaction`, `get_transactions`, `get_monthly_stats`, `update_transaction_category`, `set_budget_limit`, `get_budget_limits`, `get_budget_limit`

**Keep untouched:**
- `MerchantMapping` dataclass
- `merchant_mappings` table and its methods (`get_merchant_category`, `save_merchant_mapping`)
- `category_keywords` table and its methods (`add_keyword`, `get_all_keywords`)
- `csv_profiles` table and its methods (`save_csv_profile`, `get_csv_profile_by_sig`, `get_all_csv_profiles`)

---

### 2. `bot/handlers.py`

The bot uses `tx_id` (SQLite row ID) in Telegram callback buttons to track pending transactions between OCR and user confirmation. Replace SQLite with an **in-memory dict** keyed by a UUID string.

**Add at module level:**
```python
import uuid
from dataclasses import dataclass, field

@dataclass
class _PendingTx:
    merchant: str
    amount: float
    category_id: str
    date: str
    raw_ocr_text: str = ""
    actual_budget_id: str = ""

_pending: dict[str, _PendingTx] = {}
```

**Replace every `db.save_transaction(record)` with:**
```python
tx_id = uuid.uuid4().hex
_pending[tx_id] = _PendingTx(
    merchant=record_merchant,
    amount=record_amount,
    category_id=prediction.category_id,
    date=record_date,
    raw_ocr_text=record_raw_text,
)
```
(Use the actual field values, not a `TransactionRecord` object — that class is being deleted.)

**In `_handle_confirm_category` and `_handle_set_category`:**
- Replace `db.update_transaction_category(tx_id, category_id)` → delete or no-op (no longer needed)
- Replace `db.get_transactions(limit=...)` loop with `tx = _pending.get(str(tx_id))` (single lookup)
- If `tx` is found: call `categorizer.learn(tx.merchant, category_id, tx.raw_ocr_text)` as before
- If `tx.actual_budget_id` exists: call `actual_client.update_transaction_category(...)` as before
- After processing: `_pending.pop(str(tx_id), None)` to free memory

**In `_do_save_transaction`:**
- After `actual_id = await actual_client.add_transaction(...)`, store it back:
  ```python
  if tx_id in _pending:
      _pending[tx_id].actual_budget_id = actual_id or ""
  ```

**Remove all stale imports:**
- `from memory.database import TransactionRecord` (appears inline in 3 places — delete all)

**`_check_budget_alert` function:**
- Remove the call to `db.get_budget_limit(category_name)` and the entire function body
- Replace with an early return: `async def _check_budget_alert(query, category_name, new_amount): return`
- (Budget limits from SQLite are gone; AB's own budget tracking handles this)

---

### 3. `bot/csv_wizard.py`

- Remove `from memory.database import TransactionRecord` import (line ~34)
- Remove the `record = TransactionRecord(...)` and `tx_id = db.save_transaction(record)` block (lines ~414–422)
- The `actual_budget_id` computed by SHA256 hash was passed to Telegram callback buttons for the CSV confirmation flow. Replace `tx_id` (the SQLite int) with a UUID string stored in `_pending` the same way as `handlers.py`.
- The `tx_id` passed to `transaction_confirm_keyboard()` must become the UUID string key.

---

### 4. `bot/budget_wizard.py`

- Remove `db.get_budget_limits()` call (line ~46) and any logic that depends on it
- Remove `db.set_budget_limit(name, limit)` call (line ~176)
- If the entire `budget_wizard.py` becomes empty/trivial, leave it with a single `pass` or a deprecation comment. Do NOT delete the file (it may be imported elsewhere).

---

## What NOT to change

- `backend/core/memory/categorizer.py` — uses only `merchant_mappings` and `category_keywords`, which are kept
- `backend/api/`, `backend/tools/`, `backend/services/` — these never touch `transactions` or `budget_limits` in SQLite
- `backend/core/actual_client/client.py` — no changes needed
- `backend/core/memory/__init__.py` — only exports `MemoryDB` and `SmartCategorizer`, keep as-is

---

## Verification checklist

After changes:
1. `grep -r "TransactionRecord\|save_transaction\|get_transactions\|get_monthly_stats\|update_transaction_category\|set_budget_limit\|get_budget_limits\|get_budget_limit\|budget_limits" backend/ bot/ --include="*.py"` → should return 0 results (except in this prompt file)
2. `grep -r "from memory.database" bot/ --include="*.py"` → should return 0 results
3. `python -c "from backend.core.memory.database import MemoryDB"` → should import without error
4. `python -c "from backend.core.memory.categorizer import SmartCategorizer"` → should import without error

---

## Files to edit

1. `backend/core/memory/database.py`
2. `bot/handlers.py`
3. `bot/csv_wizard.py`
4. `bot/budget_wizard.py`
