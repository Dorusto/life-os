import { Bell } from 'lucide-react'
import type { VehicleReminder } from '../lib/api'
import { formatNumber } from '../lib/formatCurrency'
import { formatDate } from '../lib/formatDate'
import { reminderHorizon } from '../lib/reminders'

interface ReminderRowProps {
  reminder: VehicleReminder
}

/**
 * A single reminder row: icon, label, due date/odometer, horizon text and an
 * optional progress bar. Kept here so every surface that lists reminders
 * renders identical markup instead of its own copy.
 */
export default function ReminderRow({ reminder }: ReminderRowProps) {
  const horizon = reminderHorizon(reminder)

  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <div className="flex items-center gap-3">
        <Bell size={16} className={reminder.overdue ? 'text-loss' : 'text-brand'} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{reminder.label}</p>
          <p className="text-xs text-ink-3">
            {reminder.due_date
              ? formatDate(reminder.due_date)
              : reminder.due_odo != null
                ? `${formatNumber(reminder.due_odo)} km`
                : ''}
          </p>
        </div>
        <span className={`text-xs font-medium ${horizon.overdue ? 'text-loss' : 'text-ink-2'}`}>
          {horizon.text}
        </span>
      </div>
      {reminder.progress != null && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full rounded-full ${reminder.overdue ? 'bg-loss' : 'bg-brand'}`}
            style={{ width: `${Math.min(reminder.progress * 100, 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}
