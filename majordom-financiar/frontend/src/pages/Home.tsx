import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LogOut, Bell, MoreVertical, Wallet, Database, Car, AlertCircle, ChevronRight } from 'lucide-react'
import { getHomeData, getHomePending } from '../lib/api'
import { getUsername, clearAuth } from '../lib/auth'
import { requestAndSubscribe } from '../lib/push'
import BudgetDashboard from '../components/BudgetDashboard'
import FireWidget from '../components/FireWidget'
import { useState, useEffect, useRef } from 'react'

const GOAL_COLORS = ['#F59E0B', '#3B82F6', '#22C55E', '#8B5CF6', '#EC4899']

export default function Home() {
  const navigate = useNavigate()

  const { data: homeData } = useQuery({
    queryKey: ['home'],
    queryFn: () => getHomeData(),
    staleTime: 120_000,
  })

  const { data: pendingItems } = useQuery({
    queryKey: ['home-pending'],
    queryFn: () => getHomePending(),
    staleTime: 120_000,
  })
  const [pendingExpanded, setPendingExpanded] = useState(false)

  const budgetStatus = homeData?.budget
  const stats = homeData?.stats
  const goals = homeData?.goals
  const fireData = homeData?.fire
  const accountCount = homeData?.account_count
  const cashflow = stats ? stats.income - stats.total : null
  const cashflowTrend = stats && stats.prev_cashflow !== undefined ? cashflow! - stats.prev_cashflow : null

  function handleLogout() {
    clearAuth()
    navigate('/login', { replace: true })
  }

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const origin = `${window.location.protocol}//${window.location.hostname}`
  // Public Actual Budget URL — set VITE_ACTUAL_BUDGET_URL at build time for a
  // custom domain; otherwise falls back to this host on AB's default port.
  const actualBudgetUrl = import.meta.env.VITE_ACTUAL_BUDGET_URL || `${origin}:5006`

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

  const now = new Date()
  const monthName = now.toLocaleString('default', { month: 'long' })

  return (
    <div className="min-h-dvh bg-background flex flex-col overflow-y-auto">
      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-14 pb-2 flex-shrink-0">
        <div>
          <p className="text-xs tracking-widest uppercase text-muted">{greeting}</p>
          <h1 className="font-display text-3xl font-bold text-white capitalize">{username}</h1>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="p-2 rounded-xl text-muted hover:text-white hover:bg-surface transition-colors"
            aria-label="Menu"
          >
            <MoreVertical size={20} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 rounded-xl bg-surface border border-border shadow-lg z-50 overflow-hidden">
              <a
                href={actualBudgetUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/5 transition-colors"
              >
                <Wallet size={16} className="text-muted flex-shrink-0" />
                Actual Budget
              </a>
              <a
                href={`${origin}:8888`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/5 transition-colors"
              >
                <Database size={16} className="text-muted flex-shrink-0" />
                Majordom Memory
              </a>
              <a
                href={`${origin}:8889`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/5 transition-colors"
              >
                <Car size={16} className="text-muted flex-shrink-0" />
                Vehicle Manager
              </a>
              <div className="border-t border-border" />
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-white/5 transition-colors"
              >
                <LogOut size={16} className="flex-shrink-0" />
                Log out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Notification permission banner */}
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

      {/* Needs resolving — all pending digest items, expandable, each item
          taps through to chat with a pre-filled starting prompt (#130) */}
      {pendingItems && pendingItems.length > 0 && (
        <div className="mx-5 mt-3 rounded-xl bg-surface border border-yellow-500/30 overflow-hidden">
          <button
            onClick={() => setPendingExpanded(o => !o)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left"
          >
            <AlertCircle size={18} className="text-yellow-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-white text-sm font-medium">Needs resolving</p>
              <p className="text-muted text-xs">
                {pendingItems.length} thing{pendingItems.length !== 1 ? 's' : ''} to look at
              </p>
            </div>
            <ChevronRight
              size={16}
              className={`text-muted flex-shrink-0 transition-transform ${pendingExpanded ? 'rotate-90' : ''}`}
            />
          </button>
          {pendingExpanded && (
            <div className="border-t border-border divide-y divide-border">
              {pendingItems.map((item, i) => (
                <button
                  key={i}
                  onClick={() => navigate('/chat', { state: { prefill: item.prompt } })}
                  className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-white/5 transition-colors"
                >
                  <span className="text-white text-sm">{item.text}</span>
                  <ChevronRight size={14} className="text-muted flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state (brand-new install) or normal dashboard */}
      {homeData && accountCount === 0 ? (
        <section className="px-5 pt-4 pb-24">
          <div className="bg-surface border border-border rounded-2xl px-5 py-6">
            <h2 className="font-display text-xl font-bold text-white mb-4">Let's get started</h2>
            <ul className="space-y-2 text-muted mb-5">
              <li className="flex gap-2">
                <span className="text-accent">→</span>
                Upload a CSV export from your bank
              </li>
              <li className="flex gap-2">
                <span className="text-accent">→</span>
                Take a photo of a receipt
              </li>
              <li className="flex gap-2">
                <span className="text-accent">→</span>
                Just ask a question — "How much did I spend on groceries?"
              </li>
            </ul>
            <button
              onClick={() => navigate('/chat')}
              className="w-full py-3 rounded-xl bg-accent text-white font-semibold hover:opacity-90 transition-opacity"
            >
              Go to Chat
            </button>
          </div>
        </section>
      ) : (
        <>
          {/* Key metrics row */}
          <section className="px-5 pt-4 pb-2">
            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                label="Cashflow"
                sublabel={monthName}
                value={cashflow}
                format="currency"
                highlight={cashflow !== null ? (cashflow >= 0 ? 'positive' : 'negative') : 'neutral'}
                trend={cashflowTrend}
              />
              <FireWidget data={fireData ?? null} />
            </div>
          </section>

          {/* Goals section — individual cards with colored borders */}
          {goals && goals.length > 0 && (
            <section className="px-5 pb-2">
              <p className="text-xs tracking-[0.2em] uppercase text-muted mb-4">Financial Goals</p>
              <div className="space-y-3">
                {goals.map((goal, idx) => (
                  <GoalCard key={goal.id} goal={goal} color={GOAL_COLORS[idx % GOAL_COLORS.length]} />
                ))}
              </div>
            </section>
          )}

          {/* Budget dashboard */}
          {budgetStatus && budgetStatus.length > 0 && (
            <section className="px-5 pb-24">
              <BudgetDashboard
                categories={budgetStatus}
                month={now.getMonth() + 1}
                year={now.getFullYear()}
              />
            </section>
          )}
        </>
      )}

    </div>
  )
}

function formatGoalAmount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return value.toLocaleString('nl-NL', { maximumFractionDigits: 0 })
  return value.toFixed(0)
}

interface GoalCardProps {
  goal: {
    id: string
    name: string
    target: number
    balance: number
    percentage: number
    deadline?: string | null
    monthly_needed?: number | null
    months_remaining?: number | null
  }
  color: string
}

function formatDeadline(deadline: string): string {
  const [year, month] = deadline.split('-').map(Number)
  const d = new Date(year, month - 1)
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

function GoalCard({ goal, color }: GoalCardProps) {
  return (
    <div
      className="bg-surface border border-border rounded-2xl overflow-hidden"
      style={{ borderTopColor: color, borderTopWidth: '3px' }}
    >
      <div className="px-4 pt-4 pb-3">
        {/* Row 1: name | target */}
        <div className="flex items-start justify-between mb-1">
          <p className="text-white font-semibold text-base">{goal.name}</p>
          <div className="text-right">
            <p className="font-display font-bold text-xl" style={{ color }}>
              €{formatGoalAmount(goal.target)}
            </p>
            <p className="text-muted text-xs">
              €{formatGoalAmount(goal.balance)} saved
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative w-full h-px bg-border/40 rounded-full overflow-hidden mt-3">
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(goal.percentage, 100)}%`,
              backgroundColor: color,
            }}
          />
        </div>

        {/* Bottom row: remaining | deadline/monthly */}
        <div className="flex items-center justify-between mt-2">
          <p className="text-muted text-xs">
            Remaining{' '}
            <span className="text-white font-mono tabular-nums">
              €{formatGoalAmount(goal.target - goal.balance)}
            </span>
          </p>
          <div className="text-right">
            {goal.deadline && (
              <p className="text-muted text-xs">
                by <span className="text-white">{formatDeadline(goal.deadline)}</span>
              </p>
            )}
            {goal.monthly_needed != null && goal.monthly_needed > 0 && (
              <p className="text-xs font-mono tabular-nums" style={{ color }}>
                €{formatGoalAmount(goal.monthly_needed)}/mo
              </p>
            )}
            {(!goal.deadline) && (
              <p className="text-xs font-mono tabular-nums" style={{ color }}>
                {goal.percentage.toFixed(0)}%
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface MetricCardProps {
  label: string
  sublabel: string
  value: number | null
  format: 'currency' | 'percent'
  highlight: 'positive' | 'negative' | 'neutral'
  trend?: number | null
}

function MetricCard({ label, sublabel, value, format, highlight, trend }: MetricCardProps) {
  const formatted = value === null
    ? '—'
    : format === 'currency'
      ? formatCurrency(value)
      : `${value.toFixed(1)}%`

  const valueClass =
    highlight === 'positive' ? 'text-emerald-400' :
    highlight === 'negative' ? 'text-red-400' :
    'text-white'

  const topColor =
    highlight === 'positive' ? '#22C55E' :
    highlight === 'negative' ? '#EF4444' :
    '#3B82F6'

  return (
    <div
      className="bg-surface border border-border rounded-2xl px-4 py-4 overflow-hidden"
      style={{ borderTopColor: topColor, borderTopWidth: '3px' }}
    >
      <p className={`font-display text-2xl font-bold tabular-nums ${valueClass}`}>{formatted}</p>
      <p className="text-white text-sm font-medium mt-1">{label}</p>
      <p className="text-muted text-xs">{sublabel}</p>
      {trend !== null && trend !== undefined && (
        <p className={`text-xs mt-1 ${trend > 0 ? 'text-emerald-400' : trend < 0 ? 'text-red-400' : 'text-muted'}`}>
          {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} {formatCurrency(Math.abs(trend))} vs last month
        </p>
      )}
    </div>
  )
}

function formatCurrency(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}€${(abs / 1_000).toFixed(1)}k`
  return `${sign}€${abs.toFixed(0)}`
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning,'
  if (hour < 18) return 'Good afternoon,'
  return 'Good evening,'
}
