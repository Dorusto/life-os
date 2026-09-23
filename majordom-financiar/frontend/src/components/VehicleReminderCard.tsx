import { useState } from 'react'
import { Bell, Check } from 'lucide-react'
import { confirmVehicleReminder, cancelVehicleReminder, type VehicleReminderData } from '../lib/api'
import ActionCardButtons from './ActionCardButtons'

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
  const [required, setRequired] = useState(data.required ?? true)
  const [vehicleType, setVehicleType] = useState(data.vehicle_type ?? 'car')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isService = data.reminder_type === 'service'
  const isApkRequired = data.reminder_type === 'apk_required'
  const isVehicleType = data.reminder_type === 'vehicle_type'

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      const override: Record<string, string | number | boolean> = {}
      if (vehicleId !== data.vehicle_id) override.vehicle_id = vehicleId
      if (isService) {
        if (intervalKm) override.interval_km = Number(intervalKm)
        if (intervalMonths) override.interval_months = Number(intervalMonths)
        if (lastServiceKm) override.last_service_km = Number(lastServiceKm)
        if (lastServiceDate) override.last_service_date = lastServiceDate
      } else if (isApkRequired) {
        if (required !== data.required) override.required = required
      } else if (isVehicleType) {
        if (vehicleType !== data.vehicle_type) override.vehicle_type = vehicleType
      } else {
        if (dueDate !== data.due_date) override.due_date = dueDate
      }
      const result = await confirmVehicleReminder(data.id, Object.keys(override).length ? override : undefined)
      onConfirmed(result.message)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(`Could not set reminder (${msg}). Try again.`)
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
    <div className="bg-token-surface border border-token-line rounded-2xl rounded-bl-sm px-4 py-3 w-[92%] max-w-sm space-y-3">
      <p className="text-token-ink font-medium">{isApkRequired || isVehicleType ? `Update ${data.label}` : `Set ${data.label} reminder`}</p>

      <div className="space-y-2">
        {data.vehicles.length > 1 && (
          <div className="space-y-1">
            <p className="text-token-ink-3 text-xs">Vehicle</p>
            <select
              value={vehicleId}
              onChange={e => setVehicleId(Number(e.target.value))}
              className="w-full bg-token-paper border border-token-line rounded-xl px-3 py-2 text-token-ink text-sm outline-none focus:border-token-brand"
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
                <p className="text-token-ink-3 text-xs">Every (km)</p>
                <input
                  type="number"
                  value={intervalKm}
                  onChange={e => setIntervalKm(e.target.value)}
                  placeholder="15000"
                  className="w-full bg-token-paper border border-token-line rounded-xl px-3 py-2 text-token-ink text-sm outline-none focus:border-token-brand"
                />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-token-ink-3 text-xs">Every (months)</p>
                <input
                  type="number"
                  value={intervalMonths}
                  onChange={e => setIntervalMonths(e.target.value)}
                  placeholder="12"
                  className="w-full bg-token-paper border border-token-line rounded-xl px-3 py-2 text-token-ink text-sm outline-none focus:border-token-brand"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <p className="text-token-ink-3 text-xs">Last service (km)</p>
                <input
                  type="number"
                  value={lastServiceKm}
                  onChange={e => setLastServiceKm(e.target.value)}
                  placeholder="48535"
                  className="w-full bg-token-paper border border-token-line rounded-xl px-3 py-2 text-token-ink text-sm outline-none focus:border-token-brand"
                />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-token-ink-3 text-xs">Last service date</p>
                <input
                  type="date"
                  value={lastServiceDate}
                  onChange={e => setLastServiceDate(e.target.value)}
                  className="w-full bg-token-paper border border-token-line rounded-xl px-3 py-2 text-token-ink text-sm outline-none focus:border-token-brand"
                />
              </div>
            </div>
          </>
        ) : isApkRequired ? (
          <div className="space-y-1">
            <p className="text-token-ink-3 text-xs">APK/ITP/MOT applies to this vehicle?</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRequired(true)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${required ? 'bg-token-brand text-token-on-brand' : 'bg-token-paper border border-token-line text-token-ink-3'}`}
              >
                Required
              </button>
              <button
                type="button"
                onClick={() => setRequired(false)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${!required ? 'bg-token-brand text-token-on-brand' : 'bg-token-paper border border-token-line text-token-ink-3'}`}
              >
                Not required
              </button>
            </div>
          </div>
        ) : isVehicleType ? (
          <div className="space-y-1">
            <p className="text-token-ink-3 text-xs">Vehicle type</p>
            <select
              value={vehicleType}
              onChange={e => setVehicleType(e.target.value as 'car' | 'motorcycle' | 'other')}
              className="w-full bg-token-paper border border-token-line rounded-xl px-3 py-2 text-token-ink text-sm outline-none focus:border-token-brand"
            >
              <option value="car">🚗 Car</option>
              <option value="motorcycle">🏍️ Motorcycle</option>
              <option value="other">🚙 Other</option>
            </select>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-token-ink-3 text-xs">Expiry date</p>
            {daysLabel && (
              <p className={`text-xs mb-1 ${data.days_remaining <= 0 ? 'text-token-loss' : data.days_remaining <= 30 ? 'text-token-warn' : 'text-token-ink-3'}`}>
                {daysLabel}
              </p>
            )}
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full bg-token-paper border border-token-line rounded-xl px-3 py-2 text-token-ink text-sm outline-none focus:border-token-brand"
            />
          </div>
        )}
      </div>

      {error && <p className="text-token-loss text-xs">{error}</p>}

      <ActionCardButtons
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        loading={loading}
        confirmDisabled={!isService && !isApkRequired && !isVehicleType && !dueDate}
        confirmIcon={isApkRequired || isVehicleType ? Check : Bell}
        confirmLabel={isApkRequired || isVehicleType ? 'Save' : 'Set reminder'}
      />
    </div>
  )
}
