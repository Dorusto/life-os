import { type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutGrid, Layers, Table2, MessageCircle, BarChart3 } from 'lucide-react'
import { cn } from '../lib/ui'
import { BrandMark } from './BrandMark'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/accounts', label: 'Accounts', icon: Layers, end: false },
  { to: '/transactions', label: 'Transactions', icon: Table2, end: false },
  { to: '/chat', label: 'Majordom', icon: MessageCircle, end: false },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, end: false },
]


/**
 * Desktop-only left rail (`lg:` and up), matching investment-manager's and
 * vehicle-manager's `AppShell.tsx` shape. Replaces the old phone-frame
 * treatment (`md:max-w-[480px] md:mx-auto md:border-x`) that used to squeeze
 * this app into a narrow centered column at every desktop width instead of
 * using real screen space -- see tools/design-unification-plan.md Phase 1c.
 *
 * Mobile (`<lg`) is unaffected: `BottomNav` (rendered by App.tsx, same as
 * today) keeps being the only nav, and this component contributes nothing
 * to layout below `lg:` -- same low-risk pattern used for vehicle-manager's
 * own rail.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden border-r border-token-line bg-token-surface lg:flex lg:flex-col">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <BrandMark size={32} />
          <p className="text-sm font-semibold text-token-ink">Majordom</p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-token-brand-soft text-token-brand-ink'
                    : 'text-token-ink-2 hover:bg-token-surface-2 hover:text-token-ink',
                )
              }
            >
              <Icon className="h-[17px] w-[17px]" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="lg:min-w-0">{children}</div>
    </div>
  )
}
