import type { ReactNode } from 'react'

type CardVariant = 'hero' | 'list-item' | 'accordion'

interface CardProps {
  variant?: CardVariant
  /** Accent stripe color (3px) — omit for no accent. */
  accentColor?: string
  /** Which edge the accent stripe sits on. Financial Goals cards use 'left' (mockup spec); pre-existing metric-style cards default to 'top'. */
  accentSide?: 'top' | 'left'
  className?: string
  children: ReactNode
}

const VARIANT_PADDING: Record<CardVariant, string> = {
  hero: 'px-5 py-5',
  'list-item': 'px-4 py-4',
  // accordion: no padding — inner sections (header row, expandable body) manage their own
  accordion: '',
}

/** Shared card shell used across Financial Goals, Budget, and metric cards. */
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
