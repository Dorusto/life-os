import { NavLink } from 'react-router-dom'
import { LayoutGrid, Layers, Table2, MessageCircle, BarChart3 } from 'lucide-react'

/**
 * Bottom navigation bar — 5 persistent tabs (decisions.md#planned-folded-into-analytics).
 * Hidden on /login and /receipt (full-screen flows).
 * CSV import and Photo capture are reached via the + Add button in headers.
 *
 * Uses NavLink so the active tab is highlighted automatically.
 * `pb-safe` ensures the bar clears the iOS home indicator on notched phones.
 */

const tabs = [
  { to: '/', icon: LayoutGrid, label: 'Dashboard' },
  { to: '/accounts', icon: Layers, label: 'Accounts' },
  { to: '/transactions', icon: Table2, label: 'Transactions' },
  { to: '/chat', icon: MessageCircle, label: 'Majordom' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
]

export default function BottomNav() {
  return (
    <nav className="
      fixed bottom-0 left-0 right-0 z-50
      md:max-w-[480px] md:mx-auto md:left-0 md:right-0
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
            text-[10px] font-medium transition-colors
            ${isActive ? 'text-accent' : 'text-muted hover:text-white'}
          `}
        >
          {({ isActive }) => (
            <>
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.75} />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
