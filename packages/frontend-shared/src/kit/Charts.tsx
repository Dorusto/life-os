import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cx } from '../shell/cx'
import { EmptyState } from './Stats'

/*
 * Dependency-free SVG charts shared by every app (Invest's originals were the reference).
 * One interaction model everywhere: hover (mouse) or drag (touch) shows a crosshair and a
 * readout; nothing animates on its own. Colors default to the app accent (var(--accent)).
 */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}

function Readout({ x, width, children }: { x: number; width: number; children: ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow"
      style={{ left: Math.min(Math.max(x, 70), Math.max(width - 70, 70)) }}
    >
      {children}
    </div>
  )
}

// ----------------------------------------------------------------------------- area / line

export interface LineSeries {
  name: string
  values: Array<number | null>
  color?: string
  dashed?: boolean
  area?: boolean
}

const VIEW_W = 1000
const PAD_Y = 10

export function AreaChart({
  labels,
  series,
  height = 220,
  formatValue = (v) => v.toFixed(2),
  formatLabel = (l) => l,
  baseline,
  showRange = true,
  emptyMessage = 'No data for this period yet.',
  onSelect,
}: {
  labels: string[]
  series: LineSeries[]
  height?: number
  formatValue?: (value: number) => string
  formatLabel?: (label: string) => string
  /** Reference level drawn as a dashed rule (cost basis, target). */
  baseline?: number | null
  /** First/last label and min–max under the plot. */
  showRange?: boolean
  emptyMessage?: string
  /** Called with the index under the pointer on click/tap — for drill-down. */
  onSelect?: (index: number) => void
}) {
  const gradientId = useId()
  const { ref, width } = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const n = labels.length

  const { min, max } = useMemo(() => {
    let lo = Infinity
    let hi = -Infinity
    for (const s of series) for (const v of s.values) {
      if (v === null || !Number.isFinite(v)) continue
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
    if (baseline !== null && baseline !== undefined) {
      lo = Math.min(lo, baseline)
      hi = Math.max(hi, baseline)
    }
    if (!Number.isFinite(lo)) return { min: 0, max: 1 }
    const pad = lo === hi ? Math.abs(lo) * 0.1 || 1 : (hi - lo) * 0.08
    return { min: lo - pad, max: hi + pad }
  }, [series, baseline])

  const plotH = height - PAD_Y * 2
  const xAt = (i: number) => (n <= 1 ? VIEW_W / 2 : (i / (n - 1)) * VIEW_W)
  const yAt = (v: number) => PAD_Y + (1 - (v - min) / (max - min)) * plotH

  const paths = useMemo(() => series.map(s => {
    let line = ''
    let started = false
    s.values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) { started = false; return }
      line += `${started ? 'L' : 'M'}${xAt(i).toFixed(2)},${yAt(v).toFixed(2)} `
      started = true
    })
    const bottom = (PAD_Y + plotH).toFixed(2)
    return { line: line.trim(), area: `${line} L${xAt(n - 1).toFixed(2)},${bottom} L${xAt(0).toFixed(2)},${bottom} Z` }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [series, min, max, n, height])

  const hasData = series.some(s => s.values.some(v => v !== null && Number.isFinite(v)))
  if (!hasData) return <EmptyState title={emptyMessage} />

  const indexAt = (clientX: number) => {
    const el = ref.current
    if (!el || n <= 1) return null
    const rect = el.getBoundingClientRect()
    return Math.round(Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) * (n - 1))
  }

  return (
    <div>
      <div ref={ref} className="relative touch-pan-y" style={{ height }}>
        <svg viewBox={`0 0 ${VIEW_W} ${height}`} preserveAspectRatio="none" className="h-full w-full overflow-visible" role="img" aria-label={series.map(s => s.name).join(', ')}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={i} id={`${gradientId}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color ?? 'var(--accent)'} stopOpacity="0.2" />
                <stop offset="100%" stopColor={s.color ?? 'var(--accent)'} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {[0.25, 0.5, 0.75].map(f => (
            <line key={f} x1={0} x2={VIEW_W} y1={PAD_Y + plotH * f} y2={PAD_Y + plotH * f} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {baseline !== null && baseline !== undefined && (
            <line x1={0} x2={VIEW_W} y1={yAt(baseline)} y2={yAt(baseline)} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          )}
          {series.map((s, i) => (
            <g key={i}>
              {(s.area ?? i === 0) && <path d={paths[i].area} fill={`url(#${gradientId}-${i})`} />}
              <path d={paths[i].line} fill="none" stroke={s.color ?? 'var(--accent)'} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '5 4' : undefined} vectorEffect="non-scaling-stroke" />
            </g>
          ))}
          {hover !== null && (
            <line x1={xAt(hover)} x2={xAt(hover)} y1={PAD_Y} y2={PAD_Y + plotH} stroke="var(--line-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {width > 0 && hover !== null && (
          <Readout x={(xAt(hover) / VIEW_W) * width} width={width}>
            <p className="text-ink-3">{formatLabel(labels[hover])}</p>
            {series.map(s => {
              const v = s.values[hover]
              return (
                <p key={s.name} className="flex items-center justify-between gap-3 font-mono tabular-nums text-ink">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color ?? 'var(--accent)' }} />
                    {s.name}
                  </span>
                  {v === null || v === undefined ? '—' : formatValue(v)}
                </p>
              )
            })}
          </Readout>
        )}
        {width > 0 && (
          <div
            className={cx('absolute inset-0', onSelect ? 'cursor-pointer' : 'cursor-crosshair')}
            onMouseMove={e => setHover(indexAt(e.clientX))}
            onMouseLeave={() => setHover(null)}
            onTouchStart={e => setHover(indexAt(e.touches[0].clientX))}
            onTouchMove={e => setHover(indexAt(e.touches[0].clientX))}
            onTouchEnd={() => setHover(null)}
            onClick={e => { const i = indexAt(e.clientX); if (i !== null) onSelect?.(i) }}
          />
        )}
      </div>
      {showRange && (
        <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-ink-3">
          <span>{n > 0 ? formatLabel(labels[0]) : ''}</span>
          <span className="tabular-nums">{formatValue(min)} – {formatValue(max)}</span>
          <span>{n > 0 ? formatLabel(labels[n - 1]) : ''}</span>
        </div>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------- bars

export interface BarDatum {
  label: string
  value: number
  /** Override color for this bar (e.g. a negative month in loss red). */
  color?: string
}

/** Vertical bars (monthly spend, cash flow). Negative values hang below a zero line. */
export function BarChart({
  data,
  height = 180,
  formatValue = (v) => v.toFixed(0),
  formatLabel = (l) => l,
  color = 'var(--accent)',
  emptyMessage = 'No data for this period yet.',
  onSelect,
}: {
  data: BarDatum[]
  height?: number
  formatValue?: (value: number) => string
  formatLabel?: (label: string) => string
  color?: string
  emptyMessage?: string
  onSelect?: (index: number) => void
}) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  if (!data.length || data.every(d => !d.value)) return <EmptyState title={emptyMessage} />

  const maxV = Math.max(0, ...data.map(d => d.value))
  const minV = Math.min(0, ...data.map(d => d.value))
  const span = maxV - minV || 1
  const zeroY = (maxV / span) * height
  const slot = 100 / data.length
  const barW = Math.min(slot * 0.62, 8)

  return (
    <div>
      <div ref={ref} className="relative" style={{ height }}>
        <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="Bar chart">
          <line x1={0} x2={100} y1={zeroY} y2={zeroY} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {data.map((d, i) => {
            const h = (Math.abs(d.value) / span) * height
            const y = d.value >= 0 ? zeroY - h : zeroY
            return (
              <rect
                key={i}
                x={i * slot + (slot - barW) / 2}
                y={y}
                width={barW}
                height={Math.max(h, 0.5)}
                rx={0.8}
                fill={d.color ?? color}
                opacity={hover === null || hover === i ? 0.9 : 0.45}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelect?.(i)}
                className={onSelect ? 'cursor-pointer' : undefined}
              />
            )
          })}
        </svg>
        {width > 0 && hover !== null && (
          <Readout x={((hover + 0.5) * slot / 100) * width} width={width}>
            <p className="text-ink-3">{formatLabel(data[hover].label)}</p>
            <p className="font-mono tabular-nums text-ink">{formatValue(data[hover].value)}</p>
          </Readout>
        )}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[11px] text-ink-3">
        <span>{formatLabel(data[0].label)}</span>
        {data.length > 2 && <span>{formatLabel(data[Math.floor(data.length / 2)].label)}</span>}
        <span>{formatLabel(data[data.length - 1].label)}</span>
      </div>
    </div>
  )
}

export interface BarGroup {
  label: string
  /** One value per series, same order as `series`. */
  values: number[]
}

/** Side-by-side bars per label for 2–3 series (income vs. spending per month). */
export function GroupedBarChart({
  series,
  data,
  height = 180,
  formatValue = (v) => v.toFixed(0),
  formatLabel = (l) => l,
  emptyMessage = 'No data for this period yet.',
  onSelect,
}: {
  series: { label: string; color: string }[]
  data: BarGroup[]
  height?: number
  formatValue?: (value: number) => string
  formatLabel?: (label: string) => string
  emptyMessage?: string
  onSelect?: (index: number) => void
}) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const all = data.flatMap(d => d.values)
  if (!data.length || all.every(v => !v)) return <EmptyState title={emptyMessage} />

  const maxV = Math.max(0, ...all)
  const minV = Math.min(0, ...all)
  const span = maxV - minV || 1
  const zeroY = (maxV / span) * height
  const slot = 100 / data.length
  const groupW = Math.min(slot * 0.7, 10 * series.length)
  const barW = groupW / series.length

  return (
    <div>
      <div ref={ref} className="relative" style={{ height }}>
        <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-full w-full" role="img" aria-label={series.map(s => s.label).join(' vs ')}>
          <line x1={0} x2={100} y1={zeroY} y2={zeroY} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {data.map((d, i) => (
            <g
              key={i}
              opacity={hover === null || hover === i ? 0.9 : 0.45}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect?.(i)}
              className={onSelect ? 'cursor-pointer' : undefined}
            >
              <rect x={i * slot} y={0} width={slot} height={height} fill="transparent" />
              {d.values.map((v, s) => {
                const h = (Math.abs(v) / span) * height
                return (
                  <rect key={s} x={i * slot + (slot - groupW) / 2 + s * barW} y={v >= 0 ? zeroY - h : zeroY} width={barW * 0.85} height={Math.max(h, 0.5)} rx={0.6} fill={series[s]?.color ?? 'var(--accent)'} />
                )
              })}
            </g>
          ))}
        </svg>
        {width > 0 && hover !== null && (
          <Readout x={((hover + 0.5) * slot / 100) * width} width={width}>
            <p className="text-ink-3">{formatLabel(data[hover].label)}</p>
            {series.map((s, k) => (
              <p key={s.label} className="flex items-center justify-between gap-3 font-mono tabular-nums text-ink">
                <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}</span>
                {formatValue(data[hover].values[k] ?? 0)}
              </p>
            ))}
          </Readout>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-ink-3">
        <span>{formatLabel(data[0].label)}</span>
        <span className="flex gap-3">
          {series.map(s => (
            <span key={s.label} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}</span>
          ))}
        </span>
        <span>{formatLabel(data[data.length - 1].label)}</span>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------- composition

export interface Slice {
  label: string
  value: number
  color: string
}

/**
 * Composition as one stacked bar plus a legend list ("where it went"). Preferred over a donut
 * for more than ~5 parts; the legend carries the numbers.
 */
export function StackedBar({ slices, formatValue, onSelect }: {
  slices: Slice[]
  formatValue: (value: number) => string
  onSelect?: (slice: Slice) => void
}) {
  const [active, setActive] = useState<number | null>(null)
  const total = slices.reduce((sum, s) => sum + Math.max(s.value, 0), 0)
  if (!slices.length || total <= 0) return <EmptyState title="Nothing to show yet." />
  return (
    <div>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
        {slices.map((s, i) => (
          <div
            key={s.label}
            className="h-full transition-opacity"
            style={{ width: `${(Math.max(s.value, 0) / total) * 100}%`, background: s.color, opacity: active === null || active === i ? 1 : 0.35 }}
          />
        ))}
      </div>
      <ul className="mt-4 space-y-1">
        {slices.map((s, i) => {
          const row = (
            <>
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="truncate text-sm text-ink">{s.label}</span>
              </span>
              <span className="shrink-0 font-mono text-[13px] tabular-nums text-ink">
                <span className="mr-3 text-ink-3">{((Math.max(s.value, 0) / total) * 100).toFixed(1)}%</span>
                {formatValue(s.value)}
              </span>
            </>
          )
          const cls = 'flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-left'
          return (
            <li key={s.label} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
              {onSelect ? (
                <button type="button" onClick={() => onSelect(s)} className={cx(cls, 'hover:bg-surface-2')}>{row}</button>
              ) : (
                <div className={cls}>{row}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Allocation donut with a legend; for up to ~6 parts. */
export function DonutChart({ slices, centerLabel, centerValue, size = 180, thickness = 22 }: {
  slices: Slice[]
  centerLabel: string
  centerValue: string
  size?: number
  thickness?: number
}) {
  const [active, setActive] = useState<number | null>(null)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const total = slices.reduce((sum, s) => sum + Math.max(s.value, 0), 0)
  if (!slices.length || total <= 0) return <EmptyState title="Nothing to show yet." />

  let offset = 0
  const segments = slices.map((slice, index) => {
    const dash = (Math.max(slice.value, 0) / total) * circumference
    const seg = { slice, index, dash, offset }
    offset += dash
    return seg
  })

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={centerLabel}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-sunken)" strokeWidth={thickness} />
          {segments.map(({ slice, index, dash, offset: o }) => (
            <circle
              key={slice.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth={active === index ? thickness + 4 : thickness}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-o}
              className="transition-[stroke-width] duration-150"
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">{centerLabel}</span>
          <span className="mt-1 font-mono text-[15px] font-medium tabular-nums text-ink">{centerValue}</span>
        </div>
      </div>
      <ul className="min-w-[10rem] flex-1 space-y-2">
        {segments.map(({ slice, index }) => (
          <li key={slice.label} className="flex items-center justify-between gap-3 text-sm" onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)}>
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: slice.color }} />
              <span className="truncate text-ink-2">{slice.label}</span>
            </span>
            <span className="shrink-0 font-mono tabular-nums text-ink">{((Math.max(slice.value, 0) / total) * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Horizontal proportion bars (table-like counterpart to the donut). */
export function BarList({ items, formatValue }: { items: Slice[]; formatValue: (value: number) => string }) {
  if (!items.length) return <EmptyState title="Nothing to show yet." />
  const max = Math.max(...items.map(i => i.value), 1)
  const total = items.reduce((sum, i) => sum + Math.max(i.value, 0), 0) || 1
  return (
    <ul className="space-y-3.5">
      {items.map(item => (
        <li key={item.label}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="truncate text-sm text-ink-2">{item.label}</span>
            <span className="shrink-0 font-mono text-[13px] tabular-nums text-ink">
              {formatValue(item.value)}
              <span className="ml-2 text-ink-3">{((Math.max(item.value, 0) / total) * 100).toFixed(1)}%</span>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div className="h-full rounded-full" style={{ width: `${Math.max((item.value / max) * 100, 1)}%`, background: item.color }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Categorical palette for slices/series: accent first, then the token set. */
export const SERIES_COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)']
