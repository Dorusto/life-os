// GENERATED FILE — do not edit directly. Source: packages/frontend-shared/src/shell/Page.tsx.
// Run python3 scripts/sync_shared_frontend.py after editing the source, then commit both.

import type { ReactNode } from 'react'
import { cx } from './cx'

/**
 * Content container for one page inside AppShell. `wide` (dashboards, lists, analytics) fills the
 * window up to 1600px so ultra-wide screens don't stretch rows; `narrow` (settings, forms) caps at
 * 1040px because long form rows are harder to scan.
 */
export function Page({ width = 'wide', children, className }: {
  width?: 'wide' | 'narrow'
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cx(
        'mx-auto w-full px-4 py-6 lg:px-10 lg:py-8',
        width === 'wide' ? 'max-w-[1600px]' : 'max-w-[1040px]',
        className,
      )}
    >
      {children}
    </div>
  )
}
