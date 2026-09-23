/**
 * Generic chart renderer — one component, four chart_type variants, drawn with
 * the shared kit (components/kit/Card.tsx, Stats.tsx, Charts.tsx).
 *
 * Copied from majordom-financiar/frontend/src/components/Chart.tsx (2026-09-12,
 * Phase 3 of tools/vehicle-manager/docs/standalone-app-plan.md) and migrated onto
 * the shared kit on 2026-09-24 (Phase 4). The chart_type contract, the refetch
 * logic and this component's props are unchanged; only the drawing is the kit's.
 *
 * One majordom-financiar-shaped detail is deliberately left alone here, since
 * data fetching is not part of the kit migration: `refetchWith()` calls
 * `authFetch(`/api${endpoint}`)`, while vehicle-manager's own routes have no
 * `/api` prefix. Nothing in this app sends a `refetch` block today.
 *
 * Backend tools return {"type": "chart", "chart_type": ..., "title": ..., "data": {...}}.
 * The tool (backend, deterministic code) decides which chart_type fits its data —
 * this component never guesses the type, it only renders what it's told.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authFetch } from '../lib/auth'
import { formatCurrency, formatPercent, formatNumber } from '../lib/formatCurrency'
import { cx } from './shell/cx'
import { Card } from './kit/Card'
import { EmptyState, HeroValue, ListRow, ProgressBar } from './kit/Stats'
import {
  AreaChart,
  BarChart as KitBarChart,
  GroupedBarChart,
  SERIES_COLORS,
  StackedBar,
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
  count: number
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
  | { chart_type: 'pie'; title: string; data: PieData; refetch?: RefetchConfig }
  | { chart_type: 'progress_list'; title: string; data: ProgressListData; refetch?: RefetchConfig }
  | { chart_type: 'bar'; title: string; data: BarData; refetch?: RefetchConfig }
  // `bare` drops the chart's own bg-surface/rounded/padding wrapper, for a
  // caller that already places it inside its own card (e.g. the Budget card's
  // 3M/6M/12M trend view, embedded alongside the period nav in one shared card
  // instead of two stacked cards).
  | { chart_type: 'line'; title: string; data: LineData; refetch?: RefetchConfig; bare?: boolean }

export default function Chart(props: ChartProps) {
  switch (props.chart_type) {
    case 'pie':
      return <PieChart title={props.title} data={props.data} refetch={props.refetch} />
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
      const res = await authFetch(`/api${refetch.endpoint}?${qs}`)
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

// Prev/next month arrows — the live title is the card's label, so this is only
// the control, shown as the card action when refetch.mode is 'month_nav'.
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

  const button = cx(
    'rounded-full px-2 py-0.5 text-sm leading-none text-ink-3 transition-colors',
    'hover:bg-surface-2 hover:text-ink disabled:opacity-40',
  )

  return (
    <div className="flex items-center gap-1">
      <button type="button" disabled={loading} onClick={() => shift(-1)} className={button} aria-label="Previous month">
        ‹
      </button>
      <button type="button" disabled={loading} onClick={() => shift(1)} className={button} aria-label="Next month">
        ›
      </button>
    </div>
  )
}

// --- Pie (composition of a total, e.g. cost categories) ---

function PieChart({ title, data, refetch: initialRefetch }: { title: string; data: PieData; refetch?: RefetchConfig }) {
  const { title: liveTitle, data: liveData, refetch, loading, error, refetchWith } = useChartRefetch(
    title,
    data,
    initialRefetch
  )

  // Show at most 7 categories + "Other" to keep the composition bar readable
  const topSegs = liveData.segments.slice(0, 7)
  const rest = liveData.segments.slice(7)
  const slices = [
    ...topSegs.map((s, i) => ({
      label: s.name,
      value: s.value,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
    })),
    ...(rest.length > 0
      ? [
          {
            label: 'Other',
            value: rest.reduce((sum, s) => sum + s.value, 0),
            color: 'var(--ink-3)',
          },
        ]
      : []),
  ]

  return (
    <Card
      label={liveTitle}
      action={
        refetch?.mode === 'month_nav' ? (
          <MonthNav refetch={refetch} loading={loading} onNav={refetchWith} />
        ) : null
      }
    >
      {error && <p className="mb-2 text-xs text-loss">{error}</p>}
      <HeroValue label="Total" value={formatCurrency(liveData.total)} sub={`${liveData.count} transactions`} />
      <div className="mt-5">
        <StackedBar slices={slices} formatValue={formatCurrency} />
      </div>
    </Card>
  )
}

// --- Progress list (budget vs actual, savings goals) ---

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

  return (
    <Card
      label={liveTitle}
      action={
        refetch?.mode === 'month_nav' ? (
          <MonthNav refetch={refetch} loading={loading} onNav={refetchWith} />
        ) : null
      }
    >
      {error && <p className="mb-2 text-xs text-loss">{error}</p>}
      {liveData.items.length === 0 ? (
        <EmptyState title={liveData.empty_message || 'No data available'} />
      ) : (
        <ul className="space-y-4">
          {liveData.items.map((item) => {
            // Over target reads as a loss (the old chart's red warning state).
            const tone = item.percentage > 100 ? 'loss' : 'default'
            return (
              <li key={item.label}>
                <ListRow
                  title={item.label}
                  value={formatPercent(item.percentage, { decimals: 0 })}
                  subtitle={`${formatCurrency(item.value)} / ${formatCurrency(item.target)}`}
                  meta={item.extra}
                  tone={tone}
                />
                <ProgressBar className="mt-2" value={item.percentage / 100} tone={tone} />
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

// --- Bar (grouped, e.g. per-month income vs. spending) ---

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
    <div className="flex items-center gap-2 mb-4">
      <input
        type="month"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        disabled={loading}
        className="rounded border border-line bg-surface px-2 py-1 font-mono text-[10px] text-ink outline-none focus:border-brand-2 disabled:opacity-50"
      />
      <span className="text-xs text-ink-3">–</span>
      <input
        type="month"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        disabled={loading}
        className="rounded border border-line bg-surface px-2 py-1 font-mono text-[10px] text-ink outline-none focus:border-brand-2 disabled:opacity-50"
      />
      <button
        type="button"
        disabled={loading}
        onClick={apply}
        className="rounded-full bg-brand px-3 py-1 text-[10px] text-on-brand transition-colors hover:bg-brand-2 disabled:opacity-50"
      >
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

  const rangePicker =
    refetch?.mode === 'month_range' ? (
      <MonthRangePicker key={`${refetch.start}_${refetch.end}`} refetch={refetch} loading={loading} onApply={refetchWith} />
    ) : null

  // A point that names its month/year drills into that month's transactions.
  // Transport's own bar charts don't send month/year yet, so this stays dormant;
  // the destination is the one the original tooltip had, kept as-is rather than
  // guessed at (this app has no /transactions route).
  const drillDown = liveData.points.some((p) => p.month != null && p.year != null)
    ? (index: number) => {
        const point = liveData.points[index]
        if (!point || point.month == null || point.year == null) return
        const month = String(point.month).padStart(2, '0')
        const lastDay = new Date(point.year, point.month, 0).getDate()
        navigate('/transactions', {
          state: {
            dateFrom: `${point.year}-${month}-01`,
            dateTo: `${point.year}-${month}-${String(lastDay).padStart(2, '0')}`,
          },
        })
      }
    : undefined

  const colorAt = (i: number) => liveData.series[i]?.color || SERIES_COLORS[i % SERIES_COLORS.length]

  return (
    <Card label={liveTitle}>
      {rangePicker}
      {error && <p className="mb-2 text-xs text-loss">{error}</p>}
      {liveData.points.length === 0 ? (
        <EmptyState title="No data available" />
      ) : liveData.series.length > 1 ? (
        <GroupedBarChart
          series={liveData.series.map((s, i) => ({ label: s.label, color: colorAt(i) }))}
          data={liveData.points.map((p) => ({ label: p.x, values: p.values }))}
          formatValue={formatCurrency}
          onSelect={drillDown}
        />
      ) : (
        <KitBarChart
          data={liveData.points.map((p) => ({ label: p.x, value: p.values[0] ?? 0 }))}
          color={colorAt(0)}
          formatValue={formatCurrency}
          onSelect={drillDown}
        />
      )}
    </Card>
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

// Decimals for the min/max readouts, picked from the series magnitude so the
// header line and the Y-axis edge labels can never disagree: a sub-1 series
// (e.g. cost/km) shows cents instead of rounding to "0", while a mileage
// series doesn't get a noisy ",00" suffix.
function axisDecimals(min: number, max: number): 0 | 1 | 2 {
  const magnitude = Math.max(Math.abs(min), Math.abs(max))
  if (magnitude < 1) return 2
  if (magnitude < 100) return 1
  return 0
}

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
    <div className="flex items-center gap-1">
      {refetch.periods.map((p) => (
        <button
          key={p.value}
          type="button"
          disabled={loading}
          onClick={() => onSelect(p.value)}
          className={cx(
            'rounded-full px-2.5 py-1 font-mono text-[11px] transition-colors disabled:opacity-50',
            p.value === refetch.current
              ? 'bg-brand text-on-brand'
              : 'bg-surface-sunken text-ink-2 hover:text-ink',
          )}
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
    <div className="flex items-center gap-2 mb-3">
      <input
        type="date"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        disabled={loading}
        className="rounded border border-line bg-surface px-2 py-1 font-mono text-[10px] text-ink outline-none focus:border-brand-2 disabled:opacity-50"
      />
      <span className="text-xs text-ink-3">–</span>
      <input
        type="date"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        disabled={loading}
        className="rounded border border-line bg-surface px-2 py-1 font-mono text-[10px] text-ink outline-none focus:border-brand-2 disabled:opacity-50"
      />
      <button
        type="button"
        disabled={loading}
        onClick={apply}
        className="rounded-full bg-brand px-3 py-1 text-[10px] text-on-brand transition-colors hover:bg-brand-2 disabled:opacity-50"
      >
        Apply
      </button>
    </div>
  )
}

/** One series' points on the shared label grid. The kit plots by index, so a
 *  sparse series (the projection's two-point salvage floor) is interpolated
 *  across the grid — the same stretch the old per-series scale drew. */
function toValueGrid(points: LinePoint[], labels: string[]): Array<number | null> {
  const n = labels.length
  const byLabel = new Map(points.map((p) => [p.x, p.y]))
  if (points.length >= n) return labels.map((label) => byLabel.get(label) ?? null)
  return labels.map((_, i) => {
    const position = (i / (n - 1)) * (points.length - 1)
    const low = Math.floor(position)
    const high = Math.min(low + 1, points.length - 1)
    return points[low].y + (points[high].y - points[low].y) * (position - low)
  })
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

  // One x axis for every series (the kit plots by index), so the labels are the
  // union of the series' x values in date order.
  const allPoints = chartData.series.flatMap((s) => s.points)
  const labels = Array.from(new Set(allPoints.map((p) => p.x))).sort()
  const values = allPoints.map((p) => p.y)
  const decimals = values.length ? axisDecimals(Math.min(...values), Math.max(...values)) : 0

  // A multi-year series (e.g. a 12-year value projection) labels consecutive
  // points ~1 year apart, which formatDateShort() renders as four look-alike
  // days; those fall back to the year-inclusive format.
  const first = labels[0] ?? ''
  const last = labels[labels.length - 1] ?? ''
  const spanDays = (Date.parse(last) - Date.parse(first)) / 86_400_000
  const formatLabel = spanDays > 365 ? formatDateFull : formatDateShort

  const series = chartData.series.map((s, i) => ({
    name: s.label,
    values: toValueGrid(s.points, labels),
    color: s.color || SERIES_COLORS[i % SERIES_COLORS.length],
  }))

  const periodSwitcher =
    refetch?.mode === 'period_buttons' ? (
      <PeriodSwitcher refetch={refetch} loading={loading} onSelect={handlePeriodSelect} />
    ) : null

  const body = (
    <>
      {refetch?.mode === 'period_buttons' && refetch.range && (
        <DateRangePicker
          key={`${refetch.range.start}_${refetch.range.end}`}
          range={refetch.range}
          loading={loading}
          onApply={refetchWith}
        />
      )}
      {error && <p className="mb-2 text-xs text-loss">{error}</p>}
      {allPoints.length < 2 ? (
        <EmptyState title={chartData.empty_message || 'Not enough data yet'} />
      ) : (
        <AreaChart
          labels={labels}
          series={series}
          height={220}
          formatValue={(v) => formatNumber(v, decimals)}
          formatLabel={formatLabel}
        />
      )}
    </>
  )

  // `bare` keeps the old escape hatch for a caller that already supplies a card:
  // the label and the period pills move back inside the plot's own box.
  if (bare) {
    return (
      <div className="p-4">
        <p className="mb-2 text-[13px] font-medium text-ink-2">{liveTitle}</p>
        {periodSwitcher && <div className="mb-3">{periodSwitcher}</div>}
        {body}
      </div>
    )
  }

  return (
    <Card label={liveTitle} action={periodSwitcher}>
      {body}
    </Card>
  )
}
