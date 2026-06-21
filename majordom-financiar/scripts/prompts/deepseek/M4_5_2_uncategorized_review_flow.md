# Task: M4.5.2 — Uncategorized transactions review flow

## Context

Majordom is a self-hosted personal finance assistant (FastAPI backend + React PWA).
The evening digest already tells the user they have uncategorized transactions (M4.5.1, done).
M4.5.2 adds the interactive review: the user says "review uncategorized transactions",
Majordom groups them by payee, proposes a category per group via a confirmation card, and
creates an AB rule so future transactions are auto-categorized on import.

## Goal

After implementation, this flow works end-to-end:
1. User: "review uncategorized transactions"
2. LLM calls `get_uncategorized_groups` → sees groups with suggested categories
3. LLM presents the groups conversationally and says "Say 'stop' at any time to pause."
4. LLM calls `propose_categorize_with_rule(payee, category_name)` for the first group
5. A card appears: payee name, transaction count, editable category, "Create AB rule" checkbox
6. User confirms → backend categorizes existing transactions + creates AB rule
7. User says "next" → LLM proceeds with the next group

---

## Relevant files

| File | What it contains now |
|------|---------------------|
| `backend/core/actual_client/client.py` | AB client wrapper. Has `count_uncategorized()`, `count_uncategorized_by_payee()`, `update_uncategorized_by_payee()`. All sync ops run in executor via `self._run()`. |
| `backend/tools/finance/actual_budget.py` | Tool functions. Has `propose_categorize_by_payee(payee, category_name)` — follow this pattern exactly. |
| `backend/tools/registry.py` | `TOOLS` list + `execute_tool()` dispatcher. |
| `backend/api/chat.py` | `_PROPOSAL_TOOLS` set — controls which tool results go to frontend as cards. |
| `backend/api/category_actions.py` | Confirm/cancel endpoints for category actions. Has `categorize_by_payee` case in `confirm_category_action`. Has `GoalOverride` Pydantic model. |
| `backend/tools/category_actions.py` | In-memory store for pending actions: `store()`, `get()`, `delete()`. |
| `frontend/src/lib/api.ts` | `CategoryActionData` interface + `confirmCategoryAction()`. |
| `frontend/src/components/CategoryActionCard.tsx` | Renders all category action cards. Has `categorize_by_payee` case — follow this pattern. |

---

## Changes required

### 1. `backend/core/actual_client/client.py`

Add three methods. Place them after `count_uncategorized()` (around line 1395).

**a) `get_uncategorized_groups()`**

Returns all uncategorized transactions grouped by payee, with a suggested category from AB
history and a flag indicating whether the payee has been categorized consistently before.

```python
async def get_uncategorized_groups(self) -> list[dict]:
    """
    Group uncategorized transactions by payee. For each group:
    - payee_name: str
    - payee_id: str (AB UUID)
    - count: int
    - rule_prefix: str  — first word of payee name if >=4 alphanum chars, else full payee name
    - suggested_category: str | None  — from AB history
    - is_consistent: bool  — False if same payee was categorized differently before
    """
    def _fetch():
        from actual.database import Transactions, Payees, Categories
        with self._get_actual() as actual:
            actual.download_budget()
            rows = (
                actual.session.query(
                    Payees.id.label("payee_id"),
                    Payees.name.label("payee_name"),
                    func.count(Transactions.id).label("count"),
                )
                .join(Transactions, Transactions.payee_id == Payees.id)
                .filter(
                    Transactions.category_id == None,
                    Transactions.tombstone == 0,
                    Transactions.is_parent == 0,
                    Transactions.transferred_id == None,
                )
                .group_by(Payees.id, Payees.name)
                .order_by(func.count(Transactions.id).desc())
                .all()
            )

            groups = []
            for row in rows:
                # Rule prefix: first word if >=4 alphanum chars, else full name
                first_word = row.payee_name.split()[0] if row.payee_name else ""
                rule_prefix = (
                    first_word
                    if len(first_word) >= 4 and first_word.isalnum()
                    else row.payee_name
                )

                # Suggested category from AB history (same payee, already categorized)
                history = (
                    actual.session.query(Transactions.category_id)
                    .filter(
                        Transactions.payee_id == row.payee_id,
                        Transactions.category_id != None,
                        Transactions.tombstone == 0,
                    )
                    .all()
                )
                cat_ids = [h.category_id for h in history]
                unique_cats = set(cat_ids)

                suggested_category = None
                is_consistent = True

                if unique_cats:
                    is_consistent = len(unique_cats) == 1
                    # Most common category
                    most_common_id = max(set(cat_ids), key=cat_ids.count)
                    cat = actual.session.query(Categories).filter(
                        Categories.id == most_common_id,
                        Categories.tombstone == 0,
                    ).first()
                    if cat:
                        suggested_category = cat.name

                groups.append({
                    "payee_id": str(row.payee_id),
                    "payee_name": row.payee_name or "Unknown",
                    "count": row.count,
                    "rule_prefix": rule_prefix,
                    "suggested_category": suggested_category,
                    "is_consistent": is_consistent,
                })
            return groups

    from sqlalchemy import func
    return await self._run(_fetch)
```

**b) `create_payee_rule(payee_name_prefix, category_id)`**

Creates an AB rule: "if imported_description contains PREFIX → set category".

```python
async def create_payee_rule(self, payee_name_prefix: str, category_id: str) -> None:
    """Create an AB rule: imported_description contains prefix → set category."""
    def _create():
        from actual.rules import Rule, Condition, Action
        from actual.queries import create_rule
        with self._get_actual() as actual:
            actual.download_budget()
            rule = Rule(
                conditions=[
                    Condition(
                        field="imported_description",
                        op="contains",
                        value=payee_name_prefix,
                    )
                ],
                operation="and",
                actions=[
                    Action(op="set", field="category", value=category_id)
                ],
            )
            create_rule(actual.session, rule)
            actual.commit()
    await self._run(_create)
```

---

### 2. `backend/tools/finance/actual_budget.py`

Add two tool functions at the bottom of the file.

**a) `get_uncategorized_groups()`** — read-only, returns JSON for LLM:

```python
async def get_uncategorized_groups() -> str:
    """
    Return all uncategorized transaction groups for LLM to present to the user.
    Each group has payee, count, suggested category, and consistency flag.
    NOT a proposal tool — LLM uses this to list groups conversationally.
    """
    client = _get_client()
    groups = await client.get_uncategorized_groups()

    if not groups:
        return json.dumps({"type": "info", "message": "No uncategorized transactions found."})

    return json.dumps({
        "type": "uncategorized_groups",
        "groups": groups,
        "total": sum(g["count"] for g in groups),
    })
```

**b) `propose_categorize_with_rule(payee, category_name)`** — proposal tool, returns card:

Follow the exact pattern of `propose_categorize_by_payee` (already in this file).
Add `rule_prefix` and `is_consistent` to the stored action and the returned JSON.

```python
async def propose_categorize_with_rule(payee: str, category_name: str) -> str:
    """
    Propose categorizing all uncategorized transactions for a payee AND creating an AB rule.
    Returns a confirmation card. Does NOT write to AB yet.
    """
    import uuid
    from difflib import get_close_matches
    from backend.tools import category_actions as action_store

    client = _get_client()
    cats = await client.get_categories()
    cat_names = [c.name for c in cats]

    exact = next((c for c in cats if c.name.lower() == category_name.lower()), None)
    if not exact:
        close = get_close_matches(category_name, cat_names, n=1, cutoff=0.6)
        if close:
            exact = next((c for c in cats if c.name == close[0]), None)
    if not exact:
        return json.dumps({
            "type": "error",
            "message": f"Category not found: {category_name!r}. Available: {', '.join(cat_names)}",
        })

    count = await client.count_uncategorized_by_payee(payee)
    if count == 0:
        return json.dumps({
            "type": "error",
            "message": f"No uncategorized transactions found for payee matching '{payee}'.",
        })

    # Detect rule prefix
    first_word = payee.split()[0] if payee else ""
    rule_prefix = (
        first_word
        if len(first_word) >= 4 and first_word.isalnum()
        else payee
    )

    # Check consistency (has payee been categorized differently before?)
    groups = await client.get_uncategorized_groups()
    group = next((g for g in groups if g["payee_name"].lower() == payee.lower()), None)
    is_consistent = group["is_consistent"] if group else True

    categories_map = {c.id: c.name for c in cats}
    available_categories = [c.name for c in cats]

    action_id = uuid.uuid4().hex[:8]
    action_store.store(action_id, {
        "action": "categorize_with_rule",
        "payee": payee,
        "category_id": exact.id,
        "category_name": exact.name,
        "count": count,
        "rule_prefix": rule_prefix,
        "is_consistent": is_consistent,
        "categories_map": categories_map,
    })

    return json.dumps({
        "type": "category_action",
        "id": action_id,
        "action": "categorize_with_rule",
        "payee": payee,
        "category_name": exact.name,
        "count": count,
        "rule_prefix": rule_prefix,
        "is_consistent": is_consistent,
        "available_categories": available_categories,
    })
```

---

### 3. `backend/tools/registry.py`

**a) Add to `TOOLS` list** (after existing category tools):

```python
{
    "type": "function",
    "function": {
        "name": "get_uncategorized_groups",
        "description": "Get all uncategorized transaction groups from Actual Budget, with suggested categories based on past history. Use this when the user wants to review or categorize uncategorized transactions. Returns a list of payee groups with counts and category suggestions.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
},
{
    "type": "function",
    "function": {
        "name": "propose_categorize_with_rule",
        "description": "Propose categorizing all uncategorized transactions for a specific payee AND creating an AB auto-categorization rule for future transactions. Shows a confirmation card. Use after get_uncategorized_groups to process one group at a time.",
        "parameters": {
            "type": "object",
            "properties": {
                "payee": {"type": "string", "description": "Exact payee name as returned by get_uncategorized_groups."},
                "category_name": {"type": "string", "description": "Category name to assign. Use the suggested_category if available, otherwise ask the user."},
            },
            "required": ["payee", "category_name"],
        },
    },
},
```

**b) Add to `execute_tool()`**:

```python
elif name == "get_uncategorized_groups":
    return await finance.get_uncategorized_groups()
elif name == "propose_categorize_with_rule":
    return await finance.propose_categorize_with_rule(**args)
```

---

### 4. `backend/api/chat.py`

Add `"propose_categorize_with_rule"` to `_PROPOSAL_TOOLS`. Do NOT add `"get_uncategorized_groups"` — it is read-only, result goes to LLM as context.

---

### 5. `backend/api/category_actions.py`

**a) Extend `GoalOverride`** — add `create_rule: bool | None = None`:

```python
class GoalOverride(BaseModel):
    target: float | None = None
    deadline: str | None = None
    category_name: str | None = None
    group_name: str | None = None
    amount: float | None = None
    payee: str | None = None
    create_rule: bool | None = None   # ← add this
```

**b) Add `categorize_with_rule` case** in `confirm_category_action`, after the `categorize_by_payee` case:

```python
elif action["action"] == "categorize_with_rule":
    payee = override.payee or action["payee"]
    cat_id = action["category_id"]
    cat_name = action["category_name"]
    if override.category_name and override.category_name != action["category_name"]:
        id_by_name = {v: k for k, v in action.get("categories_map", {}).items()}
        cat_id = id_by_name.get(override.category_name, cat_id)
        cat_name = override.category_name

    count = await client.update_uncategorized_by_payee(payee=payee, category_id=cat_id)

    should_create_rule = (
        override.create_rule
        if override.create_rule is not None
        else action.get("is_consistent", True)
    )
    if should_create_rule:
        await client.create_payee_rule(
            payee_name_prefix=action["rule_prefix"],
            category_id=cat_id,
        )
        message = (
            f"Categorized {count} transaction(s) for '{payee}' → '{cat_name}'. "
            f"AB rule created: '{action['rule_prefix']}' → '{cat_name}'."
        )
    else:
        message = (
            f"Categorized {count} transaction(s) for '{payee}' → '{cat_name}'. "
            f"No rule created (payee has inconsistent category history)."
        )
```

---

### 6. `frontend/src/lib/api.ts`

**a) Extend `CategoryActionData`**:

```ts
export interface CategoryActionData {
  id: string
  action: 'rename' | 'delete' | 'create' | 'setup_groups' | 'set_budget' | 'categorize_by_payee' | 'categorize_with_rule'
  category_name: string
  // ... existing fields ...
  // categorize_with_rule fields:
  payee?: string
  count?: number
  rule_prefix?: string
  is_consistent?: boolean
}
```

**b) Extend `confirmCategoryAction` override type**:

```ts
export async function confirmCategoryAction(
  id: string,
  override?: {
    // ... existing fields ...
    payee?: string
    create_rule?: boolean
  }
): Promise<{ message: string }> {
  // body unchanged
}
```

---

### 7. `frontend/src/components/CategoryActionCard.tsx`

Add `categorize_with_rule` rendering. Follow the exact structure of the existing `categorize_by_payee` block.

State additions:

```tsx
const [createRule, setCreateRule] = useState<boolean>(
  data.action === 'categorize_with_rule' ? (data.is_consistent ?? true) : false
)
```

Override in `handleConfirm`:

```tsx
const overrides =
  data.action === 'categorize_by_payee'
    ? { payee: payeeName || data.payee, category_name: categoryName || data.category_name }
    : data.action === 'categorize_with_rule'
    ? { payee: data.payee, category_name: categoryName || data.category_name, create_rule: createRule }
    : // ... rest unchanged
```

`isWithRule` flag:

```tsx
const isWithRule = data.action === 'categorize_with_rule'
```

Render block (add after `isCategorizeByPayee` block):

```tsx
{isWithRule && (
  <div className="space-y-3">
    <p className="text-muted text-sm">
      <span className="text-white">{data.payee}</span>
      <span className="text-muted"> · {data.count} transaction{(data.count ?? 0) > 1 ? 's' : ''}</span>
    </p>
    <div className="space-y-1">
      <p className="text-muted text-xs">Category</p>
      <select
        value={categoryName}
        onChange={e => setCategoryName(e.target.value)}
        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-accent"
      >
        {(data.available_categories ?? []).map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={createRule}
        onChange={e => setCreateRule(e.target.checked)}
        className="accent-accent"
        disabled={!data.is_consistent}
      />
      <span className="text-sm text-muted">
        Create AB rule: future "{data.rule_prefix}" transactions → auto-categorized
        {!data.is_consistent && <span className="text-yellow-400 ml-1">(disabled — inconsistent history)</span>}
      </span>
    </label>
  </div>
)}
```

Title and confirm button label (add `isWithRule` alongside `isCategorizeByPayee`):

```tsx
{isWithRule ? 'Categorize + rule?' : /* existing titles */ ...}
{isWithRule ? 'Confirm' : /* existing labels */ ...}
```

---

## Critical Rules

- **Rule 1** (architecture.md#async-vs-sync): All AB operations run sync inside executor. Pattern: `def _fetch(): with self._get_actual() as actual: actual.download_budget(); ...; return await self._run(_fetch)`. Never call actualpy directly in an async function.
- **Rule 2** (architecture.md#actualpy-operation-order): `download_budget()` always first. `commit()` only for write operations (`create_payee_rule` writes — must call `actual.commit()`). Read-only methods (`get_uncategorized_groups`) do NOT call `commit()`.
- **Rule 3** (architecture.md#confirmation-card): `propose_categorize_with_rule` is a write tool → must be in `_PROPOSAL_TOOLS`. `get_uncategorized_groups` is read-only → must NOT be in `_PROPOSAL_TOOLS`.
- **Rule 4** (decisions.md#no-financial-data-in-sqlite): No financial data in SQLite. All grouping and history lookup happens in AB via the client, not via merchant_mappings.

---

## Gotchas

1. **`create_rule` syntax** — this is NOT obvious and will break silently if wrong:
   - `field='description'` = payee UUID (ID match) — NOT what we want
   - `field='imported_description'` = raw bank payee name string — USE THIS for prefix matching
   - Action op is `'set'` with `field='category'`, NOT `'set-category'`:
     ```python
     Action(op='set', field='category', value=category_id_string)
     ```
   - `create_rule(actual.session, rule)` — takes the session object, not `actual` itself
   - `actual.commit()` must be called after `create_rule()` to persist

2. **`get_uncategorized_groups` needs `sqlalchemy.func`** for `func.count()`. Import it inside the sync function to avoid issues:
   ```python
   from sqlalchemy import func
   ```

3. **`update_uncategorized_by_payee` ilike join may fail** on some AB versions — client already has this implemented with its own fallback (W22 session). Do not re-implement; call the existing method.

4. **Frontend auth**: any `fetch()` call that does NOT go through `request()` from `api.ts` must use `authFetch()` from `../lib/auth` — NOT `localStorage.getItem('auth_token')`. The real key is `'majordom_token'`. The existing `confirmCategoryAction` already uses `request()` — do not change it.

5. **`categoryName` state init for `categorize_with_rule`**: init from `data.category_name` (the suggested category), same as `categorize_by_payee`:
   ```tsx
   const [categoryName, setCategoryName] = useState<string>(
     ['categorize_by_payee', 'categorize_with_rule'].includes(data.action)
       ? (data.category_name ?? '')
       : ''
   )
   ```

6. **`propose_categorize_with_rule` calls `get_uncategorized_groups` internally** to check `is_consistent`. This means two AB sessions are opened sequentially — that's fine, each is short-lived. Do not try to merge them into one.

---

## Do NOT touch

- `backend/tools/category_actions.py` — in-memory store, no changes needed
- `backend/core/memory/categorizer.py` or `merchant_mappings` — not used in this flow
- `backend/api/category_actions.py` cancel endpoint — unchanged
- Existing `categorize_by_payee` tool and card — do not modify, only add alongside

---

## Done when

- `get_uncategorized_groups` returns JSON with groups, counts, suggested categories
- `propose_categorize_with_rule` returns a card JSON with all required fields
- Card renders in frontend: payee name, count, editable category select, rule checkbox
- Rule checkbox is disabled (but visible) when `is_consistent=false`
- Confirming card: categorizes existing transactions AND creates AB rule (when checkbox checked)
- Confirming card when `is_consistent=false`: categorizes transactions, no rule created, message says so
- `get_uncategorized_groups` does NOT appear in `_PROPOSAL_TOOLS`
- `propose_categorize_with_rule` appears in `_PROPOSAL_TOOLS`
