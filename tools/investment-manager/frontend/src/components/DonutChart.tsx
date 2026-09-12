import { useState } from 'react'

export interface DonutSlice {
  label: string
  value: number
  percentage: number
  color: string
}

interface DonutChartProps {
  slices: DonutSlice[]
  centerLabel: string
  centerValue: string
  size?: number
  thickness?: number
}

/**
 * Allocation donut. Segments are drawn as stroke dashes on a single circle —
 * no charting dependency. Hovering a segment (or its legend row) raises it.
 */
export function DonutChart({
  slices,
  centerLabel,
  centerValue,
  size = 190,
  thickness = 24,
}: DonutChartProps) {
  const [active, setActive] = useState<number | null>(null)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const total = slices.reduce((sum, s) => sum + s.value, 0)

  if (!slices.length || total <= 0) {
    return (
      <div
        className="flex items-center justify-center rounded-full border border-line text-[12px] text-ink-3"
        style={{ width: size, height: size }}
      >
        No allocation yet
      </div>
    )
  }

  let offset = 0
  const segments = slices.map((slice, index) => {
    const fraction = slice.value / total
    const dash = fraction * circumference
    const segment = { slice, index, dash, offset }
    offset += dash
    return segment
  })

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--surface-sunken)"
            strokeWidth={thickness}
          />
          {segments.map(({ slice, index, dash, offset: segOffset }) => (
            <circle
              key={slice.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth={active === index ? thickness + 4 : thickness}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-segOffset}
              strokeLinecap="butt"
              className="transition-[stroke-width] duration-150"
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[12px] text-ink-3">{centerLabel}</span>
          <span className="mt-0.5 font-mono tnum text-[15px] font-semibold text-ink">{centerValue}</span>
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-2">
        {segments.map(({ slice, index }) => (
          <li
            key={slice.label}
            className="flex items-center justify-between gap-3 text-sm"
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive(null)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: slice.color }} />
              <span className="truncate text-ink-2">{slice.label}</span>
            </span>
            <span className="shrink-0 font-mono tnum text-ink">{slice.percentage.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
