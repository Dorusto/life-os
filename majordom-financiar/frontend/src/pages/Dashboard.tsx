import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import {
  Bell, Pencil, Plus, X, ChevronDown, ChevronLeft, ChevronRight, Calendar, Check, ArrowUpRight,
} from 'lucide-react'
import {
  getHomeData, getAccountList, getTransactions, getBudgetPeriod,
  type FireData, type BudgetCategory, type Goal, type AccountListItem, type Transaction, type BudgetPeriod,
} from '../lib/api'
import { requestAndSubscribe } from '../lib/push'
import BudgetDashboard from '../components/BudgetDashboard'
import Chart, { type LineData } from '../components/Chart'
import Card from '../components/Card'
import InfoIcon from '../components/InfoIcon'
import PageHeader from '../components/PageHeader'
import StandardHeaderActions from '../components/StandardHeaderActions'
import BottomSheet from '../components/BottomSheet'
import { WIDGETS, loadWidgetPrefs, saveWidgetPrefs, type WidgetId } from '../lib/dashboardWidgets'
import { useState, useEffect, useRef } from 'react'

const GOAL_COLORS = ['#F59E0B', '#3B82F6', '#22C55E', '#8B5CF6', '#EC4899']
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
        return <GoalsWidget fireData={fireData} goals={goals} navigate={navigate} />
      case 'budget':
        return budgetStatus && budgetStatus.length > 0 ? (
          <BudgetPeriodCard
            initialCategories={budgetStatus}
            initialMonth={now.getMonth() + 1}
            initialYear={now.getFullYear()}
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
          <p className="text-muted text-xs mt-3">Historical trend — coming soon</p>
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

function GoalsWidget({ fireData, goals, navigate }: { fireData: FireData | undefined; goals: Goal[] | undefined; navigate: NavigateFn }) {
  return (
    <div>
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
