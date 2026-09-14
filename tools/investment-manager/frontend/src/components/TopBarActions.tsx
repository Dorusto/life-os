import { Link } from 'react-router-dom'
import { MessageSquare, Settings as SettingsIcon } from 'lucide-react'
import { cn } from '../lib/ui'
import { MAJORDOM_CHAT_URL } from '../lib/links'
import { NotificationBell } from './NotificationBell'

/**
 * Shared class for an icon-only control in the top-right group. Kept in one
 * place so the gear / bell / Majordom controls match exactly.
 */
export const iconControlClass = cn(
  'inline-flex h-8 w-8 items-center justify-center rounded text-ink-3 transition-colors',
  'hover:bg-surface-2 hover:text-ink',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
)

/**
 * Shell-level controls pinned to the top-right of the content area, rendered
 * once by AppShell — never per page. New controls are appended here rather than
 * to AppShell itself.
 */
export function TopBarActions() {
  return (
    <div className="flex items-center gap-2">
      <Link to="/settings" className={iconControlClass} aria-label="Settings" title="Settings">
        <SettingsIcon className="h-[18px] w-[18px]" aria-hidden />
      </Link>
      <NotificationBell buttonClassName={iconControlClass} />
      {/* Cross-app: the Finance chat is a different origin, so a real anchor. */}
      <a
        href={MAJORDOM_CHAT_URL}
        target="_blank"
        rel="noreferrer"
        className={iconControlClass}
        aria-label="Open Majordom chat"
        title="Majordom chat"
      >
        <MessageSquare className="h-[18px] w-[18px]" aria-hidden />
      </a>
    </div>
  )
}
