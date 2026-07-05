import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { confirmAccountTransfer, type AccountTransferData } from '../lib/api'
import ActionCardButtons from './ActionCardButtons'

interface Props {
  data: AccountTransferData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function AccountTransferCard({ data, onConfirmed, onCancelled }: Props) {
  const [loading, setLoading] = useState(false)
  const [fromId, setFromId] = useState(data.from_account_id)
  const [toId, setToId] = useState(data.to_account_id)
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
    try {
      const result = creatingNew
        ? await confirmAccountTransfer(
            { ...data, from_account_id: fromId, from_account_name: fromAcc?.name ?? fromId, to_account_id: '', to_account_name: newAccountName.trim() },
            { name: newAccountName.trim(), offBudget: newAccountOffBudget }
          )
        : await confirmAccountTransfer({
            ...data,
            from_account_id: fromId,
            from_account_name: fromAcc?.name ?? fromId,
            to_account_id: toId,
            to_account_name: toAcc?.name ?? toId,
          })
      onConfirmed(result.message)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      onConfirmed(`Error: could not complete transfer (${msg}). Try again via chat.`)
    } finally {
      setLoading(false)
    }
  }

  const selectClass = `
    w-full bg-surface-2 border border-border rounded-lg px-3 py-2
    text-white text-sm focus:outline-none focus:border-accent
    disabled:opacity-50 appearance-none
  `

  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[85%] space-y-3">
      <div>
        <p className="text-white font-medium text-sm">Account transfer</p>
        <p className="text-muted text-xs mt-0.5">{data.date} · €{data.amount.toFixed(2)}</p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-muted text-xs uppercase tracking-wide">From</p>
          <select
            value={fromId}
            onChange={e => setFromId(e.target.value)}
            disabled={loading}
            className={selectClass}
          >
            {accounts.map(a => (
              <option key={a.id} value={a.id} style={{ background: '#1A1A1A' }}>
                {a.name} · €{a.balance.toFixed(2)}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted pl-1">
            <span className="text-red-400">-€{data.amount.toFixed(2)}</span>
          </p>
        </div>

        <div className="flex items-center gap-1 text-muted text-xs pl-1">
          <ArrowRight size={12} />
          <span>€{data.amount.toFixed(2)}</span>
        </div>

        <div className="space-y-1">
          <p className="text-muted text-xs uppercase tracking-wide">To</p>
          {creatingNew ? (
            <div className="space-y-1.5">
              <input
                type="text"
                value={newAccountName}
                onChange={e => setNewAccountName(e.target.value)}
                disabled={loading}
                placeholder="New account name"
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent disabled:opacity-50"
              />
              <label className="flex items-center gap-1.5 text-xs text-muted pl-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newAccountOffBudget}
                  onChange={e => setNewAccountOffBudget(e.target.checked)}
                  disabled={loading}
                  className="accent-accent"
                />
                Off-budget (tracking only)
              </label>
              {accounts.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setCreatingNew(false); setToId(accounts[0].id) }}
                  disabled={loading}
                  className="text-xs text-accent hover:underline pl-1"
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
                  <option key={a.id} value={a.id} style={{ background: '#1A1A1A' }}>
                    {a.name} · €{a.balance.toFixed(2)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => { setCreatingNew(true); setNewAccountName('') }}
                disabled={loading}
                className="text-xs text-accent hover:underline pl-1"
              >
                + Create new account instead
              </button>
            </>
          )}
          <p className="text-xs text-muted pl-1">
            <span className="text-green-400">+€{data.amount.toFixed(2)}</span>
          </p>
        </div>
      </div>

      {data.notes && (
        <p className="text-muted text-xs">{data.notes}</p>
      )}

      <ActionCardButtons
        onConfirm={handleConfirm}
        onCancel={onCancelled}
        loading={loading}
        confirmDisabled={creatingNew ? !newAccountName.trim() : fromId === toId}
        confirmLabel={loading ? 'Processing…' : 'Confirm'}
      />
    </div>
  )
}
