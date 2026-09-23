import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import {
  Bell, Pencil, Plus, X, ChevronDown, ChevronLeft, ChevronRight, Calendar, ArrowUpRight, SlidersHorizontal,
} from 'lucide-react'
import {
  getHomeData, getAccountList, getBalanceHistory, getTransactions, getBudgetPeriod, getVehicleCostsSummary,
  type BudgetCategory, type AccountListItem, type Transaction, type FireData,
} from '../lib/api'
import { requestAndSubscribe } from '../lib/push'
import BudgetDashboard from '../components/BudgetDashboard'
import GoalsSection from '../components/GoalsSection'
import { PageHeader } from '../components/shell/PageHeader'
import StandardHeaderActions from '../components/StandardHeaderActions'
import BottomSheet from '../components/BottomSheet'
import Chart from '../components/Chart'
import { WIDGETS, WIDGET_SPAN, loadWidgetPrefs, saveWidgetPrefs, type WidgetId } from '../lib/dashboardWidgets'
import { loadNetWorthIncludePrefs, saveNetWorthIncludePrefs } from '../lib/netWorthPrefs'
import { useState, useEffect, useRef } from 'react'
import { formatCurrency, formatPercent } from '../lib/formatCurrency'
import { formatWeekdayDate } from '../lib/formatDate'
import WidgetLoading from '../components/WidgetLoading'

export default function Dashboard() {
  const navigate = useNavigate()

  const { data: homeData, isLoading: homeLoading } = useQuery({
    queryKey: ['home'],
    queryFn: () => getHomeData(),
    staleTime: 120_000,
  })
  const { data: accounts } = useQuery({
    queryKey: ['account-list'],
    queryFn: () => getAccountList(),
    staleTime: 120_000,
  })
  const { data: transactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ['transactions', 'latest'],
    queryFn: () => getTransactions(5),
    staleTime: 60_000,
  })

  const goals = homeData?.goals
  const fireData = homeData?.fire
  const expenseCoverage = homeData?.expense_coverage
  const onBudgetTotal = homeData?.on_budget_total
  const accountCount = homeData?.account_count

  const now = new Date()
  const [dashboardMonth, setDashboardMonth] = useState(now.getMonth() + 1)
  const [dashboardYear, setDashboardYear] = useState(now.getFullYear())
  const [periodSheetOpen, setPeriodSheetOpen] = useState(false)

  const {
    data: periodBudget,
    isLoading: periodBudgetLoading,
    isError: periodBudgetError,
  } = useQuery({
    queryKey: ['budget-period', dashboardMonth, dashboardYear],
    queryFn: () => getBudgetPeriod('month', dashboardMonth, dashboardYear),
    staleTime: 60_000,
  })
  const periodCategories =
    periodBudget?.mode === 'month' ? periodBudget.categories : undefined

  function shiftDashboardPeriod(dir: number) {
    let m = dashboardMonth + dir
    let y = dashboardYear
    if (m < 1) {
      m = 12
      y -= 1
    } else if (m > 12) {
      m = 1
      y += 1
    }
    setDashboardMonth(m)
    setDashboardYear(y)
  }

  const periodIsCurrentMonth =
    dashboardMonth === now.getMonth() + 1 && dashboardYear === now.getFullYear()
  const periodLabel = periodIsCurrentMonth
    ? 'Current month'
    : `${MONTH_NAMES_FULL[dashboardMonth - 1].slice(0, 3)} ${dashboardYear}`

  // ---------- Customize mode (widget registry, persisted to localStorage) ----------
  const [editing, setEditing] = useState(false)
  const [enabled, setEnabled] = useState<Record<WidgetId, boolean>>(() => loadWidgetPrefs())
  const enabledSnapshotRef = useRef(enabled)

  function enterEdit() {
    enabledSnapshotRef.current = enabled
    setEditing(true)
  }
  function cancelEdit() {
    setEnabled(enabledSnapshotRef.current)
    setEditing(false)
  }
  function doneEdit() {
    saveWidgetPrefs(enabled)
    setEditing(false)
  }
  function removeWidget(id: WidgetId) {
    setEnabled(prev => ({ ...prev, [id]: false }))
  }
  function addWidgetBack(id: WidgetId) {
    setEnabled(prev => ({ ...prev, [id]: true }))
  }

  // ---------- Notification permission banner ----------
  const [notifState, setNotifState] = useState<'default' | 'granted' | 'denied' | 'unsupported'>('granted')
  useEffect(() => {
    if (!('Notification' in window)) { setNotifState('unsupported'); return }
    setNotifState(Notification.permission as 'default' | 'granted' | 'denied')
  }, [])
  async function handleEnableNotifications() {
    const result = await requestAndSubscribe()
    setNotifState(result === 'unsupported' ? 'unsupported' : result)
  }

  const dateLabel = formatWeekdayDate(now)

  function renderWidget(id: WidgetId): ReactNode {
    switch (id) {
      case 'goals':
        return (
          <div className="space-y-4">
            {fireData && fireData.fire_target > 0 && <GoalsHeadline fire={fireData} />}
            <GoalsSection fireData={fireData} expenseCoverage={expenseCoverage} goals={goals} isLoading={homeLoading} />
          </div>
        )
      case 'budget':
        // Same explicit error branch as the 'expenses' widget below — without
        // it a failed budget-period query makes the Watchlist vanish silently.
        if (periodBudgetError) {
          return (
            <div className="bg-token-surface border border-token-line rounded-xl p-4">
              <p className="text-xs text-token-ink-3 uppercase tracking-wide">Categories Watchlist</p>
              <p className="text-token-ink-3 text-sm text-center py-2">
                Couldn't load this month's budget.
              </p>
            </div>
          )
        }
        return periodCategories && periodCategories.length > 0 ? (
          <BudgetPeriodCard
            categories={periodCategories}
            dashboardMonth={dashboardMonth}
            dashboardYear={dashboardYear}
          />
        ) : null
      case 'trend':
        return <BalanceHero accounts={accounts} dashboardMonth={dashboardMonth} dashboardYear={dashboardYear} />
      case 'latest':
        return <LatestTransactionsWidget transactions={transactions} navigate={navigate} isLoading={transactionsLoading} />
      case 'expenses':
        // `periodCategories` is undefined while budget-period is in flight, and
        // stays undefined if it fails — which the pie would otherwise report as a
        // real "No expenses this month". Separate "not loaded yet" / "load failed"
        // from "genuinely nothing spent this month", so the empty state only ever
        // means the latter.
        if (periodBudgetLoading || periodBudgetError) {
          return (
            <div className="bg-token-surface border border-token-line rounded-xl p-4">
              <p className="text-xs text-token-ink-3 uppercase tracking-wide">Expenses Structure</p>
              {periodBudgetLoading ? (
                <WidgetLoading label="Loading expenses…" />
              ) : (
                <p className="text-token-ink-3 text-sm text-center py-2">
                  Couldn't load this month's spending.
                </p>
              )}
            </div>
          )
        }
        return (
          <div className="bg-token-surface border border-token-line rounded-xl">
            <Chart
              chart_type="pie"
              title="Expenses Structure"
              data={toExpensesPieData(periodCategories)}
              bare
            />
          </div>
        )
      case 'vehicle':
        return <VehicleCostsWidget dashboardMonth={dashboardMonth} dashboardYear={dashboardYear} />
      case 'networth':
        return <NetWorthWidget accounts={accounts} dashboardMonth={dashboardMonth} dashboardYear={dashboardYear} />
    }
  }

  const visibleWidgets = WIDGETS.filter(w => enabled[w.id])
  const removedWidgets = WIDGETS.filter(w => !enabled[w.id])

  // Stat strip — only figures the page already has. Spent/income come from the selected
  // period's budget categories (Income group = money in, everything else = spending).
  const periodSpent = periodCategories
    ?.filter(c => c.group_name !== 'Income')
    .reduce((sum, c) => sum + Math.max(c.spent, 0), 0)
  const incomeCategories = periodCategories?.filter(c => c.group_name === 'Income')
  const periodIncome = incomeCategories && incomeCategories.length > 0
    ? incomeCategories.reduce((sum, c) => sum + Math.abs(c.spent), 0)
    : undefined
  const periodShort = periodIsCurrentMonth
    ? MONTH_NAMES_FULL[dashboardMonth - 1].slice(0, 3)
    : periodLabel
  const stats: { label: string; value: string; sub?: string }[] = []
  if (onBudgetTotal != null) {
    stats.push({ label: 'On budget', value: formatCurrency(onBudgetTotal, { decimals: 0 }), sub: accountCount != null ? `${accountCount} account${accountCount === 1 ? '' : 's'}` : undefined })
  }
  if (periodSpent != null) stats.push({ label: `Spent · ${periodShort}`, value: formatCurrency(periodSpent) })
  if (periodIncome != null) stats.push({ label: `Income · ${periodShort}`, value: formatCurrency(periodIncome) })
  if (periodSpent != null && periodIncome != null && periodIncome > 0) {
    const rate = ((periodIncome - periodSpent) / periodIncome) * 100
    stats.push({ label: 'Savings rate', value: formatPercent(rate, { decimals: 0 }) })
  }

  const showDashboard = !(homeData && accountCount === 0)

  const headerActions = showDashboard && homeData ? (
    <>
      <div className="flex items-center gap-0.5 rounded-full border border-token-line bg-token-surface p-[3px]">
        <button
          onClick={() => shiftDashboardPeriod(-1)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-token-ink-3 hover:text-token-ink"
          aria-label="Previous period"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          onClick={() => setPeriodSheetOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-mono text-xs text-token-ink hover:bg-token-surface-2"
        >
          <Calendar size={13} />
          {periodLabel}
        </button>
        <button
          onClick={() => shiftDashboardPeriod(1)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-token-ink-3 hover:text-token-ink"
          aria-label="Next period"
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <button
        onClick={editing ? cancelEdit : enterEdit}
        className={`flex h-9 w-9 items-center justify-center rounded-full border border-token-line bg-token-surface transition-colors ${editing ? 'text-token-ink' : 'text-token-ink-3 hover:text-token-ink'}`}
        aria-label={editing ? 'Cancel customizing' : 'Customize dashboard'}
        title="Customize"
      >
        <SlidersHorizontal size={15} />
      </button>
      <StandardHeaderActions />
    </>
  ) : (
    <StandardHeaderActions />
  )

  return (
    <div className="flex flex-col">
      <PageHeader eyebrow={dateLabel} title="Dashboard" actions={headerActions} />

      {notifState === 'default' && (
        <button
          onClick={handleEnableNotifications}
          className="mb-5 flex items-center gap-3 px-4 py-3 rounded-xl bg-token-surface border border-token-line hover:border-token-brand transition-colors text-left"
        >
          <Bell size={18} className="text-token-brand-ink flex-shrink-0" />
          <div>
            <p className="text-token-ink text-sm font-medium">Enable daily notifications</p>
            <p className="text-token-ink-3 text-xs">Get a daily summary from Majordom at 20:00</p>
          </div>
        </button>
      )}

      {/* Empty state (brand-new install) or normal dashboard */}
      {!showDashboard ? (
        <section>
          <div className="bg-token-surface border border-token-line rounded-xl px-5 py-6">
            <h2 className="font-plex-sans text-xl font-bold text-token-ink mb-4">Let's get started</h2>
            <ul className="space-y-2 text-token-ink-3 mb-5">
              <li className="flex gap-2">
                <span className="text-token-brand-ink">→</span>
                Upload a CSV export from your bank
              </li>
              <li className="flex gap-2">
                <span className="text-token-brand-ink">→</span>
                Take a photo of a receipt
              </li>
              <li className="flex gap-2">
                <span className="text-token-brand-ink">→</span>
                Just ask a question — "How much did I spend on groceries?"
              </li>
            </ul>
            <button
              onClick={() => navigate('/chat')}
              className="w-full py-3 rounded-xl bg-token-brand text-token-on-brand font-semibold hover:opacity-90 transition-opacity"
            >
              Go to Chat
            </button>
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-6">
          {stats.length > 0 && (
            <div className={`grid grid-cols-2 overflow-hidden rounded-xl border border-token-line bg-token-surface ${stats.length === 4 ? 'lg:grid-cols-4' : stats.length === 3 ? 'lg:grid-cols-3' : ''}`}>
              {stats.map((stat, i) => (
                <div
                  key={stat.label}
                  className={`flex flex-col gap-1.5 px-5 py-4 ${i % 2 === 1 ? 'border-l border-token-line' : ''} ${i >= 2 ? 'border-t border-token-line lg:border-t-0' : ''} ${i === 2 ? 'lg:border-l' : ''}`}
                >
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-token-ink-3">{stat.label}</span>
                  <span className="font-mono text-xl tabular-nums text-token-ink">{stat.value}</span>
                  {stat.sub && <span className="font-mono text-xs text-token-ink-3">{stat.sub}</span>}
                </div>
              ))}
            </div>
          )}

          {/* 12-column grid (lg+); each widget declares its span in the registry.
              `items-start` keeps short cards from stretching to their row's tallest card. */}
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
            {visibleWidgets.map(w => (
              <div key={w.id} className={`min-w-0 ${WIDGET_SPAN[w.size]} ${w.id === 'trend' ? 'order-first' : ''}`}>
                <WidgetShell editing={editing} onRemove={() => removeWidget(w.id)}>
                  {renderWidget(w.id)}
                </WidgetShell>
              </div>
            ))}
          </div>

          {editing && (
            <>
              {removedWidgets.length > 0 && (
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-token-ink-3 mb-2">Add widgets</p>
                  <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
                    {removedWidgets.map(w => (
                      <div
                        key={w.id}
                        className="flex items-center justify-between gap-3 bg-token-surface border border-dashed border-token-line-strong rounded-xl px-3.5 py-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-token-ink">{w.name}</p>
                          <p className="text-[11.5px] text-token-ink-3 mt-0.5">{w.desc}</p>
                        </div>
                        <button
                          onClick={() => addWidgetBack(w.id)}
                          className="w-8 h-8 rounded-lg bg-token-brand-soft text-token-brand-ink flex items-center justify-center flex-shrink-0"
                          aria-label={`Add ${w.name} widget`}
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2.5">
                <button
                  onClick={cancelEdit}
                  className="text-token-ink-3 border border-token-line bg-token-surface font-semibold text-xs px-4 py-2 rounded-full hover:text-token-ink transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={doneEdit}
                  className="bg-token-brand hover:bg-token-brand-2 text-token-on-brand font-semibold text-xs px-4 py-2 rounded-full transition-colors"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </section>
      )}

      <PeriodPickerSheet
        open={periodSheetOpen}
        onClose={() => setPeriodSheetOpen(false)}
        onApply={(month, year) => {
          setDashboardMonth(month)
          setDashboardYear(year)
        }}
      />
    </div>
  )
}

/** In Customize mode, wraps a widget with a dashed outline + remove (×) chip.
    The mockup also shows non-functional drag-grip/size chips — skipped here
    rather than shipping dead affordances (decisions.md#universal-transaction-ui
    itself flags real drag-reorder as "not settled", mocked with remove/add only). */
function WidgetShell({ editing, onRemove, children }: { editing: boolean; onRemove: () => void; children: ReactNode }) {
  return (
    <div className={editing ? 'relative outline outline-1 outline-dashed outline-token-line-strong outline-offset-[3px] rounded-xl' : 'relative'}>
      {editing && (
        <button
          onClick={onRemove}
          // Bare text-white is deliberate here: it sits on a coloured fill
          // (bg-token-loss), so it must NOT be migrated to text-token-ink.
          className="absolute -top-2 -right-2 z-10 w-7 h-7 rounded-lg bg-token-loss border border-token-loss text-white flex items-center justify-center"
          aria-label="Remove widget"
        >
          <X size={13} />
        </button>
      )}
      {children}
    </div>
  )
}

function generateRecentMonths(count: number): { label: string; month: number; year: number }[] {
  const now = new Date()
  const out: { label: string; month: number; year: number }[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push({ label: `${MONTH_NAMES_FULL[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`, month: d.getMonth() + 1, year: d.getFullYear() })
  }
  return out
}


function PeriodPickerSheet({ open, onClose, onApply }: { open: boolean; onClose: () => void; onApply: (month: number, year: number) => void }) {
  const months = generateRecentMonths(12)
  const byYear = months.reduce<Record<number, typeof months>>((acc, m) => {
    (acc[m.year] ??= []).push(m)
    return acc
  }, {})
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a)

  return (
    <BottomSheet open={open} onClose={onClose} title="Select period">
      {years.map(year => (
        <div key={year}>
          <p className="font-plex-mono text-xs text-token-ink-3 mt-3 mb-1.5">{year}</p>
          <div className="grid grid-cols-3 gap-2">
            {byYear[year].map(m => (
              <button
                key={m.label}
                onClick={() => {
                  onApply(m.month, m.year)
                  onClose()
                }}
                className="text-[13px] font-semibold px-2 py-2.5 rounded-lg border transition-colors bg-token-surface border-token-line text-token-ink hover:border-token-line-strong"
              >
                {m.label.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      ))}
    </BottomSheet>
  )
}

const TREND_SCOPES = ['Total', 'On-budget', 'Portfolio', 'Vehicles'] as const
type TrendScope = typeof TREND_SCOPES[number]

/** The dashboard's hero: the balance as one large figure, its 30-day change, and the trend
    line full width under it — no card, per the design mockup. Portfolio/Vehicles scopes have
    no data source yet and say so rather than faking a number. */
function BalanceHero({ accounts, dashboardMonth, dashboardYear }: {
  accounts: AccountListItem[] | undefined
  dashboardMonth: number
  dashboardYear: number
}) {
  const [scope, setScope] = useState<TrendScope>('Total')
  const [menuOpen, setMenuOpen] = useState(false)

  const total = accounts?.reduce((sum, a) => sum + a.balance, 0) ?? null
  const onBudget = accounts?.filter(a => !a.off_budget).reduce((sum, a) => sum + a.balance, 0) ?? null
  const hasSnapshot = scope === 'Total' || scope === 'On-budget'
  const amount = scope === 'Total' ? total : scope === 'On-budget' ? onBudget : null

  const currentDate = new Date()
  const isCurrentPeriod =
    dashboardMonth === currentDate.getMonth() + 1 &&
    dashboardYear === currentDate.getFullYear()
  const endDate = isCurrentPeriod
    ? undefined
    : (() => {
        const lastDay = new Date(dashboardYear, dashboardMonth, 0).getDate()
        const mm = String(dashboardMonth).padStart(2, '0')
        const dd = String(lastDay).padStart(2, '0')
        return `${dashboardYear}-${mm}-${dd}`
      })()

  // Key carries the resolved kind ('total'/'on_budget'), not the raw scope, so
  // the 'total' slice is the same cache entry NetWorthWidget reads — one shared
  // request instead of two identical ones (audit finding 82).
  const kind = scope === 'Total' ? 'total' : 'on_budget'
  const balanceHistoryQuery = useQuery({
    queryKey: ['balance-history', kind, dashboardMonth, dashboardYear],
    queryFn: () => getBalanceHistory(kind, 30, endDate),
    enabled: hasSnapshot,
  })

  const historyPoints = balanceHistoryQuery.data ?? []
  const firstBalance = historyPoints[0]?.balance
  const lastBalance = historyPoints[historyPoints.length - 1]?.balance
  const periodDiff = firstBalance != null && lastBalance != null ? lastBalance - firstBalance : null
  const periodPct =
    firstBalance != null && lastBalance != null && firstBalance !== 0
      ? ((lastBalance - firstBalance) / Math.abs(firstBalance)) * 100
      : null

  const lineData = {
    series: [
      {
        label: 'Balance',
        color: 'var(--accent)',
        points: historyPoints.map(p => ({ x: p.date, y: p.balance })),
      },
    ],
    empty_message: 'No balance history yet',
  }

  // Cents dimmed, as in the mockup: split the formatted amount at its decimal separator.
  const formatted = amount != null ? formatCurrency(amount) : '—'
  const cents = formatted.match(/([.,]\d{2})$/)
  const whole = cents ? formatted.slice(0, -cents[1].length) : formatted

  return (
    <section className="flex flex-col gap-1.5">
      <div className="relative flex items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-token-ink-3">
          {scope === 'Total' ? 'Net balance' : scope} · today
        </span>
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="inline-flex items-center rounded-full p-1 text-token-ink-3 hover:bg-token-surface-2 hover:text-token-ink"
          aria-label="Change balance scope"
        >
          <ChevronDown size={13} />
        </button>
        {menuOpen && (
          <div className="absolute left-0 top-full z-10 mt-1.5 min-w-[150px] rounded-xl border border-token-line-strong bg-token-surface-2 p-1.5 shadow-lg">
            {TREND_SCOPES.map(s => (
              <button
                key={s}
                onClick={() => { setScope(s); setMenuOpen(false) }}
                className={`w-full rounded-lg px-2.5 py-2 text-left font-mono text-xs transition-colors ${
                  scope === s ? 'text-token-ink' : 'text-token-ink-3 hover:bg-token-surface hover:text-token-ink'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      {hasSnapshot ? (
        <>
          <p className="font-mono text-[34px] font-medium leading-none tracking-tight tabular-nums text-token-ink lg:text-[44px]">
            {whole}
            {cents && <span className="text-token-ink-3">{cents[1]}</span>}
          </p>
          {/* Two points minimum — one snapshot has nothing to compare against,
              so the change line must not render a fabricated +0% off one point. */}
          {historyPoints.length >= 2 && periodDiff != null && periodPct != null && (
            <p className="flex flex-wrap gap-x-3 font-mono text-[13px]">
              <span className={periodDiff >= 0 ? 'text-token-gain' : 'text-token-loss'}>
                {formatCurrency(periodDiff, { signDisplay: 'always' })}
              </span>
              <span className={periodDiff >= 0 ? 'text-token-gain' : 'text-token-loss'}>
                {formatPercent(periodPct, { signDisplay: 'always' })}
              </span>
              <span className="text-token-ink-3">vs 30 days ago</span>
            </p>
          )}
          {balanceHistoryQuery.isLoading ? (
            <WidgetLoading label="Loading historical balance…" className="mt-3" />
          ) : balanceHistoryQuery.isError ? (
            <p className="mt-3 text-xs text-token-ink-3">Couldn't load balance history.</p>
          ) : historyPoints.length >= 2 ? (
            <div className="mt-3">
              <Chart chart_type="line" title="Balance trend" data={lineData} bare />
            </div>
          ) : (
            <p className="mt-3 text-xs text-token-ink-3">Not enough balance history yet.</p>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-token-ink-3">
          {scope === 'Portfolio' ? 'No portfolio data source yet.' : 'Needs vehicle-manager cost data.'}
        </p>
      )}
    </section>
  )
}

/** The one serif statement on the dashboard (design mockup): how far Portfolio Independence
    is funded, and when it is projected to land. */
function GoalsHeadline({ fire }: { fire: FireData }) {
  const pct = Math.max(0, Math.min(Math.round(fire.fire_pct), 999))
  return (
    <p className="font-serif text-[26px] leading-[1.15] text-token-ink lg:text-[30px]">
      Portfolio independence is <span className="text-token-accent">{pct}% funded</span>
      {fire.estimated_year ? <> — on track for {fire.estimated_year}.</> : '.'}
    </p>
  )
}

function NetWorthWidget({ accounts, dashboardMonth, dashboardYear }: {
  accounts: AccountListItem[] | undefined
  dashboardMonth: number
  dashboardYear: number
}) {
  const [includePrefs, setIncludePrefs] = useState<Record<'Loan' | 'Vehicle' | 'Rental', boolean>>(() => loadNetWorthIncludePrefs())
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()

  const currentTotal = (accounts ?? []).reduce((sum, a) => {
    const type = a.account_type
    if (type === 'Loan' && !includePrefs.Loan) return sum
    if (type === 'Vehicle' && !includePrefs.Vehicle) return sum
    if (type === 'Rental' && !includePrefs.Rental) return sum
    return sum + a.balance
  }, 0)

  const currentDate = new Date()
  const isCurrentPeriod =
    dashboardMonth === currentDate.getMonth() + 1 &&
    dashboardYear === currentDate.getFullYear()
  const endDate = isCurrentPeriod
    ? undefined
    : (() => {
        const lastDay = new Date(dashboardYear, dashboardMonth, 0).getDate()
        const mm = String(dashboardMonth).padStart(2, '0')
        const dd = String(lastDay).padStart(2, '0')
        return `${dashboardYear}-${mm}-${dd}`
      })()

  // Same key/args as TrendWidget's 'total' slice — one shared request, not two.
  const balanceHistoryQuery = useQuery({
    queryKey: ['balance-history', 'total', dashboardMonth, dashboardYear],
    queryFn: () => getBalanceHistory('total', 30, endDate),
  })

  const historyPoints = balanceHistoryQuery.data ?? []
  const startBalance = historyPoints[0]?.balance
  const endBalance = historyPoints[historyPoints.length - 1]?.balance
  const growthDiff = startBalance != null && endBalance != null ? endBalance - startBalance : null
  const growthPct =
    startBalance != null && endBalance != null && startBalance !== 0
      ? ((endBalance - startBalance) / Math.abs(startBalance)) * 100
      : null

  const lineData = {
    series: [
      {
        label: 'Net Worth',
        color: 'var(--brand)',
        points: historyPoints.map(p => ({ x: p.date, y: p.balance })),
      },
    ],
    empty_message: 'No net worth history yet',
  }

  function toggleInclude(category: 'Loan' | 'Vehicle' | 'Rental') {
    const next = { ...includePrefs, [category]: !includePrefs[category] }
    setIncludePrefs(next)
    saveNetWorthIncludePrefs(next)
  }

  return (
    <div className="bg-gradient-to-br from-token-surface to-token-surface-2 border border-token-line rounded-xl p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-token-ink-3">Net Worth</span>
        <div className="relative flex items-center gap-1">
          <button
            onClick={() => navigate('/analytics')}
            className="text-token-ink-3 hover:text-token-ink transition-colors"
            aria-label="View analytics"
          >
            <ArrowUpRight size={15} />
          </button>
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="inline-flex items-center gap-1.5 bg-token-surface-2 border border-token-line text-token-ink text-xs font-semibold px-2.5 py-1.5 rounded-lg"
          >
            Include
            <ChevronDown size={12} />
          </button>
          {menuOpen && (
            <div className="absolute top-full right-0 mt-1.5 bg-token-surface-2 border border-token-line-strong rounded-xl p-2.5 min-w-[190px] shadow-lg z-10">
              {(['Loan', 'Vehicle', 'Rental'] as const).map(cat => (
                <label key={cat} className="flex items-center gap-2 py-1.5 text-sm text-token-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includePrefs[cat]}
                    onChange={() => toggleInclude(cat)}
                    className="accent-token-brand"
                  />
                  {cat}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="font-plex-mono font-medium text-3xl mt-2 tabular-nums">
        {formatCurrency(currentTotal, { decimals: 0 })}
      </p>

      {balanceHistoryQuery.isLoading ? (
        <WidgetLoading label="Loading historical balance…" className="mt-3" />
      ) : balanceHistoryQuery.isError ? (
        <p className="text-token-ink-3 text-xs mt-3">Couldn't load net worth history.</p>
      ) : historyPoints.length >= 2 ? (
        <>
          <div className="mt-3">
            <Chart chart_type="line" title="Net Worth" data={lineData} bare />
          </div>
          {startBalance != null && endBalance != null && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div>
                <p className="font-plex-mono text-[10px] tracking-widest uppercase text-token-ink-3">Start</p>
                <p className="text-sm text-token-ink tabular-nums mt-0.5">{formatCurrency(startBalance)}</p>
              </div>
              <div>
                <p className="font-plex-mono text-[10px] tracking-widest uppercase text-token-ink-3">Now</p>
                <p className="text-sm text-token-ink tabular-nums mt-0.5">{formatCurrency(endBalance)}</p>
              </div>
              <div>
                <p className="font-plex-mono text-[10px] tracking-widest uppercase text-token-ink-3">Growth</p>
                <p className={`text-sm tabular-nums mt-0.5 ${growthDiff != null && growthDiff >= 0 ? 'text-token-gain' : 'text-token-loss'}`}>
                  {growthDiff != null ? formatCurrency(growthDiff, { signDisplay: 'always' }) : '—'}
                  {growthPct != null ? ` · ${formatPercent(growthPct, { signDisplay: 'always' })}` : ''}
                </p>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-token-ink-3 text-xs mt-3">Not enough net worth history yet.</p>
      )}
    </div>
  )
}

function LatestTransactionsWidget({ transactions, navigate, isLoading }: { transactions: Transaction[] | undefined; navigate: NavigateFn; isLoading?: boolean }) {
  return (
    <div className="bg-token-surface border border-token-line rounded-xl px-4 pt-4 pb-1.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-token-ink-3">Latest Transactions</span>
        <button onClick={() => navigate('/transactions')} className="text-token-ink-3 hover:text-token-ink transition-colors" aria-label="See all transactions">
          <ArrowUpRight size={16} />
        </button>
      </div>
      {isLoading ? (
        <WidgetLoading label="Loading transactions…" />
      ) : !transactions || transactions.length === 0 ? (
        <p className="text-token-ink-3 text-xs py-3">No transactions yet.</p>
      ) : (
        transactions.slice(0, 5).map(tx => (
          <div key={tx.id} className="flex items-center gap-2.5 py-2.5 border-b border-token-line last:border-b-0">
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-medium truncate">{tx.merchant}</p>
              <p className="text-[11.5px] text-token-ink-3 truncate">{tx.category ?? 'Uncategorized'}</p>
            </div>
            <p className={`font-plex-mono text-[13.5px] tabular-nums flex-shrink-0 ${!tx.is_expense ? 'text-token-gain' : ''}`}>
              {formatCurrency(tx.is_expense ? -Math.abs(tx.amount) : Math.abs(tx.amount), { signDisplay: 'always' })}
            </p>
          </div>
        ))
      )}
    </div>
  )
}

/** Budget-period categories → the generic pie contract, so "Expenses Structure"
    renders through the same Chart component (and inherits its header and empty
    state) as every other pie, instead of a bespoke conic-gradient widget.
    No `count`: categories aren't transactions, so the pie header omits the
    subtitle rather than stating a false "0". */
function toExpensesPieData(categories: BudgetCategory[] | undefined) {
  const sorted = (categories ?? [])
    .filter(c => c.group_name !== 'Income' && c.spent > 0)
    .sort((a, b) => b.spent - a.spent)
  const total = sorted.reduce((sum, c) => sum + c.spent, 0)

  return {
    total,
    income: 0,
    segments: sorted.map(c => ({
      name: c.category_name,
      value: c.spent,
      percentage: total > 0 ? (c.spent / total) * 100 : 0,
    })),
  }
}

function VehicleCostsWidget({ dashboardMonth, dashboardYear }: {
  dashboardMonth: number
  dashboardYear: number
}) {
  const period = `${dashboardYear}-${String(dashboardMonth).padStart(2, '0')}`
  const { data, isLoading, isError } = useQuery({
    queryKey: ['vehicle-costs-summary', dashboardMonth, dashboardYear],
    queryFn: () => getVehicleCostsSummary(period),
  })

  // No vehicle linked to an AB account → no card at all. The widget's value is
  // the real per-period cost summary, so an ever-present "No active vehicles
  // yet." card is pure noise for the (common) unlinked case. A vehicle-manager
  // outage is a different state — see the isError / available === false
  // branches below, which must stay visible.
  const noVehicleLinked = data && data.available === true && (data.vehicle_count ?? 0) === 0
  if (noVehicleLinked) return null

  let content: ReactNode

  if (isLoading) {
    content = <WidgetLoading label="Loading vehicle costs…" className="mt-2" />
  } else if (isError) {
    content = <p className="text-token-ink-3 text-xs mt-2">Couldn't load vehicle cost data.</p>
  } else if (data && data.available === false) {
    content = <p className="text-token-ink-3 text-xs mt-2">{data.error || 'Vehicle data temporarily unavailable.'}</p>
  } else if (data && data.available === true) {
    const totalCost = data.total_cost ?? 0
    const vehicleCount = data.vehicle_count ?? 0
    content = (
      <>
        <p className="font-plex-mono font-medium text-3xl mt-1 tabular-nums">
          {formatCurrency(totalCost, { decimals: 0 })}
        </p>
        <p className="text-token-ink-3 text-xs mt-2">
          {vehicleCount} vehicle{vehicleCount !== 1 ? 's' : ''}
          {data.cost_per_km != null && (
            <> · {formatCurrency(data.cost_per_km)}/km</>
          )}
        </p>
      </>
    )
  } else {
    content = <p className="text-token-ink-3 text-xs mt-2">No vehicle data available.</p>
  }

  return (
    <div className="bg-token-surface border border-token-line rounded-xl px-4 py-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-token-ink-3">Vehicle costs</p>
      {content}
    </div>
  )
}

type NavigateFn = ReturnType<typeof useNavigate>


const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function BudgetPeriodCard({
  categories,
  dashboardMonth,
  dashboardYear,
}: {
  categories: BudgetCategory[]
  dashboardMonth: number
  dashboardYear: number
}) {
  const [editingGroups, setEditingGroups] = useState(false)
  const queryClient = useQueryClient()

  return (
    <div className="bg-token-surface border border-token-line rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-token-line">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-token-ink-3">Categories Watchlist</span>
          <button
            onClick={() => setEditingGroups(o => !o)}
            className={`text-token-ink-3 hover:text-token-ink transition-colors p-2.5 ${editingGroups ? 'text-token-brand-ink' : ''}`}
            aria-label={editingGroups ? 'Exit group edit mode' : 'Edit groups'}
            title={editingGroups ? 'Exit group edit mode' : 'Edit groups'}
          >
            <Pencil size={15} />
          </button>
        </div>
      </div>
      <BudgetDashboard
        categories={categories}
        editing={editingGroups}
        onDataChange={() => {
          queryClient.invalidateQueries({ queryKey: ['budget-period', dashboardMonth, dashboardYear] })
        }}
      />
    </div>
  )
}
