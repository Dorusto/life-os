import { NavLink } from 'react-router-dom'
import { Home, Upload, MessageCircle } from 'lucide-react'

/**
 * Bottom navigation bar — visible on all main pages (Home, Import, Chat).
 * Hidden on /login and /receipt (full-screen flows).
 *
 * Uses NavLink so the active tab is highlighted automatically.
 * `pb-safe` ensures the bar clears the iOS home indicator on notched phones.
 */

const tabs = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/import', icon: Upload, label: 'Import' },
  { to: '/chat', icon: MessageCircle, label: 'Chat' },
]

export default function BottomNav() {
  return (
    <nav className="
      fixed bottom-0 left-0 right-0 z-50
      bg-surface border-t border-border
      flex items-stretch
      pb-safe
    ">
      {tabs.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) => `
            flex-1 flex flex-col items-center justify-center gap-1 py-3
            text-xs font-medium transition-colors
            ${isActive ? 'text-accent' : 'text-muted hover:text-white'}
          `}
        >
          {({ isActive }) => (
            <>
              <Icon size={22} strokeWidth={isActive ? 2.5 : 1.75} />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
