import { useState } from 'react'
import { confirmTransferConversion, cancelTransferConversion, type TransferConversionData } from '../lib/api'
import ActionCardButtons from './ActionCardButtons'
import { formatCurrency } from '../lib/formatCurrency'

interface Props {
  data: TransferConversionData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function TransferConversionCard({ data, onConfirmed, onCancelled }: Props) {
  const [loading, setLoading] = useState(false)
  const accounts = data.accounts ?? []
  const [targetId, setTargetId] = useState(
    data.target_account_id ?? accounts.find(a => a.name === data.target_account_name)?.id ?? accounts[0]?.id ?? ''
  )

  async function handleConfirm() {
    setLoading(true)
    try {
      const result = await confirmTransferConversion(
        data.id,
        targetId ? { target_account_id: targetId } : undefined
      )
      onConfirmed(result.message)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      onConfirmed(`Error: could not convert transaction to transfer (${msg}). Try again via chat.`)
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
    <div className="bg-token-surface border border-token-line rounded-2xl rounded-bl-sm px-4 py-3 max-w-[80%] space-y-3">
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

      <ActionCardButtons onConfirm={handleConfirm} onCancel={handleCancel} loading={loading} />
    </div>
  )
}
