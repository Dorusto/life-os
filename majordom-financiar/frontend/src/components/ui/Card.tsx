import type { ReactNode } from 'react'
import { cn } from '../../lib/ui'

type CardVariant = 'default' | 'list-item' | 'bubble'

interface CardProps {
  children: ReactNode
  className?: string
  /** Optional section heading rendered in the card's own header band. */
  title?: ReactNode
  action?: ReactNode
  padded?: boolean
  /**
   * Shell shape:
   * - 'default': padded panel with an optional header band (the original shell).
   * - 'list-item': compact shadowless row for clickable lists and stacked detail
   *   cards. Its padding sits on the shell so call-site hover styles cover the
   *   whole row, not just the inset content.
   * - 'bubble': chat/action bubble in a transcript — asymmetric tail radius and
   *   a narrower-than-column max width. Used by every Inbox action card.
   */
  variant?: CardVariant
}

const VARIANT_SHELL: Record<CardVariant, string> = {
  default: 'rounded-lg shadow-sm',
  'list-item': 'rounded-2xl overflow-hidden px-4 py-4',
  bubble: 'rounded-2xl rounded-bl-sm px-4 py-3 max-w-[85%]',
}

const VARIANT_BODY: Record<CardVariant, string> = {
  default: '',
  'list-item': '',
  // The bubble shell's only child is this wrapper, so its vertical rhythm has to
  // live here rather than on the shell itself (space-y targets direct children).
  bubble: 'space-y-3',
}

export function Card({
  children, className, title, action, padded = true, variant = 'default',
}: CardProps) {
  // The list-item and bubble shells carry their own padding, so only the default
  // shell insets the children.
  const bodyPadded = variant === 'default' && padded

  return (
    <section className={cn('border border-token-line bg-token-surface', VARIANT_SHELL[variant], className)}>
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
      <div className={cn(bodyPadded && 'p-5', VARIANT_BODY[variant])}>{children}</div>
    </section>
  )
}
