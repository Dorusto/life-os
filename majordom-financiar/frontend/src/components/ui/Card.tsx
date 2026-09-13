import type { ReactNode } from 'react'
import { cn } from '../../lib/ui'

interface CardProps {
  children: ReactNode
  className?: string
  /** Optional section heading rendered in the card's own header band. */
  title?: ReactNode
  action?: ReactNode
  padded?: boolean
}

export function Card({ children, className, title, action, padded = true }: CardProps) {
  return (
    <section className={cn('rounded-lg border border-token-line bg-token-surface shadow-sm', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-token-line px-5 py-3.5">
          {typeof title === 'string' ? (
            <h2 className="text-[15px] font-semibold text-token-ink">{title}</h2>
          ) : (
            title
          )}
          {action}
        </header>
      )}
      <div className={cn(padded && 'p-5')}>{children}</div>
    </section>
  )
}
