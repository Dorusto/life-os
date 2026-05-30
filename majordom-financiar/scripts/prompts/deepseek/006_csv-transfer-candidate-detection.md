# Task: CSV internal transfer detection (ING Code=OV)

## Context

Majordom imports bank CSV files. The import flow:
1. Upload CSV → detect profile → normalize rows
2. Preview (Step 2): show transactions with suggested categories
3. Confirm (Step 3): summary
4. Import: save to Actual Budget

**Problem:** ING exports a `Code` column with the transaction type. `Code = "OV"`
(Overschrijving = bank wire transfer) identifies wire transfers. When `Code=OV`
AND `Debit/credit = Credit` (money coming IN), the transaction is almost always
an internal transfer from own account (e.g. from Oranje spaarrekening to current
account). If imported as income, it corrupts budget statistics.

bank2ynab does NOT handle this. There is no API to query from ING NL.

**Goal:** Detect these rows during preview and mark them as "transfer candidates"
— excluded from import by default, with a UI toggle to include if needed.

---

## Files to touch

```
backend/core/csv_importer/profiles.py      ← add 2 fields to CsvProfile + 1 to NormalizedTransaction
backend/core/csv_importer/builtin_profiles.py ← set new fields on ING profiles
backend/core/csv_importer/normalizer.py    ← detection logic in _normalize_row
backend/api/csv_import.py                  ← propagate flag; skip in _do_import
frontend/src/pages/ImportPage.tsx          ← badge + exclude toggle in Step 2
```

Do NOT touch any other files.

---

## Backend changes

### 1. `profiles.py`

Add two optional fields to `CsvProfile`:

```python
@dataclass
class CsvProfile:
    # ... existing fields unchanged ...
    col_transfer_indicator: str = ""    # column that identifies transfer type (e.g. "Code")
    transfer_indicator_value: str = ""  # value meaning bank wire transfer (e.g. "OV")
```

Add one field to `NormalizedTransaction`:

```python
@dataclass
class NormalizedTransaction:
    # ... existing fields unchanged ...
    is_transfer_candidate: bool = False  # True = likely internal transfer, exclude from import
```

### 2. `builtin_profiles.py`

Add these two fields to **all three ING profiles** (semicolon, comma, Dutch):

```python
"col_transfer_indicator": "Code",
"transfer_indicator_value": "OV",
```

No changes to BUNQ or Revolut profiles.

### 3. `normalizer.py` — detection in `_normalize_row`

After computing `is_expense`, add the detection block. The condition:
- Transfer indicator column is configured (`col_transfer_indicator` is set)
- The value in that column matches `transfer_indicator_value` (case-insensitive)
- The transaction is NOT an expense (`is_expense = False`) — money coming IN

Only credit-direction OV transactions are flagged. Debit OV transactions (e.g.
paying rent by bank wire) are regular expenses — do NOT flag them.

```python
# Internal transfer candidate detection
is_transfer_candidate = False
if profile.col_transfer_indicator and profile.transfer_indicator_value:
    indicator_raw = _get_col(row, profile.col_transfer_indicator)  # use the existing case-insensitive helper
    if indicator_raw.lower() == profile.transfer_indicator_value.lower() and not is_expense:
        is_transfer_candidate = True
```

Use the existing `_get_col` case-insensitive helper (added in task 005).
If it does not exist yet, add it (see task 005 spec for reference).

Pass `is_transfer_candidate=is_transfer_candidate` to the returned
`NormalizedTransaction`.

### 4. `csv_import.py`

**`ImportRowPreview`** — add field:

```python
class ImportRowPreview(BaseModel):
    # ... existing fields ...
    is_transfer_candidate: bool = False
```

**Preview endpoint** — propagate from normalized transaction:

```python
preview_rows.append(ImportRowPreview(
    # ... existing fields ...
    is_transfer_candidate=tx.is_transfer_candidate,
))
```

**`ImportRowConfirm`** — add field:

```python
class ImportRowConfirm(BaseModel):
    # ... existing fields ...
    is_transfer_candidate: bool = False
```

**`_do_import`** — skip transfer candidates (backend safety net; frontend already
excludes them, but backend must not trust the client):

In the loop, after the existing duplicate check, add:

```python
# Skip internal transfer candidates — they are not expenses or income
if row.is_transfer_candidate:
    skipped += 1
    continue
```

Add this BEFORE the `create_transaction` call and AFTER the duplicate check.
Transfer candidates that are also duplicates should still be counted as duplicates
(existing logic handles that first).

---

## Frontend changes — `ImportPage.tsx`

### Interface update

```typescript
interface ImportRow {
  // ... existing fields ...
  isTransferCandidate: boolean
  excluded: boolean   // true = user chose to exclude from import
}
```

### Mapping preview response

In `handlePreview`, when building the `ImportRow` array:

```typescript
setRows(preview.rows.map(r => ({
  // ... existing fields ...
  isTransferCandidate: r.is_transfer_candidate ?? false,
  excluded: r.is_transfer_candidate ?? false,  // excluded by default if transfer candidate
})))
```

### Active rows filtering

Update `activeRows` to also exclude rows where `excluded = true`:

```typescript
const activeRows = rows.filter(r => !r.duplicate && !r.excluded)
```

Keep `duplicateCount` counting only `r.duplicate` (not excluded).
Add a new count:

```typescript
const transferCandidateCount = rows.filter(r => r.isTransferCandidate).length
```

### Toggle handler

Add a handler alongside `handleCategoryChange`:

```typescript
function handleToggleExclude(id: string) {
  setRows(prev => prev.map(r => r.id === id ? { ...r, excluded: !r.excluded } : r))
}
```

Pass it down to `Step2Preview`.

### Step 2 — preview row styling

In the table row for a transfer candidate, add a blue "Transfer?" badge next to
the merchant name, and a toggle button to include/exclude.

The row should render like this when `isTransferCandidate = true`:

```
| MM-DD | Oranje spaarrekening W429…  [Transfer?] | +€150.00 | [excluded — Include?] |
```

Specific requirements:
- Blue badge `Transfer?` next to the merchant name (similar to how `AlertCircle`
  is used for duplicates, but use a different icon — e.g. `ArrowLeftRight` from
  lucide-react, or just a text badge with `bg-blue-500/10 text-blue-400 border
  border-blue-500/30 text-xs px-1 rounded`)
- The category cell shows "Excluded" text in muted style when `excluded = true`,
  instead of the category dropdown
- A small toggle button or link "Include" / "Exclude" below the merchant name or
  in the category cell so the user can override
- The row is visually dimmed (`opacity-50`) when excluded, similar to duplicates

Do NOT hide excluded rows — user must see them and understand why they are flagged.

### Step 2 — summary stats update

`totalIncome` should exclude rows where `excluded = true`. Transfer candidates
that are excluded should not appear in the income total.

### Step 3 — confirm summary

Add a summary row for transfer candidates when `transferCandidateCount > 0`:

```
Likely transfers excluded    3
```

Use `SummaryRow` with `muted` prop. Place it after "Duplicates skipped".

### Sending to backend

In `handleImport`, filter out excluded rows:

```typescript
rows: rows.filter(r => !r.excluded).map(r => ({
  // ... existing fields ...
  is_transfer_candidate: r.isTransferCandidate,
}))
```

---

## Architecture rules (mandatory)

- `settings` always from `from backend.core.config import settings` — never `os.getenv`
- Do not store financial data in SQLite
- Do not create new SQLite tables
- No new Python dependencies

---

## How to test

1. Upload an ING CSV that contains a transfer from Oranje spaarrekening (Code=OV,
   Debit/credit=Credit). Verify in Step 2:
   - The row shows the blue "Transfer?" badge
   - The row is dimmed and category cell shows "Excluded"
   - The "Include" toggle works — clicking it un-dims the row and shows the category dropdown
   - Step 3 summary shows "Likely transfers excluded: 1"

2. Upload an ING CSV with a bank wire expense (Code=OV, Debit/credit=Debit) —
   paying rent or sending money. Verify it does NOT get the Transfer? badge —
   it should appear as a normal expense row.

3. Upload a Revolut CSV — verify no transfer detection happens (Revolut profile
   has no `col_transfer_indicator`).

4. Confirm import with a transfer candidate included (use the "Include" toggle).
   Verify it is imported as income in Actual Budget.

5. Confirm import with a transfer candidate excluded (default). Verify it is NOT
   in Actual Budget after import.
