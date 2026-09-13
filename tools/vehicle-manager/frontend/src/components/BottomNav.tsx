import { NavLink } from 'react-router-dom'
import { NAV_TABS } from '../lib/navTabs'

/**
 * Fixed bottom tab bar, mirroring Fuelio's Home / Timeline / Costs / More
 * layout in this app's own terms. Screens that render it reserve bottom
 * padding (`pb-20`) so content never sits under it.
 */
export default function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-[20] border-t border-line bg-surface lg:hidden">
      <div className="flex items-stretch">
        {NAV_TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] transition-colors ${
                isActive ? 'text-brand-ink' : 'text-ink-3 hover:text-ink'
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
