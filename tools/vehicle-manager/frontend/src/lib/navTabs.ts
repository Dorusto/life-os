import { BarChart3, Car, History, Home, type LucideIcon } from 'lucide-react'

export interface NavTab {
  to: string
  label: string
  /** Active only on an exact path match (used for the `/` home tab). */
  end: boolean
  icon: LucideIcon
}

/**
 * The app's primary tabs, shared by the desktop rail (`AppShell`) and the mobile
 * tab bar (`BottomNav`) so the two navigations cannot drift apart.
 */
export const NAV_TABS: NavTab[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/timeline', label: 'Timeline', icon: History, end: false },
  { to: '/stats', label: 'Stats', icon: BarChart3, end: false },
  { to: '/vehicles', label: 'Vehicles', icon: Car, end: false },
]
