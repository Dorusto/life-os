import { useQuery } from '@tanstack/react-query'
import { Wallet } from 'lucide-react'
import { getAccountList, type AccountListItem } from '../lib/api'
import PageHeader from '../components/PageHeader'
import StandardHeaderActions from '../components/StandardHeaderActions'

/**
 * Accounts tab (decisions.md#nav-five-tabs) — UI shell for now: a real, live
 * account list, but no drill-down into a single account yet. That's #194.
 */
export default function Accounts() {
  const { data: accounts } = useQuery({
    queryKey: ['account-list'],
    queryFn: () => getAccountList(),
    staleTime: 120_000,
  })

  const total = accounts?.reduce((sum, a) => sum + a.balance, 0) ?? 0
  const onBudget = accounts?.filter(a => !a.off_budget) ?? []
  const offBudget = accounts?.filter(a => a.off_budget) ?? []

  return (
    <div className="min-h-dvh bg-background flex flex-col overflow-y-auto">
      <PageHeader
        label={accounts ? `${accounts.length} account${accounts.length !== 1 ? 's' : ''} · Actual Budget` : 'Actual Budget'}
        title="Accounts"
        actions={<StandardHeaderActions />}
      />
      <section className="px-5 pt-2 pb-24">
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Total</p>
        <p className="font-mono font-medium text-3xl mt-1 tabular-nums">
          €{total.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}
        </p>

        {onBudget.length > 0 && (
          <>
            <p className="font-mono text-[11px] uppercase tracking-wide text-muted mt-6 mb-2">On budget</p>
            <div className="space-y-2.5">
              {onBudget.map(a => <AccountRow key={a.id} account={a} />)}
            </div>
          </>
        )}
        {offBudget.length > 0 && (
          <>
            <p className="font-mono text-[11px] uppercase tracking-wide text-muted mt-6 mb-2">Off budget</p>
            <div className="space-y-2.5">
              {offBudget.map(a => <AccountRow key={a.id} account={a} />)}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function AccountRow({ account }: { account: AccountListItem }) {
  return (
    <div className="flex items-center gap-3 bg-surface border border-border rounded-2xl px-3.5 py-3.5">
      <div className="w-9 h-9 rounded-xl bg-surface-2 flex items-center justify-center text-muted flex-shrink-0">
        <Wallet size={16} />
      </div>
      <p className="flex-1 min-w-0 text-[13.5px] font-semibold truncate">{account.name}</p>
      <p className="font-mono text-sm tabular-nums flex-shrink-0">
        €{account.balance.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}
      </p>
    </div>
  )
}
