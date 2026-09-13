import { Car, ChevronDown } from 'lucide-react'
import type { Vehicle } from '../lib/api'
import { formatNumber } from '../lib/formatCurrency'

/**
 * Fuelio-style vehicle header: shows the active vehicle and lets the user
 * switch between them from any main screen. A native <select> is stretched
 * over the card so the whole thing is tappable without custom dropdown code.
 */
export default function VehicleSwitcher({
  vehicles,
  selectedId,
  onSelect,
}: {
  vehicles: Vehicle[]
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  const vehicle = vehicles.find((v) => v.id === selectedId) ?? vehicles[0]
  if (vehicle) {
    const odo = vehicle.last_odo ?? vehicle.manual_mileage
    return (
      <div className="relative rounded-lg border border-line bg-surface px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-surface-sunken">
            <Car size={17} className="text-ink-3" strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{vehicle.name}</p>
            <p className="font-mono text-xs text-ink-3">
              {odo != null ? `${formatNumber(odo)} km` : 'No odometer yet'}
            </p>
          </div>
          {vehicles.length > 1 && <ChevronDown size={16} className="flex-shrink-0 text-ink-3" />}
        </div>
        {vehicles.length > 1 && (
          <select
            value={vehicle.id}
            onChange={(e) => onSelect(Number(e.target.value))}
            aria-label="Select vehicle"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        )}
      </div>
    )
  }

  return (
    <div className="w-full rounded-lg border border-dashed border-line bg-surface px-4 py-3 text-sm text-ink-3">
      No vehicles yet
    </div>
  )
}
