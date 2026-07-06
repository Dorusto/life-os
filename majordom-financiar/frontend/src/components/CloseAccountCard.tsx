import { useState } from 'react'
import { confirmCloseAccount, cancelCloseAccount, type CloseAccountData } from '../lib/api'
import ActionCardButtons from './ActionCardButtons'

interface Props {
  data: CloseAccountData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function CloseAccountCard({ data, onConfirmed, onCancelled }: Props) {
  const [loading, setLoading] = useState(false)

  function formatEuro(amount: number): string {
    return `€${Math.abs(amount).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  async function handleConfirm() {
    setLoading(true)
    try {
      const result = await confirmCloseAccount(data.id)
      onConfirmed(result.message)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      onConfirmed(`Error: could not close account (${msg}). Try again via chat.`)
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    setLoading(true)
    try {
      await cancelCloseAccount(data.id)
    } catch {}
    onCancelled()
  }

  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[80%] space-y-3">
      <div>
        <p className="text-white font-medium">{data.account_name}</p>
        <p className="text-muted text-sm">Current balance: {formatEuro(data.balance)}</p>
        {data.balance !== 0 && (
          <p className="text-sm font-medium mt-1 text-yellow-400">
            This account still has a balance of {formatEuro(data.balance)} — closing it won't zero it out.
          </p>
        )}
      </div>

      <ActionCardButtons
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        loading={loading}
        variant="danger"
        confirmLabel="Close Account"
      />
    </div>
  )
}
