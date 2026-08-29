import { NavLink } from 'react-router-dom'
import { LayoutGrid, Layers, Table2, MessageCircle, BarChart3, CalendarClock } from 'lucide-react'

/**
 * Bottom navigation bar — 6 persistent tabs (decisions.md#planned-tab-added,
 * superseding the earlier 2026-08-28 #nav-five-tabs entry which deliberately
 * left Planned out in favor of Majordom taking that slot). Doru asked for a
 * persistent Planned tab after reviewing the MoneyMatter reference again —
 * a button-launched page (the #184 pattern) didn't feel right for something
 * meant to be a primary destination, not a secondary drill-down.
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
  { to: '/planned', icon: CalendarClock, label: 'Planned' },
  { to: '/chat', icon: MessageCircle, label: 'Majordom' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
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
