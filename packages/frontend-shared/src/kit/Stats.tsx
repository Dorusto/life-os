import type { ReactNode } from 'react'
import { cx } from '../shell/cx'

export type Tone = 'gain' | 'loss' | 'warn' | 'muted' | 'default'

const TONE: Record<Tone, string> = {
  gain: 'text-gain',
  loss: 'text-loss',
  warn: 'text-warn',
  muted: 'text-ink-3',
  default: 'text-ink',
}

/** Tone for a signed number: positive → gain, negative → loss, zero/none → muted. */
export function toneOf(value: number | null | undefined): Tone {
  if (value === null || value === undefined || value === 0 || Number.isNaN(value)) return 'muted'
  return value > 0 ? 'gain' : 'loss'
}

export function toneClass(tone: Tone = 'default'): string {
  return TONE[tone]
}

/**
 * The headline figure of a page: mono, large, the fraction dimmed
 * ("€21,066.24" → "€21,066" + ".24" in ink-3). Pass the already-formatted string.
 */
export function HeroValue({ label, value, sub, className }: {
  label?: string
  value: string
  /** Line under the figure, e.g. the change vs. the previous period. */
  sub?: ReactNode
  className?: string
}) {
  const match = value.match(/^(.*?)([.,]\d{1,2})(\D*)$/)
  return (
    <div className={cx('min-w-0', className)}>
      {label && <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">{label}</p>}
      <p className="mt-1 font-mono text-[34px] font-medium leading-none tracking-tight text-ink tabular-nums lg:text-[44px]">
        {match ? (
          <>
            {match[1]}
            <span className="text-ink-3">{match[2]}</span>
            {match[3]}
          </>
        ) : value}
      </p>
      {sub && <div className="mt-2 font-mono text-[13px] tabular-nums">{sub}</div>}
    </div>
  )
}

export interface Stat {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: Tone
}

/** One bordered card split into equal cells: 2 per row on phones, all in one row from lg. */
export function StatStrip({ stats, className }: { stats: Stat[]; className?: string }) {
  if (!stats.length) return null
  const lgCols = stats.length >= 4 ? 'lg:grid-cols-4' : stats.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'
  return (
    <div className={cx('grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-surface', lgCols, className)}>
      {stats.map((stat, i) => (
        <div
          key={stat.label}
          className={cx(
            'flex min-w-0 flex-col gap-1.5 px-5 py-4',
            i % 2 === 1 && 'border-l border-line',
            i >= 2 && 'border-t border-line lg:border-t-0',
            i >= 2 && 'lg:border-l',
          )}
        >
          <span className="truncate font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">{stat.label}</span>
          <span className={cx('truncate font-mono text-xl tabular-nums', toneClass(stat.tone))}>{stat.value}</span>
          {stat.hint && <span className="truncate font-mono text-xs text-ink-3">{stat.hint}</span>}
        </div>
      ))}
    </div>
  )
}

/**
 * A two-line list row used for transactions, holdings, fill-ups, accounts:
 * title + value on the first line, secondary text + meta on the second.
 */
export function ListRow({ title, subtitle, value, meta, tone = 'default', leading, onClick, className }: {
  title: ReactNode
  subtitle?: ReactNode
  value?: ReactNode
  meta?: ReactNode
  tone?: Tone
  /** Icon, dot or avatar before the text. */
  leading?: ReactNode
  onClick?: () => void
  className?: string
}) {
  const content = (
    <>
      {leading && <span className="shrink-0">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm text-ink">{title}</span>
          {value !== undefined && (
            <span className={cx('shrink-0 font-mono text-[13px] tabular-nums', toneClass(tone))}>{value}</span>
          )}
        </span>
        {(subtitle || meta) && (
          <span className="mt-0.5 flex items-baseline justify-between gap-3 text-xs text-ink-3">
            <span className="truncate">{subtitle}</span>
            {meta && <span className="shrink-0 font-mono tabular-nums">{meta}</span>}
          </span>
        )}
      </span>
    </>
  )
  const base = cx('flex w-full items-center gap-3 py-2.5 text-left', className)
  return onClick ? (
    <button type="button" onClick={onClick} className={cx(base, 'rounded-lg transition-colors hover:bg-surface-2')}>
      {content}
    </button>
  ) : (
    <div className={base}>{content}</div>
  )
}

/** Thin progress bar in the accent color (or a tone). */
export function ProgressBar({ value, tone, className }: { value: number; tone?: Tone; className?: string }) {
  const pct = Math.max(0, Math.min(100, value * 100))
  const fill = tone === 'loss' ? 'bg-loss' : tone === 'warn' ? 'bg-warn' : tone === 'gain' ? 'bg-gain' : 'bg-accent'
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken', className)}>
      <div className={cx('h-full rounded-full', fill)} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm text-ink-2">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
