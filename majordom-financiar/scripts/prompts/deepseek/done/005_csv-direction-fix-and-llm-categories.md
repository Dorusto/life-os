# Task: Fix CSV direction parsing + add LLM category suggestions

## Context

Majordom imports bank CSV files (ING and others). The import flow:
1. Upload CSV → detect profile (Ollama or cached from SQLite)
2. Preview: show transactions with suggested categories
3. Confirm: save to Actual Budget

Two bugs/features to fix in this task.

---

## Bug 1 — All CSV transactions import as income (positive amounts)

### Symptoms

After upload, all transactions show as `+€X.XX` regardless of whether they are
debits or credits. Expenses like utility bills appear as income.

### Root cause to investigate

`backend/core/csv_importer/normalizer.py` → `_normalize_row()`:

```python
direction_val = (row.get(profile.col_direction) or "").strip()
is_expense = direction_val.lower() == profile.expense_indicator.lower()
```

`row.get(col_name)` is **case-sensitive**. The saved profile may have
`col_direction = "Debit/credit"` (lowercase c) while the actual CSV header is
`"Debit/Credit"` (uppercase C). The lookup returns `None` → `direction_val = ""`
→ `is_expense = False` → all transactions treated as income.

### What to fix

Add a case-insensitive column lookup helper and use it consistently in
`_normalize_row()` for all column reads (`col_date`, `col_merchant`, `col_amount`,
`col_direction`, `col_currency`, `col_description`).

Do NOT change the CsvProfile dataclass or the SQLite schema.

### Files to touch

- `backend/core/csv_importer/normalizer.py` — add helper, use in `_normalize_row`

---

## Feature — LLM category suggestions for uncategorized CSV rows

### Current behavior

During CSV import preview (Step 2), each transaction shows either:
- A confirmed category (from `SmartCategorizer` merchant history)
- `"— no category —"` for unknown merchants

The LLM is NOT used for category suggestions during CSV import.

### Desired behavior

For rows with no confirmed category, call the chat LLM (Ollama) to suggest a
category based on the merchant name. The suggestion should be:
- Non-blocking: fetch all suggestions in a single batch call, not one per row
- Shown as a pre-selected dropdown value in the preview (same UI as confirmed categories)
- Visually distinct from confirmed categories (e.g. a different indicator — check
  how confirmed vs unconfirmed are currently displayed in the preview response)
- Not auto-accepted: user can change the suggestion before confirming

### How to call the LLM

Use the existing Ollama chat endpoint. The LLM already knows the available AB
categories — they are fetched in the import flow. Pass the merchant names +
available category list in a single prompt, get back a JSON mapping
`{merchant: category_name}`.

Use `settings.ollama.chat_model` and `settings.ollama.url` (same as chat).
Set `"think": false` in the payload (required for qwen3).

### Files to touch

- `backend/api/csv_import.py` — add batch LLM call after SmartCategorizer, before
  building the preview response. Fill `suggested_category` for rows where
  `category_confirmed=False` and `ab_category_name` is empty.
- `backend/core/csv_importer/` — if you add a helper, put it here.

Do NOT touch the frontend. The preview response already has a category field per
row — just populate it for more rows.

---

## Architecture rules (mandatory)

- `settings` always from `from backend.core.config import settings` — never `os.getenv`
- Ollama calls must be async (`aiohttp` or `httpx`) — never blocking in async context
- `"think": false` in every Ollama payload (qwen3 requirement)
- Do not store financial data in SQLite
- Do not create new SQLite tables

## How to test

1. Upload an ING comma CSV with known debits — verify amounts are negative in preview
2. Upload CSV with merchants not in history — verify LLM suggests plausible categories
3. Re-import same CSV — verify dedup still works (no duplicates in Actual Budget)
