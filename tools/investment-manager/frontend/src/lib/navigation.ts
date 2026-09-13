import {
  ArrowLeftRight,
  Briefcase,
  HandCoins,
  LayoutDashboard,
  Scale,
  Settings as SettingsIcon,
  Target,
  type LucideIcon,
} from 'lucide-react'

/** Which navigation surface lists a destination. */
export type NavSurface = 'rail' | 'tabs' | 'more'

export interface Destination {
  to: string
  label: string
  icon: LucideIcon
  /** `true` for `/` so it isn't active on every route. */
  end: boolean
  /** Surfaces that render this destination; every surface filters this list. */
  surfaces: readonly NavSurface[]
}

/**
 * Single source of truth for app destinations. The desktop rail, the mobile
 * tab bar and the More sheet all derive from this list, so adding, moving or
 * relabelling a destination is a one-line change here.
 */
const DESTINATIONS: readonly Destination[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, surfaces: ['rail', 'tabs'] },
  { to: '/holdings', label: 'Holdings', icon: Briefcase, end: false, surfaces: ['rail', 'tabs'] },
  {
    to: '/transactions',
    label: 'Transactions',
    icon: ArrowLeftRight,
    end: false,
    surfaces: ['rail', 'tabs'],
  },
  { to: '/income', label: 'Income', icon: HandCoins, end: false, surfaces: ['rail', 'more'] },
  { to: '/rebalancing', label: 'Rebalancing', icon: Scale, end: false, surfaces: ['rail', 'more'] },
  { to: '/goals', label: 'Goals', icon: Target, end: false, surfaces: ['rail', 'tabs'] },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, end: false, surfaces: ['rail', 'tabs'] },
]

/** Destinations for one surface, in the shared list's order. */
export function destinationsFor(surface: NavSurface): Destination[] {
  return DESTINATIONS.filter((destination) => destination.surfaces.includes(surface))
}
