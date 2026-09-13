import { useState, type ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import { getAccountList, getTransactions, setAccountType, ACCOUNT_TYPES } from '../lib/api'
import { formatCurrency } from '../lib/formatCurrency'
import DetailPageSkeleton from '../components/DetailPageSkeleton'
import { groupByMonth } from '../lib/groupByMonth'

type Tab = 'details' | 'transactions'

const TABS: { value: Tab; label: string }[] = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
]

/**
 * Account drill-down (#194) — one Actual Budget/bank account's name + balance,
 * a Details/Transactions tab switch, and (on Transactions) that account's own
 * transaction list. Balance/type come from getAccountList() (matched client-side
 * by id); transactions come from getTransactions(50, id) which filters server-side.
 */
export default function AccountDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('transactions')
  const [editingType, setEditingType] = useState(false)
  const [typeError, setTypeError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: accounts } = useQuery({
    queryKey: ['account-list'],
    queryFn: () => getAccountList(),
    staleTime: 120_000,
  })

  const account = accounts?.find(a => a.id === id)

  const { data: transactions } = useQuery({
    queryKey: ['transactions', 'account', id],
    queryFn: () => getTransactions(50, id!),
    enabled: !!account,
  })

  // `accounts` starts undefined while the list is still loading — render
  // nothing (not "Account not found") until it resolves, otherwise a fresh
  // page load briefly flashes the not-found state before real content ever
  // gets a chance to render.
  if (!accounts) {
    return <DetailPageSkeleton />
  }

  if (!account) {
    return (
      <div className="min-h-dvh bg-token-paper flex flex-col px-5 pt-14">
        <button
          onClick={() => navigate('/accounts')}
          className="flex items-center gap-1 text-token-ink-3 hover:text-token-ink transition-colors text-sm self-start"
        >
          <ChevronLeft size={16} /> Accounts
        </button>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 pb-24">
          <p className="font-plex-sans text-xl font-bold text-token-ink">Account not found</p>
          <button
            onClick={() => navigate('/accounts')}
            className="text-token-brand-ink text-sm font-medium hover:opacity-80 transition-opacity"
          >
            Back to accounts
          </button>
        </div>
      </div>
    )
  }

  async function handleTypeChange(event: ChangeEvent<HTMLSelectElement>) {
    if (!account) return
    const value = event.target.value
    try {
      await setAccountType(account.id, value)
      await queryClient.invalidateQueries({ queryKey: ['account-list'] })
      setTypeError(null)
    } catch (err) {
      setTypeError(err instanceof Error ? err.message : 'Failed to update category')
    }
    setEditingType(false)
  }

  return (
    <div className="h-dvh bg-token-paper flex flex-col overflow-y-auto">
      <header className="flex-shrink-0 px-5 pb-3 pt-14">
        <button
          onClick={() => navigate('/accounts')}
          className="flex items-center gap-1 text-token-ink-3 hover:text-token-ink transition-colors text-sm mb-3"
        >
          <ChevronLeft size={16} /> Accounts
        </button>
        <p className="font-plex-mono text-[11px] uppercase tracking-wide text-token-ink-3">Balance</p>
        <h1 className="font-plex-sans text-3xl font-bold text-token-ink truncate">{account.name}</h1>
        <p className="font-plex-mono font-medium text-3xl mt-1 tabular-nums">
          {formatCurrency(account.balance, { decimals: 0 })}
        </p>
      </header>

      <section className="px-5 pt-2 pb-24">
        <div className="flex items-center gap-1 bg-token-paper rounded-full p-1 border border-token-line w-fit">
          {TABS.map(t => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`text-[11px] font-semibold px-3.5 py-1 rounded-full transition-colors ${
                tab === t.value ? 'bg-token-brand text-token-ink' : 'text-token-ink-3 hover:text-token-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'details' ? (
          <div className="mt-4 bg-token-surface border border-token-line rounded-2xl px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[13.5px] text-token-ink-3">Budget</p>
              <p className="text-[13.5px] font-semibold">{account.off_budget ? 'Off-budget' : 'On-budget'}</p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13.5px] text-token-ink-3">Category</p>
              {editingType ? (
                <select
                  autoFocus
                  value={account.account_type ?? ''}
                  onChange={handleTypeChange}
                  onBlur={() => setEditingType(false)}
                  className="bg-token-surface-2 border border-token-line text-[13.5px] font-semibold px-2 py-1 rounded-lg"
                >
                  <option value="" disabled>Select…</option>
                  {ACCOUNT_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              ) : (
                <button
                  onClick={() => setEditingType(true)}
                  className="text-[13.5px] font-semibold hover:text-token-brand-ink transition-colors"
                >
                  {account.account_type ?? 'Not set'}
                </button>
              )}
            </div>
            {typeError && <p className="text-token-loss text-xs">{typeError}</p>}
          </div>
        ) : (
          <div className="mt-2">
            {!transactions || transactions.length === 0 ? (
              <p className="text-token-ink-3 text-xs py-3">No transactions for this account yet.</p>
            ) : (
              groupByMonth(
                transactions,
                tx => tx.date,
                tx => (tx.is_expense ? -Math.abs(tx.amount) : Math.abs(tx.amount))
              ).map(group => (
                <div key={group.label} className="mb-3">
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-token-ink-3 text-xs font-semibold uppercase tracking-wide">{group.label}</span>
                    <span
                      className={`font-plex-mono text-xs tabular-nums ${group.total >= 0 ? 'text-token-gain' : 'text-token-ink-3'}`}
                    >
                      {formatCurrency(group.total, { decimals: 0, signDisplay: 'always' })}
                    </span>
                  </div>
                  {group.items.map(tx => (
                    <div key={tx.id} className="flex items-center gap-2.5 py-2.5 border-b border-token-line last:border-b-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] font-medium truncate">{tx.merchant}</p>
                        <p className="text-[11.5px] text-token-ink-3 truncate">{tx.category ?? 'Uncategorized'}</p>
                      </div>
                      <p className={`font-plex-mono text-[13.5px] tabular-nums flex-shrink-0 ${!tx.is_expense ? 'text-token-gain' : ''}`}>
                        {formatCurrency(tx.is_expense ? -Math.abs(tx.amount) : Math.abs(tx.amount), { signDisplay: 'always' })}
                      </p>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  )
}
