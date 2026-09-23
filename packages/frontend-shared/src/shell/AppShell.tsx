import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Check, ChevronsUpDown, Eye, EyeOff, LogOut, MessageCircle, PanelLeft, Settings, type LucideIcon } from 'lucide-react'
// Generated layout: this file lands in src/components/shell/, privacy.ts in src/lib/.
import { setAmountsHidden, useAmountsHidden } from '../../lib/privacy'
import { BrandMark } from '../BrandMark'
import { APP_LINKS, type AppId } from './appLinks'
import { cx } from './cx'
import { MobileTabBar } from './MobileTabBar'
import { MoreSheet } from './MoreSheet'

export interface ShellNavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

/**
 * In-app route (`to`) when the chat lives in this app, cross-origin link (`href`) otherwise.
 * The cross-origin link opens in the same tab on purpose: chat is a place you go, not a popup.
 */
export type ShellChat = { to: string } | { href: string }

interface AppShellProps {
  app: AppId
  nav: ShellNavItem[]
  chat: ShellChat
  settingsTo: string
  /** The app's own notification control (bell + popup); rendered in the rail and on mobile. */
  notifications: ReactNode
  username?: string | null
  onLogout?: () => void
  /** Extra controls at the bottom of the rail, e.g. a theme toggle. */
  railFooter?: ReactNode
  children: ReactNode
}

const COLLAPSED_KEY = 'majordom_rail_collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

const itemClass = (active: boolean, collapsed: boolean) =>
  cx(
    'flex items-center gap-3 rounded-lg py-2 font-mono text-[13px] transition-colors',
    collapsed ? 'justify-center px-0' : 'px-3',
    active ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  )

function AppSwitcher({ app, collapsed }: { app: AppId; collapsed: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch app"
        className={cx(
          'flex w-full items-center rounded-[10px] border border-line bg-surface text-left',
          collapsed ? 'justify-center p-2' : 'justify-between gap-2 px-3 py-2.5',
        )}
      >
        <span className="flex items-center gap-2.5">
          <BrandMark size={28} />
          {!collapsed && (
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-ink">Majordom</span>
              <span className="font-mono text-[11px] text-accent">{APP_LINKS[app].label}</span>
            </span>
          )}
        </span>
        {!collapsed && <ChevronsUpDown size={14} className="text-ink-3" aria-hidden />}
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-50 mt-1.5 w-52 rounded-[10px] border border-line bg-surface p-1 shadow-lg">
          {(Object.keys(APP_LINKS) as AppId[]).map((id) => (
            <a
              key={id}
              role="menuitem"
              href={APP_LINKS[id].url}
              aria-current={id === app ? 'page' : undefined}
              className="flex items-center justify-between rounded-lg px-3 py-2 font-mono text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              <span className="flex items-center gap-2.5">
                <span className={cx('h-2 w-2 rounded-full', id === app ? 'bg-accent' : 'bg-line-strong')} aria-hidden />
                {APP_LINKS[id].label}
              </span>
              {id === app && <Check size={14} className="text-ink" aria-hidden />}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function PrivacyToggle({ className }: { className?: string }) {
  const hidden = useAmountsHidden()
  const Icon = hidden ? EyeOff : Eye
  return (
    <button
      type="button"
      onClick={() => setAmountsHidden(!hidden)}
      title={hidden ? 'Show amounts' : 'Hide amounts'}
      aria-label={hidden ? 'Show amounts' : 'Hide amounts'}
      aria-pressed={hidden}
      className={cx('rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink', className)}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  )
}

/**
 * The shell every Majordom app renders around its routes: a collapsible left rail on desktop
 * (lg+) and a floating 5-button bar + More sheet on phones. Pages wrap their own content in
 * <Page>. Generated into each app from packages/frontend-shared — never edit the copies.
 */
export function AppShell({
  app, nav, chat, settingsTo, notifications, username, onLogout, railFooter, children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  // Flipping privacy mode remounts the page so every formatted amount re-renders at once.
  const amountsHidden = useAmountsHidden()
  const [moreOpen, setMoreOpen] = useState(false)

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        // Persisting is best-effort; the in-memory state still applies.
      }
      return next
    })
  }

  const chatItem = (
    <>
      <MessageCircle className="h-[17px] w-[17px] shrink-0" aria-hidden />
      {!collapsed && 'Majordom'}
    </>
  )

  return (
    <div className="h-dvh lg:grid lg:grid-cols-[auto_1fr]">
      <aside
        className={cx(
          'hidden h-dvh flex-col gap-4 overflow-y-auto border-r border-line bg-paper px-3 py-5 lg:flex',
          collapsed ? 'w-16' : 'w-56',
        )}
      >
        <AppSwitcher app={app} collapsed={collapsed} />
        <nav className="flex flex-col gap-0.5" aria-label="Main">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={collapsed ? label : undefined}
              className={({ isActive }) => itemClass(isActive, collapsed)}
            >
              <Icon className="h-[17px] w-[17px] shrink-0" aria-hidden />
              {!collapsed && label}
            </NavLink>
          ))}
          {'to' in chat ? (
            <NavLink to={chat.to} title="Majordom chat" className={({ isActive }) => itemClass(isActive, collapsed)}>
              {chatItem}
            </NavLink>
          ) : (
            <a href={chat.href} title="Majordom chat" className={itemClass(false, collapsed)}>
              {chatItem}
            </a>
          )}
        </nav>
        <div className="flex-1" />
        <div className="flex flex-col gap-0.5 border-t border-line pt-3">
          <div className={cx('flex items-center', collapsed ? 'justify-center' : 'px-1')}>{notifications}</div>
          <NavLink to={settingsTo} title={collapsed ? 'Settings' : undefined} className={({ isActive }) => itemClass(isActive, collapsed)}>
            <Settings className="h-[17px] w-[17px] shrink-0" aria-hidden />
            {!collapsed && 'Settings'}
          </NavLink>
          {!collapsed && railFooter}
          <div className={cx('flex items-center gap-1 py-1.5', collapsed ? 'flex-col' : 'justify-between px-3')}>
            {!collapsed && (
              <span className="min-w-0 truncate font-mono text-xs text-ink-3">{username ?? 'Signed in'}</span>
            )}
            <span className={cx('flex items-center gap-1', collapsed && 'flex-col')}>
              <PrivacyToggle />
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  title="Sign out"
                  aria-label="Sign out"
                  className="rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-loss"
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                </button>
              )}
              <button
                type="button"
                onClick={toggleCollapsed}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-pressed={collapsed}
                className="rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <PanelLeft className="h-4 w-4" aria-hidden />
              </button>
            </span>
          </div>
        </div>
      </aside>

      <main className="relative h-dvh min-w-0 overflow-y-auto pb-28 lg:pb-0">
        <div className="absolute right-4 top-3 z-30 flex items-center gap-1 lg:hidden">
          <PrivacyToggle />
          {notifications}
        </div>
        <div key={amountsHidden ? 'hidden' : 'shown'} className="contents">{children}</div>
      </main>

      <MobileTabBar nav={nav} chat={chat} moreOpen={moreOpen} onMore={() => setMoreOpen(true)} />
      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        items={nav.slice(3)}
        notifications={notifications}
        settingsTo={settingsTo}
        onLogout={onLogout}
      />
    </div>
  )
}
