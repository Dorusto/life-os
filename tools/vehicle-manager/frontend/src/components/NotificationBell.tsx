import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { getVehicleSummary } from '../lib/api'
import { formatNumber } from '../lib/formatCurrency'
import { formatDate } from '../lib/formatDate'
import { reminderHorizon } from '../lib/reminders'
import { useSelectedVehicle } from '../lib/useSelectedVehicle'
import { cn } from '../lib/ui'

interface NotificationBellProps {
  /** Lets the host surface (the desktop rail pads its own controls) align the trigger. */
  className?: string
  /**
   * Aligns the popup panel. The desktop rail opens it rightwards (`left-0 right-auto`),
   * since a right-anchored panel would fall off the left screen edge there.
   */
  panelClassName?: string
  /**
   * Vehicle whose reminders to show. Defaults to the app-wide selected vehicle, which is
   * what every header means; VehicleDetail passes its route vehicle so the bell never
   * reports a different vehicle than the page it sits on.
   */
  vehicleId?: number
}

/**
 * Reminder bell (#11) — the same top-right entry as the other apps, sitting as a sibling
 * of SettingsButton. Vehicle-manager has no shared BottomSheet/IconButton primitive to
 * reuse, so the panel is a self-contained dropdown anchored to the trigger, built from the
 * same tokens and the same row markup as RemindersPage's list. Reads the summary through
 * the shared `['vehicle-summary', id]` query key, so on Home/Timeline/Reminders it is
 * served straight from the cache those pages already populate.
 */
export default function NotificationBell({ className, panelClassName, vehicleId }: NotificationBellProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { vehicle } = useSelectedVehicle()

  const summaryVehicleId = vehicleId ?? vehicle?.id
  const summaryQuery = useQuery({
    queryKey: ['vehicle-summary', summaryVehicleId],
    queryFn: () => getVehicleSummary(summaryVehicleId!),
    enabled: summaryVehicleId != null,
    staleTime: 60_000,
  })
  const reminders = summaryQuery.data?.reminders ?? []
  const hasOverdue = reminders.some((r) => r.overdue)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Notifications"
        className={cn('relative flex items-center text-ink-3 transition-colors hover:text-ink', className)}
      >
        <Bell size={16} aria-hidden />
        {hasOverdue && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-loss" aria-hidden />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className={cn(
            'absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-lg border border-line bg-surface shadow-lg',
            panelClassName,
          )}
        >
          <div className="border-b border-line px-4 py-2.5">
            <p className="text-sm font-semibold text-ink">Notifications</p>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {summaryVehicleId == null ? (
              <p className="px-4 py-3 text-xs text-ink-2">No vehicles yet.</p>
            ) : summaryQuery.isError ? (
              <p className="px-4 py-3 text-xs text-ink-2">Couldn't load this vehicle's reminders.</p>
            ) : reminders.length === 0 ? (
              <p className="px-4 py-3 text-xs text-ink-2">You're all caught up.</p>
            ) : (
              <div className="divide-y divide-line">
                {reminders.map((r) => {
                  const horizon = reminderHorizon(r)
                  return (
                    <div key={r.kind} className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Bell size={16} className={r.overdue ? 'text-loss' : 'text-brand'} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink">{r.label}</p>
                          <p className="text-xs text-ink-3">
                            {r.due_date
                              ? formatDate(r.due_date)
                              : r.due_odo != null
                                ? `${formatNumber(r.due_odo)} km`
                                : ''}
                          </p>
                        </div>
                        <span className={`text-xs font-medium ${horizon.overdue ? 'text-loss' : 'text-ink-2'}`}>
                          {horizon.text}
                        </span>
                      </div>
                      {r.progress != null && (
                        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className={`h-full rounded-full ${r.overdue ? 'bg-loss' : 'bg-brand'}`}
                            style={{ width: `${Math.min(r.progress * 100, 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              navigate('/reminders')
            }}
            className="w-full border-t border-line px-4 py-2.5 text-left text-sm font-medium text-brand transition-colors hover:bg-surface-2"
          >
            View all
          </button>
        </div>
      )}
    </div>
  )
}
