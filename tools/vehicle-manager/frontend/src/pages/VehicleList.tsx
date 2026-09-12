import { useQuery } from '@tanstack/react-query'
import { Car } from 'lucide-react'
import { getVehicles } from '../lib/api'

/**
 * Vehicle list — the app's home page.
 *
 * Deliberately minimal for Phase 3: proves the auth+fetch pipeline works end
 * to end (login -> authenticated GET /vehicles). Phase 4 builds the real list
 * UI (icons, current value, last odo) and the vehicle-creation/Fuelio-import
 * flow that would actually populate this — until then, an empty list here is
 * the expected, correct result, not a bug.
 */
export default function VehicleList() {
  const { data: vehicles, isLoading, error } = useQuery({
    queryKey: ['vehicles'],
    queryFn: getVehicles,
  })

  return (
    <div className="min-h-dvh bg-background px-4 py-6">
      <h1 className="text-white text-xl font-semibold mb-6">Vehicles</h1>

      {isLoading && (
        <p className="text-muted text-sm text-center py-8">Loading…</p>
      )}

      {error && (
        <p className="text-danger text-sm text-center py-8">
          Failed to load vehicles. Is vehicle-manager running?
        </p>
      )}

      {vehicles && vehicles.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Car className="w-10 h-10 text-muted-2" strokeWidth={1.5} />
          <p className="text-muted text-sm">No vehicles yet</p>
        </div>
      )}

      {vehicles && vehicles.length > 0 && (
        <ul className="space-y-2">
          {vehicles.map((v) => (
            <li
              key={v.id}
              className="bg-surface rounded-xl px-4 py-3 text-white text-sm flex items-center gap-3"
            >
              <Car className="w-5 h-5 text-muted flex-shrink-0" strokeWidth={1.5} />
              <span>{v.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
