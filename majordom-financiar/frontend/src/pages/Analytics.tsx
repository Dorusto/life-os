import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ACCOUNT_TYPES,
  getSpendingChartData,
  getBudgetChartData,
  getSpendingTrendData,
  getSavingsRateData,
  getNetWorthHistory,
  type NetWorthHistoryPoint,
} from '../lib/api'
import Chart from '../components/Chart'
import PageHeader from '../components/PageHeader'
import StandardHeaderActions from '../components/StandardHeaderActions'
import WidgetLoading from '../components/WidgetLoading'
import { colorForKey } from '../lib/chartColors'
import { asTrendBarData, extractCashFlow, type CashFlowPoint } from '../lib/cashFlow'
import { formatCurrency } from '../lib/formatCurrency'

/**
 * Analytics — section tabs (Overview / Trends / Cash Flow / Net Worth) over the
 * chart endpoints the app already exposes. Overview is the original four charts,
 * unchanged. Trends re-slices the spending-trend response (no new endpoint, no
 * period change) into Expenses / Income / Savings bar + cumulative line views.
 * Cash Flow pairs that response's own latest month with the month-scoped
 * spending breakdown, both pinned to the same period. Net Worth asks the
 * dedicated net-worth-history endpoint for account balances at each period end
 * and draws assets, liabilities and the resulting net as charts.
 *
 * See docs/decisions.md#planned-folded-into-analytics.
 */

type Section = 'overview' | 'trends' | 'cashflow' | 'networth'

const SECTIONS: { value: Section; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'trends', label: 'Trends' },
  { value: 'cashflow', label: 'Cash Flow' },
  { value: 'networth', label: 'Net Worth' },
]

type TrendTab = 'expenses' | 'income' | 'savings'

const TREND_TABS: { value: TrendTab; label: string }[] = [
  { value: 'expenses', label: 'Expenses' },
  { value: 'income', label: 'Income' },
  { value: 'savings', label: 'Savings' },
]

type Granularity = 'month' | 'week'

const GRANULARITY_TABS: { value: Granularity; label: string }[] = [
  { value: 'month', label: 'Monthly' },
  { value: 'week', label: 'Weekly' },
]

/** Pill tab strip — same token-class pattern as AccountDetail's Details/Transactions switch. */
function PillTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex items-center gap-1 bg-token-paper rounded-full p-1 border border-token-line w-fit">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={`text-[11px] font-semibold px-3.5 py-1 rounded-full transition-colors ${
            value === t.value
              ? 'bg-token-brand text-token-ink'
              : 'text-token-ink-3 hover:text-token-ink'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// --- Trends section ---
//
// The spending-trend endpoint already returns a two-series per-month bar chart
// (spending vs income) over its own default period; Trends only re-slices that
// one response. It reuses the endpoint's series — it never derives a split the
// backend didn't produce, and it never asks for a different period. The
// aggregation itself (income / expenses / saved per month) lives in
// lib/cashFlow, shared with the Cash Flow section below and the Dashboard's
// Cash Flow widget.

/** The period the response actually covers, taken from its own x labels, so a
 *  subsection title can't disagree with the data underneath it. */
function periodSuffix(points: { x: string }[]): string {
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last) return ''
  return ` · ${first.x}–${last.x}`
}

export default function AnalyticsPage() {
  const [section, setSection] = useState<Section>('overview')
  const [trendTab, setTrendTab] = useState<TrendTab>('expenses')

  const spendingQuery = useQuery({
    queryKey: ['analytics-spending-chart'],
    queryFn: () => getSpendingChartData(),
    staleTime: 120_000,
  })

  const budgetQuery = useQuery({
    queryKey: ['analytics-budget-chart'],
    queryFn: () => getBudgetChartData(),
    staleTime: 120_000,
  })

  const trendQuery = useQuery({
    queryKey: ['analytics-spending-trend'],
    queryFn: () => getSpendingTrendData(),
    staleTime: 120_000,
  })

  const savingsQuery = useQuery({
    queryKey: ['analytics-savings-rate'],
    queryFn: () => getSavingsRateData(),
    staleTime: 120_000,
  })

  // --- Net Worth ---
  //
  // Both controls are server-side: every bucket is a balance snapshot summed over
  // the selected accounts, so changing the granularity or the type filter means
  // recomputing, not re-slicing. The endpoint reads through the cached read
  // connection (rule 32), so re-requesting the same parameters is cheap.
  const [netWorthGranularity, setNetWorthGranularity] = useState<Granularity>('month')
  const [netWorthTypes, setNetWorthTypes] = useState<string[]>([])

  const netWorthQuery = useQuery({
    queryKey: ['analytics-net-worth', netWorthGranularity, netWorthTypes],
    queryFn: () => getNetWorthHistory(netWorthGranularity, netWorthTypes),
    staleTime: 120_000,
  })

  function toggleNetWorthType(type: string) {
    setNetWorthTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  // --- Cash Flow ---
  //
  // Both halves of the section are pinned to one period: the trend's own latest
  // month anchors it, and the month-scoped spending breakdown is then requested
  // for that same month. The trend endpoint takes no `month` parameter, so it is
  // what decides the period here — if its latest point doesn't name a month,
  // renderCashFlow() reports that rather than pairing the figures with a
  // different month's breakdown.
  const cashFlowTrend = trendQuery.data ? extractCashFlow(trendQuery.data.data) : null
  const cashFlowPoints = cashFlowTrend ? cashFlowTrend.points : []
  const cashFlowLatest = cashFlowPoints.length > 0 ? cashFlowPoints[cashFlowPoints.length - 1] : null

  const cashFlowBreakdownQuery = useQuery({
    queryKey: ['analytics-cashflow-breakdown', cashFlowLatest?.year, cashFlowLatest?.month],
    queryFn: () => getSpendingChartData(cashFlowLatest?.month, cashFlowLatest?.year),
    staleTime: 120_000,
    enabled: cashFlowLatest?.month != null && cashFlowLatest?.year != null,
  })

  function renderChart(
    query: typeof spendingQuery,
    fallbackLabel: string
  ) {
    if (query.isLoading) {
      return <WidgetLoading label={`Loading ${fallbackLabel}…`} />
    }
    if (query.isError || !query.data) {
      return (
        <p className="text-token-ink-3 text-xs">
          Couldn't load {fallbackLabel}.
        </p>
      )
    }
    const { chart_type, title, data, refetch } = query.data
    return (
      <Chart
        chart_type={chart_type}
        title={title}
        data={data}
        refetch={refetch}
      />
    )
  }

  function renderTrends() {
    if (trendQuery.isLoading) {
      return <WidgetLoading label="Loading trend…" />
    }
    if (trendQuery.isError || !trendQuery.data) {
      return <p className="text-token-ink-3 text-xs">Couldn't load spending trend.</p>
    }

    const cashFlow = extractCashFlow(trendQuery.data.data)

    // Circuit breaker: the section is built from the endpoint's own income and
    // expense series. If they aren't both there, report what did come back
    // instead of inventing a split the backend never made.
    if (!cashFlow) {
      const trend = asTrendBarData(trendQuery.data.data)
      const found = trend ? trend.series.map((s) => s.label).join(', ') : 'no series'
      return (
        <p className="text-token-ink-3 text-xs">
          The spending-trend response doesn't carry separate income and expense series (found: {found}), so
          the Expenses / Income / Savings split can't be derived from it.
        </p>
      )
    }

    const { points, incomeSeries, expenseSeries } = cashFlow
    const selectedSeries = trendTab === 'income' ? incomeSeries : expenseSeries
    const selectedLabel =
      trendTab === 'income' ? 'Income' : trendTab === 'savings' ? 'Savings' : 'Expenses'
    const color =
      trendTab === 'savings' ? colorForKey('Savings') : selectedSeries.color || colorForKey(selectedLabel)

    // Each tab picks one of the shared aggregation's own figures (income /
    // expenses / saved = income − expenses), so the three views can't disagree
    // about a month.
    const valueFor = (point: CashFlowPoint) =>
      trendTab === 'income' ? point.income : trendTab === 'savings' ? point.saved : point.expenses

    // Exactly one series per point — the shared bar renderer draws each value in
    // a point independently (not stacked).
    const barData = {
      series: [{ label: selectedLabel, color }],
      points: points.map((point) => ({
        x: point.x,
        values: [valueFor(point)],
        ...(point.month != null && point.year != null
          ? { month: point.month, year: point.year }
          : {}),
      })),
    }

    let running = 0
    const cumulativeData = {
      series: [
        {
          label: selectedLabel,
          color,
          points: points.map((point) => {
            running += valueFor(point)
            return { x: point.x, y: running }
          }),
        },
      ],
    }

    // Deliberately no `refetch` on either chart: the trend endpoint's refetch
    // block swaps the whole response (with the raw two-series payload, which
    // isn't the shape these derived views render), and silently re-requesting a
    // period here would desync the sub-tab from the data it's showing.
    const period = periodSuffix(points)

    return (
      <div className="space-y-6">
        <PillTabs tabs={TREND_TABS} value={trendTab} onChange={setTrendTab} />
        <Chart chart_type="bar" title={`${selectedLabel} by month${period}`} data={barData} />
        <Chart chart_type="line" title={`${selectedLabel} cumulative${period}`} data={cumulativeData} />
      </div>
    )
  }

  // --- Cash Flow section ---

  function renderCashFlowBreakdown() {
    if (cashFlowBreakdownQuery.isLoading) {
      return <WidgetLoading label="Loading breakdown…" />
    }
    if (cashFlowBreakdownQuery.isError || !cashFlowBreakdownQuery.data) {
      return <p className="text-token-ink-3 text-xs">Couldn't load the spending breakdown.</p>
    }

    const { chart_type, title, data } = cashFlowBreakdownQuery.data
    if (chart_type !== 'pie') {
      return (
        <p className="text-token-ink-3 text-xs">
          The spending breakdown came back as a "{chart_type}" chart, not the category pie this section
          renders.
        </p>
      )
    }

    // Deliberately no `refetch`: the section is pinned to one month, so the
    // pie's prev/next month nav would walk the breakdown off the figures above
    // it (the same reason Trends omits it).
    return <Chart chart_type="pie" title={title} data={data} />
  }

  function renderCashFlow() {
    if (trendQuery.isLoading) {
      return <WidgetLoading label="Loading cash flow…" />
    }
    if (trendQuery.isError || !trendQuery.data) {
      return <p className="text-token-ink-3 text-xs">Couldn't load cash flow.</p>
    }

    // Circuit breakers — the section is one period or it's nothing:
    // no separable income/expense series means there are no figures to show;
    // no months means there is nothing to pin to; and a latest point that
    // doesn't name its own month means the month-scoped breakdown can't be
    // asked for that period, so pairing it with these figures would mix two.
    if (!cashFlowTrend) {
      return (
        <p className="text-token-ink-3 text-xs">
          The spending-trend response doesn't carry separate income and expense series, so the Cash Flow
          figures can't be derived from it.
        </p>
      )
    }
    if (!cashFlowLatest) {
      return <p className="text-token-ink-3 text-xs">The spending-trend response covers no months.</p>
    }
    if (cashFlowLatest.month == null || cashFlowLatest.year == null) {
      return (
        <p className="text-token-ink-3 text-xs">
          The spending trend doesn't say which month its latest point ({cashFlowLatest.x}) covers, so the
          month-scoped spending breakdown can't be pinned to the same period as these figures.
        </p>
      )
    }

    return (
      <div className="space-y-6">
        <div className="bg-token-surface rounded-2xl p-4">
          <p className="text-xs text-token-ink-3 uppercase tracking-wide mb-3">
            {cashFlowLatest.x} · income, expenses, saved
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[11px] text-token-ink-3 uppercase tracking-wide">Income</p>
              <p className="font-plex-mono tabular-nums text-token-ink text-lg mt-0.5">
                {formatCurrency(cashFlowLatest.income, { decimals: 0 })}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-token-ink-3 uppercase tracking-wide">Expenses</p>
              <p className="font-plex-mono tabular-nums text-token-ink text-lg mt-0.5">
                {formatCurrency(cashFlowLatest.expenses, { decimals: 0 })}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-token-ink-3 uppercase tracking-wide">Saved</p>
              <p
                className={`font-plex-mono tabular-nums text-lg mt-0.5 ${
                  cashFlowLatest.saved >= 0 ? 'text-token-gain' : 'text-token-loss'
                }`}
              >
                {formatCurrency(cashFlowLatest.saved, { decimals: 0 })}
              </p>
            </div>
          </div>
        </div>

        {renderCashFlowBreakdown()}
      </div>
    )
  }

  // --- Net Worth section ---
  //
  // Deliberately two bar charts rather than one stacked chart: Chart's bar
  // renderer scales every series against one shared maximum, so a single chart
  // would flatten the liabilities bars (a few thousand) beside the assets (an
  // order of magnitude larger). Two charts read correctly and need no change to
  // Chart.tsx's contract, so the Dashboard widgets are untouched.
  function renderNetWorth() {
    const periodLabel = netWorthGranularity === 'month' ? 'monthly' : 'weekly'

    function renderBody() {
      if (netWorthQuery.isLoading) {
        return <WidgetLoading label="Loading net worth history…" />
      }
      if (netWorthQuery.isError || !netWorthQuery.data) {
        return <p className="text-token-ink-3 text-xs">Couldn't load net worth history.</p>
      }

      const { points, account_count } = netWorthQuery.data

      // A type filter matching no account is a real state, and an all-zero chart
      // would misread as "net worth is zero" rather than "nothing to include".
      // The controls stay above this, so it's escapable.
      if (account_count === 0) {
        return (
          <p className="text-token-ink-3 text-xs">
            No accounts carry the selected type{netWorthTypes.length === 1 ? '' : 's'} — untick a
            filter to widen the history.
          </p>
        )
      }
      if (points.length === 0) {
        return <p className="text-token-ink-3 text-xs">No account balances to chart yet.</p>
      }

      // One series per point — the shared bar renderer draws each value in a
      // point independently (the shape Trends builds too). No month/year on these
      // points: a point is a balance snapshot, so the renderer's "View
      // transactions" drill-down would open an unrelated month's transactions
      // rather than anything that explains the balance.
      function barData(label: string, valueOf: (point: NetWorthHistoryPoint) => number) {
        return {
          series: [{ label, color: colorForKey(label) }],
          points: points.map((point) => ({ x: point.x, values: [valueOf(point)] })),
        }
      }

      return (
        <div className="space-y-6">
          <Chart
            chart_type="bar"
            title={`Assets · ${periodLabel}`}
            data={barData('Assets', (point) => point.assets)}
          />
          <Chart
            chart_type="bar"
            title={`Liabilities · ${periodLabel}`}
            data={barData('Liabilities', (point) => point.liabilities)}
          />
          {/* The section's headline figure, from the same snapshots — assets
              minus liabilities, which is the one series here that isn't a
              magnitude-scaled bar. */}
          <Chart
            chart_type="line"
            title={`Net worth · ${periodLabel}`}
            data={{
              series: [
                {
                  label: 'Net worth',
                  color: colorForKey('Net worth'),
                  points: points.map((point) => ({ x: point.x, y: point.net })),
                },
              ],
            }}
          />
        </div>
      )
    }

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <PillTabs
            tabs={GRANULARITY_TABS}
            value={netWorthGranularity}
            onChange={setNetWorthGranularity}
          />
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11px] text-token-ink-3 uppercase tracking-wide">Include</span>
            {ACCOUNT_TYPES.map((type) => (
              <label
                key={type}
                className="flex items-center gap-1.5 text-xs text-token-ink cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={netWorthTypes.includes(type)}
                  onChange={() => toggleNetWorthType(type)}
                  className="accent-token-brand"
                />
                {type}
              </label>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-token-ink-3">
          Balances at each {periodLabel} period end — an account counts as an asset while its balance
          is positive and as a liability while it is negative.
          {netWorthTypes.length === 0
            ? ' All accounts included.'
            : ` Filtered to ${netWorthTypes.join(', ')} accounts, by the type they carry today.`}
        </p>

        {renderBody()}
      </div>
    )
  }

  return (
    <div className="h-dvh bg-token-paper flex flex-col overflow-y-auto">
      <PageHeader
        label="Spending, budget, and trends"
        title="Analytics"
        actions={<StandardHeaderActions />}
      />
      <section className="px-5 pt-2 pb-24 space-y-6">
        <PillTabs tabs={SECTIONS} value={section} onChange={setSection} />

        {/* Overview — the original four charts, untouched. */}
        {section === 'overview' && (
          <>
            {renderChart(spendingQuery, 'spending breakdown')}
            {renderChart(budgetQuery, 'budget vs actual')}
            {renderChart(trendQuery, 'spending trend')}
            {renderChart(savingsQuery, 'savings rate')}
          </>
        )}

        {section === 'trends' && renderTrends()}

        {section === 'cashflow' && renderCashFlow()}

        {section === 'networth' && renderNetWorth()}
      </section>
    </div>
  )
}
