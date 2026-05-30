import { useState, useEffect } from 'react'
import { Loader2, Check } from 'lucide-react'
import { createIncomeSource, getAccountList, AccountListItem } from '../lib/api'

interface IncomeSourceCardProps {
  payee: string
  amount: number   // always positive
  date: string     // "YYYY-MM-DD"
  onConfirmed: (message: string) => void
}

export default function IncomeSourceCard({ payee, amount, date, onConfirmed }: IncomeSourceCardProps) {
  const [mode, setMode] = useState<'income' | 'transfer'>('income')
  const [incomeName, setIncomeName] = useState('')
  const [accountId, setAccountId] = useState('')
  const [accounts, setAccounts] = useState<AccountListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchingAccounts, setFetchingAccounts] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getAccountList()
      .then(setAccounts)
      .catch(() => {})
      .finally(() => setFetchingAccounts(false))
  }, [])

  async function handleSave() {
    setLoading(true)
    setError(null)
    try {
      const result = await createIncomeSource({
        payee,
        type: mode,
        income_name: mode === 'income' ? incomeName.trim() : undefined,
        account_id: mode === 'transfer' ? accountId : undefined,
      })
      if (mode === 'income') {
        const msg = result.updated_count > 0
          ? `Income source saved: ${incomeName}. ${result.updated_count} transaction(s) categorized.`
          : `Income source saved: ${incomeName}.`
        onConfirmed(msg)
      } else {
        onConfirmed('Marked as transfer. Future imports will auto-detect this payee.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[520px] w-full space-y-3">
      {/* Transaction context bar */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-green-400 font-medium">+€{amount.toFixed(2)}</span>
        <span className="text-muted">·</span>
        <span className="text-white">{payee}</span>
        <span className="text-muted">·</span>
        <span className="text-muted">{date.slice(5).replace('-', '/')}</span>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-xl overflow-hidden border border-border text-sm">
        <button
          onClick={() => setMode('income')}
          className={`flex-1 py-1.5 transition-colors ${mode === 'income' ? 'bg-accent text-white' : 'text-muted hover:text-white'}`}
        >Income</button>
        <button
          onClick={() => setMode('transfer')}
          className={`flex-1 py-1.5 transition-colors ${mode === 'transfer' ? 'bg-accent text-white' : 'text-muted hover:text-white'}`}
        >Transfer from account</button>
      </div>

      {/* Income mode panel */}
      {mode === 'income' && (
        <div className="space-y-2">
          <label className="text-xs text-muted">What type of income?</label>
          <input
            type="text"
            value={incomeName}
            onChange={e => setIncomeName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="e.g. Salary Doru, Freelance, Rent income…"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
            autoFocus
          />
        </div>
      )}

      {/* Transfer mode panel */}
      {mode === 'transfer' && (
        <div className="space-y-2">
          <label className="text-xs text-muted">Transfer from:</label>
          {fetchingAccounts ? (
            <div className="flex items-center gap-2 text-muted text-sm">
              <Loader2 size={14} className="animate-spin" /> Loading accounts…
            </div>
          ) : (
            <select
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent transition-colors appearance-none"
            >
              <option value="" disabled>— select account —</option>
              <optgroup label="On budget">
                {accounts.filter(a => !a.off_budget).map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </optgroup>
              <optgroup label="Off budget">
                {accounts.filter(a => a.off_budget).map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </optgroup>
            </select>
          )}
        </div>
      )}

      {/* Error */}
      {error && <p className="text-red-400 text-xs">{error}</p>}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={loading || (mode === 'income' ? !incomeName.trim() : !accountId)}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Check size={14} /> Save</>}
      </button>
    </div>
  )
}
