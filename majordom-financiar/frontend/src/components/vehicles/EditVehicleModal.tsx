import { useEffect, useState, type FormEvent } from 'react'
import BottomSheet from '../BottomSheet'
import {
  createVehicle,
  patchVehicle,
  type Vehicle,
  type CreateVehicleInput,
} from '../../lib/vehicleValueApi'

interface FormState {
  name: string
  make: string
  model: string
  year: string
  vehicle_class: string
  depreciation_pattern: 'class' | 'custom'
  annual_depreciation_pct: string
  salvage_floor_pct: string
  manual_mileage: string
  purchase_price: string
  purchase_date: string
}

interface EditVehicleModalProps {
  open: boolean
  onClose: () => void
  vehicleId?: number
  initialData?: Vehicle
  onSaved: (createdVehicleId?: number) => void
}

function buildInitialForm(initialData?: Vehicle): FormState {
  const annual = initialData?.annual_depreciation_pct
  return {
    name: initialData?.name ?? '',
    make: initialData?.make ?? '',
    model: initialData?.model ?? '',
    year: initialData?.year ? String(initialData.year) : '',
    vehicle_class: initialData?.vehicle_class ?? '',
    depreciation_pattern: annual != null ? 'custom' : 'class',
    annual_depreciation_pct: annual != null ? String(annual) : '',
    salvage_floor_pct: initialData ? String(initialData.salvage_floor_pct) : '10',
    manual_mileage: initialData?.manual_mileage != null ? String(initialData.manual_mileage) : '',
    purchase_price: initialData?.purchase_price != null ? String(initialData.purchase_price) : '',
    purchase_date: initialData?.purchase_date ?? '',
  }
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const n = Number(trimmed)
  return Number.isNaN(n) ? undefined : n
}

const inputClass =
  'bg-background text-white border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors w-full'
const labelClass = 'text-[11px] font-semibold text-muted uppercase tracking-wide'

export default function EditVehicleModal({
  open,
  onClose,
  vehicleId,
  initialData,
  onSaved,
}: EditVehicleModalProps) {
  const [form, setForm] = useState<FormState>(() => buildInitialForm(initialData))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm(buildInitialForm(initialData))
      setError(null)
    }
  }, [open, initialData])

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const payload: CreateVehicleInput = {
      name: form.name.trim(),
      make: form.make.trim() || undefined,
      model: form.model.trim() || undefined,
      year: parseOptionalNumber(form.year),
      vehicle_class: form.vehicle_class || undefined,
      annual_depreciation_pct:
        form.depreciation_pattern === 'custom'
          ? parseOptionalNumber(form.annual_depreciation_pct)
          : null,
      salvage_floor_pct: parseOptionalNumber(form.salvage_floor_pct) ?? 10,
      manual_mileage: parseOptionalNumber(form.manual_mileage),
      purchase_price: parseOptionalNumber(form.purchase_price) ?? null,
      purchase_date: form.purchase_date.trim() || null,
    }

    try {
      if (vehicleId) {
        await patchVehicle(vehicleId, payload)
        onSaved(undefined)
      } else {
        const created = await createVehicle(payload)
        onSaved(created.id)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save vehicle')
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={vehicleId ? 'Edit vehicle' : 'Add vehicle'}>
      <form onSubmit={handleSubmit} className="space-y-3 pt-2">
        <div className="space-y-1">
          <label className={labelClass}>Name</label>
          <input
            autoFocus
            value={form.name}
            onChange={e => updateField('name', e.target.value)}
            className={inputClass}
            placeholder="e.g. Duster"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className={labelClass}>Make</label>
            <input
              value={form.make}
              onChange={e => updateField('make', e.target.value)}
              className={inputClass}
              placeholder="Dacia"
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Model</label>
            <input
              value={form.model}
              onChange={e => updateField('model', e.target.value)}
              className={inputClass}
              placeholder="Duster"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className={labelClass}>Year</label>
            <input
              inputMode="numeric"
              value={form.year}
              onChange={e => updateField('year', e.target.value)}
              className={inputClass}
              placeholder="2020"
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Vehicle class</label>
            <select
              value={form.vehicle_class}
              onChange={e => updateField('vehicle_class', e.target.value)}
              className={inputClass}
            >
              <option value="">Select…</option>
              <option value="Economy">Economy</option>
              <option value="Standard">Standard</option>
              <option value="Luxury">Luxury</option>
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className={labelClass}>Depreciation pattern</label>
          <select
            value={form.depreciation_pattern}
            onChange={e => updateField('depreciation_pattern', e.target.value as 'class' | 'custom')}
            className={inputClass}
          >
            <option value="class">Class default</option>
            <option value="custom">Custom %</option>
          </select>
        </div>

        {form.depreciation_pattern === 'custom' && (
          <div className="space-y-1">
            <label className={labelClass}>Custom annual depreciation %</label>
            <input
              inputMode="decimal"
              value={form.annual_depreciation_pct}
              onChange={e => updateField('annual_depreciation_pct', e.target.value)}
              className={inputClass}
              placeholder="12.5"
            />
          </div>
        )}

        <div className="space-y-1">
          <label className={labelClass}>Salvage floor %</label>
          <input
            inputMode="decimal"
            value={form.salvage_floor_pct}
            onChange={e => updateField('salvage_floor_pct', e.target.value)}
            className={inputClass}
            placeholder="10"
          />
        </div>

        <div className="space-y-1">
          <label className={labelClass}>Current mileage (optional)</label>
          <input
            inputMode="numeric"
            value={form.manual_mileage}
            onChange={e => updateField('manual_mileage', e.target.value)}
            className={inputClass}
            placeholder="85000"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className={labelClass}>Purchase price</label>
            <input
              inputMode="decimal"
              value={form.purchase_price}
              onChange={e => updateField('purchase_price', e.target.value)}
              className={inputClass}
              placeholder="18500"
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Purchase date</label>
            <input
              type="date"
              value={form.purchase_date}
              onChange={e => updateField('purchase_date', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {error && <p className="text-danger text-xs">{error}</p>}

        <button
          type="submit"
          className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-full py-2.5 text-sm font-semibold transition-colors"
        >
          {vehicleId ? 'Save changes' : 'Create vehicle'}
        </button>
      </form>
    </BottomSheet>
  )
}
