# Task: M4.5.2 — Uncategorized transactions review flow

## Context

Majordom is a self-hosted personal finance assistant (FastAPI + React PWA + Actual Budget).
The evening digest tells the user they have uncategorized transactions (already done).
This task adds the interactive review: user says "review uncategorized transactions" → Majordom
groups them by payee → proposes a category per group via card → creates an AB rule so future
transactions are auto-categorized on import.

## Goal

After implementation:
1. User: "review uncategorized transactions"
2. LLM calls `get_uncategorized_groups` → sees all groups with suggested categories
3. LLM presents the list conversationally, says "Say 'stop' at any time to pause."
4. LLM calls `propose_categorize_with_rule(payee, category_name)` for the first group
5. Card appears: payee, transaction count, editable category select, "Create AB rule" checkbox
6. User confirms → backend applies category to existing transactions + creates AB rule in AB
7. User says "next" → LLM processes next group

## Relevant files

| File | What it contains |
|------|-----------------|
| `backend/core/actual_client/client.py` | AB client. Has `count_uncategorized_by_payee()`, `update_uncategorized_by_payee()`. All sync ops run in executor via `self._run()`. |
| `backend/tools/finance/actual_budget.py` | Tool functions. Has `propose_categorize_by_payee(payee, category_name)` — follow this pattern for the new proposal tool. |
| `backend/tools/registry.py` | `TOOLS` list + `execute_tool()` dispatcher. |
| `backend/api/chat.py` | `_PROPOSAL_TOOLS` set. |
| `backend/api/category_actions.py` | Confirm endpoint. Has `GoalOverride` model and `categorize_by_payee` case — follow this pattern. |
| `backend/tools/category_actions.py` | In-memory store: `store()`, `get()`, `delete()`. No changes needed. |
| `frontend/src/lib/api.ts` | `CategoryActionData` interface + `confirmCategoryAction()`. |
| `frontend/src/components/CategoryActionCard.tsx` | Card renderer. Has `categorize_by_payee` case — follow this pattern. |

## Changes required

### 1. `backend/core/actual_client/client.py`

Add two methods after `count_uncategorized()`.

**`get_uncategorized_groups()`** — groups all uncategorized transactions (no category, no transfer) by payee. For each group return: `payee_id`, `payee_name`, `count`, `rule_prefix` (first word of payee name if ≥4 alphanum chars, else full name), `suggested_category` (name of the most common category this payee has had in AB history, or null), `is_consistent` (False if same payee was categorized differently before). Sort by count desc. Use `sqlalchemy.func.count()` inside the executor sync function (import it there). Follow the exact async-in-executor pattern of existing methods.

**`create_payee_rule(payee_name_prefix, category_id)`** — creates an AB rule inside the executor. This is a write operation — call `actual.commit()` at the end.

### 2. `backend/tools/finance/actual_budget.py`

Add two tool functions at the bottom.

**`get_uncategorized_groups()`** — calls the client method, returns JSON with `type: "uncategorized_groups"`, `groups: [...]`, `total: N`. If no groups, return `type: "info"` message. This is a read-only tool — NOT a proposal tool.

**`propose_categorize_with_rule(payee, category_name)`** — follow `propose_categorize_by_payee` exactly. Add to the stored action and returned JSON: `rule_prefix`, `is_consistent`. Also detect `rule_prefix` the same way as `get_uncategorized_groups`.

### 3. `backend/tools/registry.py`

Add both tool schemas to `TOOLS` and both dispatchers to `execute_tool()`.

`get_uncategorized_groups` — no parameters. Description: use when user wants to review or categorize uncategorized transactions.

`propose_categorize_with_rule` — parameters: `payee` (string), `category_name` (string). Description: propose categorizing a payee group and creating an AB rule for future auto-categorization.

### 4. `backend/api/chat.py`

Add `"propose_categorize_with_rule"` to `_PROPOSAL_TOOLS`. Do NOT add `get_uncategorized_groups` — it is read-only.

### 5. `backend/api/category_actions.py`

Extend `GoalOverride` with `create_rule: bool | None = None`.

Add `categorize_with_rule` case after `categorize_by_payee`. It does two things:
- Calls `update_uncategorized_by_payee()` (already exists in client)
- If `create_rule` is True (or None and `is_consistent` is True from stored action): calls `create_payee_rule()` using `action["rule_prefix"]` and resolved `category_id`
- Return message describes what was done (categorized N transactions + whether rule was created)

### 6. `frontend/src/lib/api.ts`

Extend `CategoryActionData` with: `payee?`, `count?`, `rule_prefix?`, `is_consistent?` fields and add `'categorize_with_rule'` to the `action` union type.

Extend `confirmCategoryAction` override type with `create_rule?: boolean`.

### 7. `frontend/src/components/CategoryActionCard.tsx`

Add `categorize_with_rule` rendering. Follow the `categorize_by_payee` block structure exactly. Show: payee name + count (read-only), category select (editable, init from `data.category_name`), checkbox "Create AB rule for future '{rule_prefix}' transactions" (checked by default if `is_consistent`, disabled with warning text if not). Pass `create_rule` boolean in the confirm override.

## Critical Rules

- **Async/sync**: all AB operations must run in executor. Pattern: `def _sync(): with self._get_actual() as actual: actual.download_budget(); ...; return await self._run(_sync)`.
- **Write ops need commit**: `create_payee_rule` writes → must call `actual.commit()` inside the sync function. `get_uncategorized_groups` is read-only → no commit.
- **`_PROPOSAL_TOOLS`**: `propose_categorize_with_rule` must be listed. `get_uncategorized_groups` must NOT be listed.
- **No financial data in SQLite**: all grouping and history lookup queries go to AB via client.

## Gotchas

1. **`create_rule` Action syntax** — this is NOT obvious and WILL fail with a validation error if wrong:
   ```python
   # CORRECT:
   Action(op='set', field='category', value=category_id)
   # WRONG (raises ValidationError):
   Action(op='set-category', value=category_id)
   ```

2. **Condition field for payee name** — `'description'` means payee UUID, NOT name:
   ```python
   # CORRECT — matches raw bank description string:
   Condition(field='imported_description', op='contains', value=rule_prefix)
   # WRONG — expects a UUID, will reject string values:
   Condition(field='description', op='contains', value=rule_prefix)
   ```

3. **`create_rule` takes `actual.session`**, not `actual`:
   ```python
   create_rule(actual.session, rule)  # correct
   actual.commit()                    # must follow
   ```

4. **Frontend auth**: use `authFetch()` from `../lib/auth` for any direct `fetch()` call. The existing `confirmCategoryAction` already uses `request()` — do not change it.

## Do NOT touch

- `backend/tools/category_actions.py` — in-memory store, no changes
- `backend/core/memory/categorizer.py` or `merchant_mappings` — not used in this flow
- Existing `propose_categorize_by_payee` tool and card rendering

## Done when

- `get_uncategorized_groups` returns groups with payee, count, suggested_category, is_consistent
- `propose_categorize_with_rule` returns a card with all fields including rule_prefix, is_consistent
- Card shows: payee + count, editable category select, rule checkbox (disabled when is_consistent=False)
- Confirm applies category to existing transactions + creates AB rule when checkbox is checked
- When is_consistent=False: transactions categorized, no rule created, message says so
