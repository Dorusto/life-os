import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { createIncomeSource, getAccountList, AccountListItem } from '../lib/api'

interface OwnAccountInfo {
  account_id: string | null
  account_name: string | null
  reason: string
}

interface OwnAccountPanelProps {
  payee: string
  ownAccount: OwnAccountInfo
  interestCategory: string | null | undefined
  onInterest: (category: string) => void
  onConverted: (message: string) => void
}

/**
 * Banner shown on a categorize_with_rule card when the payee looks like one of
 * the user's own accounts (#301). Offers two one-tap paths: convert the payee
 * into a real AB transfer (via the existing POST /api/income/sources endpoint),
 * or set the card's category select to the detected interest category.
 */
export default function OwnAccountPanel({
  payee,
  ownAccount,
  interestCategory,
  onInterest,
  onConverted,
}: OwnAccountPanelProps) {
  const [showConvert, setShowConvert] = useState(false)
  const [accountId, setAccountId] = useState(ownAccount.account_id ?? '')
  const [accounts, setAccounts] = useState<AccountListItem[]>([])
  const [fetchingAccounts, setFetchingAccounts] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!showConvert || accounts.length > 0) return
    setFetchingAccounts(true)
    getAccountList()
      .then(setAccounts)
      .catch(() => {})
      .finally(() => setFetchingAccounts(false))
  }, [showConvert, accounts.length])

  async function handleConvert() {
    setLoading(true)
    setError(null)
    try {
      const result = await createIncomeSource({ payee, type: 'transfer', account_id: accountId })
      const msg = result.updated_count > 0
        ? `Marked as transfer. ${result.updated_count} transaction(s) converted.`
        : 'Marked as transfer. Future imports will auto-detect this payee.'
      onConverted(msg)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to convert')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-token-paper border border-token-line rounded-xl px-3 py-2.5 space-y-2">
      <p className="text-token-ink text-sm">
        Looks like your own account{ownAccount.account_name ? `: ${ownAccount.account_name}` : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-label="Convert to transfer"
          onClick={() => setShowConvert(v => !v)}
          className="px-3 py-1.5 rounded-lg border border-token-line text-token-ink text-xs hover:border-token-brand transition-colors"
        >
          Convert to transfer
        </button>
        {interestCategory && (
          <button
            type="button"
            aria-label="Interest income"
            onClick={() => onInterest(interestCategory)}
            className="px-3 py-1.5 rounded-lg border border-token-line text-token-ink text-xs hover:border-token-brand transition-colors"
          >
            Interest income
          </button>
        )}
      </div>
      {showConvert && (
        <div className="space-y-2">
          {fetchingAccounts ? (
            <div className="flex items-center gap-2 text-token-ink-3 text-xs">
              <Loader2 size={12} className="animate-spin" /> Loading accounts…
            </div>
          ) : (
            <select
              aria-label="Transfer account"
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              className="w-full bg-token-paper border border-token-line rounded-lg px-2.5 py-1.5 text-token-ink text-sm focus:outline-none focus:border-token-brand transition-colors appearance-none"
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
          {error && <p className="text-token-loss text-xs">{error}</p>}
          <button
            type="button"
            onClick={handleConvert}
            disabled={loading || !accountId}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-token-brand hover:bg-token-brand-2 text-token-ink text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? <><Loader2 size={12} className="animate-spin" /> Converting…</> : 'Convert'}
          </button>
        </div>
      )}
    </div>
  )
}
