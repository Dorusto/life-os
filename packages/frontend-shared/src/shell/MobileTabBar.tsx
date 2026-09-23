import { NavLink } from 'react-router-dom'
import { LayoutGrid, MessageCircle } from 'lucide-react'
import type { ShellNavItem, ShellChat } from './AppShell'
import { cx } from './cx'

const tabClass = (active: boolean) =>
  cx(
    'flex h-[52px] w-[52px] items-center justify-center rounded-full transition-colors',
    active ? 'bg-surface text-ink' : 'text-ink-3 hover:text-ink',
  )

/**
 * Floating 5-button bar for phones: two destinations, the Majordom chat in the middle (the app's
 * differentiator, so it gets the brand pill), one more destination, and More. Hidden at lg:, where
 * the rail takes over.
 */
export function MobileTabBar({ nav, chat, moreOpen, onMore }: {
  nav: ShellNavItem[]
  chat: ShellChat
  moreOpen: boolean
  onMore: () => void
}) {
  const tab = (item: ShellNavItem | undefined) =>
    item ? (
      <NavLink key={item.to} to={item.to} end={item.end} aria-label={item.label} className={({ isActive }) => tabClass(isActive)}>
        <item.icon size={20} aria-hidden />
      </NavLink>
    ) : (
      <span className="h-[52px] w-[52px]" aria-hidden />
    )

  const chatClass = 'flex h-[52px] w-[52px] items-center justify-center rounded-full bg-brand text-on-brand'

  return (
    <nav
      aria-label="Main"
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-4 z-40 flex h-16 items-center justify-between rounded-full border border-line-strong bg-surface-2 px-1.5 backdrop-blur lg:hidden"
    >
      {tab(nav[0])}
      {tab(nav[1])}
      {'to' in chat ? (
        <NavLink to={chat.to} aria-label="Majordom chat" className={chatClass}>
          <MessageCircle size={20} aria-hidden />
        </NavLink>
      ) : (
        <a href={chat.href} target="_blank" rel="noopener noreferrer" aria-label="Majordom chat" className={chatClass}>
          <MessageCircle size={20} aria-hidden />
        </a>
      )}
      {tab(nav[2])}
      <button type="button" onClick={onMore} aria-label="More" aria-haspopup="dialog" aria-expanded={moreOpen} className={tabClass(moreOpen)}>
        <LayoutGrid size={20} aria-hidden />
      </button>
    </nav>
  )
}
