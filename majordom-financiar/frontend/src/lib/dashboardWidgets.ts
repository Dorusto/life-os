export type WidgetId = 'goals' | 'budget' | 'trend' | 'latest' | 'expenses' | 'vehicle' | 'networth'

export interface WidgetMeta {
  id: WidgetId
  name: string
  desc: string
  defaultEnabled: boolean
  /** Width in the dashboard's 12-column grid (lg and up); every widget is full width on mobile. */
  size: WidgetSize
}

export type WidgetSize = 'sm' | 'md' | 'lg' | 'full'

/** lg:col-span-* per size — full class strings so Tailwind's scanner sees them. */
export const WIDGET_SPAN: Record<WidgetSize, string> = {
  sm: 'lg:col-span-4',
  md: 'lg:col-span-6',
  lg: 'lg:col-span-8',
  full: 'lg:col-span-12',
}

/**
 * Dashboard widget registry (#192). The mockup's own widget list only covers
 * trend/latest/cashflow/expenses/vehicle — Financial Goals and Budget aren't
 * in the mockup at all, but they're existing, real, actively-used features
 * from the old Home screen, so they're kept as widgets too (confirmed with
 * the user rather than silently dropped or silently kept — see session notes).
 */
export const WIDGETS: WidgetMeta[] = [
  { id: 'trend', name: 'Balance trend', desc: 'Total / on-budget / portfolio / vehicles', defaultEnabled: true, size: 'full' },
  { id: 'goals', name: 'Financial Goals', desc: 'Portfolio Independence and your savings goals', defaultEnabled: true, size: 'lg' },
  { id: 'latest', name: 'Latest Transactions', desc: 'Recent activity across all accounts', defaultEnabled: true, size: 'sm' },
  { id: 'budget', name: 'Categories Watchlist', desc: 'Category groups with current-month amounts', defaultEnabled: true, size: 'sm' },
  { id: 'expenses', name: 'Expenses Structure', desc: "This month's spend, broken down by category", defaultEnabled: true, size: 'md' },
  { id: 'vehicle', name: 'Vehicle costs', desc: 'Fuel + maintenance from vehicle-manager, cost/km', defaultEnabled: true, size: 'sm' },
  { id: 'networth', name: 'Net Worth', desc: 'Total balance, adjustable by account category', defaultEnabled: false, size: 'md' },
]

// Unchanged by the 12-column layout (2026-09-23): only on/off is stored, never layout, so
// existing saved choices keep working.
const STORAGE_KEY = 'majordom_dashboard_widgets_v1'

export function loadWidgetPrefs(): Record<WidgetId, boolean> {
  const defaults = Object.fromEntries(WIDGETS.map(w => [w.id, w.defaultEnabled])) as Record<WidgetId, boolean>
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    const stored = JSON.parse(raw) as Partial<Record<WidgetId, boolean>>
    return { ...defaults, ...stored }
  } catch {
    return defaults
  }
}

export function saveWidgetPrefs(prefs: Record<WidgetId, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // localStorage unavailable (private mode, quota) — Customize choices just won't persist
  }
}
