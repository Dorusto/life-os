import type { ReactNode } from 'react'
import { cn } from '../lib/ui'

interface MetricTileProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  className?: string
  /** Emphasise the figure (used for the headline vehicle value). */
  emphasis?: boolean
}

export function MetricTile({ label, value, hint, className, emphasis = false }: MetricTileProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[13px] text-ink-2">{label}</p>
      <p
        className={cn(
          'mt-1 font-mono tnum text-ink',
          emphasis ? 'text-2xl font-semibold' : 'text-lg font-medium',
        )}
      >
        {value}
      </p>
      {hint && <div className="mt-1 text-[12px] text-ink-3">{hint}</div>}
    </div>
  )
}
