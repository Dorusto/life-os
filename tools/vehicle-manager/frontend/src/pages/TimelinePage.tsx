import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Droplet, Shield, Trash2, Wrench, CircleDollarSign } from 'lucide-react'
import LogEntryForm from '../components/LogEntryForm'
import VehicleSwitcher from '../components/VehicleSwitcher'
import { Loading } from '../components/Feedback'
import { deleteLogEntry, getVehicleLog, type VehicleLogEntry } from '../lib/api'
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
  const queryClient = useQueryClient()
  const { vehicles, vehicle, selectedId, select, isLoading } = useSelectedVehicle()

  const logQuery = useQuery({
    queryKey: ['vehicle-log', vehicle?.id, 'timeline'],
    queryFn: () => getVehicleLog(vehicle!.id, 200),
    enabled: !!vehicle,
    staleTime: 60_000,
  })
  const entries = logQuery.data ?? []
  const groups = groupByMonth(entries)

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
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-ink">Timeline</h1>
      </header>

      {isLoading ? (
        <Loading />
      ) : !vehicle ? (
        <p className="py-8 text-center text-sm text-ink-2">No vehicles yet.</p>
      ) : (
        <>
          <VehicleSwitcher vehicles={vehicles} selectedId={selectedId} onSelect={select} />

          {entries.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-2">No entries yet.</p>
          ) : (
            groups.map(([month, monthEntries]) => (
              <div key={month} className="mt-5">
                <p className="mb-2 text-xs font-semibold text-ink-2">{monthLabel(month)}</p>
                <div className="space-y-2">
                  {monthEntries.map((entry) => {
                    const Icon = iconFor(entry.entry_type)
                    return (
                      <div
                        key={entry.id}
                        className="flex items-start gap-3 rounded-lg border border-line bg-surface px-3 py-3"
                      >
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-2">
                          <Icon size={15} className="text-brand" strokeWidth={1.7} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-ink">{categoryLabel(entry.entry_type)}</p>
                            {entry.cost_total != null && (
                              <p className="flex-shrink-0 font-mono text-sm text-ink tnum">
                                {formatCurrency(entry.cost_total)}
                              </p>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-ink-3">
                            {formatDate(entry.date)}
                            {entry.odo_km != null ? ` · ${formatNumber(entry.odo_km)} km` : ''}
                          </p>
                          {entry.entry_type === 'fuel' ? (
                            <p className="mt-0.5 text-xs text-ink-3">
                              {entry.fuel_liters != null ? `${entry.fuel_liters} L` : ''}
                              {entry.fuel_price_per_liter != null
                                ? ` · ${formatCurrency(entry.fuel_price_per_liter, { decimals: 3 })}/L`
                                : ''}
                              {entry.location ? ` · ${entry.location}` : ''}
                            </p>
                          ) : (
                            entry.notes && <p className="mt-0.5 text-xs text-ink-3">{entry.notes}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="shrink-0 rounded p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-loss"
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
    </div>
  )
}
