import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Bell, Droplet, Shield, Trash2, Wrench, CircleDollarSign } from 'lucide-react'
import BottomNav from '../components/BottomNav'
import LogoutButton from '../components/LogoutButton'
import LogEntryForm from '../components/LogEntryForm'
import VehicleSwitcher from '../components/VehicleSwitcher'
import { deleteLogEntry, getVehicleLog, getVehicleSummary, type VehicleLogEntry } from '../lib/api'
import { formatCurrency, formatNumber } from '../lib/formatCurrency'
import { formatDate } from '../lib/formatDate'
import { categoryLabel } from '../lib/entryTypes'
import { useSelectedVehicle } from '../lib/useSelectedVehicle'

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthLabel(month: string): string {
  const [y, m] = month.split('-')
  return `${MONTH_ABBR[Number(m) - 1]} ${y}`
}

function iconFor(entryType: string) {
  switch (entryType) {
    case 'fuel':
      return Droplet
    case 'insurance':
      return Shield
    case 'service':
    case 'maintenance':
      return Wrench
    default:
      return CircleDollarSign
  }
}

function groupByMonth(entries: VehicleLogEntry[]): [string, VehicleLogEntry[]][] {
  const buckets = new Map<string, VehicleLogEntry[]>()
  for (const e of entries) {
    const month = (e.date || '').slice(0, 7)
    if (!month) continue
    const bucket = buckets.get(month) ?? []
    bucket.push(e)
    buckets.set(month, bucket)
  }
  return Array.from(buckets.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
}

export default function TimelinePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { vehicles, vehicle, selectedId, select, isLoading } = useSelectedVehicle()

  const logQuery = useQuery({
    queryKey: ['vehicle-log', vehicle?.id, 'timeline'],
    queryFn: () => getVehicleLog(vehicle!.id, 200),
    enabled: !!vehicle,
    staleTime: 60_000,
  })
  const summaryQuery = useQuery({
    queryKey: ['vehicle-summary', vehicle?.id],
    queryFn: () => getVehicleSummary(vehicle!.id),
    enabled: !!vehicle,
    staleTime: 60_000,
  })

  const entries = logQuery.data ?? []
  const groups = groupByMonth(entries)
  const reminders = summaryQuery.data?.reminders ?? []

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['vehicle-log', vehicle?.id] })
    void queryClient.invalidateQueries({ queryKey: ['vehicle-summary', vehicle?.id] })
    void queryClient.invalidateQueries({ queryKey: ['vehicles'] })
  }

  async function handleDelete(id: number) {
    await deleteLogEntry(id)
    invalidate()
  }

  return (
    <div className="min-h-dvh bg-background px-4 pt-8 pb-24">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-white text-xl font-semibold">Timeline</h1>
        <LogoutButton />
      </div>

      {isLoading ? (
        <p className="text-muted text-sm text-center py-8">Loading…</p>
      ) : !vehicle ? (
        <p className="text-muted text-sm text-center py-8">No vehicles yet.</p>
      ) : (
        <>
          <VehicleSwitcher vehicles={vehicles} selectedId={selectedId} onSelect={select} />

          {reminders.length > 0 && (
            <button
              onClick={() => navigate('/reminders')}
              className="mt-3 w-full bg-surface border border-border rounded-2xl px-4 py-3 flex items-center gap-3 text-left"
            >
              <Bell size={16} className={reminders[0].overdue ? 'text-danger' : 'text-accent'} />
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-medium">Reminders ({reminders.length})</p>
                <p className="text-muted text-xs truncate">
                  {reminders[0].label}
                  {reminders[0].overdue ? ' · overdue' : ''}
                </p>
              </div>
              <span className="text-muted text-xs">More…</span>
            </button>
          )}

          {entries.length === 0 ? (
            <p className="text-muted text-sm text-center py-10">No entries yet.</p>
          ) : (
            groups.map(([month, monthEntries]) => (
              <div key={month} className="mt-5">
                <p className="text-xs text-muted font-semibold mb-2">{monthLabel(month)}</p>
                <div className="space-y-2">
                  {monthEntries.map((entry) => {
                    const Icon = iconFor(entry.entry_type)
                    return (
                      <div
                        key={entry.id}
                        className="bg-surface border border-border rounded-xl px-3 py-3 flex items-start gap-3"
                      >
                        <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center flex-shrink-0">
                          <Icon size={15} className="text-accent" strokeWidth={1.7} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-white text-sm font-medium">{categoryLabel(entry.entry_type)}</p>
                            {entry.cost_total != null && (
                              <p className="font-mono text-sm text-white flex-shrink-0">
                                {formatCurrency(entry.cost_total)}
                              </p>
                            )}
                          </div>
                          <p className="text-muted text-xs mt-0.5">
                            {formatDate(entry.date)}
                            {entry.odo_km != null ? ` · ${formatNumber(entry.odo_km)} km` : ''}
                          </p>
                          {entry.entry_type === 'fuel' ? (
                            <p className="text-muted text-xs mt-0.5">
                              {entry.fuel_liters != null ? `${entry.fuel_liters} L` : ''}
                              {entry.fuel_price_per_liter != null
                                ? ` · ${formatCurrency(entry.fuel_price_per_liter, { decimals: 3 })}/L`
                                : ''}
                              {entry.location ? ` · ${entry.location}` : ''}
                            </p>
                          ) : (
                            entry.notes && <p className="text-muted text-xs mt-0.5">{entry.notes}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="text-muted hover:text-danger transition-colors shrink-0 p-1"
                          aria-label="Delete entry"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}

          <LogEntryForm vehicleId={vehicle.id} onAdded={invalidate} />
        </>
      )}

      <BottomNav />
    </div>
  )
}
