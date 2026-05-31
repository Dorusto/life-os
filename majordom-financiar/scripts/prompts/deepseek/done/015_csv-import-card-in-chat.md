# Task: CSV import as inline chat card (replaces overlay approach)

## Context

The current implementation opens CSV import as a full-screen overlay (fixed inset-0).
This is wrong UX. Replace it with a `CsvImportCard` that appears inline in the chat
message list — same pattern as `ProposalCard`, `BudgetRebalanceCard`, etc.

The user selects a CSV file from the `+` menu in chat. The preview API is called
immediately (no upload step shown to user). The card appears in chat with the results.

Stack: React + TypeScript + Tailwind. No backend changes needed.

## Files to touch

- `frontend/src/pages/Chat.tsx` — remove overlay, add preview call + card message
- `frontend/src/components/CsvImportCard.tsx` — new component
- `frontend/src/lib/api.ts` — `ImportResult` already has correct types; no changes needed

Do NOT touch `ImportPage.tsx`, `BottomNav.tsx`, or any backend file.

## What to remove from Chat.tsx

Remove the full-screen overlay entirely:
```tsx
// DELETE this block:
{importFile && (
  <div className="fixed inset-0 z-[50] bg-background overflow-y-auto">
    <ImportPage ... />
  </div>
)}
```

Remove the `import ImportPage from './ImportPage'` line.

Keep: `importFile` state, `csvInputRef` ref, the hidden `<input type="file">`, and the
`onChange` handler that sets `importFile`. These are still needed.

## New flow in Chat.tsx

When `importFile` is set (onChange fires), instead of showing the overlay, immediately
call the preview API and append a `csv_import` message to chat:

```tsx
onChange={e => {
  const f = e.target.files?.[0]
  if (!f) return
  e.target.value = ''
  setShowMediaMenu(false)
  handleCsvSelected(f)   // new function
}}
```

New function `handleCsvSelected(file: File)`:
```tsx
async function handleCsvSelected(file: File) {
  // 1. Append a loading placeholder to chat
  setMessages(prev => [...prev, {
    role: 'csv_import' as const,
    content: '',
    csvImport: { status: 'loading' },
  }])

  try {
    const preview = await previewCsvImport(file)
    // 2. Replace loading placeholder with real preview data
    setMessages(prev => {
      const idx = [...prev].reverse().findIndex(m => m.role === 'csv_import')
      if (idx === -1) return prev
      const realIdx = prev.length - 1 - idx
      const updated = [...prev]
      updated[realIdx] = {
        role: 'csv_import' as const,
        content: '',
        csvImport: { status: 'ready', preview },
      }
      return updated
    })
  } catch (err) {
    setMessages(prev => {
      const idx = [...prev].reverse().findIndex(m => m.role === 'csv_import')
      if (idx === -1) return prev
      const realIdx = prev.length - 1 - idx
      const updated = [...prev]
      updated[realIdx] = {
        role: 'csv_import' as const,
        content: '',
        csvImport: { status: 'error', error: err instanceof Error ? err.message : 'Failed to parse CSV' },
      }
      return updated
    })
  }
}
```

Import `previewCsvImport` and `confirmCsvImport` from `../lib/api` (they are already exported).

## Message type changes

Add to the `Message` interface in Chat.tsx:

```ts
role: '...' | 'csv_import'
csvImport?: {
  status: 'loading' | 'ready' | 'error'
  preview?: ImportPreview       // from api.ts
  error?: string
}
```

Import `ImportPreview` from `../lib/api`.

Render in the messages list (same pattern as other cards):
```tsx
} : msg.role === 'csv_import' && msg.csvImport ? (
  <CsvImportCard
    data={msg.csvImport}
    onConfirmed={(message) => {
      setMessages(prev =>
        prev.map((m, i) => i === idx ? { role: 'status' as const, content: message } : m)
      )
    }}
    onCancelled={() => {
      setMessages(prev =>
        prev.map((m, i) => i === idx ? { role: 'status' as const, content: 'Import cancelled.' } : m)
      )
    }}
  />
)
```

## CsvImportCard component

Create `frontend/src/components/CsvImportCard.tsx`.

Props:
```ts
interface CsvImportCardProps {
  data: {
    status: 'loading' | 'ready' | 'error'
    preview?: ImportPreview
    error?: string
  }
  onConfirmed: (message: string) => void
  onCancelled: () => void
}
```

### Loading state
Show a card with a spinner and "Analyzing CSV…" text.

### Error state
Show a card with the error message and a "Dismiss" button that calls `onCancelled()`.

### Ready state

The card shows the import preview inline. Reuse the exact same logic as `ImportPage`
Step 2 (`Step2Preview`) and Step 3 (`Step3Confirm`) — copy the state and handlers,
not the full-page layout.

Card structure (same visual style as `ProposalCard` — `bg-surface border border-border rounded-2xl p-4`):

**Header:** "Import CSV — [source_name] — [N] transactions"

**Account selector:** same dropdown as ImportPage Step 2

**Transaction list:** scrollable, max height `max-h-72 overflow-y-auto`.
Each row: date | merchant | amount | category dropdown.
- Amount: green for income (+), normal for expenses
- Category dropdown: same `abCategories` list
- Auto-propagate category edits to similar merchants (copy `merchantSimilarity` + the
  propagation logic from ImportPage `handleCategoryChange`)
- Transfer candidates: show "Transfer?" badge + Include/Exclude toggle (same as ImportPage)

**Summary row** (below the list):
- X expenses (−€Y) | X income (+€Z) | X duplicates skipped

**Warnings:**
- If uncategorized rows exist: yellow warning "N transactions need a category"

**Buttons:**
- "Cancel" → calls `onCancelled()`
- "Import" → disabled when no account selected OR loading; calls `confirmCsvImport()`

On confirm:
```ts
const result = await confirmCsvImport({
  account_id: accountId,
  rows: rows.filter(r => !r.excluded).map(r => ({ ... })),
})
const parts = [`Imported ${result.imported} transactions.`]
if (result.merged) parts.push(`${result.merged} categories updated.`)
if (result.skipped) parts.push(`${result.skipped} duplicates skipped.`)
onConfirmed(parts.join(' '))
```

## Patterns to follow

- `ImportPreview`, `ImportRow` (frontend type), `confirmCsvImport`, `previewCsvImport`
  are all already in `frontend/src/lib/api.ts` — import from there, do not redefine
- `merchantSimilarity` function is in `ImportPage.tsx` — copy it into `CsvImportCard.tsx`
- Tailwind only, TypeScript strict, no `any`
- Card max-width: `max-w-[520px] w-full` (wider than ProposalCard to fit the table)
- The card is self-contained: it holds its own row/account state, calls the API on confirm
