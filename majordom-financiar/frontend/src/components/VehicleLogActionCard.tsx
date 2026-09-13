import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { confirmVehicleLogAction, cancelVehicleLogAction, type VehicleLogActionData } from '../lib/api'
import ActionCardButtons from './ActionCardButtons'
import { formatCurrency, formatNumber } from '../lib/formatCurrency'

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
    <div className="bg-token-surface border border-token-line rounded-2xl rounded-bl-sm px-4 py-3 max-w-[85%] space-y-3">
      <div>
        <p className="text-token-ink font-medium">Delete log entry?</p>
        <p className="text-token-ink-3 text-sm mt-0.5">
          <span className="text-token-ink">{data.vehicle_name}</span>
          {' · '}
          {data.date}
          {data.odo_km != null && <span> · {formatNumber(data.odo_km)} km</span>}
          {data.fuel_liters != null && <span> · {formatNumber(data.fuel_liters, 1)}L</span>}
          {data.cost_total != null && <span> · {formatCurrency(data.cost_total)}</span>}
          {data.location && <span> · {data.location}</span>}
        </p>
        <p className="text-token-warn text-xs mt-1">ID #{data.entry_id} · This cannot be undone.</p>
        {data.has_ab_transaction && (
          <p className="text-token-warn text-xs mt-0.5">⚠ Will also remove the Actual Budget transaction</p>
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
