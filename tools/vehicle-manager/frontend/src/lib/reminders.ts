import { formatNumber } from './formatCurrency'
import type { VehicleReminder } from './api'

export function reminderHorizon(r: VehicleReminder): { text: string; overdue: boolean } {
  if (r.overdue) return { text: 'Overdue', overdue: true }
  if (r.days_left != null) {
    return { text: r.days_left === 0 ? 'Due today' : `in ${r.days_left} days`, overdue: false }
  }
  if (r.km_left != null) return { text: `in ${formatNumber(r.km_left)} km`, overdue: false }
  return { text: '', overdue: false }
}
