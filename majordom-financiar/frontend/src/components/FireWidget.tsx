/**
 * FIRE 2035 Progress Widget
 *
 * Displays current FIRE portfolio status — percentage achieved, progress bar,
 * portfolio vs target amounts, and on-track/behind-schedule status.
 * Visually matches MetricCard dimensions and card style for the Home grid.
 */
import type { FireData } from '../lib/api'

function fmtK(n: number): string {
  if (n >= 1000) return `€${(n / 1000).toFixed(1)}k`
  return `€${n.toFixed(0)}`
}

export default function FireWidget({ data }: { data: FireData | null }) {
  if (!data) {
    return (
      <div
        className="bg-surface border border-border rounded-2xl px-4 py-4 overflow-hidden"
        style={{ borderTopColor: '#3B82F6', borderTopWidth: '3px' }}
      >
        <p className="font-display text-2xl font-bold text-white tabular-nums">—</p>
        <p className="text-white text-sm font-medium mt-1">FIRE 2035</p>
        <p className="text-muted text-xs">portfolio</p>
      </div>
    )
  }

  const years = Math.floor(data.months_remaining / 12)
  const topColor = data.on_track ? '#22C55E' : '#F59E0B'
  const statusText = data.on_track ? 'on track ✓' : 'behind schedule ⚠'
  const pctTrend = Math.round((data.fire_pct - data.fire_pct_prev) * 10) / 10

  return (
    <div
      className="bg-surface border border-border rounded-2xl px-4 py-4 overflow-hidden"
      style={{ borderTopColor: topColor, borderTopWidth: '3px' }}
    >
      {/* Percentage + label */}
      <div className="flex items-baseline justify-between">
        <p className="font-display text-2xl font-bold tabular-nums text-white">
          {data.fire_pct.toFixed(0)}%
        </p>
        <p className="text-white text-sm font-medium">FIRE 2035</p>
      </div>

      {/* Progress bar */}
      <div className="relative w-full h-px bg-border/40 rounded-full overflow-hidden mt-3 mb-2">
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(data.fire_pct, 100)}%`,
            backgroundColor: topColor,
          }}
        />
      </div>

      {/* Portfolio / target */}
      <p className="text-muted text-xs">
        {fmtK(data.fire_portfolio)} / {fmtK(data.fire_target)}
      </p>

      {/* Years remaining + status */}
      <p className="text-muted text-xs mt-0.5">
        ~{years} years · {statusText}
      </p>

      {/* Trend vs previous month (#77) */}
      <p className={`text-xs mt-1 ${pctTrend > 0 ? 'text-emerald-400' : pctTrend < 0 ? 'text-red-400' : 'text-muted'}`}>
        {pctTrend > 0 ? '↑' : pctTrend < 0 ? '↓' : '→'} {Math.abs(pctTrend).toFixed(1)}% vs last month
      </p>
    </div>
  )
}
