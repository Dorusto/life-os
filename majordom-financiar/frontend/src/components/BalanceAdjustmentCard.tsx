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

  async function handleConfirm() {
    setLoading(true)
    try {
      const result = await confirmBalanceAdjustment(data.id)
      onConfirmed(result.message)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      onConfirmed(`Error: could not adjust balance (${msg}). Try again via chat.`)
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

  const diffColor = data.diff > 0 ? 'text-token-gain' : data.diff < 0 ? 'text-token-loss' : 'text-token-ink-3'

  return (
    <div className="bg-token-surface border border-token-line rounded-2xl rounded-bl-sm px-4 py-3 max-w-[80%] space-y-3">
      <div>
        <p className="text-token-ink font-medium">{data.account_name}</p>
        <p className="text-token-ink-3 text-sm">
          {formatCurrency(data.current_balance)} → {formatCurrency(data.real_balance)}
        </p>
        <p className={`text-sm font-medium mt-1 ${diffColor}`}>
          {data.diff === 0
            ? 'Already in sync'
            : formatCurrency(data.diff, { signDisplay: 'always' })}
        </p>
      </div>

      <ActionCardButtons onConfirm={handleConfirm} onCancel={handleCancel} loading={loading} />
    </div>
  )
}
