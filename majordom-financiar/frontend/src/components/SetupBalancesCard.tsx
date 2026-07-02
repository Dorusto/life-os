import { useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { completeSetup, type SetupAccount } from '../lib/api'

interface Props {
  accounts: SetupAccount[]
  onComplete: (message: string) => void
}

export default function SetupBalancesCard({ accounts, onComplete }: Props) {
  const [balances, setBalances] = useState<Record<string, string>>(
    Object.fromEntries(accounts.map(a => [a.id, a.balance.toFixed(2)]))
  )
  const [extras, setExtras] = useState<{ name: string; balance: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Skipped accounts are sent with their current AB balance unchanged (a safe
  // no-op — adjust_account_balance() creates no transaction when the target
  // matches within 1 cent), but marked explicitly so the intent is visible
  // instead of relying on the user noticing the field was pre-filled.
  const [skipped, setSkipped] = useState<Set<string>>(new Set())

  function toggleSkip(accountId: string, currentBalance: number) {
    setSkipped(prev => {
      const next = new Set(prev)
      if (next.has(accountId)) {
        next.delete(accountId)
      } else {
        next.add(accountId)
        setBalances(b => ({ ...b, [accountId]: currentBalance.toFixed(2) }))
      }
      return next
    })
  }

  function addExtra() {
    setExtras(prev => [...prev, { name: '', balance: '' }])
  }

  function updateExtra(idx: number, field: 'name' | 'balance', value: string) {
    setExtras(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
  }

  function removeExtra(idx: number) {
    setExtras(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit() {
    setLoading(true)
    setError(null)
    try {
      const entries = accounts.map(a => ({
        account_id: a.id,
        // Skipped accounts always send the account's current balance,
        // regardless of what's in the input — guarantees a no-op adjustment.
        real_balance: skipped.has(a.id) ? a.balance : parseFloat(balances[a.id] || '0'),
      }))
      const newAccounts = extras
        .filter(e => e.name.trim())
        .map(e => ({ name: e.name.trim(), balance: parseFloat(e.balance || '0') }))

      const result = await completeSetup('today', entries, newAccounts)

      const adjusted = result.adjustments.filter(a => Math.abs(a.adjustment) >= 0.01)
      if (adjusted.length === 0) {
        onComplete('All balances are already up to date. Majordom is ready.')
      } else {
        const parts = adjusted.map(a =>
          `${a.account_name} ${a.adjustment > 0 ? '+' : ''}€${Math.abs(a.adjustment).toFixed(2)}`
        )
        onComplete(`Balances updated — ${parts.join(' · ')}`)
      }
    } catch {
      setError('Could not update balances. Try again.')
      setLoading(false)
    }
  }

  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[85%] space-y-3">
      <div>
        <p className="text-white text-sm font-medium">Enter your real account balances</p>
        <p className="text-muted text-xs mt-0.5">Check your banking app and correct where needed — not sure about one? Skip it, no changes until you investigate</p>
      </div>

      <div className="space-y-2">
        {accounts.map(acc => {
          const isSkipped = skipped.has(acc.id)
          return (
          <div key={acc.id} className="flex items-center gap-3">
            <span className={`text-sm flex-1 truncate ${isSkipped ? 'text-muted' : 'text-white'}`}>{acc.name}</span>
            <button
              type="button"
              onClick={() => toggleSkip(acc.id, acc.balance)}
              className={`text-[11px] px-1.5 py-0.5 rounded-md border transition-colors ${
                isSkipped
                  ? 'border-yellow-500/40 text-yellow-500 bg-yellow-500/10'
                  : 'border-border text-muted hover:text-white'
              }`}
            >
              {isSkipped ? 'Skipped' : 'Skip'}
            </button>
            <div className="flex items-center gap-1.5">
              <span className="text-muted text-sm">€</span>
              <input
                type="number"
                step="0.01"
                disabled={isSkipped}
                value={isSkipped ? acc.balance.toFixed(2) : (balances[acc.id] ?? '')}
                onChange={e => setBalances(prev => ({ ...prev, [acc.id]: e.target.value }))}
                className={`bg-background border border-border rounded-lg px-2 py-1 w-24 text-sm text-right focus:outline-none focus:border-accent transition-colors ${
                  isSkipped ? 'text-muted opacity-50' : 'text-white'
                }`}
              />
            </div>
          </div>
          )
        })}

        {extras.map((extra, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Account name"
              value={extra.name}
              onChange={e => updateExtra(idx, 'name', e.target.value)}
              className="flex-1 bg-background border border-border rounded-lg px-2 py-1 text-white text-sm focus:outline-none focus:border-accent transition-colors"
            />
            <div className="flex items-center gap-1.5">
              <span className="text-muted text-sm">€</span>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={extra.balance}
                onChange={e => updateExtra(idx, 'balance', e.target.value)}
                className="w-20 bg-background border border-border rounded-lg px-2 py-1 text-white text-sm text-right focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <button onClick={() => removeExtra(idx)} className="text-muted hover:text-white transition-colors">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addExtra}
        className="flex items-center gap-1.5 text-muted hover:text-white transition-colors text-xs"
      >
        <Plus size={14} />
        Add account
      </button>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-40 flex items-center justify-center gap-2 active:scale-95"
      >
        {loading ? <Loader2 className="animate-spin" size={14} /> : 'Confirm balances'}
      </button>
    </div>
  )
}
