import { type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Car, LogOut } from 'lucide-react'
import { clearAuth, getUsername } from '../lib/auth'
import { NAV_TABS } from '../lib/navTabs'
import { cn } from '../lib/ui'

function BrandMark() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded bg-brand text-white">
      <Car size={17} aria-hidden />
    </span>
  )
}

/**
 * Desktop-only left rail, matching investment-manager's `AppShell.tsx` shape
 * (248px, brand + nav + account footer). Mobile is intentionally untouched
 * here — every nav-bearing page already renders its own `BottomNav`, header,
 * and full-bleed `min-h-dvh` wrapper (see e.g. `pages/Dashboard.tsx`), and
 * rewriting all of them to route through this shell on mobile too is a
 * larger, separate follow-up (tools/design-unification-plan.md, Phase 1b's
 * own note) — not done in this pass to keep the change low-risk. Below
 * `lg:`, this component renders nothing but its `children` unchanged.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate()

  const logout = () => {
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <div className="lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden border-r border-line bg-surface lg:flex lg:flex-col">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <BrandMark />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-ink">Majordom</p>
            <p className="text-[11px] font-medium text-brand-ink">Transport</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV_TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-brand-soft text-brand-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                )
              }
            >
              <Icon className="h-[17px] w-[17px]" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line px-3 py-3">
          <div className="flex items-center justify-between gap-2 rounded px-2 py-1.5">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-ink">{getUsername() ?? 'Signed in'}</p>
              <p className="text-[11px] text-ink-3">Vehicle manager</p>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Sign out"
              className="rounded p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-loss"
            >
              <LogOut className="h-4 w-4" />
              <span className="sr-only">Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Desktop content column, mirroring investment-manager's centered max-width main.
          Below `lg:`, this contributes no grid/layout of its own -- `children` render exactly
          as they do today (each page owns its full mobile layout, unchanged). */}
      <div className="lg:min-w-0 lg:overflow-y-auto">{children}</div>
    </div>
  )
}
