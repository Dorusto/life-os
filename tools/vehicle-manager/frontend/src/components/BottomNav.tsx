import { NavLink } from 'react-router-dom'
import { Home, History, BarChart3, Car } from 'lucide-react'

const TABS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/timeline', label: 'Timeline', icon: History, end: false },
  { to: '/stats', label: 'Stats', icon: BarChart3, end: false },
  { to: '/vehicles', label: 'Vehicles', icon: Car, end: false },
]

/**
 * Fixed bottom tab bar, mirroring Fuelio's Home / Timeline / Costs / More
 * layout in this app's own terms. Screens that render it reserve bottom
 * padding (`pb-20`) so content never sits under it.
 */
export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-[20] bg-surface border-t border-border">
      <div className="flex items-stretch">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] transition-colors ${
                isActive ? 'text-accent' : 'text-muted hover:text-white'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
