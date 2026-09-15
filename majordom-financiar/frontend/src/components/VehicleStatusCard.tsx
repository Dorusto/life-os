import { useState } from 'react'
import { confirmVehicleStatus, cancelVehicleStatus, type VehicleStatusData } from '../lib/api'
import ActionCardButtons from './ActionCardButtons'

interface Props {
  data: VehicleStatusData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function VehicleStatusCard({ data, onConfirmed, onCancelled }: Props) {
  const [loading, setLoading] = useState(false)
  const vehicles = data.vehicles ?? []
  const [vehicleId, setVehicleId] = useState<number | ''>(data.vehicle_id ?? vehicles[0]?.id ?? '')

  const selectedName = vehicles.find(v => v.id === vehicleId)?.name ?? data.vehicle_name

  async function handleConfirm() {
    setLoading(true)
    try {
      const result = await confirmVehicleStatus(
        data.id,
        vehicleId !== '' ? { vehicle_id: vehicleId } : undefined
      )
      onConfirmed(result.message)
    } catch (err) {
      onConfirmed(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    setLoading(true)
    try { await cancelVehicleStatus(data.id) } catch {}
    onCancelled()
  }

  return (
    <div className="bg-token-surface border border-token-line rounded-2xl rounded-bl-sm px-4 py-3 max-w-[85%] space-y-3">
      <div>
        <p className="text-token-ink font-medium">
          {data.active ? 'Reactivate vehicle?' : 'Mark vehicle as sold/retired?'}
        </p>
        {vehicles.length > 0 && (
          <div className="space-y-1 mt-1.5">
            <p className="text-token-ink-3 text-xs uppercase tracking-wide">Vehicle</p>
            <select
              value={vehicleId}
              onChange={e => setVehicleId(Number(e.target.value))}
              disabled={loading}
              className="w-full bg-token-surface-2 border border-token-line rounded-lg px-3 py-2 text-token-ink text-sm focus:outline-none focus:border-token-brand disabled:opacity-50 appearance-none"
            >
              {vehicles.map(v => (
                <option key={v.id} value={v.id} style={{ background: 'var(--surface)' }}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <p className="text-token-ink-3 text-sm mt-0.5">
          <span className="text-token-ink">{selectedName}</span>
          {' '}will {data.active ? 'reappear' : 'no longer appear'} in vehicle stats and tools.
        </p>
      </div>

      <ActionCardButtons onConfirm={handleConfirm} onCancel={handleCancel} loading={loading} />
    </div>
  )
}
