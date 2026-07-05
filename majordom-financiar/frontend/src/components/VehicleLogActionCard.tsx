import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { confirmVehicleLogAction, cancelVehicleLogAction, type VehicleLogActionData } from '../lib/api'
import ActionCardButtons from './ActionCardButtons'

interface Props {
  data: VehicleLogActionData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function VehicleLogActionCard({ data, onConfirmed, onCancelled }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      const result = await confirmVehicleLogAction(data.id)
      onConfirmed(result.message)
    } catch (err) {
      onConfirmed(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    setLoading(true)
    try { await cancelVehicleLogAction(data.id) } catch {}
    onCancelled()
  }

  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[85%] space-y-3">
      <div>
        <p className="text-white font-medium">Delete log entry?</p>
        <p className="text-muted text-sm mt-0.5">
          <span className="text-white">{data.vehicle_name}</span>
          {' · '}
          {data.date}
          {data.odo_km != null && <span> · {data.odo_km.toFixed(0)} km</span>}
          {data.fuel_liters != null && <span> · {data.fuel_liters.toFixed(1)}L</span>}
          {data.cost_total != null && <span> · €{data.cost_total.toFixed(2)}</span>}
          {data.location && <span> · {data.location}</span>}
        </p>
        <p className="text-yellow-500 text-xs mt-1">ID #{data.entry_id} · This cannot be undone.</p>
        {data.has_ab_transaction && (
          <p className="text-yellow-500 text-xs mt-0.5">⚠ Will also remove the Actual Budget transaction</p>
        )}
      </div>

      <ActionCardButtons
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        loading={loading}
        variant="danger"
        confirmIcon={Trash2}
        confirmLabel="Delete"
      />
    </div>
  )
}
