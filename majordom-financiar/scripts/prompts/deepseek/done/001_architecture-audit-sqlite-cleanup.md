# Task: Architecture audit — remove dead code from SmartCategorizer and mark legacy SQLite tables

## Context

Majordom is a personal finance PWA. The backend is FastAPI (Python 3.11). Financial data lives in Actual Budget (self-hosted). SQLite is used only for conversational memory: merchant→category mappings, CSV import profiles, and category keywords.

Two files to modify:
- `backend/core/memory/database.py` — SQLite interface
- `backend/core/memory/categorizer.py` — SmartCategorizer

## Problem

`SmartCategorizer` has three categorization levels:
1. HISTORY — merchant_mappings (SQLite) ← correct, keep
2. KEYWORDS — category_keywords (SQLite) ← correct, keep
3. TF-IDF — reads from `transactions` table (SQLite) ← WRONG, remove

The `transactions` table in SQLite is a legacy local copy of financial transactions. The web backend never writes to it (`save_transaction()` is never called from any web flow). The table is always empty in web flows, so `_tfidf_match()` never produces a result — it is dead code that violates the architectural principle (financial data belongs in Actual Budget, not SQLite).

Additionally, `database.py` contains a `budget_limits` table and related methods. This table is also a legacy violation — budget limits belong in Actual Budget. It is still used by the Telegram bot (maintenance mode) but should be clearly marked.

## What to change

### `backend/core/memory/categorizer.py`

1. Remove the `_tfidf_match()` method entirely.
2. Remove the call to `_tfidf_match()` from `predict()` (the "Level 3: TF-IDF" block).
3. Remove the import of `math` (only used by TF-IDF).
4. Update the class docstring to reflect two levels: HISTORY and KEYWORDS only.
5. The `learn()` method calls `self.db.add_keyword()` — keep this, it is correct.

Do NOT remove anything else. `predict()`, `learn()`, `_match_keywords()`, `_tokenize()` must remain unchanged.

### `backend/core/memory/database.py`

Add a prominent comment above the `transactions` table schema in `_init_db()`:

```python
# LEGACY — local copy of transactions; violates architectural principle.
# Financial data belongs in Actual Budget, not SQLite.
# Used only by the Telegram bot (maintenance mode).
# To be removed when the Telegram bot is retired.
```

Add the same comment above the `budget_limits` table schema:

```python
# LEGACY — local copy of budget limits; violates architectural principle.
# Budget limits belong in Actual Budget.
# Used only by the Telegram bot (maintenance mode).
# To be removed when the Telegram bot is retired.
```

Do NOT remove the tables or any methods from database.py — the Telegram bot still uses them and must not break.

## What NOT to change

- Do not touch `merchant_mappings` — this is the correct use of SQLite
- Do not touch `category_keywords` — correct use of SQLite
- Do not touch `csv_profiles` — correct use of SQLite
- Do not touch `bot/handlers.py` or any Telegram bot file
- Do not touch any file in `backend/api/` or `backend/services/`
- Do not change function signatures or the public API of `SmartCategorizer`

## Expected result

After the change:
- `SmartCategorizer.predict()` has two levels: HISTORY (merchant_mappings) and KEYWORDS. Falls back to "other" if neither matches.
- `categorizer.py` does not import `math` or reference `get_transactions`.
- `database.py` has legacy tables clearly marked with comments.
- All existing tests (if any) pass.
- The Telegram bot continues to work unchanged.

## Files to modify

1. `backend/core/memory/categorizer.py`
2. `backend/core/memory/database.py`

## Verification

After making the change, confirm:
- `from backend.core.memory import SmartCategorizer` imports without error
- `categorizer.predict(merchant="test")` returns a `CategoryPrediction` without touching the `transactions` table
- `grep -n "_tfidf_match\|import math" backend/core/memory/categorizer.py` returns no results
