/**
 * Generic chart renderer — one component, four chart_type variants.
 *
 * Backend tools return {"type": "chart", "chart_type": ..., "title": ..., "data": {...}}.
 * The tool (backend, deterministic code) decides which chart_type fits its data —
 * this component never guesses the type, it only renders what it's told.
 */
import { useState } from 'react'
import { authFetch } from '../lib/auth'

// Shared palette — single source of truth for chart colors (previously duplicated
// across SpendingChart.tsx and BudgetChart.tsx).
const SEGMENT_COLORS = [
  '#6366F1', // indigo
  '#22C55E', // green
  '#F59E0B', // amber
  '#EC4899', // pink
  '#14B8A6', // teal
  '#8B5CF6', // violet
  '#F97316', // orange
  '#06B6D4', // cyan
]

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
  | { chart_type: 'line'; title: string; data: LineData; refetch?: RefetchConfig }

export default function Chart(props: ChartProps) {
  switch (props.chart_type) {
    case 'pie':
      return <PieChart title={props.title} data={props.data} refetch={props.refetch} />
    case 'progress_list':
      return <ProgressListChart title={props.title} data={props.data} refetch={props.refetch} />
    case 'bar':
      return <BarChart title={props.title} data={props.data} refetch={props.refetch} />
    case 'line':
      return <LineChart title={props.title} data={props.data} refetch={props.refetch} />
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

// Prev/next month arrows flanking the title — used instead of the plain title
// line when refetch.mode is 'month_nav'.
function MonthNavTitle({
  title,
  refetch,
  loading,
  onNav,
}: {
  title: string
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
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        disabled={loading}
        onClick={() => shift(-1)}
        className="text-muted hover:text-white disabled:opacity-40 px-1 text-sm leading-none"
        aria-label="Previous month"
      >
        ‹
      </button>
      <p className="text-xs text-muted uppercase tracking-wide text-center flex-1 truncate">{title}</p>
      <button
        type="button"
        disabled={loading}
        onClick={() => shift(1)}
        className="text-muted hover:text-white disabled:opacity-40 px-1 text-sm leading-none"
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  )
}

const money = (n: number) =>
  `€${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// --- Pie / donut ---

function PieChart({ title, data, refetch: initialRefetch }: { title: string; data: PieData; refetch?: RefetchConfig }) {
  const { title: liveTitle, data: liveData, refetch, loading, error, refetchWith } = useChartRefetch(
    title,
    data,
    initialRefetch
  )

  // Show at most 7 categories + "Other" to keep the chart readable
  const topSegs = liveData.segments.slice(0, 7)
  const rest = liveData.segments.slice(7)
  const otherValue = rest.reduce((s, c) => s + c.value, 0)
  const otherPct = rest.reduce((s, c) => s + c.percentage, 0)

  const segments = [
    ...topSegs.map((s, i) => ({ ...s, color: SEGMENT_COLORS[i] })),
    ...(rest.length > 0 ? [{ name: 'Other', value: otherValue, percentage: otherPct, color: '#3F3F46' }] : []),
  ]

  return (
    <div className="bg-surface rounded-2xl p-4">
      <div className="flex items-baseline justify-between mb-4">
        <div className="flex-1 min-w-0">
          {refetch?.mode === 'month_nav' ? (
            <MonthNavTitle title={liveTitle} refetch={refetch} loading={loading} onNav={refetchWith} />
          ) : (
            <p className="text-xs text-muted uppercase tracking-wide">{liveTitle}</p>
          )}
          <p className="text-white text-2xl font-semibold mt-0.5">{money(liveData.total)}</p>
          <p className="text-muted text-xs mt-0.5">{liveData.count} transactions</p>
        </div>
        <Donut segments={segments} />
      </div>

      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      {segments.length === 0 ? (
        <p className="text-muted text-sm text-center py-2">No expenses this month</p>
      ) : (
        <div className="space-y-2.5">
          {segments.map((seg) => (
            <div key={seg.name}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                  <span className="text-white text-xs truncate">{seg.name}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <span className="text-muted text-xs">{seg.percentage.toFixed(0)}%</span>
                  <span className="text-white text-xs font-medium w-16 text-right">{money(seg.value)}</span>
                </div>
              </div>
              <div className="h-1 bg-background rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${seg.percentage}%`, backgroundColor: seg.color }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Donut({ segments }: { segments: { name: string; percentage: number; color: string }[] }) {
  const size = 72
  const radius = 28
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * radius
  const gap = 1.5

  let offset = 0
  const paths = segments.map((seg) => {
    const length = Math.max(0, (seg.percentage / 100) * circumference - gap)
    const rotate = (offset / circumference) * 360 - 90
    const el = (
      <circle
        key={seg.name}
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={seg.color}
        strokeWidth={8}
        strokeDasharray={`${length} ${circumference - length}`}
        strokeDashoffset={0}
        transform={`rotate(${rotate} ${cx} ${cy})`}
        strokeLinecap="butt"
      />
    )
    offset += (seg.percentage / 100) * circumference
    return el
  })

  return (
    <svg width={size} height={size} className="flex-shrink-0">
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#2A2A2A" strokeWidth={8} />
      {paths}
    </svg>
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

  const chartTitle =
    refetch?.mode === 'month_nav' ? (
      <MonthNavTitle title={liveTitle} refetch={refetch} loading={loading} onNav={refetchWith} />
    ) : (
      <p className="text-xs text-muted uppercase tracking-wide mb-4">{liveTitle}</p>
    )

  if (liveData.items.length === 0) {
    return (
      <div className="bg-surface rounded-2xl p-4">
        {chartTitle}
        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
        <p className="text-muted text-sm text-center py-4">{liveData.empty_message || 'No data available'}</p>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-2xl p-4">
      {chartTitle}
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      <div className="space-y-4">
        {liveData.items.map((item, i) => {
          const barWidth = Math.min(item.percentage, 100)
          const color = item.color || SEGMENT_COLORS[i % SEGMENT_COLORS.length]
          const isWarning = color === '#FF2D2D'

          return (
            <div key={item.label}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  {isWarning && <span className="text-sm">⚠️</span>}
                  <span className="text-white text-sm font-medium truncate mr-2">{item.label}</span>
                </div>
                <span
                  className="text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{ color, backgroundColor: `${color}20` }}
                >
                  {item.percentage.toFixed(0)}%
                </span>
              </div>
              <div className="h-2 bg-background rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${barWidth}%`, backgroundColor: color }}
                />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-muted text-xs">
                  {money(item.value)} / {money(item.target)}
                </span>
              </div>
              {item.extra && <p className="text-xs text-muted mt-0.5">{item.extra}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- Bar (grouped, e.g. spending vs income per month) ---

const MAX_BAR_HEIGHT = 80
const MIN_BAR_HEIGHT = 2

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
        className="bg-background text-white rounded px-2 py-1 text-[10px] border border-transparent focus:border-accent outline-none disabled:opacity-50"
      />
      <span className="text-muted text-xs">–</span>
      <input
        type="month"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        disabled={loading}
        className="bg-background text-white rounded px-2 py-1 text-[10px] border border-transparent focus:border-accent outline-none disabled:opacity-50"
      />
      <button
        type="button"
        disabled={loading}
        onClick={apply}
        className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-full px-3 py-1 text-[10px] transition-colors"
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

  const rangePicker = refetch?.mode === 'month_range' && (
    <MonthRangePicker key={`${refetch.start}_${refetch.end}`} refetch={refetch} loading={loading} onApply={refetchWith} />
  )

  if (liveData.points.length === 0) {
    return (
      <div className="bg-surface rounded-2xl p-4">
        {rangePicker}
        <p className="text-muted text-sm text-center py-4">{error || 'No data available'}</p>
      </div>
    )
  }

  const maxVal = Math.max(...liveData.points.flatMap((p) => p.values), 1)
  const scaleHeight = (value: number) => (value === 0 ? MIN_BAR_HEIGHT : Math.max((value / maxVal) * MAX_BAR_HEIGHT, MIN_BAR_HEIGHT))

  return (
    <div className="bg-surface rounded-2xl p-4">
      {liveTitle && <p className="text-xs text-muted uppercase tracking-wide mb-2">{liveTitle}</p>}
      {rangePicker}
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      <div className="flex items-center gap-4 mb-4 text-xs text-muted">
        {liveData.series.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      <div className="flex items-end justify-around gap-3" style={{ height: MAX_BAR_HEIGHT }}>
        {liveData.points.map((p) => (
          <div key={p.x} className="flex items-end gap-0.5 flex-1 justify-center">
            {p.values.map((v, i) => (
              <div
                key={i}
                className="w-3 rounded-t-sm transition-all duration-300"
                style={{ height: scaleHeight(v), backgroundColor: liveData.series[i]?.color || SEGMENT_COLORS[i] }}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="flex justify-around gap-3 mt-2">
        {liveData.points.map((p) => (
          <div key={p.x} className="flex-1 text-center">
            <span className="text-xs text-muted">{p.x}</span>
          </div>
        ))}
      </div>

      <div className="flex justify-around gap-3 mt-1">
        {liveData.points.map((p) => (
          <div key={p.x} className="flex-1 text-center">
            <span className="text-[10px] text-muted">
              €{(p.values[0] || 0).toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
        ))}
      </div>
    </div>
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
    <div className="flex items-center gap-1 mb-3">
      {refetch.periods.map((p) => (
        <button
          key={p.value}
          type="button"
          disabled={loading}
          onClick={() => onSelect(p.value)}
          className={`text-[10px] px-2 py-0.5 rounded-full transition-colors disabled:opacity-50 ${
            p.value === refetch.current
              ? 'bg-accent text-white'
              : 'bg-background text-muted hover:text-white'
          }`}
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
        className="bg-background text-white rounded px-2 py-1 text-[10px] border border-transparent focus:border-accent outline-none disabled:opacity-50"
      />
      <span className="text-muted text-xs">–</span>
      <input
        type="date"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        disabled={loading}
        className="bg-background text-white rounded px-2 py-1 text-[10px] border border-transparent focus:border-accent outline-none disabled:opacity-50"
      />
      <button
        type="button"
        disabled={loading}
        onClick={apply}
        className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-full px-3 py-1 text-[10px] transition-colors"
      >
        Apply
      </button>
    </div>
  )
}

function LineChart({
  title,
  data,
  refetch: initialRefetch,
}: {
  title: string
  data: LineData
  refetch?: RefetchConfig
}) {
  const { title: liveTitle, data: chartData, refetch, loading, error, refetchWith } = useChartRefetch(
    title,
    data,
    initialRefetch
  )

  function handlePeriodSelect(value: number) {
    if (refetch?.mode === 'period_buttons') refetchWith({ [refetch.period_param]: value })
  }

  const allPoints = chartData.series.flatMap((s) => s.points)

  if (allPoints.length < 2) {
    return (
      <div className="bg-surface rounded-2xl p-4">
        <p className="text-xs text-muted uppercase tracking-wide mb-2">{liveTitle}</p>
        {refetch?.mode === 'period_buttons' && (
          <PeriodSwitcher refetch={refetch} loading={loading} onSelect={handlePeriodSelect} />
        )}
        <p className="text-muted text-sm text-center py-4">
          {error || chartData.empty_message || 'Not enough data yet'}
        </p>
      </div>
    )
  }

  const width = 300
  const height = 100
  const padX = 8
  const padY = 12

  const values = allPoints.map((p) => p.y)
  const minY = Math.min(...values)
  const maxY = Math.max(...values)
  const rangeY = maxY - minY || 1
  const yPad = rangeY * 0.15

  const scaleY = (y: number) => height - padY - ((y - minY + yPad) / (rangeY + yPad * 2)) * (height - padY * 2)

  return (
    <div className="bg-surface rounded-2xl p-4">
      <p className="text-xs text-muted uppercase tracking-wide mb-2">{liveTitle}</p>
      {refetch?.mode === 'period_buttons' && (
        <>
          <PeriodSwitcher refetch={refetch} loading={loading} onSelect={handlePeriodSelect} />
          {refetch.range && (
            <DateRangePicker
              key={`${refetch.range.start}_${refetch.range.end}`}
              range={refetch.range}
              loading={loading}
              onApply={refetchWith}
            />
          )}
        </>
      )}
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      {chartData.series.map((s) => {
        const scaleX = (i: number) => padX + (i / (s.points.length - 1)) * (width - padX * 2)
        const path = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(p.y)}`).join(' ')

        // At most 4 x-axis labels (first, ~1/3, ~2/3, last), deduplicated for
        // short series — showing every point would overlap once dates are
        // longer than a couple of characters.
        const lastIdx = s.points.length - 1
        const labelIndices = Array.from(
          new Set([0, Math.round(lastIdx / 3), Math.round((lastIdx * 2) / 3), lastIdx])
        ).sort((a, b) => a - b)

        return (
          <div key={s.label} className="mb-2">
            <div className="flex items-center justify-between text-xs text-muted mb-1">
              <span>{s.label}</span>
              <span>
                min {Math.min(...s.points.map((p) => p.y))} · max {Math.max(...s.points.map((p) => p.y))}
              </span>
            </div>
            <p className="text-[10px] text-muted mb-1">
              {formatDateFull(s.points[0].x)} – {formatDateFull(s.points[lastIdx].x)}
            </p>
            <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
              <path d={path} fill="none" stroke={s.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
              {s.points.map((p, i) => (
                <circle key={i} cx={scaleX(i)} cy={scaleY(p.y)} r={2.5} fill={s.color} />
              ))}
            </svg>
            <div className="relative h-4 mt-1 text-[10px] text-muted">
              {labelIndices.map((i) => {
                const pct = (scaleX(i) / width) * 100
                const isFirst = i === 0
                const isLast = i === lastIdx
                const style = isFirst
                  ? { left: 0 }
                  : isLast
                  ? { right: 0 }
                  : { left: `${pct}%`, transform: 'translateX(-50%)' }
                return (
                  <span key={i} className="absolute whitespace-nowrap" style={style}>
                    {formatDateShort(s.points[i].x)}
                  </span>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
