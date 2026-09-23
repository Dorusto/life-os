/**
 * Generic chart renderer — one component, four chart_type variants.
 *
 * Copied verbatim from majordom-financiar/frontend/src/components/Chart.tsx
 * (2026-09-12, Phase 3 of tools/vehicle-manager/docs/standalone-app-plan.md).
 * Not wired up to any page yet — Phase 4 does that, and at that point needs
 * to fix two majordom-financiar-specific assumptions baked into this file:
 * (1) `useChartRefetch`'s `refetchWith()` calls `authFetch(`/api${endpoint}`)`
 * — vehicle-manager's own routes have no `/api` prefix (they're `/vehicles/...`
 * directly), so either this file's `/api` literal needs to become a prop/const,
 * or every `refetch.endpoint` value vehicle-manager's own chart endpoints send
 * needs to already include a leading `/api` to match (simpler, but confusing
 * naming) — a real decision to make then, not guessed here. (2) `BarChart`'s
 * tap-tooltip navigates to `/transactions` on a month/year point, a route that
 * doesn't exist in this app — vehicle-manager's charts don't currently send
 * `month`/`year` on bar points, so this path is unreachable today, but if a
 * future vehicle bar chart adds them, this needs its own destination first.
 *
 * Backend tools return {"type": "chart", "chart_type": ..., "title": ..., "data": {...}}.
 * The tool (backend, deterministic code) decides which chart_type fits its data —
 * this component never guesses the type, it only renders what it's told.
 */
import { useRef, useState } from 'react'
import { authFetch } from '../lib/auth'
import { formatCurrency, formatPercent, formatNumber } from '../lib/formatCurrency'
import { colorForKey } from '../lib/chartColors'
import { useNavigate } from 'react-router-dom'

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
        className="px-3 py-2 text-sm leading-none text-ink-3 transition-colors hover:text-ink disabled:opacity-40"
        aria-label="Previous month"
      >
        ‹
      </button>
      <p className="flex-1 truncate text-center text-[13px] font-medium text-ink-2">{title}</p>
      <button
        type="button"
        disabled={loading}
        onClick={() => shift(1)}
        className="px-3 py-2 text-sm leading-none text-ink-3 transition-colors hover:text-ink disabled:opacity-40"
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  )
}

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
    ...topSegs.map((s) => ({ ...s, color: colorForKey(s.name) })),
    ...(rest.length > 0 ? [{ name: 'Other', value: otherValue, percentage: otherPct, color: 'var(--ink-3)' }] : []),
  ]

  return (
    <div className="rounded-lg border border-line bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-baseline justify-between">
        <div className="min-w-0 flex-1">
          {refetch?.mode === 'month_nav' ? (
            <MonthNavTitle title={liveTitle} refetch={refetch} loading={loading} onNav={refetchWith} />
          ) : (
            <p className="text-[13px] font-medium text-ink-2">{liveTitle}</p>
          )}
          <p className="mt-0.5 font-mono text-2xl font-semibold text-ink">{formatCurrency(liveData.total)}</p>
          <p className="mt-0.5 text-[12px] text-ink-3">{liveData.count} transactions</p>
        </div>
        <Donut segments={segments} />
      </div>

      {error && <p className="mb-2 text-xs text-loss">{error}</p>}

      {segments.length === 0 ? (
        <p className="py-2 text-center text-sm text-ink-3">No expenses this month</p>
      ) : (
        <div className="space-y-2.5">
          {segments.map((seg) => (
            <div key={seg.name}>
              <div className="mb-1 flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: seg.color }} />
                  <span className="truncate text-xs text-ink">{seg.name}</span>
                </div>
                <div className="ml-2 flex flex-shrink-0 items-center gap-2">
                  <span className="font-mono text-xs text-ink-3">{formatPercent(seg.percentage, { decimals: 0 })}</span>
                  <span className="w-16 text-right font-mono text-xs font-medium text-ink">{formatCurrency(seg.value)}</span>
                </div>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-surface-sunken">
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
  const size = 120
  const radius = 46
  const strokeWidth = 12
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
        /* A token-driven color, so it must go through `style` — `var()` does
           not resolve in an SVG presentation attribute. */
        style={{ stroke: seg.color }}
        strokeWidth={strokeWidth}
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
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        style={{ stroke: 'var(--surface-sunken)' }}
        strokeWidth={strokeWidth}
      />
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
      <p className="mb-4 text-[13px] font-medium text-ink-2">{liveTitle}</p>
    )

  if (liveData.items.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface p-5 shadow-sm">
        {chartTitle}
        {error && <p className="mb-2 text-xs text-loss">{error}</p>}
        <p className="py-4 text-center text-sm text-ink-3">{liveData.empty_message || 'No data available'}</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-5 shadow-sm">
      {chartTitle}
      {error && <p className="mb-2 text-xs text-loss">{error}</p>}
      <div className="space-y-4">
        {liveData.items.map((item) => {
          const barWidth = Math.min(item.percentage, 100)
          const color = item.color || colorForKey(item.label)
          const isWarning = color === '#FF2D2D'

          return (
            <div key={item.label}>
              <div className="mb-1 flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-1.5">
                  {isWarning && <span className="text-sm">⚠️</span>}
                  <span className="mr-2 truncate text-sm font-medium text-ink">{item.label}</span>
                </div>
                <span
                  className="text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{ color, backgroundColor: `${color}20` }}
                >
                  {formatPercent(item.percentage, { decimals: 0 })}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${barWidth}%`, backgroundColor: color }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="font-mono text-xs text-ink-3">
                  {formatCurrency(item.value)} / {formatCurrency(item.target)}
                </span>
              </div>
              {item.extra && <p className="mt-0.5 text-xs text-ink-3">{item.extra}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- Bar (grouped, e.g. spending vs income per month) ---

const MAX_BAR_HEIGHT = 140
const MIN_BAR_HEIGHT = 2
const GRID_FRACTIONS = [0, 0.25, 0.5, 0.75, 1]

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
  // Which point's tooltip is open — index into liveData.points, or null.
  const [activePoint, setActivePoint] = useState<number | null>(null)
  const navigate = useNavigate()

  const rangePicker = refetch?.mode === 'month_range' && (
    <MonthRangePicker key={`${refetch.start}_${refetch.end}`} refetch={refetch} loading={loading} onApply={refetchWith} />
  )

  if (liveData.points.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface p-5 shadow-sm">
        {rangePicker}
        <p className="py-4 text-center text-sm text-ink-3">{error || 'No data available'}</p>
      </div>
    )
  }

  const maxVal = Math.max(...liveData.points.flatMap((p) => p.values), 1)
  const scaleHeight = (value: number) => (value === 0 ? MIN_BAR_HEIGHT : Math.max((value / maxVal) * MAX_BAR_HEIGHT, MIN_BAR_HEIGHT))

  return (
    <div className="rounded-lg border border-line bg-surface p-5 shadow-sm">
      {liveTitle && <p className="mb-2 text-[13px] font-medium text-ink-2">{liveTitle}</p>}
      {rangePicker}
      {error && <p className="mb-2 text-xs text-loss">{error}</p>}

      <div className="mb-4 flex items-center gap-4 text-xs text-ink-3">
        {liveData.series.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      <div className="relative" style={{ height: MAX_BAR_HEIGHT }}>
        {/* Y-axis gridlines + value labels — labels sit flush with the outer
            edge; the bars/x-axis rows below reserve `pl-8` so nothing overlaps. */}
        {GRID_FRACTIONS.map((f) => (
          <div
            key={f}
            className="absolute left-0 right-0 border-t border-line"
            style={{ top: `${(1 - f) * 100}%` }}
          >
            <span className="absolute left-0 -translate-y-1/2 bg-surface pr-1 font-mono text-[10px] text-ink-3">
              {formatCurrency(maxVal * f, { decimals: 0 })}
            </span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end justify-around gap-3 pl-8">
          {liveData.points.map((p, pi) => {
            // Anchor the tooltip inward (not centered) on the first/last column
            // so its whitespace-nowrap content can't spill past the card edge.
            const isFirst = pi === 0
            const isLast = pi === liveData.points.length - 1
            const tooltipPos = isFirst ? 'left-0' : isLast ? 'right-0' : 'left-1/2 -translate-x-1/2'
            return (
              <button
                key={p.x}
                type="button"
                onClick={() => setActivePoint(activePoint === pi ? null : pi)}
                className="relative flex items-end gap-0.5 flex-1 justify-center h-full"
              >
                {p.values.map((v, i) => (
                  <div
                    key={i}
                    className="w-3 rounded-t-sm transition-all duration-300"
                    style={{ height: scaleHeight(v), backgroundColor: liveData.series[i]?.color || colorForKey(liveData.series[i]?.label ?? `series-${i}`) }}
                  />
                ))}
                {activePoint === pi && (
                  <div
                    className={`absolute bottom-full z-10 mb-1.5 whitespace-nowrap rounded border border-line bg-surface-2 px-2 py-1 font-mono text-[10px] text-ink shadow ${tooltipPos}`}
                  >
                    <p className="mb-0.5 text-ink-3">{p.x}</p>
                    {p.values.map((v, i) => (
                      <p key={i} style={{ color: liveData.series[i]?.color || colorForKey(liveData.series[i]?.label ?? `series-${i}`) }}>
                        {liveData.series[i]?.label ?? `#${i + 1}`}: {formatCurrency(v)}
                      </p>
                    ))}
                    {p.month != null && p.year != null && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          const year = p.year!
                          const month = p.month!
                          const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`
                          const lastDay = new Date(year, month, 0).getDate()
                          const dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
                          navigate('/transactions', { state: { dateFrom, dateTo } })
                        }}
                        className="mt-1 text-[10px] text-brand-ink hover:text-ink underline"
                      >
                        View transactions
                      </button>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-2 flex justify-around gap-3 pl-8">
        {liveData.points.map((p) => (
          <div key={p.x} className="flex-1 text-center">
            <span className="text-xs text-ink-3">{p.x}</span>
          </div>
        ))}
      </div>

      <div className="mt-1 flex justify-around gap-3 pl-8">
        {liveData.points.map((p) => (
          <div key={p.x} className="flex-1 text-center">
            <span className="font-mono text-[10px] text-ink-3">
              {formatCurrency(p.values[0] || 0, { decimals: 0 })}
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
    <div className="flex items-center gap-1 mb-3">
      {refetch.periods.map((p) => (
        <button
          key={p.value}
          type="button"
          disabled={loading}
          onClick={() => onSelect(p.value)}
          className={`rounded-full px-2 py-0.5 text-[10px] transition-colors disabled:opacity-50 ${
            p.value === refetch.current
              ? 'bg-brand text-on-brand'
              : 'bg-surface-sunken text-ink-2 hover:text-ink'
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
  const wrapperClass = bare ? 'p-4' : 'rounded-lg border border-line bg-surface p-5 shadow-sm'
  // Shared hover position, held as a 0-1 fraction across the plot width — one
  // crosshair + one tooltip for the whole chart, rather than a permanent dot
  // per point (see tools/investment-manager/frontend/src/components/LineChart.tsx).
  const [hover, setHover] = useState<number | null>(null)
  const [hoverWidth, setHoverWidth] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  function handleMove(clientX: number) {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return
    setHoverWidth(rect.width)
    setHover(Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1))
  }

  function handlePeriodSelect(value: number) {
    if (refetch?.mode === 'period_buttons') refetchWith({ [refetch.period_param]: value })
  }

  const allPoints = chartData.series.flatMap((s) => s.points)

  if (allPoints.length < 2) {
    return (
      <div className={wrapperClass}>
        <p className="mb-2 text-[13px] font-medium text-ink-2">{liveTitle}</p>
        {refetch?.mode === 'period_buttons' && (
          <PeriodSwitcher refetch={refetch} loading={loading} onSelect={handlePeriodSelect} />
        )}
        <p className="py-4 text-center text-sm text-ink-3">
          {error || chartData.empty_message || 'Not enough data yet'}
        </p>
      </div>
    )
  }

  const width = 300
  const height = 160
  const padX = 8
  const padY = 12

  const values = allPoints.map((p) => p.y)
  const minY = Math.min(...values)
  const maxY = Math.max(...values)
  const rangeY = maxY - minY || 1
  const yPad = rangeY * 0.15

  const scaleY = (y: number) => height - padY - ((y - minY + yPad) / (rangeY + yPad * 2)) * (height - padY * 2)

  // Intermediate Y gridlines between the min/max labels already shown per
  // series below — min/max (0 and 1) are skipped here, those two edges
  // already get their own label overlay.
  const GRID_FRACTIONS = [0.25, 0.5, 0.75]

  // Resolve the shared hover fraction to each series' own nearest point. Series
  // can have different point counts (e.g. the projection's 2-point salvage
  // floor beside its many-point estimated value), so this can't use one shared
  // index — each series resolves independently from its own point count.
  const hoverViewX = hover !== null ? hover * width : 0
  const hoverPlotFraction = Math.min(Math.max((hoverViewX - padX) / (width - padX * 2), 0), 1)

  function pointIndexAt(count: number): number {
    if (count <= 1) return 0
    return Math.round(hoverPlotFraction * (count - 1))
  }

  const hoverRows =
    hover === null
      ? []
      : chartData.series.map((s) => {
          const p = s.points[pointIndexAt(s.points.length)]
          const seriesMin = Math.min(...s.points.map((q) => q.y))
          const seriesMax = Math.max(...s.points.map((q) => q.y))
          return {
            label: s.label,
            color: s.color,
            value: p ? formatNumber(p.y, axisDecimals(seriesMin, seriesMax)) : '',
            date: p ? p.x : '',
          }
        })

  const hoverLabel = hoverRows.length > 0 && hoverRows[0].date ? formatDateFull(hoverRows[0].date) : ''

  return (
    <div className={wrapperClass}>
      <p className="mb-2 text-[13px] font-medium text-ink-2">{liveTitle}</p>
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
      {error && <p className="mb-2 text-xs text-loss">{error}</p>}

      <div ref={containerRef} className="relative">
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

        // A multi-year series (e.g. a 12-year vehicle-value projection) has
        // consecutive labeled points ~1 year apart that land on nearly the
        // same day-of-month — formatDateShort() alone renders them as e.g.
        // "29 Aug · 28 Aug · 27 Aug · 26 Aug", indistinguishable from
        // consecutive days. Fall back to the year-inclusive format whenever
        // the series spans more than a year; short spans keep the less
        // crowded no-year label formatDateShort() was designed for.
        const spanDays =
          (Date.parse(s.points[lastIdx].x) - Date.parse(s.points[0].x)) / 86_400_000
        const formatAxisLabel = spanDays > 365 ? formatDateFull : formatDateShort

        const seriesMin = Math.min(...s.points.map((p) => p.y))
        const seriesMax = Math.max(...s.points.map((p) => p.y))
        const dec = axisDecimals(seriesMin, seriesMax)

        return (
          <div key={s.label} className="mb-2">
            <div className="mb-1 flex items-center justify-between text-xs text-ink-2">
              <span>{s.label}</span>
              <span className="font-mono">
                min {formatNumber(seriesMin, dec)} · max {formatNumber(seriesMax, dec)}
              </span>
            </div>
            <p className="mb-1 font-mono text-[10px] text-ink-3">
              {formatDateFull(s.points[0].x)} – {formatDateFull(s.points[lastIdx].x)}
            </p>
            {/* Y-axis reference values — an HTML overlay, not SVG <text>, since
                the SVG below uses preserveAspectRatio="none" (stretches to the
                container width) and would visibly skew any text drawn inside it. */}
            <div className="relative">
              {GRID_FRACTIONS.map((f) => {
                const gridVal = minY + f * (maxY - minY)
                return (
                  <div
                    key={f}
                    className="absolute left-0 right-0 border-t border-line"
                    style={{ top: `${(scaleY(gridVal) / height) * 100}%` }}
                  />
                )
              })}
              <span
                className="absolute left-0.5 -translate-y-1/2 rounded bg-surface px-0.5 font-mono text-[11px] text-ink-3"
                style={{ top: `${(scaleY(seriesMax) / height) * 100}%` }}
              >
                {formatNumber(seriesMax, dec)}
              </span>
              <span
                className="absolute left-0.5 -translate-y-1/2 rounded bg-surface px-0.5 font-mono text-[11px] text-ink-3"
                style={{ top: `${(scaleY(seriesMin) / height) * 100}%` }}
              >
                {formatNumber(seriesMin, dec)}
              </span>
              <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
                <path d={path} fill="none" style={{ stroke: s.color }} strokeWidth={2} vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
            <div className="relative mt-1 h-4 font-mono text-[10px] text-ink-3">
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
                    {formatAxisLabel(s.points[i].x)}
                  </span>
                )
              })}
            </div>
          </div>
        )
      })}

      {hover !== null && (
        <>
          {/* One crosshair for the whole chart, aligned to the shared hovered x. */}
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-10 w-px"
            style={{ left: `${hover * 100}%`, backgroundColor: 'var(--line-strong)' }}
          />
          <div
            className="pointer-events-none absolute top-0 z-20 -translate-x-1/2 whitespace-nowrap rounded border border-line bg-surface-2 px-2.5 py-1.5 text-[11px] shadow"
            style={{ left: Math.min(Math.max(hover * hoverWidth, 72), hoverWidth - 72) }}
          >
            <p className="mb-1 text-ink-3">{hoverLabel}</p>
            {hoverRows.map((row) => (
              <p key={row.label} className="flex items-center justify-between gap-3 font-mono text-ink">
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                  {row.label}
                </span>
                <span>{row.value}</span>
              </p>
            ))}
          </div>
        </>
      )}

      {/* Transparent hover overlay — sits above the plots so the crosshair
          follows the pointer continuously, but below the refetch controls
          (which are outside this wrapper) so they stay tappable. */}
      <div
        className="absolute inset-0 z-30 cursor-crosshair"
        onMouseMove={(e) => handleMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => {
          const t = e.touches[0]
          if (t) handleMove(t.clientX)
        }}
        onTouchMove={(e) => {
          const t = e.touches[0]
          if (t) handleMove(t.clientX)
        }}
        onTouchEnd={() => setHover(null)}
      />
      </div>
    </div>
  )
}
