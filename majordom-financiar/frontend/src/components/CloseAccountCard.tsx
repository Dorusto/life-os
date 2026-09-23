import { useState } from 'react'
import { confirmCloseAccount, cancelCloseAccount, type CloseAccountData } from '../lib/api'
import ActionCardButtons from './ActionCardButtons'
import { formatCurrency } from '../lib/formatCurrency'
import { Card, SectionLabel } from './kit/Card'

interface Props {
  data: CloseAccountData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function CloseAccountCard({ data, onConfirmed, onCancelled }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const accounts = data.accounts ?? []
  const hasBalance = Math.abs(data.balance) >= 0.01
  const [destinationId, setDestinationId] = useState(accounts[0]?.id ?? '')

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      const result = await confirmCloseAccount(data.id, hasBalance ? destinationId : undefined)
      onConfirmed(result.message)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(`Could not close account (${msg}). Try again.`)
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
    <Card label="Close account" className="max-w-[85%] rounded-bl-sm">
      <div className="space-y-3">
        <div>
          <p className="text-token-ink font-medium">{data.account_name}</p>
          <p className="text-token-ink-3 text-sm">
            Current balance: <span className="font-mono tabular-nums">{formatCurrency(data.balance)}</span>
          </p>
          {hasBalance && (
            <p className="text-sm font-medium mt-1 text-token-warn">
              This account still has a balance of <span className="font-mono tabular-nums">{formatCurrency(data.balance)}</span> — pick a destination account below to move it there before closing.
            </p>
          )}
        </div>

        {hasBalance && (
          <div className="space-y-1">
            <SectionLabel>Move balance to</SectionLabel>
            <select
              value={destinationId}
              onChange={e => setDestinationId(e.target.value)}
              disabled={loading}
              className="w-full bg-token-surface-2 border border-token-line rounded-lg px-3 py-2 text-token-ink text-sm focus:outline-none focus:border-token-brand disabled:opacity-50 appearance-none"
            >
              {accounts.length === 0 && <option value="">No other accounts available</option>}
              {accounts.map(a => (
                <option key={a.id} value={a.id} style={{ background: 'var(--surface)' }}>
                  {a.name} · {formatCurrency(a.balance)}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && <p className="text-token-loss text-xs">{error}</p>}

        <ActionCardButtons
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          loading={loading}
          variant="danger"
          confirmLabel="Close Account"
          confirmDisabled={hasBalance && !destinationId}
        />
      </div>
    </Card>
  )
}
