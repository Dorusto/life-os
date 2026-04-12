import type { MonthlyStats } from '../lib/api'

/**
 * Monthly spending summary — donut chart + category breakdown.
 *
 * Implemented with raw SVG (no chart library) to keep the bundle small.
 * A donut chart is just a circle with stroke-dasharray tricks:
 *   - circumference = 2 * π * radius
 *   - each segment's dash length = (percentage / 100) * circumference
 *   - segments are rotated using stroke-dashoffset
 */

// Colors for up to 8 category segments — ordered from most to least vibrant
const SEGMENT_COLORS = [
  '#6366F1', // indigo  — accent color
  '#22C55E', // green
  '#F59E0B', // amber
  '#EC4899', // pink
  '#14B8A6', // teal
  '#8B5CF6', // violet
  '#F97316', // orange
  '#06B6D4', // cyan
]

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface Props {
  stats: MonthlyStats
}

export default function SpendingChart({ stats }: Props) {
  const { month, year, total, count, categories } = stats

  // Show at most 7 categories + "Other" to keep the chart readable
  const topCats = categories.slice(0, 7)
  const rest = categories.slice(7)
  const otherTotal = rest.reduce((s, c) => s + c.total, 0)
  const otherPct = rest.reduce((s, c) => s + c.percentage, 0)

  const segments = [
    ...topCats.map((c, i) => ({
      name: c.name,
      total: c.total,
      percentage: c.percentage,
      color: SEGMENT_COLORS[i],
    })),
    ...(rest.length > 0
      ? [{ name: 'Other', total: otherTotal, percentage: otherPct, color: '#3F3F46' }]
      : []),
  ]

  return (
    <div className="bg-surface rounded-2xl p-4">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <p className="text-xs text-muted uppercase tracking-wide">
            {MONTH_NAMES[month - 1]} {year}
          </p>
          <p className="text-white text-2xl font-semibold mt-0.5">
            €{total.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-muted text-xs mt-0.5">{count} transactions</p>
        </div>
        <DonutChart segments={segments} />
      </div>

      {/* Category bars */}
      {segments.length === 0 ? (
        <p className="text-muted text-sm text-center py-2">No expenses this month</p>
      ) : (
        <div className="space-y-2.5">
          {segments.map((seg) => (
            <CategoryBar key={seg.name} {...seg} />
          ))}
        </div>
      )}
    </div>
  )
}

// --- Donut chart (SVG) ---

interface Segment {
  name: string
  total: number
  percentage: number
  color: string
}

function DonutChart({ segments }: { segments: Segment[] }) {
  const size = 72
  const radius = 28
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * radius
  const gap = 1.5  // gap between segments in px (visual separation)

  // Build segments from the percentages — each starts where the previous ended
  let offset = 0
  const paths = segments.map((seg) => {
    const length = Math.max(0, (seg.percentage / 100) * circumference - gap)
    const rotate = (offset / circumference) * 360 - 90  // -90 to start from top
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
      {/* Background track */}
      <circle
        cx={cx} cy={cy} r={radius}
        fill="none"
        stroke="#2A2A2A"
        strokeWidth={8}
      />
      {paths}
    </svg>
  )
}

// --- Category bar row ---

function CategoryBar({
  name,
  total,
  percentage,
  color,
}: {
  name: string
  total: number
  percentage: number
  color: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="text-white text-xs truncate">{name}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <span className="text-muted text-xs">{percentage.toFixed(0)}%</span>
          <span className="text-white text-xs font-medium w-16 text-right">
            €{total.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>
      {/* Progress bar */}
      <div className="h-1 bg-background rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}
