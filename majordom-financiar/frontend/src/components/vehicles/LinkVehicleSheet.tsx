import { useState, type FormEvent } from 'react'
import BottomSheet from '../BottomSheet'
import { ApiError, createVehicle, linkVehicleAccount, type Vehicle } from '../../lib/vehicleValueApi'
import type { AccountListItem } from '../../lib/api'

interface LinkVehicleSheetProps {
  open: boolean
  onClose: () => void
  account: AccountListItem
  unlinkedVehicles: Vehicle[]
  onLinked: () => void
  /**
   * Called when linking a vehicle from `unlinkedVehicles` returns 404 —
   * the list the parent passed in is stale. The parent should refetch it;
   * this sheet stays open so the user can pick again from the refreshed
   * list without closing and reopening.
   */
  onStaleData: () => void
}

interface NewProfileForm {
  name: string
  make: string
  model: string
  year: string
}

const inputClass =
  'bg-token-paper text-token-ink border border-token-line rounded-lg px-3 py-2 text-sm outline-none focus:border-token-brand transition-colors w-full'
const labelClass = 'text-[11px] font-semibold text-token-ink-3 uppercase tracking-wide'

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const n = Number(trimmed)
  return Number.isNaN(n) ? undefined : n
}

export default function LinkVehicleSheet({
  open,
  onClose,
  account,
  unlinkedVehicles,
  onLinked,
  onStaleData,
}: LinkVehicleSheetProps) {
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Tapping an existing profile selects it (and fills the fields below as a
  // read-only preview) instead of linking immediately — the user confirms
  // via the same button the "create new" flow uses, matching this app's
  // general "review before it's written" pattern.
  const [selected, setSelected] = useState<Vehicle | null>(null)
  const [newProfile, setNewProfile] = useState<NewProfileForm>({ name: '', make: '', model: '', year: '' })

  function updateField<K extends keyof NewProfileForm>(key: K, value: NewProfileForm[K]) {
    setNewProfile(prev => ({ ...prev, [key]: value }))
  }

  function selectExisting(vehicle: Vehicle) {
    setError(null)
    setSelected(prev => (prev?.id === vehicle.id ? null : vehicle))
  }

  function clearSelection() {
    setError(null)
    setSelected(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const vehicleId = selected ? selected.id : (await createVehicle({
        name: newProfile.name.trim(),
        make: newProfile.make.trim() || undefined,
        model: newProfile.model.trim() || undefined,
        year: parseOptionalNumber(newProfile.year),
      })).id
      await linkVehicleAccount(vehicleId, account.id)
      onLinked()
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // The vehicle list the parent gave us is stale (e.g. the vehicle was
        // deleted since it loaded) — ask the parent to refetch it, but keep
        // the sheet open so the user can just pick again once it updates.
        setError('That vehicle no longer exists — refreshing the list…')
        setSelected(null)
        onStaleData()
      } else {
        setError(err instanceof Error ? err.message : 'Failed to link vehicle')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Link vehicle">
      <p className="text-token-ink-3 text-xs">
        This account ({account.name}) isn't linked to a vehicle profile yet.
      </p>

      {unlinkedVehicles.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className={labelClass}>Link to an existing profile</p>
          <div className="space-y-1.5">
            {unlinkedVehicles.map(v => {
              const isSelected = selected?.id === v.id
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={submitting}
                  onClick={() => selectExisting(v)}
                  className={`w-full text-left bg-token-paper border rounded-lg px-3 py-2 text-sm text-token-ink transition-colors disabled:opacity-50 ${
                    isSelected ? 'border-token-brand' : 'border-token-line hover:border-token-brand'
                  }`}
                >
                  {[v.make, v.model].filter(Boolean).join(' ') || v.name}
                  {v.year ? ` · ${v.year}` : ''}
                  {isSelected && ' ✓'}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3 pt-3">
        <div className="flex items-center justify-between">
          <p className={labelClass}>
            {selected ? 'Selected profile' : 'Or create a new profile'}
          </p>
          {selected && (
            <button type="button" onClick={clearSelection} className="text-[11px] text-token-ink-3 hover:text-token-ink">
              Create new instead
            </button>
          )}
        </div>
        <div className="space-y-1">
          <label className={labelClass}>Name</label>
          <input
            value={selected ? selected.name : newProfile.name}
            onChange={e => updateField('name', e.target.value)}
            className={inputClass}
            placeholder="e.g. Duster"
            readOnly={Boolean(selected)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className={labelClass}>Make</label>
            <input
              value={selected ? selected.make ?? '' : newProfile.make}
              onChange={e => updateField('make', e.target.value)}
              className={inputClass}
              placeholder="Dacia"
              readOnly={Boolean(selected)}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Model</label>
            <input
              value={selected ? selected.model ?? '' : newProfile.model}
              onChange={e => updateField('model', e.target.value)}
              className={inputClass}
              placeholder="Duster"
              readOnly={Boolean(selected)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className={labelClass}>Year</label>
          <input
            inputMode="numeric"
            value={selected ? selected.year ?? '' : newProfile.year}
            onChange={e => updateField('year', e.target.value)}
            className={inputClass}
            placeholder="2020"
            readOnly={Boolean(selected)}
          />
        </div>

        {error && <p className="text-token-loss text-xs">{error}</p>}

        <button
          type="submit"
          disabled={submitting || (!selected && !newProfile.name.trim())}
          className="w-full bg-token-brand hover:bg-token-brand-2 disabled:opacity-50 text-token-on-brand rounded-full py-2.5 text-sm font-semibold transition-colors"
        >
          {submitting ? (selected ? 'Linking…' : 'Creating…') : selected ? 'Link vehicle' : 'Create & link'}
        </button>
      </form>
    </BottomSheet>
  )
}
