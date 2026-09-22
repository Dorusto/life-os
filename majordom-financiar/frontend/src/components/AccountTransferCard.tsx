import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { confirmAccountTransfer, type AccountTransferData } from '../lib/api'
import ActionCardButtons from './ActionCardButtons'
import { formatCurrency } from '../lib/formatCurrency'
import { Card } from './ui/Card'

interface Props {
  data: AccountTransferData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function AccountTransferCard({ data, onConfirmed, onCancelled }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fromId, setFromId] = useState(data.from_account_id)
  const [toId, setToId] = useState(data.to_account_id)
  const [amount, setAmount] = useState(data.amount)
  const [creatingNew, setCreatingNew] = useState(data.to_account_missing ?? false)
  const [newAccountName, setNewAccountName] = useState(data.to_account_name ?? '')
  const [newAccountOffBudget, setNewAccountOffBudget] = useState(false)

  const accounts = data.accounts ?? [
    { id: data.from_account_id, name: data.from_account_name, balance: 0 },
    { id: data.to_account_id, name: data.to_account_name, balance: 0 },
  ]

  const fromAcc = accounts.find(a => a.id === fromId) ?? accounts[0]
  const toAcc = accounts.find(a => a.id === toId) ?? accounts[1] ?? accounts[0]

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      const result = creatingNew
        ? await confirmAccountTransfer(
            { ...data, amount, from_account_id: fromId, from_account_name: fromAcc?.name ?? fromId, to_account_id: '', to_account_name: newAccountName.trim() },
            { name: newAccountName.trim(), offBudget: newAccountOffBudget }
          )
        : await confirmAccountTransfer({
            ...data,
            amount,
            from_account_id: fromId,
            from_account_name: fromAcc?.name ?? fromId,
            to_account_id: toId,
            to_account_name: toAcc?.name ?? toId,
          })
      onConfirmed(result.message)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(`Could not complete transfer (${msg}). Try again.`)
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
    <Card variant="bubble">
      <div>
        <p className="text-token-ink font-medium text-sm">Account transfer</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-token-ink-3 text-xs">{data.date} ·</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={e => setAmount(parseFloat(e.target.value) || 0)}
            disabled={loading}
            className="w-24 bg-token-surface-2 border border-token-line rounded-lg px-2 py-1 text-token-ink text-sm focus:outline-none focus:border-token-brand disabled:opacity-50"
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-token-ink-3 text-xs uppercase tracking-wide">From</p>
          <select
            value={fromId}
            onChange={e => setFromId(e.target.value)}
            disabled={loading}
            className={selectClass}
          >
            {accounts.map(a => (
              <option key={a.id} value={a.id} style={{ background: 'var(--surface-2)' }}>
                {a.name} · {formatCurrency(a.balance)}
              </option>
            ))}
          </select>
          <p className="text-xs text-token-ink-3 pl-1">
            <span className="text-token-loss">{formatCurrency(-Math.abs(amount))}</span>
          </p>
        </div>

        <div className="flex items-center gap-1 text-token-ink-3 text-xs pl-1">
          <ArrowRight size={12} />
          <span>{formatCurrency(amount)}</span>
        </div>

        <div className="space-y-1">
          <p className="text-token-ink-3 text-xs uppercase tracking-wide">To</p>
          {creatingNew ? (
            <div className="space-y-1.5">
              <input
                type="text"
                value={newAccountName}
                onChange={e => setNewAccountName(e.target.value)}
                disabled={loading}
                placeholder="New account name"
                className="w-full bg-token-surface-2 border border-token-line rounded-lg px-3 py-2 text-token-ink text-sm focus:outline-none focus:border-token-brand disabled:opacity-50"
              />
              <label className="flex items-center gap-1.5 text-xs text-token-ink-3 pl-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newAccountOffBudget}
                  onChange={e => setNewAccountOffBudget(e.target.checked)}
                  disabled={loading}
                  className="accent-token-brand"
                />
                Off-budget (tracking only)
              </label>
              {accounts.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setCreatingNew(false); setToId(accounts[0].id) }}
                  disabled={loading}
                  className="text-xs text-token-brand-ink hover:underline pl-1"
                >
                  Use an existing account instead
                </button>
              )}
            </div>
          ) : (
            <>
              <select
                value={toId}
                onChange={e => setToId(e.target.value)}
                disabled={loading}
                className={selectClass}
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.id} style={{ background: 'var(--surface-2)' }}>
                    {a.name} · {formatCurrency(a.balance)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => { setCreatingNew(true); setNewAccountName('') }}
                disabled={loading}
                className="text-xs text-token-brand-ink hover:underline pl-1"
              >
                + Create new account instead
              </button>
            </>
          )}
          <p className="text-xs text-token-ink-3 pl-1">
            <span className="text-token-gain">{formatCurrency(Math.abs(amount), { signDisplay: 'always' })}</span>
          </p>
        </div>
      </div>

      {data.notes && (
        <p className="text-token-ink-3 text-xs">{data.notes}</p>
      )}

      {error && <p className="text-token-loss text-xs">{error}</p>}

      <ActionCardButtons
        onConfirm={handleConfirm}
        onCancel={onCancelled}
        loading={loading}
        confirmDisabled={creatingNew ? !newAccountName.trim() : fromId === toId}
        confirmLabel={loading ? 'Processing…' : 'Confirm'}
      />
    </Card>
  )
}
