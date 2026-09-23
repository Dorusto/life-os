import { ArrowLeftRight, Briefcase, HandCoins, LayoutDashboard, Scale, Target } from 'lucide-react'
import type { ShellNavItem } from '../components/shell/AppShell'

/**
 * Single source of truth for this app's destinations, in display order. The shared shell
 * derives every surface from it: the desktop rail lists all of them; the phone bar shows the
 * first three (around the chat button) and the More sheet the rest. Settings is not listed —
 * the shell renders it on its own.
 */
export const NAV: ShellNavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/holdings', label: 'Holdings', icon: Briefcase },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/income', label: 'Income', icon: HandCoins },
  { to: '/rebalancing', label: 'Rebalancing', icon: Scale },
]
