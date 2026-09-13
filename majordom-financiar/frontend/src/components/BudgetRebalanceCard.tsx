import { useState, useMemo } from 'react'
import { confirmBudgetRebalance, type BudgetRebalanceData } from '../lib/api'
import ActionCardButtons from './ActionCardButtons'
import { formatCurrency } from '../lib/formatCurrency'

interface Props {
  data: BudgetRebalanceData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function BudgetRebalanceCard({ data, onConfirmed, onCancelled }: Props) {
  const [loading, setLoading] = useState(false)
  const [selectedSource, setSelectedSource] = useState(data.source_category)
  const [selectedDest, setSelectedDest] = useState(data.destination_category)
  const [amount, setAmount] = useState(data.amount)

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

  const newSource = Math.round((sourceBudgeted - amount) * 100) / 100
  const newDest = Math.round((destBudgeted + amount) * 100) / 100

  async function handleConfirm() {
    setLoading(true)
    try {
      const result = await confirmBudgetRebalance({
        ...data,
        amount,
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
    w-full bg-token-surface-2 border border-token-line rounded-lg px-3 py-2
    text-token-ink text-sm focus:outline-none focus:border-token-brand
    disabled:opacity-50 appearance-none
  `

  return (
    <div className="bg-token-surface border border-token-line rounded-2xl rounded-bl-sm px-4 py-3 max-w-[85%] space-y-3">
      <div>
        <p className="text-token-ink font-medium text-sm">Budget rebalance</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-token-ink-3 text-xs">{data.month} ·</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={e => setAmount(parseFloat(e.target.value) || 0)}
            disabled={loading}
            className="w-24 bg-token-surface-2 border border-token-line rounded-lg px-2 py-1 text-token-ink text-sm focus:outline-none focus:border-token-brand disabled:opacity-50"
          />
        </div>
      </div>

      <div className="space-y-3">
        {/* Source */}
        <div className="space-y-1">
          <p className="text-token-ink-3 text-xs uppercase tracking-wide">From</p>
          <select
            value={selectedSource}
            onChange={e => setSelectedSource(e.target.value)}
            disabled={loading}
            className={selectClass}
          >
            {categories.map(c => (
              <option key={c.name} value={c.name} style={{ background: '#1A1A1A' }}>
                {c.name} · {formatCurrency(c.budgeted)}
              </option>
            ))}
          </select>
          <p className="text-xs text-token-ink-3 pl-1">
            {formatCurrency(sourceBudgeted)} → <span className="text-token-loss">{formatCurrency(newSource)}</span>
          </p>
        </div>

        <p className="text-token-ink-3 text-xs pl-1">↓ {formatCurrency(amount)}</p>

        {/* Destination */}
        <div className="space-y-1">
          <p className="text-token-ink-3 text-xs uppercase tracking-wide">To</p>
          <select
            value={selectedDest}
            onChange={e => setSelectedDest(e.target.value)}
            disabled={loading}
            className={selectClass}
          >
            {categories.map(c => (
              <option key={c.name} value={c.name} style={{ background: '#1A1A1A' }}>
                {c.name} · {formatCurrency(c.budgeted)}
              </option>
            ))}
          </select>
          <p className="text-xs text-token-ink-3 pl-1">
            {formatCurrency(destBudgeted)} → <span className="text-token-gain">{formatCurrency(newDest)}</span>
          </p>
        </div>
      </div>

      <ActionCardButtons
        onConfirm={handleConfirm}
        onCancel={onCancelled}
        loading={loading}
        confirmDisabled={selectedSource === selectedDest}
        confirmLabel={loading ? 'Saving…' : 'Confirm'}
      />
    </div>
  )
}
