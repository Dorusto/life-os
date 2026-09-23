/**
 * Generic chart renderer — one component, four chart_type variants.
 *
 * Backend tools return {"type": "chart", "chart_type": ..., "title": ..., "data": {...}}.
 * The tool (backend, deterministic code) decides which chart_type fits its data —
 * this component never guesses the type, it only renders what it's told.
 *
 * This file owns the payload contract and the refetch logic; the pixels come from
 * the shared kit (src/components/kit — generated, do not edit), so a Finance chart
 * and an Invest chart of the same data render as the same chart.
 */
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { authFetch } from '../lib/auth'
import { formatCurrency, formatPercent, formatNumber } from '../lib/formatCurrency'
import { cx } from './shell/cx'
import { Card, SectionLabel } from './kit/Card'
import { EmptyState, HeroValue, ProgressBar, type Tone } from './kit/Stats'
import {
  AreaChart,
  BarChart as KitBarChart,
  GroupedBarChart,
  StackedBar,
  SERIES_COLORS,
} from './kit/Charts'

// --- Contract types ---

interface PieSegment {
  name: string
  value: number
  percentage: number
}

interface PieData {
  total: number
  income: number
  /** Optional: a pie whose source has no transaction count (e.g. the
      dashboard's budget-derived "Expenses Structure") omits it, and the header
      hides the subtitle rather than stating a false "0 transactions". */
  count?: number
  segments: PieSegment[]
}

interface ProgressListItem {
  label: string
  value: number
  target: number
  percentage: number
  color?: string | null
  extra?: string | null
}

interface ProgressListData {
  items: ProgressListItem[]
  empty_message?: string
}

interface BarSeries {
  label: string
  color: string
}

interface BarPoint {
  x: string
  values: number[]
  month?: number
  year?: number
}

interface BarData {
  series: BarSeries[]
  points: BarPoint[]
}

interface LinePoint {
  x: string
  y: number
}

interface LineSeriesData {
  label: string
  color: string
  points: LinePoint[]
}

export interface LineData {
  series: LineSeriesData[]
  empty_message?: string
}

// --- Kit rendering helpers ---------------------------------------------------
// The payload supplies the data (and sometimes a color); every visual — axes,
// tooltips, empty states, bars — comes from src/components/kit.

/**
 * A payload color is honored only when it is a kit CSS var; anything else (a hex
 * from the old palette) is dropped for the kit's own series palette, so no chart
 * can ship a color that isn't a design token.
 */
function seriesColor(color: string | undefined, index: number): string {
  return color?.startsWith('var(') ? color : SERIES_COLORS[index % SERIES_COLORS.length]
}

// Segmented pills / pickers / Apply — one look for every refetch control, the
// same as the shared PageHeader tabs.
const PILL_BASE = 'rounded-full px-2.5 py-1 font-mono text-xs transition-colors disabled:opacity-50'
const PILL_ACTIVE = 'bg-token-surface-2 text-token-ink'
const PILL_IDLE = 'text-token-ink-3 hover:text-token-ink'
const PICKER_INPUT =
  'rounded-full border border-token-line bg-token-surface px-2.5 py-1 font-mono text-xs text-token-ink outline-none focus:border-token-brand disabled:opacity-50'
const PICKER_APPLY =
  'rounded-full bg-token-brand px-3 py-1 font-mono text-xs text-token-on-brand transition-colors hover:bg-token-brand-2 disabled:opacity-50'

/** Text color for a semantic tone (a progress row keeps its green/amber/red read). */
function toneText(tone: Tone): string {
  if (tone === 'loss') return 'text-token-loss'
  if (tone === 'warn') return 'text-token-warn'
  return 'text-token-ink'
}

/**
 * The card every variant lives in: kit Card with the chart's title as its label
 * and its refetch control as the action. `bare` keeps the caller's own card (the
 * Budget trend sits inside one) and drops only the surface and rounding.
 */
function ChartFrame({
  title,
  control,
  error,
  bare,
  children,
}: {
  title: string
  control?: ReactNode
  error?: string | null
  bare?: boolean
  children: ReactNode
}) {
  const body = (
    <>
      {error && <p className="mb-3 font-mono text-xs text-token-loss">{error}</p>}
      {children}
    </>
  )
  if (bare) {
    return (
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <SectionLabel>{title}</SectionLabel>
          {control}
        </div>
        {body}
      </div>
    )
  }
  return (
    <Card label={title} action={control}>
      {body}
    </Card>
  )
}

// Lets a chart switch its own time period in place (a REST GET) instead of
// round-tripping through the LLM for what's really just a parameter change.
// Two flavors: a fixed set of preset buttons (e.g. 3M/1Y/5Y), or prev/next
// navigation for charts that are inherently one-calendar-month-at-a-time.
interface PeriodButtonsRefetch {
  mode: 'period_buttons'
  endpoint: string
  params: Record<string, string>
  period_param: string
  periods: { label: string; value: number }[]
  current: number
  // Actual date range of what's currently shown — lets a custom day-level date
  // picker sit alongside the preset buttons, pre-filled with something meaningful.
  range?: { start: string; end: string } | null
}

interface MonthNavRefetch {
  mode: 'month_nav'
  endpoint: string
  params: Record<string, string>
  month: number
  year: number
}

// A free start/end month range (e.g. the spending trend chart) — rendered as
// two native <input type="month"> pickers + an Apply button.
interface MonthRangeRefetch {
  mode: 'month_range'
  endpoint: string
  params: Record<string, string>
  start: string // "YYYY-MM"
  end: string // "YYYY-MM"
}

type RefetchConfig = PeriodButtonsRefetch | MonthNavRefetch | MonthRangeRefetch

type ChartProps =
  | { chart_type: 'pie'; title: string; data: PieData; refetch?: RefetchConfig; bare?: boolean }
  | { chart_type: 'progress_list'; title: string; data: ProgressListData; refetch?: RefetchConfig }
  | { chart_type: 'bar'; title: string; data: BarData; refetch?: RefetchConfig }
  // `bare` drops the chart's own bg-token-surface/rounded/padding wrapper, for a
  // caller that already places it inside its own card (e.g. the Budget card's
  // 3M/6M/12M trend view, embedded alongside the period nav in one shared card
  // instead of two stacked cards).
  | { chart_type: 'line'; title: string; data: LineData; refetch?: RefetchConfig; bare?: boolean }

export default function Chart(props: ChartProps) {
  switch (props.chart_type) {
    case 'pie':
      return <PieChart title={props.title} data={props.data} refetch={props.refetch} bare={props.bare} />
    case 'progress_list':
      return <ProgressListChart title={props.title} data={props.data} refetch={props.refetch} />
    case 'bar':
      return <BarChart title={props.title} data={props.data} refetch={props.refetch} />
    case 'line':
      return <LineChart title={props.title} data={props.data} refetch={props.refetch} bare={props.bare} />
    default:
      return null
  }
}

// Generic refetch state, shared by any chart_type that carries a `refetch`
// block — holds whatever the endpoint returns (title/data/refetch all change
// together, e.g. the title's month label moves with the data on nav).
function useChartRefetch<T>(initialTitle: string, initialData: T, initialRefetch?: RefetchConfig) {
  const [state, setState] = useState<{ title: string; data: T; refetch?: RefetchConfig }>({
    title: initialTitle,
    data: initialData,
    refetch: initialRefetch,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refetchWith(extraParams: Record<string, number | string>) {
    const refetch = state.refetch
    if (!refetch || loading) return
    setLoading(true)
    setError(null)
    try {
      const allParams: Record<string, string> = { ...refetch.params }
      Object.entries(extraParams).forEach(([k, v]) => {
        allParams[k] = String(v)
      })
      const qs = new URLSearchParams(allParams)
      // Refetch endpoints come from the backend chart envelope and span two
      // backends: /finance/* chart endpoints (Actual Budget) and /vehicle/*
      // per-vehicle charts (vehicle-manager's own DB — backend/tools/finance/
      // vehicle.py). Only the finance ones prove AB health, so the clear is
      // conditional (audit finding 57).
      const abBacked = refetch.endpoint.startsWith('/finance/')
      const res = await authFetch(`/api${refetch.endpoint}?${qs}`, undefined, { abBacked })
      if (!res.ok) {
        setError(`Failed to load chart (HTTP ${res.status})`)
        return
      }
      const json = await res.json()
      if (json.type === 'error') {
        setError(json.message || 'Failed to load chart')
      } else {
        setState({ title: json.title, data: json.data, refetch: json.refetch })
      }
    } catch {
      setError('Failed to load chart')
    } finally {
      setLoading(false)
    }
  }

  return { title: state.title, data: state.data, refetch: state.refetch, loading, error, refetchWith }
}

// Prev/next month arrows for month_nav. The month label is the card's own label
// (it moves with the refetched data), so the action is only the two arrows.
function MonthNav({
  refetch,
  loading,
  onNav,
}: {
  refetch: MonthNavRefetch
  loading: boolean
  onNav: (params: Record<string, number>) => void
}) {
  function shift(delta: number) {
    let m = refetch.month + delta
    let y = refetch.year
    if (m > 12) {
      m = 1
      y += 1
    } else if (m < 1) {
      m = 12
      y -= 1
    }
    onNav({ month: m, year: y })
  }

  return (
    <div className="flex items-center">
      <button
        type="button"
        disabled={loading}
        onClick={() => shift(-1)}
        className={cx(PILL_BASE, PILL_IDLE)}
        aria-label="Previous month"
      >
        ‹
      </button>
      <button
        type="button"
        disabled={loading}
        onClick={() => shift(1)}
        className={cx(PILL_BASE, PILL_IDLE)}
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  )
}

// --- Pie (a composition) — kit StackedBar ---
// The kit's flat graph language has no donut: composition is one stacked bar
// plus a legend carrying the numbers, which is also what Invest shows.

function PieChart({ title, data, refetch: initialRefetch, bare }: { title: string; data: PieData; refetch?: RefetchConfig; bare?: boolean }) {
  const { title: liveTitle, data: liveData, refetch, loading, error, refetchWith } = useChartRefetch(
    title,
    data,
    initialRefetch
  )

  // Show at most 7 categories + "Other" to keep the chart readable
  const topSegs = liveData.segments.slice(0, 7)
  const rest = liveData.segments.slice(7)
  const slices = [
    ...topSegs.map((s, i) => ({ label: s.name, value: s.value, color: SERIES_COLORS[i % SERIES_COLORS.length] })),
    ...(rest.length > 0
      ? [
          {
            label: 'Other',
            value: rest.reduce((sum, s) => sum + s.value, 0),
            color: 'var(--line-strong)',
          },
        ]
      : []),
  ]

  return (
    <ChartFrame
      title={liveTitle}
      error={error}
      bare={bare}
      control={
        refetch?.mode === 'month_nav' ? (
          <MonthNav refetch={refetch} loading={loading} onNav={refetchWith} />
        ) : null
      }
    >
      {slices.length > 0 && (
        <HeroValue
          label="Total"
          value={formatCurrency(liveData.total)}
          sub={liveData.count != null ? `${liveData.count} transactions` : undefined}
        />
      )}
      <div className="mt-4">
        <StackedBar slices={slices} formatValue={formatCurrency} />
      </div>
    </ChartFrame>
  )
}

// --- Progress list (budget vs actual, savings goals) — kit ProgressBar ---

function ProgressListChart({
  title,
  data,
  refetch: initialRefetch,
}: {
  title: string
  data: ProgressListData
  refetch?: RefetchConfig
}) {
  const { title: liveTitle, data: liveData, refetch, loading, error, refetchWith } = useChartRefetch(
    title,
    data,
    initialRefetch
  )

  const control =
    refetch?.mode === 'month_nav' ? (
      <MonthNav refetch={refetch} loading={loading} onNav={refetchWith} />
    ) : null

  if (liveData.items.length === 0) {
    return (
      <ChartFrame title={liveTitle} control={control} error={error}>
        <EmptyState title={liveData.empty_message || 'No data available'} />
      </ChartFrame>
    )
  }

  return (
    <ChartFrame title={liveTitle} control={control} error={error}>
      <div className="space-y-4">
        {liveData.items.map((item) => {
          // Toned by how far past its target the row is: amber from 90%,
          // red once it has overspent.
          const tone: Tone = item.percentage > 100 ? 'loss' : item.percentage >= 90 ? 'warn' : 'default'

          return (
            <div key={item.label}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="truncate text-sm text-token-ink-2">{item.label}</span>
                <span className={cx('shrink-0 font-mono text-xs tabular-nums', toneText(tone))}>
                  {formatPercent(item.percentage, { decimals: 0 })}
                </span>
              </div>
              <ProgressBar value={item.percentage / 100} tone={tone} />
              <p className="mt-1 font-mono text-xs tabular-nums text-token-ink-3">
                {formatCurrency(item.value)} / {formatCurrency(item.target)}
              </p>
              {item.extra && <p className="mt-0.5 text-xs text-token-ink-3">{item.extra}</p>}
            </div>
          )
        })}
      </div>
    </ChartFrame>
  )
}

// --- Bar (spending vs income per month) — kit BarChart / GroupedBarChart ---

// Free start/end month range picker — two native <input type="month"> plus an
// Apply button. Keyed by the current refetch.start/end wherever it's rendered,
// so its local draft state resets to match whenever a new range loads.
function MonthRangePicker({
  refetch,
  loading,
  onApply,
}: {
  refetch: MonthRangeRefetch
  loading: boolean
  onApply: (params: Record<string, number>) => void
}) {
  const [start, setStart] = useState(refetch.start)
  const [end, setEnd] = useState(refetch.end)

  function apply() {
    const [sy, sm] = start.split('-').map(Number)
    const [ey, em] = end.split('-').map(Number)
    if (!sy || !sm || !ey || !em) return
    onApply({ start_month: sm, start_year: sy, end_month: em, end_year: ey })
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="month"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        disabled={loading}
        className={PICKER_INPUT}
      />
      <span className="font-mono text-xs text-token-ink-3">–</span>
      <input
        type="month"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        disabled={loading}
        className={PICKER_INPUT}
      />
      <button type="button" disabled={loading} onClick={apply} className={PICKER_APPLY}>
        Apply
      </button>
    </div>
  )
}

function BarChart({ title, data, refetch: initialRefetch }: { title: string; data: BarData; refetch?: RefetchConfig }) {
  const { title: liveTitle, data: liveData, refetch, loading, error, refetchWith } = useChartRefetch(
    title,
    data,
    initialRefetch
  )
  const navigate = useNavigate()

  // A point carrying month + year is a drill-down handle: clicking its bar opens
  // that month in the transactions list (what the old tooltip's link did).
  function drillDown(index: number) {
    const point = liveData.points[index]
    if (!point || point.month == null || point.year == null) return
    const month = String(point.month).padStart(2, '0')
    const lastDay = new Date(point.year, point.month, 0).getDate()
    const dateFrom = `${point.year}-${month}-01`
    const dateTo = `${point.year}-${month}-${String(lastDay).padStart(2, '0')}`
    navigate('/transactions', { state: { dateFrom, dateTo } })
  }

  const canDrillDown = liveData.points.some((p) => p.month != null && p.year != null)

  const control =
    refetch?.mode === 'month_range' ? (
      <MonthRangePicker key={`${refetch.start}_${refetch.end}`} refetch={refetch} loading={loading} onApply={refetchWith} />
    ) : null

  const series = liveData.series.map((s, i) => ({ label: s.label, color: seriesColor(s.color, i) }))

  return (
    <ChartFrame title={liveTitle} control={control} error={error}>
      {series.length > 1 ? (
        <GroupedBarChart
          series={series}
          data={liveData.points.map((p) => ({ label: p.x, values: p.values }))}
          formatValue={formatCurrency}
          emptyMessage="No data available"
          onSelect={canDrillDown ? drillDown : undefined}
        />
      ) : (
        <KitBarChart
          data={liveData.points.map((p) => ({ label: p.x, value: p.values[0] ?? 0 }))}
          color={seriesColor(liveData.series[0]?.color, 0)}
          formatValue={formatCurrency}
          emptyMessage="No data available"
          onSelect={canDrillDown ? drillDown : undefined}
        />
      )}
    </ChartFrame>
  )
}

// --- Line (e.g. fuel consumption trend) ---

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Points carry ISO dates (YYYY-MM-DD). Short form omits the year (used on the
// crowded x-axis); full form includes it (used once in the header range, so a
// trend spanning a year boundary — e.g. Aug '25 to Jan '26 — isn't ambiguous).
function formatDateShort(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso
  const [, , mo, d] = m
  return `${parseInt(d, 10)} ${MONTH_ABBR[parseInt(mo, 10) - 1]}`
}

function formatDateFull(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso
  const [, y, mo, d] = m
  return `${parseInt(d, 10)} ${MONTH_ABBR[parseInt(mo, 10) - 1]} '${y.slice(2)}`
}

// Decimals for the readouts, picked from the series magnitude: a sub-1 series
// (e.g. cost/km) shows cents instead of rounding to "0", while a mileage series
// doesn't get a noisy ",00" suffix.
function axisDecimals(min: number, max: number): 0 | 1 | 2 {
  const magnitude = Math.max(Math.abs(min), Math.abs(max))
  if (magnitude < 1) return 2
  if (magnitude < 100) return 1
  return 0
}

// Segmented pills, the same control the shared PageHeader tabs use.
function PeriodSwitcher({
  refetch,
  loading,
  onSelect,
}: {
  refetch: PeriodButtonsRefetch
  loading: boolean
  onSelect: (value: number) => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-token-line bg-token-surface p-[3px]">
      {refetch.periods.map((p) => (
        <button
          key={p.value}
          type="button"
          disabled={loading}
          onClick={() => onSelect(p.value)}
          className={cx(PILL_BASE, p.value === refetch.current ? PILL_ACTIVE : PILL_IDLE)}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

// Custom day-level start/end date picker, shown alongside (not instead of) the
// preset period buttons — keyed by the current range wherever it's rendered, so
// its draft state resets to match whenever a new range loads.
function DateRangePicker({
  range,
  loading,
  onApply,
}: {
  range: { start: string; end: string }
  loading: boolean
  onApply: (params: Record<string, string>) => void
}) {
  const [start, setStart] = useState(range.start)
  const [end, setEnd] = useState(range.end)

  function apply() {
    if (!start || !end) return
    onApply({ start_date: start, end_date: end })
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="date"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        disabled={loading}
        className={PICKER_INPUT}
      />
      <span className="font-mono text-xs text-token-ink-3">–</span>
      <input
        type="date"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        disabled={loading}
        className={PICKER_INPUT}
      />
      <button type="button" disabled={loading} onClick={apply} className={PICKER_APPLY}>
        Apply
      </button>
    </div>
  )
}

function LineChart({
  title,
  data,
  refetch: initialRefetch,
  bare,
}: {
  title: string
  data: LineData
  refetch?: RefetchConfig
  bare?: boolean
}) {
  const { title: liveTitle, data: chartData, refetch, loading, error, refetchWith } = useChartRefetch(
    title,
    data,
    initialRefetch
  )

  function handlePeriodSelect(value: number) {
    if (refetch?.mode === 'period_buttons') refetchWith({ [refetch.period_param]: value })
  }

  const control =
    refetch?.mode === 'period_buttons' ? (
      <div className="flex flex-col items-end gap-1.5">
        <PeriodSwitcher refetch={refetch} loading={loading} onSelect={handlePeriodSelect} />
        {refetch.range && (
          <DateRangePicker
            key={`${refetch.range.start}_${refetch.range.end}`}
            range={refetch.range}
            loading={loading}
            onApply={refetchWith}
          />
        )}
      </div>
    ) : null

  const pointCount = chartData.series.reduce((n, s) => n + s.points.length, 0)

  if (pointCount < 2) {
    return (
      <ChartFrame title={liveTitle} control={control} error={error} bare={bare}>
        <EmptyState title={chartData.empty_message || 'Not enough data yet'} />
      </ChartFrame>
    )
  }

  // AreaChart draws every series on one shared x-axis, so feed it the union of
  // the payload's dates (ISO, so a plain sort is chronological); a series with
  // no point on a date contributes a gap instead of shifting its neighbours.
  const labels = Array.from(new Set(chartData.series.flatMap((s) => s.points.map((p) => p.x)))).sort()
  const series = chartData.series.map((s, i) => {
    const byDate = new Map(s.points.map((p) => [p.x, p.y]))
    return {
      name: s.label,
      values: labels.map((x) => byDate.get(x) ?? null),
      color: seriesColor(s.color, i),
      // The first series keeps the kit's area fill; the rest read as lines.
      area: i === 0,
    }
  })

  const allValues = chartData.series.flatMap((s) => s.points.map((p) => p.y))
  const decimals = axisDecimals(Math.min(...allValues), Math.max(...allValues))

  // A multi-year series (e.g. a 12-year vehicle-value projection) has
  // consecutive labeled points ~1 year apart that land on nearly the same
  // day-of-month — "29 Aug · 28 Aug · 27 Aug" reads as consecutive days. The
  // year-inclusive format is used whenever the series spans more than a year.
  const spanDays = (Date.parse(labels[labels.length - 1]) - Date.parse(labels[0])) / 86_400_000
  const formatAxisLabel = spanDays > 365 ? formatDateFull : formatDateShort

  return (
    <ChartFrame title={liveTitle} control={control} error={error} bare={bare}>
      <AreaChart
        labels={labels}
        series={series}
        formatValue={(value) => formatNumber(value, decimals)}
        formatLabel={formatAxisLabel}
        emptyMessage={chartData.empty_message}
      />
    </ChartFrame>
  )
}
