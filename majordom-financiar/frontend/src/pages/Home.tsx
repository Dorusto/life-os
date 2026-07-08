import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LogOut, Bell, MoreVertical, RefreshCw, Wallet, Database, Car, AlertCircle, ChevronRight } from 'lucide-react'
import {
  getHomeData, getHomePending, syncAccounts, getBudgetPeriod,
  type FireData, type BudgetCategory, type BudgetPeriod,
} from '../lib/api'
import { getUsername, clearAuth } from '../lib/auth'
import { requestAndSubscribe } from '../lib/push'
import BudgetDashboard from '../components/BudgetDashboard'
import Chart, { type LineData } from '../components/Chart'
import Card from '../components/Card'
import InfoIcon from '../components/InfoIcon'
import PageHeader from '../components/PageHeader'
import IconButton from '../components/IconButton'
import BottomSheet from '../components/BottomSheet'
import { useState, useEffect, useRef } from 'react'

const GOAL_COLORS = ['#F59E0B', '#3B82F6', '#22C55E', '#8B5CF6', '#EC4899']

// Maps a pending item's backend `type` to the tag shown in the Needs
// Resolving sheet — unknown/future types fall back to the "finance" look
// rather than showing nothing.
const PENDING_TAGS: Record<string, { label: string; className: string }> = {
  uncategorized: { label: 'finance', className: 'bg-info-dim text-info' },
  unreconciled: { label: 'finance', className: 'bg-info-dim text-info' },
  over_budget: { label: 'finance', className: 'bg-info-dim text-info' },
  vehicle_reminder: { label: 'vehicle', className: 'bg-attention-dim text-attention' },
}
const DEFAULT_PENDING_TAG = { label: 'finance', className: 'bg-info-dim text-info' }

export default function Home() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

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
  const [pendingSheetOpen, setPendingSheetOpen] = useState(false)

  const budgetStatus = homeData?.budget
  const goals = homeData?.goals
  const fireData = homeData?.fire
  const accountCount = homeData?.account_count

  function handleLogout() {
    clearAuth()
    navigate('/login', { replace: true })
  }

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'failed'>('idle')

  async function handleSync() {
    setSyncState('syncing')
    try {
      await syncAccounts()
      await queryClient.invalidateQueries({ queryKey: ['home'] })
      setSyncState('idle')
    } catch {
      setSyncState('failed')
    }
  }

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

  return (
    <div className="min-h-dvh bg-background flex flex-col overflow-y-auto">
      {/* Header */}
      <PageHeader
        label={greeting}
        title={username ?? ''}
        actions={
          <>
            {pendingItems && pendingItems.length > 0 && (
              <IconButton
                icon={AlertCircle}
                onClick={() => setPendingSheetOpen(true)}
                label="Needs resolving"
                badge={
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-attention text-background text-[10px] font-bold flex items-center justify-center">
                    {pendingItems.length}
                  </span>
                }
              />
            )}
            <IconButton
              icon={RefreshCw}
              onClick={handleSync}
              label="Sync accounts"
              disabled={syncState === 'syncing'}
              iconClassName={syncState === 'syncing' ? 'animate-spin' : ''}
              badge={syncState === 'failed' ? <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger" /> : undefined}
            />
            <div className="relative ml-1" ref={menuRef}>
              <IconButton icon={MoreVertical} onClick={() => setMenuOpen(o => !o)} label="Menu" />
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
          </>
        }
      />

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

      {/* Needs resolving — badge in the header opens this sheet; each row taps
          through to chat with a pre-filled starting prompt (#130, moved from
          an inline expandable banner to a popup behind the badge for #165) */}
      {pendingItems && pendingItems.length > 0 && (
        <BottomSheet
          open={pendingSheetOpen}
          onClose={() => setPendingSheetOpen(false)}
          title="⚠️ Needs resolving"
        >
          <p className="text-muted text-xs mb-3">
            {pendingItems.length} thing{pendingItems.length !== 1 ? 's' : ''} to check
          </p>
          <div className="-mx-6 border-t border-border divide-y divide-border">
            {pendingItems.map((item, i) => {
              const tag = PENDING_TAGS[item.type] ?? DEFAULT_PENDING_TAG
              return (
                <button
                  key={i}
                  onClick={() => {
                    setPendingSheetOpen(false)
                    navigate('/chat', { state: { prefill: item.prompt } })
                  }}
                  className="w-full flex items-center justify-between gap-2 px-6 py-3 text-left hover:bg-white/5 transition-colors"
                >
                  <span className="text-white text-sm">
                    {item.text}{' '}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tag.className}`}>{tag.label}</span>
                  </span>
                  <ChevronRight size={14} className="text-muted flex-shrink-0" />
                </button>
              )
            })}
          </div>
        </BottomSheet>
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
          {/* Financial Goals — Portfolio Independence (from FIRE data) first, then user goals */}
          <section className="px-5 pt-4 pb-2">
            <p className="text-xs tracking-[0.2em] uppercase text-muted mb-4">Financial Goals</p>
            <div className="space-y-3">
              {fireData && <PortfolioIndependenceCard data={fireData} navigate={navigate} />}
              {goals && goals.length > 0 ? (
                <>
                  {goals.map((goal, idx) => (
                    <GoalCard key={goal.id} goal={goal} color={GOAL_COLORS[idx % GOAL_COLORS.length]} navigate={navigate} />
                  ))}
                  <AddAnotherGoalRow navigate={navigate} />
                </>
              ) : (
                <EmptyGoalsCard navigate={navigate} />
              )}
            </div>
          </section>

          {/* Budget dashboard */}
          {budgetStatus && budgetStatus.length > 0 && (
            <section className="px-5 pb-24">
              <BudgetPeriodCard
                initialCategories={budgetStatus}
                initialMonth={now.getMonth() + 1}
                initialYear={now.getFullYear()}
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
    note?: string | null
  }
  color: string
  navigate: NavigateFn
}

function formatDeadline(deadline: string): string {
  const [year, month] = deadline.split('-').map(Number)
  const d = new Date(year, month - 1)
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

function GoalCard({ goal, color, navigate }: GoalCardProps) {
  return (
    <Card accentColor={color} accentSide="left" className="!p-0">
      <div className="px-4 py-4">
        {/* Row 1: name + info | target */}
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-white font-semibold text-[15px]">
            {goal.name}
            <InfoIcon title={goal.name}>
              {goal.note ? (
                <p>{goal.note}</p>
              ) : (
                <>
                  <p>No description set for this goal yet.</p>
                  <button
                    onClick={() => navigate('/chat', {
                      state: { prefill: `Set the description for my ${goal.name} goal to: ` },
                    })}
                    className="mt-1.5 underline underline-offset-2 font-medium text-white"
                  >
                    Set a description →
                  </button>
                </>
              )}
            </InfoIcon>
          </p>
          <p className="font-display font-bold text-lg tabular-nums flex-shrink-0" style={{ color }}>
            €{formatGoalAmount(goal.target)}
          </p>
        </div>

        {/* Row 2: progress bar — hairline (3px), per Home redesign design system */}
        <div className="relative w-full h-px bg-border/40 rounded-full overflow-hidden mt-3 mb-2.5">
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(goal.percentage, 100)}%`, backgroundColor: color }}
          />
        </div>

        {/* Row 3: saved | monthly contribution */}
        <div className="flex items-center justify-between text-xs text-muted">
          <span>€{formatGoalAmount(goal.balance)} saved</span>
          {goal.monthly_needed != null && goal.monthly_needed > 0 && (
            <span>€{formatGoalAmount(goal.monthly_needed)}/mo</span>
          )}
        </div>

        {/* Row 4: target date, or percentage if no deadline is set */}
        <div className="text-right text-[11px] text-muted-2 mt-1.5">
          {goal.deadline ? `target: ${formatDeadline(goal.deadline)}` : `${goal.percentage.toFixed(0)}%`}
        </div>
      </div>
    </Card>
  )
}

function fmtK(n: number): string {
  if (n >= 1000) return `€${Math.round(n / 1000)}k`
  return `€${Math.round(n)}`
}

const FIRE_ASSUMPTIONS_PREFILL = 'I want to set my real retirement assumptions — timeline, monthly spend, and contribution.'

function PortfolioIndependenceCard({ data, navigate }: { data: FireData; navigate: NavigateFn }) {
  const color = '#4F8EF7' // info
  const trend = data.trend_months

  return (
    <Card accentColor={color} accentSide="left" className="!p-0">
      <div className="px-4 py-4">
        {/* Row 1: name + info | percentage */}
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-white font-semibold text-[15px]">
            Portfolio Independence
            <InfoIcon title="Portfolio Independence">
              <p className="mb-2">
                Money saved to eventually live off investments alone, for a long stretch of time — not
                forever, but for the years you've planned.
              </p>
              <p className="mb-2">
                Counts your off-budget accounts (savings, brokerage, crypto) — your home and any mortgage
                are excluded. Assumes a {(data.accumulation_return * 100).toFixed(0)}% return during
                accumulation, {(data.decumulation_return * 100).toFixed(0)}% during retirement, and your
                current {fmtK(data.monthly_contribution)}/mo contribution.
              </p>
              <p>
                Target ({fmtK(data.fire_target)}) is the principal needed today to fund{' '}
                {fmtK(data.desired_monthly_spend)}/mo for {data.years_in_retirement} years at{' '}
                {(data.decumulation_return * 100).toFixed(0)}% return.
              </p>
              {data.is_default_assumptions && (
                <div className="mt-2 text-yellow-400">
                  <p>
                    "Placeholder" means these numbers aren't yours yet — they're generic defaults so the
                    card has something to show before you've told Majordom your real plans. Tap below to
                    open Chat and set your real timeline, monthly spend, and contribution.
                  </p>
                  <button
                    onClick={() => navigate('/chat', { state: { prefill: FIRE_ASSUMPTIONS_PREFILL } })}
                    className="mt-1.5 underline underline-offset-2 font-medium"
                  >
                    Set my real numbers →
                  </button>
                </div>
              )}
            </InfoIcon>
          </p>
          <p className="font-display font-bold text-lg tabular-nums flex-shrink-0" style={{ color }}>
            {data.fire_pct.toFixed(0)}%
          </p>
        </div>

        {/* Row 2: progress bar */}
        <div className="relative w-full h-px bg-border/40 rounded-full overflow-hidden mt-3 mb-2.5">
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(data.fire_pct, 100)}%`, backgroundColor: color }}
          />
        </div>

        {/* Row 3: saved | monthly contribution */}
        <div className="flex items-center justify-between text-xs text-muted">
          <span>{fmtK(data.fire_portfolio)} saved</span>
          <span>{fmtK(data.monthly_contribution)}/mo</span>
        </div>

        {/* Row 4: target | estimated year + trend vs last month */}
        <div className="flex items-center justify-between text-[11px] text-muted-2 mt-1.5">
          <span>target ~{fmtK(data.fire_target)}</span>
          <span>
            {data.estimated_year ? `est. ${data.estimated_year}` : '—'}
            {trend != null && trend !== 0 && (
              <span className={`font-bold ml-1 ${trend > 0 ? 'text-positive' : 'text-danger'}`}>
                {trend > 0 ? '▲' : '▼'}{Math.abs(trend)}mo
              </span>
            )}
          </span>
        </div>

        {data.is_default_assumptions && (
          <button
            onClick={() => navigate('/chat', { state: { prefill: FIRE_ASSUMPTIONS_PREFILL } })}
            className="w-full text-[10px] text-yellow-500/70 hover:text-yellow-400 mt-2 text-center underline underline-offset-2"
          >
            Placeholder assumptions — set your real numbers in Chat
          </button>
        )}
      </div>
    </Card>
  )
}

type NavigateFn = ReturnType<typeof useNavigate>

const GOAL_CHIPS: { label: string; colorClass: string; prefill: string }[] = [
  {
    label: 'Expense Coverage',
    colorClass: 'bg-positive-dim text-positive',
    prefill: 'I want to set up an Expense Coverage goal — how does that work?',
  },
  {
    label: 'FIRE',
    colorClass: 'bg-positive-dim text-positive',
    prefill: 'I want to check my FIRE / Portfolio Independence assumptions.',
  },
  {
    label: 'Custom goal',
    colorClass: 'bg-attention-dim text-attention',
    prefill: 'I want to create a new savings goal.',
  },
]

function EmptyGoalsCard({ navigate }: { navigate: NavigateFn }) {
  return (
    <Card className="!border-dashed text-center">
      <p className="text-xl text-muted-2 mb-1.5">+</p>
      <p className="text-white font-semibold text-[15px] mb-2.5">Create your first goal</p>
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {GOAL_CHIPS.map(chip => (
          <button
            key={chip.label}
            onClick={() => navigate('/chat', { state: { prefill: chip.prefill } })}
            className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${chip.colorClass}`}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </Card>
  )
}

function AddAnotherGoalRow({ navigate }: { navigate: NavigateFn }) {
  return (
    <button
      onClick={() => navigate('/chat', { state: { prefill: 'I want to create a new savings goal.' } })}
      className="w-full py-2.5 rounded-xl border border-dashed border-border text-muted text-xs text-center hover:border-accent hover:text-white transition-colors"
    >
      + Add another goal
    </button>
  )
}

const PERIOD_OPTIONS: { value: BudgetPeriod; label: string }[] = [
  { value: 'month', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '12m', label: '12M' },
]

const PERIOD_MONTHS: Record<BudgetPeriod, number> = { month: 1, '3m': 3, '6m': 6, '12m': 12 }

const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function BudgetPeriodCard({
  initialCategories, initialMonth, initialYear,
}: {
  initialCategories: BudgetCategory[]
  initialMonth: number
  initialYear: number
}) {
  const [period, setPeriod] = useState<BudgetPeriod>('month')
  const [month, setMonth] = useState(initialMonth)
  const [year, setYear] = useState(initialYear)
  const [loading, setLoading] = useState(false)
  const [monthCategories, setMonthCategories] = useState(initialCategories)
  const [trend, setTrend] = useState<{ range_label: string; title: string; data: LineData; requestId: number } | null>(null)

  // Every load() bumps this; a response only gets applied if it's still the
  // most recent request. Actual Budget serializes requests through one lock
  // backend-side, so a fast click sequence (period switch right after a nav
  // shift) can leave an earlier request still in flight — without this guard
  // it can resolve after the newer one and overwrite the screen with stale
  // data (verified live: nav label updated to the new window, chart didn't).
  const requestIdRef = useRef(0)

  async function load(p: BudgetPeriod, m: number, y: number) {
    const requestId = ++requestIdRef.current
    setLoading(true)
    try {
      const result = await getBudgetPeriod(p, m, y)
      if (requestId !== requestIdRef.current) return
      setMonth(result.month)
      setYear(result.year)
      if (result.mode === 'month') {
        setMonthCategories(result.categories)
        setTrend(null)
      } else {
        setTrend({ range_label: result.range_label, title: result.title, data: result.data, requestId })
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }

  function selectPeriod(p: BudgetPeriod) {
    if (p === period) return
    setPeriod(p)
    load(p, month, year)
  }

  function shift(delta: number) {
    const step = PERIOD_MONTHS[period]
    let m = month + delta * step
    let y = year
    while (m > 12) { m -= 12; y += 1 }
    while (m < 1) { m += 12; y -= 1 }
    load(period, m, y)
  }

  const navLabel = period === 'month' ? `${MONTH_NAMES_FULL[month - 1]} ${year}` : trend?.range_label ?? ''

  return (
    <>
      <p className="text-xs tracking-[0.2em] uppercase text-muted mb-4">Budget</p>
      <Card variant="accordion">
        {/* Period nav — segmented control + prev/next, inside the card (the label
            between the arrows is the only source of truth for what's shown below;
            no separate month/year label duplicated elsewhere on the card). */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/40">
          <div className="flex items-center gap-1 bg-background rounded-full p-1 border border-border">
            {PERIOD_OPTIONS.map(p => (
              <button
                key={p.value}
                onClick={() => selectPeriod(p.value)}
                disabled={loading}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors disabled:opacity-50 ${
                  period === p.value ? 'bg-accent text-white' : 'text-muted hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => shift(-1)}
              disabled={loading}
              className="w-6 h-6 rounded-full bg-background border border-border text-muted hover:text-white disabled:opacity-50 flex items-center justify-center text-xs"
              aria-label="Previous period"
            >
              ‹
            </button>
            <span className="text-[11px] text-muted-2 min-w-[6rem] text-center">{navLabel}</span>
            <button
              onClick={() => shift(1)}
              disabled={loading}
              className="w-6 h-6 rounded-full bg-background border border-border text-muted hover:text-white disabled:opacity-50 flex items-center justify-center text-xs"
              aria-label="Next period"
            >
              ›
            </button>
          </div>
        </div>

        {period === 'month' ? (
          <BudgetDashboard categories={monthCategories} month={month} year={year} />
        ) : trend ? (
          // Chart.tsx's internal state only takes title/data as an initial value
          // (for its own in-card refetch), so it needs a `key` change to pick up
          // fresh data. Keying on period/month/year looked right but isn't: those
          // update one render *before* the new trend data lands (setPeriod fires
          // immediately, setTrend only after the fetch resolves), so the remount
          // happens too early and the later props-only update gets ignored by
          // Chart's internal state — verified live (nav label updated, chart
          // didn't). requestId only changes in the same state update as the data
          // itself, so the key and the data it's keying always land together.
          <Chart key={trend.requestId} chart_type="line" title={trend.title} data={trend.data} bare />
        ) : null}
      </Card>
    </>
  )
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning,'
  if (hour < 18) return 'Good afternoon,'
  return 'Good evening,'
}
