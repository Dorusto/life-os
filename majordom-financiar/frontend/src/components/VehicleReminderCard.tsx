import { useState } from 'react'
import { Bell, X } from 'lucide-react'
import { confirmVehicleReminder, cancelVehicleReminder, type VehicleReminderData } from '../lib/api'

interface Props {
  data: VehicleReminderData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function VehicleReminderCard({ data, onConfirmed, onCancelled }: Props) {
  const [vehicleId, setVehicleId] = useState(data.vehicle_id)
  const [dueDate, setDueDate] = useState(data.due_date)
  const [intervalKm, setIntervalKm] = useState(String(data.interval_km ?? ''))
  const [intervalMonths, setIntervalMonths] = useState(String(data.interval_months ?? ''))
  const [lastServiceKm, setLastServiceKm] = useState(String(data.last_service_km ?? ''))
  const [lastServiceDate, setLastServiceDate] = useState(data.last_service_date ?? '')
  const [loading, setLoading] = useState(false)

  const isService = data.reminder_type === 'service'

  async function handleConfirm() {
    setLoading(true)
    try {
      const override: Record<string, string | number> = {}
      if (vehicleId !== data.vehicle_id) override.vehicle_id = vehicleId
      if (isService) {
        if (intervalKm) override.interval_km = Number(intervalKm)
        if (intervalMonths) override.interval_months = Number(intervalMonths)
        if (lastServiceKm) override.last_service_km = Number(lastServiceKm)
        if (lastServiceDate) override.last_service_date = lastServiceDate
      } else {
        if (dueDate !== data.due_date) override.due_date = dueDate
      }
      const result = await confirmVehicleReminder(data.id, Object.keys(override).length ? override : undefined)
      onConfirmed(result.message)
    } catch (err) {
      onConfirmed(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    setLoading(true)
    try { await cancelVehicleReminder(data.id) } catch {}
    onCancelled()
  }

  const daysLabel = data.days_remaining < 0
    ? `expired ${Math.abs(data.days_remaining)} days ago`
    : data.days_remaining === 0
    ? ''
    : `${data.days_remaining} days remaining`

  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 w-[92%] max-w-sm space-y-3">
      <p className="text-white font-medium">Set {data.label} reminder</p>

      <div className="space-y-2">
        {data.vehicles.length > 1 && (
          <div className="space-y-1">
            <p className="text-muted text-xs">Vehicle</p>
            <select
              value={vehicleId}
              onChange={e => setVehicleId(Number(e.target.value))}
              className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-accent"
            >
              {data.vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
        )}

        {isService ? (
          <>
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <p className="text-muted text-xs">Every (km)</p>
                <input
                  type="number"
                  value={intervalKm}
                  onChange={e => setIntervalKm(e.target.value)}
                  placeholder="15000"
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-accent"
                />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-muted text-xs">Every (months)</p>
                <input
                  type="number"
                  value={intervalMonths}
                  onChange={e => setIntervalMonths(e.target.value)}
                  placeholder="12"
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-accent"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <p className="text-muted text-xs">Last service (km)</p>
                <input
                  type="number"
                  value={lastServiceKm}
                  onChange={e => setLastServiceKm(e.target.value)}
                  placeholder="48535"
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-accent"
                />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-muted text-xs">Last service date</p>
                <input
                  type="date"
                  value={lastServiceDate}
                  onChange={e => setLastServiceDate(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-accent"
                />
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-1">
            <p className="text-muted text-xs">Expiry date</p>
            {daysLabel && (
              <p className={`text-xs mb-1 ${data.days_remaining <= 0 ? 'text-red-400' : data.days_remaining <= 30 ? 'text-yellow-400' : 'text-muted'}`}>
                {daysLabel}
              </p>
            )}
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-accent"
            />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={loading || (!isService && !dueDate)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors active:scale-95 disabled:opacity-50 whitespace-nowrap"
        >
          <Bell size={14} />
          Set reminder
        </button>
        <button
          onClick={handleCancel}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-surface-2 border border-border text-muted hover:text-white text-sm font-medium transition-colors active:scale-95 disabled:opacity-50 whitespace-nowrap"
        >
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  )
}
