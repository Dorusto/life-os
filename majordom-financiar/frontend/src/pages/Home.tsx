import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LogOut, Bell } from 'lucide-react'
import { getTransactions, getBudgetStatus, getAccounts } from '../lib/api'
import { getUsername, clearAuth } from '../lib/auth'
import { requestAndSubscribe } from '../lib/push'
import TransactionItem from '../components/TransactionItem'
import BudgetDashboard from '../components/BudgetDashboard'

export default function Home() {
  const navigate = useNavigate()

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => getTransactions(5),
  })

  const { data: budgetStatus } = useQuery({
    queryKey: ['budget'],
    queryFn: () => getBudgetStatus(),
    staleTime: 120_000,
  })

  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => getAccounts(),
    staleTime: 120_000,
  })

  const totalBalance = accounts?.reduce((sum, acc) => sum + acc.balance, 0) ?? null

  function handleLogout() {
    clearAuth()
    navigate('/login', { replace: true })
  }

  const username = getUsername()
  const greeting = getGreeting()

  const [notifState, setNotifState] = useState<'default' | 'granted' | 'denied' | 'unsupported'>('granted')

  useEffect(() => {
    if (!('Notification' in window)) { setNotifState('unsupported'); return }
    setNotifState(Notification.permission as 'default' | 'granted' | 'denied')
  }, [])

  async function handleEnableNotifications() {
    const result = await requestAndSubscribe()
    setNotifState(result === 'unsupported' ? 'unsupported' : result)
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col overflow-y-auto">
      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-14 pb-2 flex-shrink-0">
        <div>
          <p className="text-muted text-sm">{greeting}</p>
          <h1 className="text-white text-xl font-semibold capitalize">{username}</h1>
        </div>
        <button
          onClick={handleLogout}
          className="p-2 rounded-xl text-muted hover:text-white hover:bg-surface transition-colors"
          aria-label="Log out"
        >
          <LogOut size={20} />
        </button>
      </header>

      {/* Notification permission banner — shown only when not yet granted */}
      {notifState === 'default' && (
        <button
          onClick={handleEnableNotifications}
          className="mx-5 mt-3 flex items-center gap-3 px-4 py-3 rounded-xl bg-surface border border-border hover:border-accent transition-colors text-left"
        >
          <Bell size={18} className="text-accent flex-shrink-0" />
          <div>
            <p className="text-white text-sm font-medium">Enable daily notifications</p>
            <p className="text-muted text-xs">Get a daily summary from Majordom at 20:00</p>
          </div>
        </button>
      )}

      {/* Budget dashboard */}
      {budgetStatus && budgetStatus.length > 0 && (
        <section className="px-5 pb-4">
          <BudgetDashboard
            categories={budgetStatus}
            month={new Date().getMonth() + 1}
            year={new Date().getFullYear()}
            totalBalance={totalBalance}
          />
        </section>
      )}

      {/* Recent transactions — pb-24 leaves space for the fixed bottom nav */}
      <section className="px-5 pb-24">
        <h2 className="text-muted text-xs uppercase tracking-wide mb-3">Recent</h2>

        {isLoading && (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-surface animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && transactions && transactions.length === 0 && (
          <p className="text-muted text-sm text-center py-6">
            No transactions yet. Use the chat to add your first receipt.
          </p>
        )}

        {!isLoading && transactions && transactions.length > 0 && (
          <div className="space-y-2">
            {transactions.map(tx => (
              <TransactionItem key={tx.id} transaction={tx} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning,'
  if (hour < 18) return 'Good afternoon,'
  return 'Good evening,'
}
