import { useState } from 'react'
import { confirmCategoryAction, cancelCategoryAction, type CategoryActionData } from '../lib/api'
import ActionCardButtons from './ActionCardButtons'

interface Props {
  data: CategoryActionData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function GoalBudgetPlanCard({ data, onConfirmed, onCancelled }: Props) {
  const items = data.items ?? []
  const [amounts, setAmounts] = useState<Record<string, string>>(
    Object.fromEntries(items.map(i => [i.category_name, i.amount.toFixed(2)]))
  )
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      const category_amounts: Record<string, number> = {}
      for (const i of items) {
        const parsed = parseFloat(amounts[i.category_name])
        category_amounts[i.category_name] = isNaN(parsed) ? i.amount : parsed
      }
      const result = await confirmCategoryAction(data.id, { category_amounts })
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

  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[420px] w-full space-y-3">
      <div>
        <p className="text-white font-medium">Set up goal budget for {data.goal_name}?</p>
        <p className="text-muted text-sm mt-0.5">
          By {data.by_month} — edit any amount before confirming. Missing categories are created
          in <span className="text-white">{data.group_name}</span>, each gets a savings goal and
          rollover so unspent balance carries forward.
        </p>
      </div>

      <div className="max-h-64 overflow-y-auto space-y-1.5 -mx-1 px-1">
        {items.map(i => (
          <div key={i.category_name} className="flex items-center justify-between gap-2">
            <span className="text-white text-sm truncate">
              {i.category_name}
              {!i.exists && <span className="text-muted text-xs"> (new)</span>}
            </span>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-muted text-sm">€</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amounts[i.category_name] ?? ''}
                onChange={e => setAmounts(prev => ({ ...prev, [i.category_name]: e.target.value }))}
                className="bg-background border border-border rounded-lg px-2 py-1 w-24 text-white text-sm text-right focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          </div>
        ))}
      </div>

      <ActionCardButtons
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        loading={loading}
        confirmDisabled={items.length === 0}
        confirmLabel="Apply"
      />
    </div>
  )
}
