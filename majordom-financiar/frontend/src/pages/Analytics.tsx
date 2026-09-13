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

/**
 * Analytics — section tabs (Overview / Trends / Cash Flow / Net Worth) over the
 * chart endpoints the app already exposes. Overview is the original four charts,
 * unchanged. Trends re-slices the spending-trend response (no new endpoint, no
 * period change) into Expenses / Income / Savings bar + cumulative line views.
 * The remaining two sections are filled in by later passes of issue 15.
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
// backend didn't produce, and it never asks for a different period.

interface TrendSeries {
  label: string
  color: string
}

interface TrendPoint {
  x: string
  values: number[]
  month?: number
  year?: number
}

interface TrendBarData {
  series: TrendSeries[]
  points: TrendPoint[]
}

/**
 * Narrow the (untyped) chart payload before slicing it — if the trend response
 * isn't a per-month bar chart, say so rather than rendering a chart built from
 * a split that isn't there.
 */
function asTrendBarData(data: unknown): TrendBarData | null {
  if (!data || typeof data !== 'object') return null
  const candidate = data as { series?: unknown; points?: unknown }
  if (!Array.isArray(candidate.series) || !Array.isArray(candidate.points)) return null
  return {
    series: candidate.series as TrendSeries[],
    points: candidate.points as TrendPoint[],
  }
}

/** Find a series by its own label rather than by position — the endpoint decides
 *  the order, and guessing it could silently swap Income for Expenses. */
function findSeriesIndex(series: TrendSeries[], patterns: RegExp[]): number {
  for (const pattern of patterns) {
    const index = series.findIndex((s) => pattern.test(s.label))
    if (index >= 0) return index
  }
  return -1
}

function valueAt(point: TrendPoint, index: number): number {
  return point.values[index] ?? 0
}

/** The period the response actually covers, taken from its own x labels, so a
 *  subsection title can't disagree with the data underneath it. */
function periodSuffix(points: TrendPoint[]): string {
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

    const trend = asTrendBarData(trendQuery.data.data)
    const incomeIndex = trend ? findSeriesIndex(trend.series, [/income/i, /inflow/i]) : -1
    const expenseIndex = trend ? findSeriesIndex(trend.series, [/spen/i, /expense/i]) : -1

    // Circuit breaker: the section is built from the endpoint's own income and
    // expense series. If they aren't both there, report what did come back
    // instead of inventing a split the backend never made.
    if (!trend || incomeIndex < 0 || expenseIndex < 0 || incomeIndex === expenseIndex) {
      const found = trend ? trend.series.map((s) => s.label).join(', ') : 'no series'
      return (
        <p className="text-token-ink-3 text-xs">
          The spending-trend response doesn't carry separate income and expense series (found: {found}), so
          the Expenses / Income / Savings split can't be derived from it.
        </p>
      )
    }

    const { points } = trend
    const selectedIndex = trendTab === 'income' ? incomeIndex : expenseIndex
    const selectedLabel =
      trendTab === 'income' ? 'Income' : trendTab === 'savings' ? 'Savings' : 'Expenses'
    const color =
      trendTab === 'savings'
        ? colorForKey('Savings')
        : trend.series[selectedIndex]?.color || colorForKey(selectedLabel)

    // Savings is derived here, in the component: income − expenses per point.
    // Everything else reads one of the endpoint's existing series directly.
    const valueFor = (point: TrendPoint) =>
      trendTab === 'savings'
        ? valueAt(point, incomeIndex) - valueAt(point, expenseIndex)
        : valueAt(point, selectedIndex)

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

        {/* Cash Flow / Net Worth are separate sub-specs of issue 15. */}
        {section === 'cashflow' && (
          <p className="text-token-ink-3 text-sm text-center py-8">
            Cash Flow is coming in a later pass.
          </p>
        )}

        {section === 'networth' && (
          <p className="text-token-ink-3 text-sm text-center py-8">
            Net Worth is coming in a later pass.
          </p>
        )}
      </section>
    </div>
  )
}
