import { useState, useMemo } from 'react'
import { confirmBudgetRebalance, type BudgetRebalanceData } from '../lib/api'
import ActionCardButtons from './ActionCardButtons'
import { formatCurrency } from '../lib/formatCurrency'
import { Card, SectionLabel } from './kit/Card'

interface Props {
  data: BudgetRebalanceData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function BudgetRebalanceCard({ data, onConfirmed, onCancelled }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
    setError(null)
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
      setError(`Could not rebalance budget (${msg}). Try again.`)
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
    <Card label="Budget rebalance" className="max-w-[85%] rounded-bl-sm">
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <span className="text-token-ink-3 text-xs">{data.month} ·</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={e => setAmount(parseFloat(e.target.value) || 0)}
            disabled={loading}
            className="w-24 bg-token-surface-2 border border-token-line rounded-lg px-2 py-1 text-token-ink text-sm font-mono tabular-nums focus:outline-none focus:border-token-brand disabled:opacity-50"
          />
        </div>

        {/* Source */}
        <div className="space-y-1">
          <SectionLabel>From</SectionLabel>
          <select
            value={selectedSource}
            onChange={e => setSelectedSource(e.target.value)}
            disabled={loading}
            className={selectClass}
          >
            {categories.map(c => (
              <option key={c.name} value={c.name} style={{ background: 'var(--surface-2)' }}>
                {c.name} · {formatCurrency(c.budgeted)}
              </option>
            ))}
          </select>
          <p className="text-xs text-token-ink-3 pl-1 font-mono tabular-nums">
            {formatCurrency(sourceBudgeted)} → <span className="text-token-loss">{formatCurrency(newSource)}</span>
          </p>
        </div>

        <p className="text-token-ink-3 text-xs pl-1 font-mono tabular-nums">↓ {formatCurrency(amount)}</p>

        {/* Destination */}
        <div className="space-y-1">
          <SectionLabel>To</SectionLabel>
          <select
            value={selectedDest}
            onChange={e => setSelectedDest(e.target.value)}
            disabled={loading}
            className={selectClass}
          >
            {categories.map(c => (
              <option key={c.name} value={c.name} style={{ background: 'var(--surface-2)' }}>
                {c.name} · {formatCurrency(c.budgeted)}
              </option>
            ))}
          </select>
          <p className="text-xs text-token-ink-3 pl-1 font-mono tabular-nums">
            {formatCurrency(destBudgeted)} → <span className="text-token-gain">{formatCurrency(newDest)}</span>
          </p>
        </div>

        {error && <p className="text-token-loss text-xs">{error}</p>}

        <ActionCardButtons
          onConfirm={handleConfirm}
          onCancel={onCancelled}
          loading={loading}
          confirmDisabled={selectedSource === selectedDest}
          confirmLabel={loading ? 'Saving…' : 'Confirm'}
        />
      </div>
    </Card>
  )
}
