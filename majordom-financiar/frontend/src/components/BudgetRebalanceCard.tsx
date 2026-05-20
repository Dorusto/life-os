import { useState, useMemo } from 'react'
import { Check, X } from 'lucide-react'
import { confirmBudgetRebalance, type BudgetRebalanceData } from '../lib/api'

interface Props {
  data: BudgetRebalanceData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function BudgetRebalanceCard({ data, onConfirmed, onCancelled }: Props) {
  const [loading, setLoading] = useState(false)
  const [selectedSource, setSelectedSource] = useState(data.source_category)
  const [selectedDest, setSelectedDest] = useState(data.destination_category)

  const categories = data.categories ?? [
    { name: data.source_category, budgeted: data.current_source_budget },
    { name: data.destination_category, budgeted: data.current_destination_budget },
  ]

  const sourceBudgeted = useMemo(
    () => categories.find(c => c.name === selectedSource)?.budgeted ?? 0,
    [selectedSource, categories]
  )
  const destBudgeted = useMemo(
    () => categories.find(c => c.name === selectedDest)?.budgeted ?? 0,
    [selectedDest, categories]
  )

  const newSource = Math.round((sourceBudgeted - data.amount) * 100) / 100
  const newDest = Math.round((destBudgeted + data.amount) * 100) / 100

  async function handleConfirm() {
    setLoading(true)
    try {
      const result = await confirmBudgetRebalance({
        ...data,
        source_category: selectedSource,
        destination_category: selectedDest,
        current_source_budget: sourceBudgeted,
        current_destination_budget: destBudgeted,
        new_source_budget: newSource,
        new_destination_budget: newDest,
      })
      onConfirmed(result.message)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      onConfirmed(`Error: could not rebalance budget (${msg}). Try again via chat.`)
    } finally {
      setLoading(false)
    }
  }

  const selectClass = `
    w-full bg-surface-2 border border-border rounded-lg px-3 py-2
    text-white text-sm focus:outline-none focus:border-accent
    disabled:opacity-50 appearance-none
  `

  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[85%] space-y-3">
      <div>
        <p className="text-white font-medium text-sm">Budget rebalance</p>
        <p className="text-muted text-xs mt-0.5">{data.month} · €{data.amount.toFixed(2)}</p>
      </div>

      <div className="space-y-3">
        {/* Source */}
        <div className="space-y-1">
          <p className="text-muted text-xs uppercase tracking-wide">From</p>
          <select
            value={selectedSource}
            onChange={e => setSelectedSource(e.target.value)}
            disabled={loading}
            className={selectClass}
          >
            {categories.map(c => (
              <option key={c.name} value={c.name} style={{ background: '#1A1A1A' }}>
                {c.name} · €{c.budgeted.toFixed(2)}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted pl-1">
            €{sourceBudgeted.toFixed(2)} → <span className="text-red-400">€{newSource.toFixed(2)}</span>
          </p>
        </div>

        <p className="text-muted text-xs pl-1">↓ €{data.amount.toFixed(2)}</p>

        {/* Destination */}
        <div className="space-y-1">
          <p className="text-muted text-xs uppercase tracking-wide">To</p>
          <select
            value={selectedDest}
            onChange={e => setSelectedDest(e.target.value)}
            disabled={loading}
            className={selectClass}
          >
            {categories.map(c => (
              <option key={c.name} value={c.name} style={{ background: '#1A1A1A' }}>
                {c.name} · €{c.budgeted.toFixed(2)}
            </option>
            ))}
          </select>
          <p className="text-xs text-muted pl-1">
            €{destBudgeted.toFixed(2)} → <span className="text-green-400">€{newDest.toFixed(2)}</span>
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={loading || selectedSource === selectedDest}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors active:scale-95 disabled:opacity-40"
        >
          <Check size={14} />
          {loading ? 'Saving…' : 'Confirm'}
        </button>
        <button
          onClick={onCancelled}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-surface-2 hover:bg-surface-hover border border-border text-muted hover:text-white text-sm font-medium transition-colors active:scale-95 disabled:opacity-40"
        >
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  )
}
