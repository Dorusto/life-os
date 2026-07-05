import { useState } from 'react'
import { confirmBalanceAdjustment, cancelBalanceAdjustment, type BalanceAdjustmentData } from '../lib/api'
import ActionCardButtons from './ActionCardButtons'

interface Props {
  data: BalanceAdjustmentData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function BalanceAdjustmentCard({ data, onConfirmed, onCancelled }: Props) {
  const [loading, setLoading] = useState(false)

  function formatEuro(amount: number): string {
    return `€${Math.abs(amount).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

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

  const diffColor = data.diff > 0 ? 'text-green-400' : data.diff < 0 ? 'text-red-400' : 'text-muted'
  const diffSign = data.diff >= 0 ? '+' : ''

  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[80%] space-y-3">
      <div>
        <p className="text-white font-medium">{data.account_name}</p>
        <p className="text-muted text-sm">
          {formatEuro(data.current_balance)} → {formatEuro(data.real_balance)}
        </p>
        <p className={`text-sm font-medium mt-1 ${diffColor}`}>
          {data.diff === 0
            ? 'Already in sync'
            : `${diffSign}${formatEuro(data.diff)}`}
        </p>
      </div>

      <ActionCardButtons onConfirm={handleConfirm} onCancel={handleCancel} loading={loading} />
    </div>
  )
}
