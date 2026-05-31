# Task: CSV import as chat overlay (no separate Import tab)

## Context

React PWA (Vite + TypeScript + Tailwind). The app has a chat page (`Chat.tsx`) with a `+` media
menu in the input bar. Until now, "Upload CSV" in that menu called `navigate('/import')`.
The Import tab has already been removed from `BottomNav.tsx`. The task is to make CSV import
happen inside the chat — without leaving the chat page.

No backend changes needed. All existing API calls stay the same.

## Files to touch

- `frontend/src/pages/ImportPage.tsx`
- `frontend/src/pages/Chat.tsx`

Do NOT touch `BottomNav.tsx`, `App.tsx`, or any backend file.

## What to implement

### 1. `ImportPage.tsx` — add overlay mode

Add optional props to the default export:

```ts
interface ImportPageProps {
  initialFile?: File   // if provided, skip Step 1 and auto-start preview
  onDone?: (result: ImportResult) => void  // called instead of navigate('/') on Step 4
}
```

When `initialFile` is provided:
- Set `file` state to `initialFile` on mount (useEffect, runs once)
- Immediately call `handlePreview()` — skip Step 1 entirely, user lands on Step 2
- Step 1 upload UI is never shown in this mode

When `onDone` is provided:
- In `Step4Done`, "Back to Home" button calls `onDone(importResult)` instead of `navigate('/')`
- Pass `onDone` down to `Step4Done` as a prop

`handlePreview` currently reads from the `file` state variable. Since `useEffect` sets state
asynchronously, call `handlePreview` with an explicit file argument:

```ts
async function handlePreview(fileArg?: File) {
  const f = fileArg ?? file
  if (!f) return
  // ... rest unchanged, use f instead of file
}
```

In the useEffect:
```ts
useEffect(() => {
  if (initialFile) {
    setFile(initialFile)
    handlePreview(initialFile)
  }
}, [])
```

When used as standalone page (no props), behaviour is identical to today.

### 2. `Chat.tsx` — open ImportPage as overlay

**State and ref to add:**
```ts
const [importFile, setImportFile] = useState<File | null>(null)
const csvInputRef = useRef<HTMLInputElement>(null)
```

**Change the + menu "Upload CSV" action:**

Instead of `navigate('/import')`, do:
```ts
action: () => csvInputRef.current?.click()
```

**Add hidden file input** (inside the form, after the textarea):
```tsx
<input
  ref={csvInputRef}
  type="file"
  accept=".csv"
  className="hidden"
  onChange={e => {
    const f = e.target.files?.[0]
    if (f) { setImportFile(f); setShowMediaMenu(false) }
    e.target.value = ''   // reset so same file can be re-selected
  }}
/>
```

**Add overlay** — rendered as a sibling to the main chat `div`, inside the outermost wrapper.
The overlay covers the entire viewport, including the bottom nav:

```tsx
{importFile && (
  <div className="fixed inset-0 z-[50] bg-background overflow-y-auto">
    <ImportPage
      initialFile={importFile}
      onDone={(result) => {
        setImportFile(null)
        const parts = [`Imported ${result.imported} transactions.`]
        if (result.merged) parts.push(`${result.merged} categories updated.`)
        if (result.skipped) parts.push(`${result.skipped} duplicates skipped.`)
        setMessages(prev => [...prev, { role: 'assistant', content: parts.join(' ') }])
      }}
    />
  </div>
)}
```

The overlay must be a sibling of — not a child of — the scrollable messages div, so it sits
above everything including the bottom nav bar.

## Patterns already in use (follow these)

- Tailwind only — no inline styles except `style={{ maxHeight: ... }}`
- `useRef` for DOM elements, `useState` for UI state
- TypeScript strict — no `any`, all props typed
- `ImportResult` is already exported from `../lib/api`

## What NOT to do

- Do not add a close/back button to the overlay — `onDone` is the only exit
- Do not change the 4-step flow inside ImportPage
- Do not add loading spinners or skeleton states beyond what exists
- Do not change any backend endpoint or type
