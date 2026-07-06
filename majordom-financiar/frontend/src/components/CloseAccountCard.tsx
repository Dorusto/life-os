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
  const accounts = data.accounts ?? []
  const hasBalance = Math.abs(data.balance) >= 0.01
  const [destinationId, setDestinationId] = useState(accounts[0]?.id ?? '')

  function formatEuro(amount: number): string {
    return `€${Math.abs(amount).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  async function handleConfirm() {
    setLoading(true)
    try {
      const result = await confirmCloseAccount(data.id, hasBalance ? destinationId : undefined)
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
        {hasBalance && (
          <p className="text-sm font-medium mt-1 text-yellow-400">
            This account still has a balance of {formatEuro(data.balance)} — pick a destination account below to move it there before closing.
          </p>
        )}
      </div>

      {hasBalance && (
        <div className="space-y-1">
          <p className="text-muted text-xs uppercase tracking-wide">Move balance to</p>
          <select
            value={destinationId}
            onChange={e => setDestinationId(e.target.value)}
            disabled={loading}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent disabled:opacity-50 appearance-none"
          >
            {accounts.length === 0 && <option value="">No other accounts available</option>}
            {accounts.map(a => (
              <option key={a.id} value={a.id} style={{ background: '#1A1A1A' }}>
                {a.name} · €{a.balance.toFixed(2)}
              </option>
            ))}
          </select>
        </div>
      )}

      <ActionCardButtons
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        loading={loading}
        variant="danger"
        confirmLabel="Close Account"
        confirmDisabled={hasBalance && !destinationId}
      />
    </div>
  )
}
