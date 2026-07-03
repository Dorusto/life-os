import { useState } from 'react'
import { Check, X, AlertCircle } from 'lucide-react'
import { confirmCategoryAction, cancelCategoryAction, type CategoryActionData } from '../lib/api'

interface Props {
  data: CategoryActionData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function BudgetCopyCard({ data, onConfirmed, onCancelled }: Props) {
  const categories = data.categories ?? []
  const [amounts, setAmounts] = useState<Record<string, string>>(
    Object.fromEntries(categories.map(c => [c.category_id, c.amount.toFixed(2)]))
  )
  const [loading, setLoading] = useState(false)

  const groups = categories.reduce((acc, c) => {
    if (!acc[c.group_name]) acc[c.group_name] = []
    acc[c.group_name].push(c)
    return acc
  }, {} as Record<string, typeof categories>)

  async function handleConfirm() {
    setLoading(true)
    try {
      const category_amounts: Record<string, number> = {}
      for (const c of categories) {
        const parsed = parseFloat(amounts[c.category_id])
        category_amounts[c.category_id] = isNaN(parsed) ? c.amount : parsed
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
        <p className="text-white font-medium">Copy budget to {data.target_month}?</p>
        <p className="text-muted text-sm mt-0.5">
          Pre-filled from {data.source_month} — edit any amount before confirming.
        </p>
        {data.excluded_templates && data.excluded_templates.length > 0 && (
          <div className="flex items-start gap-1.5 mt-2">
            <AlertCircle size={12} className="text-yellow-500 flex-shrink-0 mt-0.5" />
            <p className="text-yellow-500 text-xs">
              Skipped (goal templates, not blindly copied): {data.excluded_templates.join(', ')}
            </p>
          </div>
        )}
      </div>

      <div className="max-h-64 overflow-y-auto space-y-3 -mx-1 px-1">
        {Object.entries(groups).map(([groupName, cats]) => (
          <div key={groupName}>
            <p className="text-muted text-[11px] uppercase tracking-wide mb-1">{groupName}</p>
            <div className="space-y-1.5">
              {cats.map(c => (
                <div key={c.category_id} className="flex items-center justify-between gap-2">
                  <span className="text-white text-sm truncate">{c.category_name}</span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-muted text-sm">€</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={amounts[c.category_id] ?? ''}
                      onChange={e => setAmounts(prev => ({ ...prev, [c.category_id]: e.target.value }))}
                      className="bg-background border border-border rounded-lg px-2 py-1 w-24 text-white text-sm text-right focus:outline-none focus:border-accent transition-colors"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleCancel}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border text-muted hover:text-white hover:bg-surface-hover text-sm transition-colors disabled:opacity-40"
        >
          <X size={14} />
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={loading || categories.length === 0}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors active:scale-95 disabled:opacity-50"
        >
          <Check size={14} />
          Apply
        </button>
      </div>
    </div>
  )
}
