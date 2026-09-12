import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import BottomNav from '../components/BottomNav'
import LogoutButton from '../components/LogoutButton'
import VehicleSwitcher from '../components/VehicleSwitcher'
import { getVehicleSummary, patchVehicle } from '../lib/api'
import { formatNumber } from '../lib/formatCurrency'
import { formatDate } from '../lib/formatDate'
import { reminderHorizon } from '../lib/reminders'
import { useSelectedVehicle } from '../lib/useSelectedVehicle'

export default function RemindersPage() {
  const queryClient = useQueryClient()
  const { vehicles, vehicle, selectedId, select, isLoading } = useSelectedVehicle()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    apk_due: '',
    insurance_due: '',
    service_interval_km: '',
    service_interval_months: '',
    last_service_km: '',
    last_service_date: '',
  })
  const [error, setError] = useState<string | null>(null)

  const summaryQuery = useQuery({
    queryKey: ['vehicle-summary', vehicle?.id],
    queryFn: () => getVehicleSummary(vehicle!.id),
    enabled: !!vehicle,
    staleTime: 60_000,
  })
  const reminders = summaryQuery.data?.reminders ?? []

  function startEdit() {
    if (!vehicle) return
    setForm({
      apk_due: vehicle.apk_due ?? '',
      insurance_due: vehicle.insurance_due ?? '',
      service_interval_km: vehicle.service_interval_km != null ? String(vehicle.service_interval_km) : '',
      service_interval_months:
        vehicle.service_interval_months != null ? String(vehicle.service_interval_months) : '',
      last_service_km: vehicle.last_service_km != null ? String(vehicle.last_service_km) : '',
      last_service_date: vehicle.last_service_date ?? '',
    })
    setError(null)
    setEditing(true)
  }

  async function save() {
    if (!vehicle) return
    setSaving(true)
    setError(null)
    try {
      await patchVehicle(vehicle.id, {
        apk_due: form.apk_due || null,
        insurance_due: form.insurance_due || null,
        service_interval_km: form.service_interval_km ? Number(form.service_interval_km) : null,
        service_interval_months: form.service_interval_months
          ? Number(form.service_interval_months)
          : null,
        last_service_km: form.last_service_km ? Number(form.last_service_km) : null,
        last_service_date: form.last_service_date || null,
      })
      void queryClient.invalidateQueries({ queryKey: ['vehicle-summary', vehicle.id] })
      void queryClient.invalidateQueries({ queryKey: ['vehicle', String(vehicle.id)] })
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const field = (key: keyof typeof form, label: string, type: string) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="px-3 py-2 rounded-lg bg-background border border-border text-white text-sm focus:outline-none focus:border-accent"
      />
    </div>
  )

  return (
    <div className="min-h-dvh bg-background px-4 pt-8 pb-24">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-white text-xl font-semibold">Reminders</h1>
        <LogoutButton />
      </div>

      {isLoading ? (
        <p className="text-muted text-sm text-center py-8">Loading…</p>
      ) : !vehicle ? (
        <p className="text-muted text-sm text-center py-8">No vehicles yet.</p>
      ) : (
        <>
          <VehicleSwitcher vehicles={vehicles} selectedId={selectedId} onSelect={select} />

          {!editing && (
            <button
              onClick={startEdit}
              className="mt-3 text-accent text-sm font-medium hover:opacity-80 transition-opacity"
            >
              Edit reminders
            </button>
          )}

          {editing ? (
            <div className="mt-3 bg-surface border border-border rounded-2xl p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {field('apk_due', 'APK / inspection due', 'date')}
                {field('insurance_due', 'Insurance due', 'date')}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {field('service_interval_km', 'Service interval (km)', 'number')}
                {field('service_interval_months', 'Service interval (months)', 'number')}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {field('last_service_km', 'Last service odometer (km)', 'number')}
                {field('last_service_date', 'Last service date', 'date')}
              </div>
              {error && <p className="text-danger text-xs">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setEditing(false)}
                  className="flex-1 py-2 rounded-lg border border-border text-muted text-sm hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex-1 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-40 transition-colors"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : reminders.length === 0 ? (
            <p className="text-muted text-sm mt-4">No reminders configured.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {reminders.map((r) => {
                const horizon = reminderHorizon(r)
                return (
                  <div key={r.kind} className="bg-surface border border-border rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Bell size={16} className={r.overdue ? 'text-danger' : 'text-accent'} />
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-sm font-medium">{r.label}</p>
                        <p className="text-muted text-xs">
                          {r.due_date
                            ? formatDate(r.due_date)
                            : r.due_odo != null
                            ? `${formatNumber(r.due_odo)} km`
                            : ''}
                        </p>
                      </div>
                      <span className={`text-xs font-medium ${horizon.overdue ? 'text-danger' : 'text-muted'}`}>
                        {horizon.text}
                      </span>
                    </div>
                    {r.progress != null && (
                      <div className="h-1.5 bg-background rounded-full overflow-hidden mt-2.5">
                        <div
                          className={`h-full rounded-full ${r.overdue ? 'bg-danger' : 'bg-accent'}`}
                          style={{ width: `${Math.min(r.progress * 100, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      <BottomNav />
    </div>
  )
}
