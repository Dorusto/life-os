import { useState } from 'react'
import { confirmCategoryAction, cancelCategoryAction, type CategoryActionData } from '../lib/api'
import ActionCardButtons from './ActionCardButtons'
import { formatCurrency } from '../lib/formatCurrency'

interface Props {
  data: CategoryActionData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function ReachedGoalsCard({ data, onConfirmed, onCancelled }: Props) {
  const reached = data.reached_categories ?? []
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(reached.map(r => [r.category_name, true]))
  )
  const [loading, setLoading] = useState(false)

  function toggle(name: string) {
    setChecked(prev => ({ ...prev, [name]: !prev[name] }))
  }

  async function handleConfirm() {
    setLoading(true)
    try {
      const selected_category_names = reached
        .map(r => r.category_name)
        .filter(name => checked[name])
      const result = await confirmCategoryAction(data.id, { selected_category_names })
      onConfirmed(result.message)
    } catch (err) {
      onConfirmed(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    setLoading(true)
    try { await cancelCategoryAction(data.id) } catch {}
    onCancelled()
  }

  const anySelected = reached.some(r => checked[r.category_name])

  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[420px] w-full space-y-3">
      <div>
        <p className="text-white font-medium">Clean up reached goals?</p>
        <p className="text-muted text-sm mt-0.5">
          Their target month has passed — clearing the goal template stops it from blocking
          "Overwrite with budget template".
        </p>
      </div>

      <div className="max-h-64 overflow-y-auto space-y-1.5 -mx-1 px-1">
        {reached.map(r => (
          <label
            key={r.category_name}
            className="flex items-center justify-between gap-2 cursor-pointer"
          >
            <span className="flex items-center gap-2 min-w-0">
              <input
                type="checkbox"
                checked={checked[r.category_name] ?? false}
                onChange={() => toggle(r.category_name)}
                className="accent-accent flex-shrink-0"
              />
              <span className="text-white text-sm truncate">{r.category_name}</span>
            </span>
            <span className="text-muted text-xs whitespace-nowrap">
              {formatCurrency(r.target_amount)} by {r.target_month}
            </span>
          </label>
        ))}
      </div>

      <ActionCardButtons
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        loading={loading}
        confirmDisabled={reached.length === 0 || !anySelected}
        confirmLabel="Clean up"
      />
    </div>
  )
}
