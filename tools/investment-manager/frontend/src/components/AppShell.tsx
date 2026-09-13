import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Briefcase,
  ArrowLeftRight,
  HandCoins,
  Scale,
  Target,
  Settings as SettingsIcon,
  LogOut,
} from 'lucide-react'
import { clearAuth, getUsername } from '../lib/auth'
import { cn } from '../lib/ui'
import { ThemeToggle } from './ThemeToggle'
import { MobileBottomNav } from './MobileBottomNav'
import { MoreSheet } from './MoreSheet'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/holdings', label: 'Holdings', icon: Briefcase, end: false },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight, end: false },
  { to: '/income', label: 'Income', icon: HandCoins, end: false },
  { to: '/rebalancing', label: 'Rebalancing', icon: Scale, end: false },
  { to: '/goals', label: 'Goals', icon: Target, end: false },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, end: false },
]

function BrandMark() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded bg-brand text-white">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        <rect x="2" y="10" width="3" height="6" rx="1" fill="currentColor" opacity="0.55" />
        <rect x="7.5" y="6" width="3" height="10" rx="1" fill="currentColor" opacity="0.8" />
        <rect x="13" y="2" width="3" height="14" rx="1" fill="currentColor" />
      </svg>
    </span>
  )
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-1 px-3">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
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
  )
}

function AccountFooter({ onLogout }: { onLogout: () => void }) {
  const username = getUsername()
  return (
    <div className="border-t border-line px-3 py-3">
      <ThemeToggle className="mb-1" />
      <div className="flex items-center justify-between gap-2 rounded px-2 py-1.5">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink">{username ?? 'Signed in'}</p>
          <p className="text-[11px] text-ink-3">Investment manager</p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          title="Sign out"
          className="rounded p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-loss"
        >
          <LogOut className="h-4 w-4" />
          <span className="sr-only">Sign out</span>
        </button>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const navigate = useNavigate()

  const logout = () => {
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden border-r border-line bg-surface lg:flex lg:flex-col">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <BrandMark />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-ink">Majordom</p>
            <p className="text-[11px] font-medium text-brand-ink">Invest</p>
          </div>
        </div>
        <NavItems />
        <AccountFooter onLogout={logout} />
      </aside>

      <main className="min-w-0 px-4 py-6 pb-20 sm:px-6 lg:px-[2.5rem] lg:py-9 lg:pb-9">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      <MobileBottomNav onMoreClick={() => setMoreOpen(true)} moreOpen={moreOpen} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  )
}
