import { useState } from 'react'
import { confirmTransferConversion, cancelTransferConversion, type TransferConversionData } from '../lib/api'
import ActionCardButtons from './ActionCardButtons'
import { formatCurrency } from '../lib/formatCurrency'
import { Card } from './ui/Card'

interface Props {
  data: TransferConversionData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function TransferConversionCard({ data, onConfirmed, onCancelled }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const accounts = data.accounts ?? []
  const [targetId, setTargetId] = useState(
    data.target_account_id ?? accounts.find(a => a.name === data.target_account_name)?.id ?? accounts[0]?.id ?? ''
  )

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      const result = await confirmTransferConversion(
        data.id,
        targetId ? { target_account_id: targetId } : undefined
      )
      onConfirmed(result.message)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(`Could not convert transaction to transfer (${msg}). Try again.`)
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    setLoading(true)
    try {
      await cancelTransferConversion(data.id)
    } catch {}
    onCancelled()
  }

  return (
    <Card variant="bubble" className="max-w-[80%]">
      <div>
        <p className="text-token-ink font-medium">Convert to transfer?</p>
        <p className="text-token-ink-3 text-sm">
          <span className="text-token-ink">{data.payee || 'Unnamed'}</span> · {data.date} · {formatCurrency(data.amount)}
        </p>
        <p className="text-token-ink-3 text-sm mt-0.5">
          Move from <span className="text-token-ink">{data.account_name}</span> — it will no longer
          count as spending or income.
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-token-ink-3 text-xs uppercase tracking-wide">To account</p>
        <select
          value={targetId}
          onChange={e => setTargetId(e.target.value)}
          disabled={loading}
          className="w-full bg-token-surface-2 border border-token-line rounded-lg px-3 py-2 text-token-ink text-sm focus:outline-none focus:border-token-brand disabled:opacity-50 appearance-none"
        >
          {accounts.length > 0 ? (
            accounts.map(a => (
              <option key={a.id} value={a.id} style={{ background: 'var(--surface)' }}>
                {a.name}
              </option>
            ))
          ) : (
            <option value={targetId}>{data.target_account_name}</option>
          )}
        </select>
      </div>

      {error && <p className="text-token-loss text-xs">{error}</p>}

      <ActionCardButtons onConfirm={handleConfirm} onCancel={handleCancel} loading={loading} />
    </Card>
  )
}
