# Task: LLM category suggestions for CSV import

## Context

Majordom imports bank CSV files. During preview (Step 2), each transaction gets
a category from `SmartCategorizer` — but only if that merchant was previously
confirmed by the user. New merchants (first import, unknown payees) show
`"— no category —"` and require manual selection.

**Goal:** For rows with no confirmed category, ask the LLM to suggest the best
matching AB category based on the merchant name. The LLM already knows that
"Albert Heijn" = supermarket, "NS" = transport, "Vattenfall" = utilities —
even if the user never confirmed those merchants before.

One batch call per preview (not one per row). If LLM fails, preview works
normally without suggestions — never block the import.

---

## File to touch

Only one file:

```
backend/api/csv_import.py
```

Do NOT touch normalizer, profiles, database, or frontend.

---

## What to add

### 1. New async helper function

Add this function **above** the `preview_csv` route:

```python
async def _suggest_categories_llm(
    merchants: list[str],
    ab_categories: list[str],
    ollama_url: str,
    model: str,
) -> dict[str, str]:
    """
    One batch Ollama call: list of merchant names → {merchant: AB category name}.

    Returns only entries where the suggested category exists in ab_categories.
    Returns empty dict on any error — caller falls back to no suggestion.
    """
```

Implementation details:

- **Deduplicate merchants before sending** — if the same merchant appears multiple
  times in the CSV, send it only once. Map the result back to all rows with that
  merchant.

- **Prompt** (keep it concise):

```
You are a personal finance assistant. Assign each merchant to the most appropriate
budget category from the list below. Return ONLY a JSON object: {"merchant": "category"}.
Use null if no category fits. Do not explain.

Categories: {comma-separated list of ab_categories}

Merchants:
- Merchant Name 1
- Merchant Name 2
...
```

- **Ollama request:**
  - POST `{ollama_url}/api/chat`
  - `model`: the model parameter
  - `stream: false`
  - `think: false` — required for qwen3, prevents thinking mode from blocking
  - `format: "json"` — forces structured JSON output

- **Parse the response:**
  - Extract `response["message"]["content"]`
  - `json.loads()` it
  - Filter: keep only entries where the value is a string AND exists in `ab_categories`
  - Return the filtered dict

- **On any exception** (network, JSON parse, timeout): log a warning, return `{}`

- Use `aiohttp.ClientSession` with `timeout=aiohttp.ClientTimeout(total=60)`
- `aiohttp` is already in requirements — do NOT add new dependencies

### 2. Call the helper in `preview_csv`

The current flow builds `preview_rows` in a loop. After that loop, for rows that
have no category yet, call `_suggest_categories_llm` and fill in the suggestion.

**Insert this block AFTER the `preview_rows` loop and BEFORE the `dup_count` log line:**

```python
# LLM category suggestions for rows with no confirmed category
uncategorized_merchants = list({
    r.merchant
    for r in preview_rows
    if not r.category_name and not r.duplicate and not r.is_transfer_candidate
})
if uncategorized_merchants:
    llm_suggestions = await _suggest_categories_llm(
        merchants=uncategorized_merchants,
        ab_categories=ab_categories,
        ollama_url=settings.ollama.url,
        model=settings.ollama.chat_model,
    )
    if llm_suggestions:
        # Apply suggestions — create new objects (Pydantic models are immutable)
        updated = []
        for r in preview_rows:
            suggested = llm_suggestions.get(r.merchant)
            if suggested and not r.category_name and not r.duplicate:
                r = r.model_copy(update={"category_name": suggested, "category_confirmed": False})
            updated.append(r)
        preview_rows = updated
```

Notes:
- `category_confirmed=False` — LLM suggestions are NOT auto-confirmed; user must verify
- Skip duplicates and transfer candidates — no point suggesting a category for rows that won't be imported
- Use a set comprehension to deduplicate merchants before the call
- `r.model_copy(update={...})` is the Pydantic v2 way to create a modified copy

---

## Architecture rules (mandatory)

- `settings` always from `from backend.core.config import settings` — never `os.getenv`
- Ollama calls must use `aiohttp` (already imported) — never blocking
- `"think": false` in every Ollama payload
- Do not store financial data in SQLite
- Do not create new SQLite tables
- No new dependencies

---

## How to test

1. Import a CSV with merchants that SmartCategorizer does not know (first-time
   import, no confirmed history). Verify that in Step 2, those rows have a
   pre-selected category in the dropdown (marked with `?` — not confirmed).

2. Verify known merchants (from SmartCategorizer history) are NOT sent to LLM —
   they already have `category_confirmed=True`.

3. Shut down Ollama and import again — verify the preview still works, just
   without LLM suggestions (rows show `"— no category —"`).

4. Confirm import — verify that LLM-suggested categories are saved to Actual
   Budget and that `SmartCategorizer.learn()` is called so the next import
   remembers them without LLM.
