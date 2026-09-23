import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, type LucideIcon } from 'lucide-react'
import { cx } from './cx'

export interface PageTab {
  value: string
  label: string
  icon?: LucideIcon
}

interface PageHeaderProps {
  title: string
  /** Small mono uppercase line above the title, e.g. the date or the parent section. */
  eyebrow?: string
  description?: string
  /** Back arrow before the title, for detail pages. */
  back?: { to: string } | { onClick: () => void }
  /** Segmented sub-views of the page (Overview / Budget / ...). Controlled. */
  tabs?: PageTab[]
  tab?: string
  onTabChange?: (value: string) => void
  /** Page-level actions, primary last (e.g. filters, then Add). */
  actions?: ReactNode
  className?: string
}

const backClass =
  'mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-2 transition-colors hover:text-ink'

/**
 * The one page header every screen in every app uses: title block on the left, segmented
 * sub-views and actions on the right. Global controls (notifications, settings, chat, logout)
 * are NOT here — they belong to AppShell. On mobile the right edge leaves room for the shell's
 * floating notification bell.
 */
export function PageHeader({
  title, eyebrow, description, back, tabs, tab, onTabChange, actions, className,
}: PageHeaderProps) {
  return (
    <header className={cx('mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4 pr-12 lg:pr-0', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {back && ('to' in back ? (
          <Link to={back.to} aria-label="Back" className={backClass}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </Link>
        ) : (
          <button type="button" onClick={back.onClick} aria-label="Back" className={backClass}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </button>
        ))}
        <div className="min-w-0">
          {eyebrow && (
            <p className="truncate font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">{eyebrow}</p>
          )}
          <h1 className="truncate text-2xl font-semibold tracking-tight text-ink lg:text-[28px]">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-ink-2">{description}</p>}
        </div>
      </div>

      {(tabs || actions) && (
        <div className="flex flex-wrap items-center gap-2">
          {tabs && (
            <div role="tablist" className="flex gap-0.5 rounded-full border border-line bg-surface p-[3px]">
              {tabs.map(({ value, label, icon: Icon }) => {
                const active = value === tab
                return (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => onTabChange?.(value)}
                    className={cx(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-xs transition-colors',
                      active ? 'bg-surface-2 text-ink' : 'text-ink-3 hover:text-ink',
                    )}
                  >
                    {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
                    {label}
                  </button>
                )
              })}
            </div>
          )}
          {actions}
        </div>
      )}
    </header>
  )
}
