// GENERATED FILE — do not edit directly. Source: packages/frontend-shared/src/kit/Card.tsx.
// Run python3 scripts/sync_shared_frontend.py after editing the source, then commit both.

import type { ReactNode } from 'react'
import { cx } from '../shell/cx'

interface CardProps {
  children: ReactNode
  className?: string
  /** Mono uppercase label in the card's header row ("LATEST TRANSACTIONS"). */
  label?: string
  /** Right side of the header row: a link, a small segmented control, an icon button. */
  action?: ReactNode
  /** Inner padding; turn off for edge-to-edge lists and tables. */
  padded?: boolean
}

/**
 * The one content card for every app: surface fill, hairline border, a quiet mono label.
 * No shadow — on the graphite palette depth comes from the border.
 */
export function Card({ children, className, label, action, padded = true }: CardProps) {
  return (
    <section className={cx('min-w-0 rounded-xl border border-line bg-surface', className)}>
      {(label || action) && (
        <header className={cx('flex items-center justify-between gap-3', padded ? 'px-5 pt-4' : 'border-b border-line px-5 py-3.5')}>
          {label && <SectionLabel>{label}</SectionLabel>}
          {action}
        </header>
      )}
      <div className={cx(padded && 'p-5', padded && Boolean(label || action) && 'pt-3')}>{children}</div>
    </section>
  )
}

/** Small mono uppercase label — card titles, stat labels, section headings. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cx('font-mono text-[11px] font-normal uppercase tracking-[0.12em] text-ink-3', className)}>
      {children}
    </h2>
  )
}
