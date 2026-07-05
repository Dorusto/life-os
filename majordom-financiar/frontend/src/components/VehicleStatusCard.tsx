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

  async function handleConfirm() {
    setLoading(true)
    try {
      const result = await confirmVehicleStatus(data.id)
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
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[85%] space-y-3">
      <div>
        <p className="text-white font-medium">
          {data.active ? 'Reactivate vehicle?' : 'Mark vehicle as sold/retired?'}
        </p>
        <p className="text-muted text-sm mt-0.5">
          <span className="text-white">{data.vehicle_name}</span>
          {' '}will {data.active ? 'reappear' : 'no longer appear'} in vehicle stats and tools.
        </p>
      </div>

      <ActionCardButtons onConfirm={handleConfirm} onCancel={handleCancel} loading={loading} />
    </div>
  )
}
