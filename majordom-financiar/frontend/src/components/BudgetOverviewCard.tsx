import { useState } from 'react'
import { applyBudgetOverview, type BudgetOverviewData } from '../lib/api'
import ActionCardButtons from './ActionCardButtons'

interface Props {
  data: BudgetOverviewData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function BudgetOverviewCard({ data, onConfirmed, onCancelled }: Props) {
  const allCategories = data.groups.flatMap(g => g.categories)

  const [amounts, setAmounts] = useState<Record<string, string>>(
    Object.fromEntries(allCategories.map(c => [c.id, c.budgeted.toFixed(2)]))
  )
  const [carryover, setCarryover] = useState<Record<string, boolean>>(
    Object.fromEntries(allCategories.map(c => [c.id, c.carryover]))
  )
  const [loading, setLoading] = useState(false)

  const originalAmounts = Object.fromEntries(allCategories.map(c => [c.id, c.budgeted]))
  const originalCarryover = Object.fromEntries(allCategories.map(c => [c.id, c.carryover]))
  const nameById = Object.fromEntries(allCategories.map(c => [c.id, c.name]))

  const hasChanges = allCategories.some(c => {
    const parsed = parseFloat(amounts[c.id])
    const amountChanged = !isNaN(parsed) && parsed !== originalAmounts[c.id]
    const carryoverChanged = carryover[c.id] !== originalCarryover[c.id]
    return amountChanged || carryoverChanged
  })

  async function handleSave() {
    setLoading(true)
    try {
      const amountsPayload: Record<string, number> = {}
      const carryoverPayload: Record<string, boolean> = {}
      for (const c of allCategories) {
        const parsed = parseFloat(amounts[c.id])
        if (!isNaN(parsed) && parsed !== originalAmounts[c.id]) {
          amountsPayload[nameById[c.id]] = parsed
        }
        if (carryover[c.id] !== originalCarryover[c.id]) {
          carryoverPayload[nameById[c.id]] = carryover[c.id]
        }
      }
      const result = await applyBudgetOverview({ month: data.month, amounts: amountsPayload, carryover: carryoverPayload })
      onConfirmed(result.message)
    } catch (err) {
      onConfirmed(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[460px] w-full space-y-3">
      <div>
        <p className="text-white font-medium">Budget — {data.month}</p>
        <p className="text-muted text-sm mt-0.5">Edit any amount, toggle rollover, then save.</p>
      </div>

      <div className="max-h-72 overflow-y-auto space-y-3 -mx-1 px-1">
        {data.groups.map(group => (
          <div key={group.name}>
            <p className="text-muted text-[11px] uppercase tracking-wide mb-1">{group.name}</p>
            <div className="space-y-2">
              {group.categories.map(cat => {
                const parsed = parseFloat(amounts[cat.id])
                const liveBalance = (isNaN(parsed) ? cat.budgeted : parsed) - cat.spent
                return (
                  <div key={cat.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white text-sm truncate">{cat.name}</span>
                      <label className="flex items-center gap-1 text-[10px] text-muted cursor-pointer flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={carryover[cat.id]}
                          onChange={e => setCarryover(prev => ({ ...prev, [cat.id]: e.target.checked }))}
                          className="accent-accent"
                        />
                        rollover
                      </label>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1">
                        <span className="text-muted text-xs">€</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={amounts[cat.id] ?? ''}
                          onChange={e => setAmounts(prev => ({ ...prev, [cat.id]: e.target.value }))}
                          className="bg-background border border-border rounded-lg px-2 py-1 w-24 text-white text-sm text-right focus:outline-none focus:border-accent transition-colors"
                        />
                      </div>
                      <span className="text-muted text-xs">spent €{cat.spent.toFixed(2)}</span>
                      <span className={`text-xs ${liveBalance < 0 ? 'text-red-400' : 'text-muted'}`}>
                        balance €{liveBalance.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <ActionCardButtons
        onConfirm={handleSave}
        onCancel={onCancelled}
        loading={loading}
        confirmDisabled={!hasChanges}
        confirmLabel="Save changes"
        cancelLabel="Close"
      />
    </div>
  )
}
