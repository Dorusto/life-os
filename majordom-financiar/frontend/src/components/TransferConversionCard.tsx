import { useState } from 'react'
import { confirmTransferConversion, cancelTransferConversion, type TransferConversionData } from '../lib/api'
import ActionCardButtons from './ActionCardButtons'

interface Props {
  data: TransferConversionData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function TransferConversionCard({ data, onConfirmed, onCancelled }: Props) {
  const [loading, setLoading] = useState(false)

  function formatEuro(amount: number): string {
    return `€${Math.abs(amount).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  async function handleConfirm() {
    setLoading(true)
    try {
      const result = await confirmTransferConversion(data.id)
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
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[80%] space-y-3">
      <div>
        <p className="text-white font-medium">Convert to transfer?</p>
        <p className="text-muted text-sm">
          <span className="text-white">{data.payee || 'Unnamed'}</span> · {data.date} · {formatEuro(data.amount)}
        </p>
        <p className="text-muted text-sm mt-0.5">
          Move from {data.account_name} to{' '}
          <span className="text-white">{data.target_account_name}</span> — it will no longer
          count as spending or income.
        </p>
      </div>

      <ActionCardButtons onConfirm={handleConfirm} onCancel={handleCancel} loading={loading} />
    </div>
  )
}
