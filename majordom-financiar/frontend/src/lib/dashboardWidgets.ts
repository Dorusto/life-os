export type WidgetId = 'goals' | 'budget' | 'trend' | 'latest' | 'expenses' | 'cashflow' | 'vehicle'

export interface WidgetMeta {
  id: WidgetId
  name: string
  desc: string
  defaultEnabled: boolean
  column: 'full' | 'left' | 'right'
}

/**
 * Dashboard widget registry (#192). The mockup's own widget list only covers
 * trend/latest/cashflow/expenses/vehicle — Financial Goals and Budget aren't
 * in the mockup at all, but they're existing, real, actively-used features
 * from the old Home screen, so they're kept as widgets too (confirmed with
 * Doru rather than silently dropped or silently kept — see session notes).
 */
export const WIDGETS: WidgetMeta[] = [
  { id: 'goals', name: 'Financial Goals', desc: 'Portfolio Independence and your savings goals', defaultEnabled: true, column: 'full' },
  { id: 'budget', name: 'Budget', desc: 'Category spend vs. budget, current period', defaultEnabled: true, column: 'full' },
  { id: 'trend', name: 'Balance trend', desc: 'Total / on-budget / portfolio / vehicles', defaultEnabled: true, column: 'left' },
  { id: 'latest', name: 'Latest Transactions', desc: 'Recent activity across all accounts', defaultEnabled: true, column: 'right' },
  { id: 'expenses', name: 'Expenses Structure', desc: "This month's spend, broken down by category", defaultEnabled: true, column: 'right' },
  { id: 'cashflow', name: 'Cash Flow', desc: 'Income vs. expenses this month', defaultEnabled: false, column: 'right' },
  { id: 'vehicle', name: 'Vehicle costs', desc: 'Fuel + maintenance from vehicle-manager, cost/km', defaultEnabled: false, column: 'left' },
]

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
