import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getSpendingChartData,
  getBudgetChartData,
  getSpendingTrendData,
  getSavingsRateData,
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
 * spending breakdown, both pinned to the same period. Net Worth is a later pass
 * of issue 15.
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

        {/* Net Worth is a separate sub-spec of issue 15. */}

        {section === 'networth' && (
          <p className="text-token-ink-3 text-sm text-center py-8">
            Net Worth is coming in a later pass.
          </p>
        )}
      </section>
    </div>
  )
}
