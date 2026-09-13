import { Link } from 'react-router-dom'
import { Settings as SettingsIcon } from 'lucide-react'
import { cn } from '../lib/ui'
import { NotificationBell } from './NotificationBell'

/**
 * Shared class for an icon-only control in the top-right group. Kept in one
 * place so the bell / Majordom controls added by later specs match exactly.
 */
export const iconControlClass = cn(
  'inline-flex h-8 w-8 items-center justify-center rounded text-ink-3 transition-colors',
  'hover:bg-surface-2 hover:text-ink',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
)

/**
 * Shell-level controls pinned to the top-right of the content area, rendered
 * once by AppShell — never per page. Later specs append siblings to the same
 * group instead of adding controls to AppShell itself.
 */
export function TopBarActions() {
  return (
    <div className="flex items-center gap-2">
      <Link to="/settings" className={iconControlClass} aria-label="Settings" title="Settings">
        <SettingsIcon className="h-[18px] w-[18px]" aria-hidden />
      </Link>
      <NotificationBell buttonClassName={iconControlClass} />
    </div>
  )
}
