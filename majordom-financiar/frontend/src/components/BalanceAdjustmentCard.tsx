import { useState } from 'react'
import { confirmBalanceAdjustment, cancelBalanceAdjustment, type BalanceAdjustmentData } from '../lib/api'
import ActionCardButtons from './ActionCardButtons'
import { formatCurrency } from '../lib/formatCurrency'

interface Props {
  data: BalanceAdjustmentData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function BalanceAdjustmentCard({ data, onConfirmed, onCancelled }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [realBalance, setRealBalance] = useState(String(data.real_balance))
  const parsed = parseFloat(realBalance)
  const valid = !isNaN(parsed)

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      const result = await confirmBalanceAdjustment(data.id, valid ? { real_balance: parsed } : undefined)
      onConfirmed(result.message)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(`Could not adjust balance (${msg}). Try again.`)
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    setLoading(true)
    try {
      await cancelBalanceAdjustment(data.id)
    } catch {}
    onCancelled()
  }

  const diff = valid ? Number((parsed - data.current_balance).toFixed(2)) : data.diff
  const diffColor = diff > 0 ? 'text-token-gain' : diff < 0 ? 'text-token-loss' : 'text-token-ink-3'

  return (
    <div className="bg-token-surface border border-token-line rounded-2xl rounded-bl-sm px-4 py-3 max-w-[80%] space-y-3">
      <div>
        <p className="text-token-ink font-medium">{data.account_name}</p>
        <p className="text-token-ink-3 text-sm flex items-center gap-2">
          {formatCurrency(data.current_balance)} →
          <input
            type="number"
            step="0.01"
            value={realBalance}
            onChange={e => setRealBalance(e.target.value)}
            disabled={loading}
            className="bg-token-surface-2 border border-token-line rounded-lg px-2 py-1 text-token-ink text-sm focus:outline-none focus:border-token-brand disabled:opacity-50 w-28"
          />
        </p>
        <p className={`text-sm font-medium mt-1 ${diffColor}`}>
          {diff === 0
            ? 'Already in sync'
            : formatCurrency(diff, { signDisplay: 'always' })}
        </p>
      </div>

      {error && <p className="text-token-loss text-xs">{error}</p>}

      <ActionCardButtons onConfirm={handleConfirm} onCancel={handleCancel} loading={loading} confirmDisabled={!valid} />
    </div>
  )
}
