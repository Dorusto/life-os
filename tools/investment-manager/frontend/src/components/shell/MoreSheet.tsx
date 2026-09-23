// GENERATED FILE — do not edit directly. Source: packages/frontend-shared/src/shell/MoreSheet.tsx.
// Run python3 scripts/sync_shared_frontend.py after editing the source, then commit both.

import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronRight, LogOut, Settings, X } from 'lucide-react'
import type { ShellNavItem } from './AppShell'

const rowClass =
  'flex min-h-[52px] items-center gap-4 border-b border-line px-1 font-mono text-[15px] text-ink last:border-0'

/**
 * Mobile "More" sheet: the destinations that don't fit the 5-button bar, plus notifications,
 * settings and sign-out. Portalled to document.body — a fixed overlay inside an ancestor with
 * backdrop-filter would otherwise resolve against that ancestor (architecture rule 44).
 */
export function MoreSheet({ open, onClose, items, notifications, settingsTo, onLogout }: {
  open: boolean
  onClose: () => void
  items: ShellNavItem[]
  notifications: ReactNode
  settingsTo: string
  onLogout?: () => void
}) {
  const location = useLocation()

  useEffect(() => {
    onClose()
    // Close whenever the route changes; onClose identity is irrelevant here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="More">
      <button type="button" aria-label="Close menu" className="absolute inset-0 bg-overlay" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 rounded-t-[20px] border-t border-line bg-surface px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" aria-hidden />
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-mono text-lg font-medium text-ink">More</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-ink-2"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <nav className="flex flex-col">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={rowClass}>
              <Icon size={20} className="text-ink-2" aria-hidden />
              <span className="flex-1">{label}</span>
              <ChevronRight size={16} className="text-ink-3" aria-hidden />
            </NavLink>
          ))}
          <div className={rowClass}>
            <span className="flex-1 text-ink-2">Notifications</span>
            {notifications}
          </div>
          <NavLink to={settingsTo} className={rowClass}>
            <Settings size={20} className="text-ink-2" aria-hidden />
            <span className="flex-1">Settings</span>
            <ChevronRight size={16} className="text-ink-3" aria-hidden />
          </NavLink>
          {onLogout && (
            <button type="button" onClick={onLogout} className={`${rowClass} text-left text-loss`}>
              <LogOut size={20} aria-hidden />
              <span className="flex-1">Log out</span>
            </button>
          )}
        </nav>
      </div>
    </div>,
    document.body,
  )
}
