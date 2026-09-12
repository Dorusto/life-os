import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { EmptyState } from './EmptyState'

export interface LineSeries {
  name: string
  values: number[]
  color?: string
  dashed?: boolean
  area?: boolean
}

interface LineChartProps {
  labels: string[]
  series: LineSeries[]
  height?: number
  formatValue?: (value: number) => string
  formatLabel?: (label: string) => string
  /** Optional reference level drawn as a dashed rule (e.g. cost basis). */
  baseline?: number | null
  emptyMessage?: string
}

const VIEW_W = 1000
const PAD_TOP = 10
const PAD_BOTTOM = 10

/**
 * Minimal dependency-free SVG line/area chart. Deliberately static except for
 * a hover readout — one deliberate interactive moment rather than ambient
 * animation. Values must all be the same length as ``labels``.
 */
export function LineChart({
  labels,
  series,
  height = 260,
  formatValue = (v) => v.toFixed(2),
  formatLabel = (l) => l,
  baseline,
  emptyMessage = 'No data for this period yet.',
}: LineChartProps) {
  const gradientId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const { min, max } = useMemo(() => {
    let lo = Infinity
    let hi = -Infinity
    for (const s of series) {
      for (const v of s.values) {
        if (v === null || Number.isNaN(v)) continue
        lo = Math.min(lo, v)
        hi = Math.max(hi, v)
      }
    }
    if (baseline !== null && baseline !== undefined) {
      lo = Math.min(lo, baseline)
      hi = Math.max(hi, baseline)
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { min: 0, max: 1 }
    if (lo === hi) {
      const pad = Math.abs(lo) * 0.1 || 1
      return { min: lo - pad, max: hi + pad }
    }
    const pad = (hi - lo) * 0.08
    return { min: lo - pad, max: hi + pad }
  }, [series, baseline])

  const plotH = height - PAD_TOP - PAD_BOTTOM
  const n = labels.length

  const xAt = (i: number) => (n <= 1 ? VIEW_W / 2 : (i / (n - 1)) * VIEW_W)
  const yAt = (v: number) => PAD_TOP + (1 - (v - min) / (max - min)) * plotH

  const hasData = series.some((s) => s.values.some((v) => v !== null && Number.isFinite(v)))

  const paths = useMemo(
    () =>
      series.map((s) => {
        let line = ''
        let started = false
        s.values.forEach((v, i) => {
          if (v === null || !Number.isFinite(v)) {
            started = false
            return
          }
          line += `${started ? 'L' : 'M'}${xAt(i).toFixed(2)},${yAt(v).toFixed(2)} `
          started = true
        })
        const area = `${line} L${xAt(n - 1).toFixed(2)},${(PAD_TOP + plotH).toFixed(2)} L${xAt(0).toFixed(2)},${(
          PAD_TOP + plotH
        ).toFixed(2)} Z`
        return { line: line.trim(), area }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, min, max, n, height],
  )

  if (!hasData) {
    return <EmptyState title={emptyMessage} />
  }

  const onMove = (clientX: number) => {
    const el = containerRef.current
    if (!el || n <= 1) return
    const rect = el.getBoundingClientRect()
    const fraction = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
    setHover(Math.round(fraction * (n - 1)))
  }

  const hoverX = hover !== null ? (xAt(hover) / VIEW_W) * width : 0

  return (
    <div>
      <div ref={containerRef} className="relative" style={{ height }}>
        <svg
          viewBox={`0 0 ${VIEW_W} ${height}`}
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
          role="img"
          aria-label="Portfolio value over time"
        >
          <defs>
            {series.map((s, i) => (
              <linearGradient key={i} id={`${gradientId}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color ?? 'var(--c1)'} stopOpacity="0.18" />
                <stop offset="100%" stopColor={s.color ?? 'var(--c1)'} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={0}
              x2={VIEW_W}
              y1={PAD_TOP + plotH * f}
              y2={PAD_TOP + plotH * f}
              stroke="var(--line)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {baseline !== null && baseline !== undefined && (
            <line
              x1={0}
              x2={VIEW_W}
              y1={yAt(baseline)}
              y2={yAt(baseline)}
              stroke="var(--ink-3)"
              strokeWidth={1}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {series.map((s, i) => (
            <g key={i}>
              {s.area && (
                <path d={paths[i].area} fill={`url(#${gradientId}-${i})`} stroke="none" />
              )}
              <path
                d={paths[i].line}
                fill="none"
                stroke={s.color ?? 'var(--c1)'}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={s.dashed ? '5 4' : undefined}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}

          {hover !== null && (
            <line
              x1={xAt(hover)}
              x2={xAt(hover)}
              y1={PAD_TOP}
              y2={PAD_TOP + plotH}
              stroke="var(--line-strong)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {width > 0 && hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded border border-line bg-surface px-2.5 py-1.5 text-[12px] shadow"
            style={{ left: Math.min(Math.max(hoverX, 60), width - 60) }}
          >
            <p className="text-ink-3">{formatLabel(labels[hover])}</p>
            {series.map((s) => (
              <p key={s.name} className="flex items-center justify-between gap-3 font-mono tnum text-ink">
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: s.color ?? 'var(--c1)' }}
                  />
                  {s.name}
                </span>
                {formatValue(s.values[hover])}
              </p>
            ))}
          </div>
        )}

        {/* Interactive overlay: only shown after width is measured. */}
        {width > 0 && (
          <div
            className="absolute inset-0 cursor-crosshair"
            onMouseMove={(e) => onMove(e.clientX)}
            onMouseLeave={() => setHover(null)}
          />
        )}
      </div>

      <div className="mt-2 flex items-center justify-between text-[12px] text-ink-3">
        <span>{n > 0 ? formatLabel(labels[0]) : ''}</span>
        <div className="flex items-center gap-4">
          <span className="font-mono tnum">{formatValue(min)}</span>
          <span className="text-line-strong">to</span>
          <span className="font-mono tnum">{formatValue(max)}</span>
        </div>
        <span>{n > 0 ? formatLabel(labels[n - 1]) : ''}</span>
      </div>
    </div>
  )
}
