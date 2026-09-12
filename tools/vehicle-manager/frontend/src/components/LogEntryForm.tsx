import { useState } from 'react'
import { addLogEntry, type NewVehicleLogEntry } from '../lib/api'

/** Entry types double as the expense category (Fuelio's CostTypeID equivalent). */
export const ENTRY_TYPES = ['fuel', 'service', 'maintenance', 'insurance', 'other'] as const

const UNITS: Record<string, string> = {
  fuel: 'L',
  service: '€',
  maintenance: '€',
  insurance: '€',
  other: '€',
}

/**
 * Add-a-log-entry form (fuel vs. expense), shared by the vehicle detail and
 * timeline screens so the two never drift apart.
 */
export default function LogEntryForm({
  vehicleId,
  onAdded,
}: {
  vehicleId: string | number
  onAdded: () => void
}) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [entryType, setEntryType] = useState('fuel')
  const [odoKm, setOdoKm] = useState('')
  const [fuelLiters, setFuelLiters] = useState('')
  const [fuelPricePerLiter, setFuelPricePerLiter] = useState('')
  const [fuelFullTank, setFuelFullTank] = useState(true)
  const [fuelMissed, setFuelMissed] = useState(false)
  const [costTotal, setCostTotal] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setDate(new Date().toISOString().slice(0, 10))
    setEntryType('fuel')
    setOdoKm('')
    setFuelLiters('')
    setFuelPricePerLiter('')
    setFuelFullTank(true)
    setFuelMissed(false)
    setCostTotal('')
    setLocation('')
    setNotes('')
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const entry: NewVehicleLogEntry = {
        date,
        entry_type: entryType,
        odo_km: odoKm ? Number(odoKm) : null,
        location: location || null,
        notes: notes || null,
      }
      if (entryType === 'fuel') {
        entry.fuel_liters = fuelLiters ? Number(fuelLiters) : null
        entry.fuel_price_per_liter = fuelPricePerLiter ? Number(fuelPricePerLiter) : null
        entry.fuel_full_tank = fuelFullTank
        entry.fuel_missed = fuelMissed
        entry.cost_total =
          fuelLiters && fuelPricePerLiter
            ? Number((Number(fuelLiters) * Number(fuelPricePerLiter)).toFixed(2))
            : costTotal
            ? Number(costTotal)
            : null
      } else {
        entry.cost_total = costTotal ? Number(costTotal) : null
      }
      await addLogEntry(vehicleId, entry)
      reset()
      setOpen(false)
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save entry')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full mt-3 py-2.5 rounded-xl border border-dashed border-border text-muted text-sm hover:text-white hover:border-border-hover transition-colors"
      >
        + Add entry
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 bg-surface border border-border rounded-2xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Date</label>
          <input
            type="date" required value={date} onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 rounded-lg bg-background border border-border text-white text-sm focus:outline-none focus:border-accent"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Category</label>
          <select
            value={entryType} onChange={(e) => setEntryType(e.target.value)}
            className="px-3 py-2 rounded-lg bg-background border border-border text-white text-sm focus:outline-none focus:border-accent capitalize"
          >
            {ENTRY_TYPES.map((t) => (
              <option key={t} value={t} className="capitalize">{t}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Odometer (km)</label>
        <input
          type="number" step="1" value={odoKm} onChange={(e) => setOdoKm(e.target.value)}
          className="px-3 py-2 rounded-lg bg-background border border-border text-white text-sm focus:outline-none focus:border-accent"
        />
      </div>

      {entryType === 'fuel' ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted">Liters</label>
              <input
                type="number" step="0.01" value={fuelLiters} onChange={(e) => setFuelLiters(e.target.value)}
                className="px-3 py-2 rounded-lg bg-background border border-border text-white text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted">Price/L</label>
              <input
                type="number" step="0.001" value={fuelPricePerLiter} onChange={(e) => setFuelPricePerLiter(e.target.value)}
                className="px-3 py-2 rounded-lg bg-background border border-border text-white text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={fuelFullTank} onChange={(e) => setFuelFullTank(e.target.checked)} />
              Full tank
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={fuelMissed} onChange={(e) => setFuelMissed(e.target.checked)} />
              Missed fill-up
            </label>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Station (optional)</label>
            <input
              type="text" value={location} onChange={(e) => setLocation(e.target.value)}
              className="px-3 py-2 rounded-lg bg-background border border-border text-white text-sm focus:outline-none focus:border-accent"
            />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Cost ({UNITS[entryType] ?? '€'})</label>
          <input
            type="number" step="0.01" value={costTotal} onChange={(e) => setCostTotal(e.target.value)}
            className="px-3 py-2 rounded-lg bg-background border border-border text-white text-sm focus:outline-none focus:border-accent"
          />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Notes</label>
        <input
          type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
          className="px-3 py-2 rounded-lg bg-background border border-border text-white text-sm focus:outline-none focus:border-accent"
        />
      </div>

      {error && <p className="text-danger text-xs">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="button" onClick={() => { setOpen(false); reset() }}
          className="flex-1 py-2 rounded-lg border border-border text-muted text-sm hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit" disabled={saving}
          className="flex-1 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-40 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
