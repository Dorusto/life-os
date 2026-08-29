import type { ReactNode } from 'react'

type CardVariant = 'hero' | 'list-item'

interface CardProps {
  variant?: CardVariant
  /** Accent stripe color (3px) — omit for no accent. */
  accentColor?: string
  /** Which edge the accent stripe sits on. Metric-style cards default to 'top'. */
  accentSide?: 'top' | 'left'
  className?: string
  children: ReactNode
}

const VARIANT_PADDING: Record<CardVariant, string> = {
  hero: 'px-5 py-5',
  'list-item': 'px-4 py-4',
}

/** Shared card shell used for list/detail cards (e.g. DuplicatesReviewPage). */
export default function Card({ variant = 'list-item', accentColor, accentSide = 'top', className = '', children }: CardProps) {
  const accentStyle = !accentColor ? undefined
    : accentSide === 'left'
      ? { borderLeftColor: accentColor, borderLeftWidth: '3px' }
      : { borderTopColor: accentColor, borderTopWidth: '3px' }

  return (
    <div
      className={`bg-surface border border-border rounded-2xl overflow-hidden ${VARIANT_PADDING[variant]} ${className}`}
      style={accentStyle}
    >
      {children}
    </div>
  )
}
