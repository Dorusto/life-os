import { useState, type FormEvent } from 'react'
import BottomSheet from '../BottomSheet'
import { createVehicle, linkVehicleAccount, type Vehicle } from '../../lib/vehicleValueApi'
import type { AccountListItem } from '../../lib/api'

interface LinkVehicleSheetProps {
  open: boolean
  onClose: () => void
  account: AccountListItem
  unlinkedVehicles: Vehicle[]
  onLinked: () => void
}

interface NewProfileForm {
  name: string
  make: string
  model: string
  year: string
}

const inputClass =
  'bg-background text-white border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors w-full'
const labelClass = 'text-[11px] font-semibold text-muted uppercase tracking-wide'

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
}: LinkVehicleSheetProps) {
  const [error, setError] = useState<string | null>(null)
  const [linkingId, setLinkingId] = useState<number | null>(null)
  const [newProfile, setNewProfile] = useState<NewProfileForm>({ name: '', make: '', model: '', year: '' })
  const [creating, setCreating] = useState(false)

  function updateField<K extends keyof NewProfileForm>(key: K, value: NewProfileForm[K]) {
    setNewProfile(prev => ({ ...prev, [key]: value }))
  }

  async function handleLinkExisting(vehicleId: number) {
    setError(null)
    setLinkingId(vehicleId)
    try {
      await linkVehicleAccount(vehicleId, account.id)
      onLinked()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link vehicle')
    } finally {
      setLinkingId(null)
    }
  }

  async function handleCreateAndLink(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setCreating(true)
    try {
      const created = await createVehicle({
        name: newProfile.name.trim(),
        make: newProfile.make.trim() || undefined,
        model: newProfile.model.trim() || undefined,
        year: parseOptionalNumber(newProfile.year),
      })
      await linkVehicleAccount(created.id, account.id)
      onLinked()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create and link vehicle')
    } finally {
      setCreating(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Link vehicle">
      <p className="text-muted text-xs">
        This account ({account.name}) isn't linked to a vehicle profile yet.
      </p>

      {unlinkedVehicles.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className={labelClass}>Link to an existing profile</p>
          <div className="space-y-1.5">
            {unlinkedVehicles.map(v => (
              <button
                key={v.id}
                type="button"
                disabled={linkingId !== null}
                onClick={() => handleLinkExisting(v.id)}
                className="w-full text-left bg-background border border-border rounded-lg px-3 py-2 text-sm text-white hover:border-accent transition-colors disabled:opacity-50"
              >
                {[v.make, v.model].filter(Boolean).join(' ') || v.name}
                {v.year ? ` · ${v.year}` : ''}
                {linkingId === v.id && ' — linking…'}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleCreateAndLink} className="space-y-3 pt-3">
        <p className={labelClass}>Or create a new profile</p>
        <div className="space-y-1">
          <label className={labelClass}>Name</label>
          <input
            value={newProfile.name}
            onChange={e => updateField('name', e.target.value)}
            className={inputClass}
            placeholder="e.g. Duster"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className={labelClass}>Make</label>
            <input
              value={newProfile.make}
              onChange={e => updateField('make', e.target.value)}
              className={inputClass}
              placeholder="Dacia"
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Model</label>
            <input
              value={newProfile.model}
              onChange={e => updateField('model', e.target.value)}
              className={inputClass}
              placeholder="Duster"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className={labelClass}>Year</label>
          <input
            inputMode="numeric"
            value={newProfile.year}
            onChange={e => updateField('year', e.target.value)}
            className={inputClass}
            placeholder="2020"
          />
        </div>

        {error && <p className="text-danger text-xs">{error}</p>}

        <button
          type="submit"
          disabled={creating || !newProfile.name.trim()}
          className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-full py-2.5 text-sm font-semibold transition-colors"
        >
          {creating ? 'Creating…' : 'Create & link'}
        </button>
      </form>
    </BottomSheet>
  )
}
