import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import {
  Bell, Pencil, Plus, X, ChevronDown, ChevronLeft, ChevronRight, Calendar, ArrowUpRight,
} from 'lucide-react'
import {
  getHomeData, getAccountList, getBalanceHistory, getTransactions, getBudgetPeriod, getVehicleCostsSummary,
  type BudgetCategory, type AccountListItem, type Transaction,
} from '../lib/api'
import { requestAndSubscribe } from '../lib/push'
import BudgetDashboard from '../components/BudgetDashboard'
import GoalsSection from '../components/GoalsSection'
import PageHeader from '../components/PageHeader'
import StandardHeaderActions from '../components/StandardHeaderActions'
import BottomSheet from '../components/BottomSheet'
import Chart from '../components/Chart'
import { WIDGETS, loadWidgetPrefs, saveWidgetPrefs, type WidgetId } from '../lib/dashboardWidgets'
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
        return <GoalsSection fireData={fireData} expenseCoverage={expenseCoverage} goals={goals} isLoading={homeLoading} />
      case 'budget':
        return periodCategories && periodCategories.length > 0 ? (
          <BudgetPeriodCard
            categories={periodCategories}
            dashboardMonth={dashboardMonth}
            dashboardYear={dashboardYear}
          />
        ) : null
      case 'trend':
        return <TrendWidget accounts={accounts} dashboardMonth={dashboardMonth} dashboardYear={dashboardYear} />
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
            <div className="bg-token-surface border border-token-line rounded-2xl p-4">
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
          <div className="bg-token-surface border border-token-line rounded-2xl">
            <Chart
              chart_type="pie"
              title="Expenses Structure"
              data={toExpensesPieData(periodCategories)}
              bare
            />
          </div>
        )
      case 'cashflow':
        return <CashFlowWidget periodLabel={periodLabel} />
      case 'vehicle':
        return <VehicleCostsWidget periodLabel={periodLabel} dashboardMonth={dashboardMonth} dashboardYear={dashboardYear} />
      case 'networth':
        return <NetWorthWidget accounts={accounts} dashboardMonth={dashboardMonth} dashboardYear={dashboardYear} />
    }
  }

  const fullWidgets = WIDGETS.filter(w => w.column === 'full' && enabled[w.id])
  const leftWidgets = WIDGETS.filter(w => w.column === 'left' && enabled[w.id])
  const rightWidgets = WIDGETS.filter(w => w.column === 'right' && enabled[w.id])
  const removedWidgets = WIDGETS.filter(w => !enabled[w.id])

  return (
    <div className="h-dvh bg-token-paper flex flex-col overflow-y-auto">
      <PageHeader label={dateLabel} title="Dashboard" actions={<StandardHeaderActions />} />

      {notifState === 'default' && (
        <button
          onClick={handleEnableNotifications}
          className="mx-5 mt-3 flex items-center gap-3 px-4 py-3 rounded-xl bg-token-surface border border-token-line hover:border-token-brand transition-colors text-left"
        >
          <Bell size={18} className="text-token-brand-ink flex-shrink-0" />
          <div>
            <p className="text-token-ink text-sm font-medium">Enable daily notifications</p>
            <p className="text-token-ink-3 text-xs">Get a daily summary from Majordom at 20:00</p>
          </div>
        </button>
      )}

      {/* Empty state (brand-new install) or normal dashboard */}
      {homeData && accountCount === 0 ? (
        <section className="px-5 pt-4 pb-24">
          <div className="bg-token-surface border border-token-line rounded-2xl px-5 py-6">
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
              className="w-full py-3 rounded-xl bg-token-brand text-token-ink font-semibold hover:opacity-90 transition-opacity"
            >
              Go to Chat
            </button>
          </div>
        </section>
      ) : (
        <section className="px-5 pt-3 pb-24">
          {onBudgetTotal != null && (
            <div className="mb-5">
              <p className="font-plex-mono text-[11px] uppercase tracking-wide text-token-ink-3">On budget</p>
              <p className="font-plex-mono font-medium text-2xl mt-0.5 tabular-nums">
                {formatCurrency(onBudgetTotal, { decimals: 0 })}
              </p>
            </div>
          )}

          {fullWidgets.length > 0 && (
            <div className="space-y-6 mb-6">
              {fullWidgets.map(w => (
                <WidgetShell key={w.id} editing={editing} onRemove={() => removeWidget(w.id)}>
                  {renderWidget(w.id)}
                </WidgetShell>
              ))}
            </div>
          )}

          {/* One auto-flow grid: two per row at lg, three at xl. Concatenating
              left then right keeps the same reading order the old two-column
              split produced, while auto-placement is free to flow across the
              full row. The left/right distinction in the registry no longer
              maps to a fixed column — it only contributes this ordering. */}
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:items-start">
            {[...leftWidgets, ...rightWidgets].map(w => (
              <WidgetShell key={w.id} editing={editing} onRemove={() => removeWidget(w.id)}>
                {renderWidget(w.id)}
              </WidgetShell>
            ))}
          </div>

          {editing && (
            <>
              {removedWidgets.length > 0 && (
                <div className="mt-6">
                  <p className="font-plex-mono text-[11px] uppercase tracking-wide text-token-ink-3 mb-2">Add widgets</p>
                  <div className="flex flex-col gap-2">
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
              <div className="flex justify-end gap-2.5 mt-5">
                <button
                  onClick={cancelEdit}
                  className="text-token-ink-3 border border-token-line bg-token-surface font-semibold text-xs px-4 py-2 rounded-xl hover:text-token-ink transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={doneEdit}
                  className="bg-token-brand hover:bg-token-brand-2 text-token-ink font-semibold text-xs px-4 py-2 rounded-xl transition-colors"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* Always-visible bottom bar — sticky, so it lives inside the content
          column: above BottomNav on mobile (bottom-16) and flush with the
          bottom at lg: where the nav is hidden. Being in the content column
          means it respects AppShell's rail with no hardcoded offset.
          Combines Customize (used to sit in its own row at the top, wasting
          vertical space) with the period control (used to live at the bottom
          of the scrollable widget list) — switching periods and seeing every
          widget react no longer requires scrolling down to the control and
          back up to look at the result. */}
      {homeData && accountCount !== 0 && (
        <div className="sticky bottom-16 lg:bottom-0 z-40 flex items-center justify-between gap-2 px-4 py-2.5 bg-token-paper/95 backdrop-blur border-t border-token-line">
          {!editing ? (
            <button
              onClick={enterEdit}
              className="inline-flex items-center gap-1.5 bg-token-surface-2 border border-token-line text-token-ink hover:border-token-line-strong text-xs font-semibold px-3 py-2 rounded-xl transition-colors flex-shrink-0"
            >
              <Pencil size={13} />
              Customize
            </button>
          ) : (
            <span className="w-[1px]" aria-hidden />
          )}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => shiftDashboardPeriod(-1)}
              className="w-9 h-9 rounded-lg bg-token-surface-2 border border-token-line text-token-ink-3 hover:text-token-ink flex items-center justify-center flex-shrink-0"
              aria-label="Previous period"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setPeriodSheetOpen(true)}
              className="inline-flex items-center gap-1.5 bg-token-surface-2 border border-token-line rounded-lg px-3 py-2 text-xs font-semibold text-token-ink hover:border-token-brand-ink transition-colors"
            >
              <Calendar size={13} />
              {periodLabel}
            </button>
            <button
              onClick={() => shiftDashboardPeriod(1)}
              className="w-9 h-9 rounded-lg bg-token-surface-2 border border-token-line text-token-ink-3 hover:text-token-ink flex items-center justify-center flex-shrink-0"
              aria-label="Next period"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
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
    <div className={editing ? 'relative outline outline-1 outline-dashed outline-interactive/50 outline-offset-[3px] rounded-2xl' : 'relative'}>
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

/** Balance trend widget — current snapshot is real (summed from `getAccountList`);
    a historical chart needs a time-series endpoint that doesn't exist yet, and
    Portfolio/Vehicles scopes have no data source at all (Ghostfolio dropped,
    vehicle-manager cost aggregation not built) — both honestly marked pending
    rather than faked, per the "shell real, data placeholder" scope decision. */
function TrendWidget({ accounts, dashboardMonth, dashboardYear }: {
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

  const balanceHistoryQuery = useQuery({
    queryKey: ['balance-history', scope, dashboardMonth, dashboardYear],
    queryFn: () => getBalanceHistory(
      scope === 'Total' ? 'total' : 'on_budget',
      30,
      endDate,
    ),
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
        color: 'var(--brand)',
        points: historyPoints.map(p => ({ x: p.date, y: p.balance })),
      },
    ],
    empty_message: 'No balance history yet',
  }

  return (
    <div className="bg-gradient-to-br from-token-surface to-token-surface-2 border border-token-line rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-plex-sans font-bold text-[15px]">Balance trend</span>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="inline-flex items-center gap-1.5 bg-token-surface-2 border border-token-line text-token-ink text-xs font-semibold px-2.5 py-1.5 rounded-lg"
          >
            {scope}
            <ChevronDown size={12} />
          </button>
          {menuOpen && (
            <div className="absolute top-full right-0 mt-1.5 bg-token-surface-2 border border-token-line-strong rounded-xl p-1.5 min-w-[150px] shadow-lg z-10">
              {TREND_SCOPES.map(s => (
                <button
                  key={s}
                  onClick={() => { setScope(s); setMenuOpen(false) }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors ${
                    scope === s ? 'text-token-ink font-semibold' : 'text-token-ink-3 hover:text-token-ink hover:bg-white/5'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {hasSnapshot ? (
        <>
          <p className="font-plex-mono text-[10px] tracking-widest uppercase text-token-ink-3 mt-3">Today</p>
          <p className="font-plex-mono font-medium text-3xl mt-1 tabular-nums">
            {amount != null ? formatCurrency(amount, { decimals: 0 }) : '—'}
          </p>
          {balanceHistoryQuery.isLoading ? (
            <WidgetLoading label="Loading historical balance…" className="mt-3" />
          ) : balanceHistoryQuery.isError ? (
            <p className="text-token-ink-3 text-xs mt-3">Couldn't load balance history.</p>
          ) : historyPoints.length >= 2 ? (
            <>
              <div className="mt-3">
                <Chart chart_type="line" title="Balance trend" data={lineData} bare />
              </div>
              {periodDiff != null && periodPct != null && (
                <p className={`text-xs mt-1.5 ${periodDiff >= 0 ? 'text-token-gain' : 'text-token-loss'}`}>
                  {formatCurrency(periodDiff, { signDisplay: 'always' })} ·{' '}
                  {formatPercent(periodPct, { signDisplay: 'always' })} vs 30d ago
                </p>
              )}
            </>
          ) : (
            <p className="text-token-ink-3 text-xs mt-3">Not enough balance history yet.</p>
          )}
        </>
      ) : (
        <p className="text-token-ink-3 text-xs mt-3">
          {scope === 'Portfolio' ? 'No portfolio data source yet.' : 'Needs vehicle-manager cost data.'}
        </p>
      )}
    </div>
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

  const balanceHistoryQuery = useQuery({
    queryKey: ['net-worth-history', dashboardMonth, dashboardYear],
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
    <div className="bg-gradient-to-br from-token-surface to-token-surface-2 border border-token-line rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-plex-sans font-bold text-[15px]">Net Worth</span>
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
    <div className="bg-token-surface border border-token-line rounded-2xl px-4 pt-4 pb-1.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-plex-sans font-bold text-[15px]">Latest Transactions</span>
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

function CashFlowWidget({ periodLabel }: { periodLabel: string }) {
  return (
    <div className="bg-token-surface border border-token-line rounded-2xl px-4 py-4">
      <p className="font-plex-sans font-bold text-[15px]">Cash Flow</p>
      <p className="text-token-ink-3 text-xs mt-2">Needs an income/expense aggregation endpoint — coming soon ({periodLabel}).</p>
    </div>
  )
}

function VehicleCostsWidget({ dashboardMonth, dashboardYear }: {
  periodLabel: string
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
    <div className="bg-token-surface border border-token-line rounded-2xl px-4 py-4">
      <p className="font-plex-sans font-bold text-[15px]">Vehicle costs</p>
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
    <div className="bg-token-surface border border-token-line rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-token-line">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-plex-sans font-bold text-[15px]">Categories Watchlist</span>
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
