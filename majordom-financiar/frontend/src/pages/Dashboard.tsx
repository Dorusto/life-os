import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import {
  Bell, Pencil, Plus, X, ChevronDown, ChevronLeft, ChevronRight, Calendar, Check, ArrowUpRight, Loader2,
} from 'lucide-react'
import {
  getHomeData, getAccountList, getBalanceHistory, getTransactions,
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
import { useState, useEffect, useRef } from 'react'

const EXPENSE_COLORS = ['#E8A838', '#4F8EF7', '#EF4444', '#8B7BF0', '#22C55E']

export default function Dashboard() {
  const navigate = useNavigate()

  const { data: homeData } = useQuery({
    queryKey: ['home'],
    queryFn: () => getHomeData(),
    staleTime: 120_000,
  })
  const { data: accounts } = useQuery({
    queryKey: ['account-list'],
    queryFn: () => getAccountList(),
    staleTime: 120_000,
  })
  const { data: transactions } = useQuery({
    queryKey: ['transactions', 'latest'],
    queryFn: () => getTransactions(5),
    staleTime: 60_000,
  })

  const budgetStatus = homeData?.budget
  const goals = homeData?.goals
  const fireData = homeData?.fire
  const accountCount = homeData?.account_count

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

  // ---------- Dashboard-level period selector — UI only (issue #192 scope):
  // updates widget captions, doesn't recompute real numbers per period. The
  // Budget widget keeps its own separate, real period nav (BudgetPeriodCard). ----------
  const dashboardMonths = generateRecentMonths(12)
  const [periodIdx, setPeriodIdx] = useState(dashboardMonths.length - 1)
  const [periodLabel, setPeriodLabel] = useState('Current month')
  const [periodSheetOpen, setPeriodSheetOpen] = useState(false)

  function shiftDashboardPeriod(dir: number) {
    const next = Math.max(0, Math.min(dashboardMonths.length - 1, periodIdx + dir))
    setPeriodIdx(next)
    setPeriodLabel(next === dashboardMonths.length - 1 ? 'Current month' : dashboardMonths[next].label)
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

  const now = new Date()
  const dateLabel = now.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })

  function renderWidget(id: WidgetId): ReactNode {
    switch (id) {
      case 'goals':
        return <GoalsSection fireData={fireData} goals={goals} />
      case 'budget':
        return budgetStatus && budgetStatus.length > 0 ? (
          <BudgetPeriodCard
            initialCategories={budgetStatus}
          />
        ) : null
      case 'trend':
        return <TrendWidget accounts={accounts} />
      case 'latest':
        return <LatestTransactionsWidget transactions={transactions} navigate={navigate} />
      case 'expenses':
        return <ExpensesStructureWidget categories={budgetStatus} />
      case 'cashflow':
        return <CashFlowWidget periodLabel={periodLabel} />
      case 'vehicle':
        return <VehicleCostsWidget periodLabel={periodLabel} />
    }
  }

  const fullWidgets = WIDGETS.filter(w => w.column === 'full' && enabled[w.id])
  const leftWidgets = WIDGETS.filter(w => w.column === 'left' && enabled[w.id])
  const rightWidgets = WIDGETS.filter(w => w.column === 'right' && enabled[w.id])
  const removedWidgets = WIDGETS.filter(w => !enabled[w.id])

  return (
    <div className="min-h-dvh bg-background flex flex-col overflow-y-auto">
      <PageHeader label={dateLabel} title="Dashboard" actions={<StandardHeaderActions />} />

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
        <section className="px-5 pt-3 pb-24">
          {!editing && (
            <div className="flex justify-center mb-4">
              <button
                onClick={enterEdit}
                className="inline-flex items-center gap-1.5 bg-surface border border-border text-muted hover:text-white hover:border-border-hover text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors"
              >
                <Pencil size={13} />
                Customize
              </button>
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

          <div className="flex flex-col gap-6 sm:grid sm:grid-cols-[1.15fr_1fr] sm:items-start">
            <div className="flex flex-col gap-6">
              {leftWidgets.map(w => (
                <WidgetShell key={w.id} editing={editing} onRemove={() => removeWidget(w.id)}>
                  {renderWidget(w.id)}
                </WidgetShell>
              ))}
            </div>
            <div className="flex flex-col gap-6">
              {rightWidgets.map(w => (
                <WidgetShell key={w.id} editing={editing} onRemove={() => removeWidget(w.id)}>
                  {renderWidget(w.id)}
                </WidgetShell>
              ))}
            </div>
          </div>

          {editing && (
            <>
              {removedWidgets.length > 0 && (
                <div className="mt-6">
                  <p className="font-mono text-[11px] uppercase tracking-wide text-muted mb-2">Add widgets</p>
                  <div className="flex flex-col gap-2">
                    {removedWidgets.map(w => (
                      <div
                        key={w.id}
                        className="flex items-center justify-between gap-3 bg-surface border border-dashed border-border-hover rounded-xl px-3.5 py-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-white">{w.name}</p>
                          <p className="text-[11.5px] text-muted mt-0.5">{w.desc}</p>
                        </div>
                        <button
                          onClick={() => addWidgetBack(w.id)}
                          className="w-8 h-8 rounded-lg bg-interactive-dim text-interactive flex items-center justify-center flex-shrink-0"
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
                  className="text-muted border border-border bg-surface font-semibold text-xs px-4 py-2 rounded-xl hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={doneEdit}
                  className="bg-accent hover:bg-accent-hover text-white font-semibold text-xs px-4 py-2 rounded-xl transition-colors"
                >
                  Done
                </button>
              </div>
            </>
          )}

          <div className="flex items-center justify-center gap-2 mt-7">
            <button
              onClick={() => shiftDashboardPeriod(-1)}
              className="w-7 h-7 rounded-lg bg-surface border border-border text-muted hover:text-white flex items-center justify-center flex-shrink-0"
              aria-label="Previous period"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setPeriodSheetOpen(true)}
              className="inline-flex items-center gap-1.5 bg-surface border border-border rounded-lg px-3 py-2 text-xs font-semibold text-white hover:border-interactive transition-colors"
            >
              <Calendar size={13} />
              {periodLabel}
            </button>
            <button
              onClick={() => shiftDashboardPeriod(1)}
              className="w-7 h-7 rounded-lg bg-surface border border-border text-muted hover:text-white flex items-center justify-center flex-shrink-0"
              aria-label="Next period"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </section>
      )}

      <PeriodPickerSheet
        open={periodSheetOpen}
        onClose={() => setPeriodSheetOpen(false)}
        onApply={label => setPeriodLabel(label)}
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
          className="absolute -top-2 -right-2 z-10 w-6 h-6 rounded-lg bg-danger/15 border border-danger/40 text-danger flex items-center justify-center"
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

const GRANULARITIES = ['Day', 'Month', 'Quarter', 'Half-year', 'Year'] as const
const PRESETS = ['Current month', 'Last 3 months', 'Last 6 months', 'Last 12 months', 'This year', 'Previous year']

function PeriodPickerSheet({ open, onClose, onApply }: { open: boolean; onClose: () => void; onApply: (label: string) => void }) {
  const [gran, setGran] = useState<typeof GRANULARITIES[number]>('Month')
  const [draft, setDraft] = useState('Current month')

  const months = generateRecentMonths(12)
  const byYear = months.reduce<Record<number, typeof months>>((acc, m) => {
    (acc[m.year] ??= []).push(m)
    return acc
  }, {})
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a)

  return (
    <BottomSheet open={open} onClose={onClose} title="Select period">
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {GRANULARITIES.map(g => (
          <button
            key={g}
            onClick={() => setGran(g)}
            className={`flex-shrink-0 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors ${
              gran === g ? 'bg-interactive border-interactive text-white' : 'bg-surface border-border text-muted'
            }`}
          >
            {g}
          </button>
        ))}
      </div>
      {years.map(year => (
        <div key={year}>
          <p className="font-mono text-xs text-muted mt-3 mb-1.5">{year}</p>
          <div className="grid grid-cols-3 gap-2">
            {byYear[year].map(m => (
              <button
                key={m.label}
                onClick={() => setDraft(m.label)}
                className={`text-[13px] font-semibold px-2 py-2.5 rounded-lg border transition-colors ${
                  draft === m.label ? 'bg-interactive border-interactive text-white' : 'bg-surface border-border text-white hover:border-border-hover'
                }`}
              >
                {m.label.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[11px] text-muted mt-3 mb-1.5">Quick ranges</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 mb-2">
        {PRESETS.map(p => (
          <button key={p} onClick={() => setDraft(p)} className="text-interactive text-xs font-semibold">
            {p}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
        <span className="font-mono text-xs bg-surface border border-border rounded-lg px-3 py-2">{draft}</span>
        <button
          onClick={() => { onApply(draft); onClose() }}
          className="inline-flex items-center gap-1.5 bg-accent hover:bg-accent-hover text-white font-semibold text-sm px-4 py-2 rounded-xl transition-colors"
        >
          <Check size={15} />
          Apply
        </button>
      </div>
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
function TrendWidget({ accounts }: { accounts: AccountListItem[] | undefined }) {
  const [scope, setScope] = useState<TrendScope>('Total')
  const [menuOpen, setMenuOpen] = useState(false)

  const total = accounts?.reduce((sum, a) => sum + a.balance, 0) ?? null
  const onBudget = accounts?.filter(a => !a.off_budget).reduce((sum, a) => sum + a.balance, 0) ?? null
  const hasSnapshot = scope === 'Total' || scope === 'On-budget'
  const amount = scope === 'Total' ? total : scope === 'On-budget' ? onBudget : null

  const balanceHistoryQuery = useQuery({
    queryKey: ['balance-history', scope],
    queryFn: () => getBalanceHistory(scope === 'Total' ? 'total' : 'on_budget', 30),
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
        color: '#6366F1',
        points: historyPoints.map(p => ({ x: p.date, y: p.balance })),
      },
    ],
    empty_message: 'No balance history yet',
  }

  return (
    <div className="bg-gradient-to-br from-surface to-surface-2 border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-display font-bold text-[15px]">Balance trend</span>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="inline-flex items-center gap-1.5 bg-surface-2 border border-border text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg"
          >
            {scope}
            <ChevronDown size={12} />
          </button>
          {menuOpen && (
            <div className="absolute top-full right-0 mt-1.5 bg-surface-2 border border-border-hover rounded-xl p-1.5 min-w-[150px] shadow-lg z-10">
              {TREND_SCOPES.map(s => (
                <button
                  key={s}
                  onClick={() => { setScope(s); setMenuOpen(false) }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors ${
                    scope === s ? 'text-white font-semibold' : 'text-muted hover:text-white hover:bg-white/5'
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
          <p className="font-mono text-[10px] tracking-widest uppercase text-muted mt-3">Today</p>
          <p className="font-mono font-medium text-3xl mt-1 tabular-nums">
            {amount != null ? `€${amount.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}` : '—'}
          </p>
          {balanceHistoryQuery.isLoading ? (
            <div className="mt-3 flex items-center gap-2 text-muted text-xs">
              <Loader2 size={14} className="animate-spin" />
              Loading historical balance…
            </div>
          ) : balanceHistoryQuery.isError ? (
            <p className="text-muted text-xs mt-3">Couldn't load balance history.</p>
          ) : historyPoints.length >= 2 ? (
            <>
              <div className="mt-3">
                <Chart chart_type="line" title="Balance trend" data={lineData} bare />
              </div>
              {periodDiff != null && periodPct != null && (
                <p className={`text-xs mt-1.5 ${periodDiff >= 0 ? 'text-positive' : 'text-red-400'}`}>
                  {periodDiff >= 0 ? '+' : ''}€{periodDiff.toFixed(2)} · {periodDiff >= 0 ? '+' : ''}
                  {periodPct.toFixed(1)}% vs 30d ago
                </p>
              )}
            </>
          ) : (
            <p className="text-muted text-xs mt-3">Not enough balance history yet.</p>
          )}
        </>
      ) : (
        <p className="text-muted text-xs mt-3">
          {scope === 'Portfolio' ? 'No portfolio data source yet.' : 'Needs vehicle-manager cost data.'}
        </p>
      )}
    </div>
  )
}

function LatestTransactionsWidget({ transactions, navigate }: { transactions: Transaction[] | undefined; navigate: NavigateFn }) {
  return (
    <div className="bg-surface border border-border rounded-2xl px-4 pt-4 pb-1.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-display font-bold text-[15px]">Latest Transactions</span>
        <button onClick={() => navigate('/transactions')} className="text-muted hover:text-white transition-colors" aria-label="See all transactions">
          <ArrowUpRight size={16} />
        </button>
      </div>
      {!transactions || transactions.length === 0 ? (
        <p className="text-muted text-xs py-3">No transactions yet.</p>
      ) : (
        transactions.slice(0, 5).map(tx => (
          <div key={tx.id} className="flex items-center gap-2.5 py-2.5 border-b border-border last:border-b-0">
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-medium truncate">{tx.merchant}</p>
              <p className="text-[11.5px] text-muted truncate">{tx.category ?? 'Uncategorized'}</p>
            </div>
            <p className={`font-mono text-[13.5px] tabular-nums flex-shrink-0 ${!tx.is_expense ? 'text-positive' : ''}`}>
              {!tx.is_expense ? '+' : '−'}{Math.abs(tx.amount).toFixed(2)}
            </p>
          </div>
        ))
      )}
    </div>
  )
}

/** Expenses Structure — real data, reused from the same BudgetCategory[] the
    Budget widget already fetches (no new endpoint needed). */
function ExpensesStructureWidget({ categories }: { categories: BudgetCategory[] | undefined }) {
  const expenseCats = (categories ?? []).filter(c => c.group_name !== 'Income' && c.spent > 0)
  const sorted = [...expenseCats].sort((a, b) => b.spent - a.spent)
  const top = sorted.slice(0, 4)
  const otherTotal = sorted.slice(4).reduce((sum, c) => sum + c.spent, 0)
  const slices: { category_name: string; spent: number }[] = otherTotal > 0 ? [...top, { category_name: 'Other', spent: otherTotal }] : top
  const total = slices.reduce((sum, s) => sum + s.spent, 0)

  if (total === 0) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-4">
        <p className="font-display font-bold text-[15px] mb-2">Expenses Structure</p>
        <p className="text-muted text-xs">No spending recorded this period yet.</p>
      </div>
    )
  }

  let acc = 0
  const gradientStops = slices.map((s, i) => {
    const start = (acc / total) * 100
    acc += s.spent
    const end = (acc / total) * 100
    return `${EXPENSE_COLORS[i % EXPENSE_COLORS.length]} ${start}% ${end}%`
  }).join(', ')

  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <p className="font-display font-bold text-[15px] mb-3">Expenses Structure</p>
      <div className="flex items-center gap-4 flex-wrap">
        <div
          className="w-24 h-24 rounded-full flex-shrink-0 flex items-center justify-center"
          style={{ background: `conic-gradient(${gradientStops})` }}
        >
          <div className="w-[60%] h-[60%] rounded-full bg-surface flex flex-col items-center justify-center">
            <span className="text-[9px] text-muted uppercase tracking-wide">Total</span>
            <span className="font-mono text-[11px] mt-0.5">€{total.toFixed(0)}</span>
          </div>
        </div>
        <div className="flex-1 min-w-[120px] flex flex-col gap-1.5">
          {slices.map((s, i) => (
            <div key={s.category_name} className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: EXPENSE_COLORS[i % EXPENSE_COLORS.length] }} />
              <span className="flex-1 min-w-0 truncate">{s.category_name}</span>
              <span className="font-mono text-muted tabular-nums">€{s.spent.toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CashFlowWidget({ periodLabel }: { periodLabel: string }) {
  return (
    <div className="bg-surface border border-border rounded-2xl px-4 py-4">
      <p className="font-display font-bold text-[15px]">Cash Flow</p>
      <p className="text-muted text-xs mt-2">Needs an income/expense aggregation endpoint — coming soon ({periodLabel}).</p>
    </div>
  )
}

function VehicleCostsWidget({ periodLabel }: { periodLabel: string }) {
  return (
    <div className="bg-surface border border-border rounded-2xl px-4 py-4">
      <p className="font-display font-bold text-[15px]">Vehicle costs</p>
      <p className="text-muted text-xs mt-2">Needs vehicle-manager cost data — coming soon ({periodLabel}).</p>
    </div>
  )
}

type NavigateFn = ReturnType<typeof useNavigate>


const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function BudgetPeriodCard({ initialCategories }: { initialCategories: BudgetCategory[] }) {
  const [editingGroups, setEditingGroups] = useState(false)
  const queryClient = useQueryClient()

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-display font-bold text-[15px]">Categories Watchlist</span>
          <button
            onClick={() => setEditingGroups(o => !o)}
            className={`text-muted hover:text-white transition-colors ${editingGroups ? 'text-accent' : ''}`}
            aria-label={editingGroups ? 'Exit group edit mode' : 'Edit groups'}
            title={editingGroups ? 'Exit group edit mode' : 'Edit groups'}
          >
            <Pencil size={15} />
          </button>
        </div>
      </div>
      <BudgetDashboard
        categories={initialCategories}
        editing={editingGroups}
        onDataChange={() => {
          queryClient.invalidateQueries({ queryKey: ['home'] })
        }}
      />
    </div>
  )
}
