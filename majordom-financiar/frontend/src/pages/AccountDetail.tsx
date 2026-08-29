import { useState, type ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import { getAccountList, getTransactions, setAccountType, ACCOUNT_TYPES } from '../lib/api'
import { formatCurrency } from '../lib/formatCurrency'

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
    return <div className="min-h-dvh bg-background" />
  }

  if (!account) {
    return (
      <div className="min-h-dvh bg-background flex flex-col px-5 pt-14">
        <button
          onClick={() => navigate('/accounts')}
          className="flex items-center gap-1 text-muted hover:text-white transition-colors text-sm self-start"
        >
          <ChevronLeft size={16} /> Accounts
        </button>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 pb-24">
          <p className="font-display text-xl font-bold text-white">Account not found</p>
          <button
            onClick={() => navigate('/accounts')}
            className="text-accent text-sm font-medium hover:opacity-80 transition-opacity"
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
    <div className="min-h-dvh bg-background flex flex-col overflow-y-auto">
      <header className="flex-shrink-0 px-5 pb-3 pt-14">
        <button
          onClick={() => navigate('/accounts')}
          className="flex items-center gap-1 text-muted hover:text-white transition-colors text-sm mb-3"
        >
          <ChevronLeft size={16} /> Accounts
        </button>
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Balance</p>
        <h1 className="font-display text-3xl font-bold text-white truncate">{account.name}</h1>
        <p className="font-mono font-medium text-3xl mt-1 tabular-nums">
          {formatCurrency(account.balance, { decimals: 0 })}
        </p>
      </header>

      <section className="px-5 pt-2 pb-24">
        <div className="flex items-center gap-1 bg-background rounded-full p-1 border border-border w-fit">
          {TABS.map(t => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`text-[11px] font-semibold px-3.5 py-1 rounded-full transition-colors ${
                tab === t.value ? 'bg-accent text-white' : 'text-muted hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'details' ? (
          <div className="mt-4 bg-surface border border-border rounded-2xl px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[13.5px] text-muted">Budget</p>
              <p className="text-[13.5px] font-semibold">{account.off_budget ? 'Off-budget' : 'On-budget'}</p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13.5px] text-muted">Category</p>
              {editingType ? (
                <select
                  autoFocus
                  value={account.account_type ?? ''}
                  onChange={handleTypeChange}
                  onBlur={() => setEditingType(false)}
                  className="bg-surface-2 border border-border text-[13.5px] font-semibold px-2 py-1 rounded-lg"
                >
                  <option value="" disabled>Select…</option>
                  {ACCOUNT_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              ) : (
                <button
                  onClick={() => setEditingType(true)}
                  className="text-[13.5px] font-semibold hover:text-accent transition-colors"
                >
                  {account.account_type ?? 'Not set'}
                </button>
              )}
            </div>
            {typeError && <p className="text-danger text-xs">{typeError}</p>}
          </div>
        ) : (
          <div className="mt-2">
            {!transactions || transactions.length === 0 ? (
              <p className="text-muted text-xs py-3">No transactions for this account yet.</p>
            ) : (
              transactions.map(tx => (
                <div key={tx.id} className="flex items-center gap-2.5 py-2.5 border-b border-border last:border-b-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-medium truncate">{tx.merchant}</p>
                    <p className="text-[11.5px] text-muted truncate">{tx.category ?? 'Uncategorized'}</p>
                  </div>
                  <p className={`font-mono text-[13.5px] tabular-nums flex-shrink-0 ${!tx.is_expense ? 'text-positive' : ''}`}>
                    {formatCurrency(tx.is_expense ? -Math.abs(tx.amount) : Math.abs(tx.amount), { signDisplay: 'always' })}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  )
}
