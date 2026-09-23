import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import VehicleSwitcher from '../components/VehicleSwitcher'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Field, TextInput } from '../components/Form'
import { Loading } from '../components/Feedback'
import ReminderRow from '../components/ReminderRow'
import { getVehicleSummary, patchVehicle } from '../lib/api'
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

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-ink">Reminders</h1>
      </header>

      {isLoading ? (
        <Loading />
      ) : !vehicle ? (
        <p className="py-8 text-center text-sm text-ink-2">No vehicles yet.</p>
      ) : (
        <>
          <VehicleSwitcher vehicles={vehicles} selectedId={selectedId} onSelect={select} />

          {!editing && (
            <div className="mt-3">
              <Button variant="ghost" size="sm" onClick={startEdit} className="-ml-3 text-brand">
                Edit reminders
              </Button>
            </div>
          )}

          {editing ? (
            <Card className="mt-3">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="APK / inspection due" htmlFor="apk_due">
                    <TextInput
                      id="apk_due"
                      type="date"
                      value={form.apk_due}
                      onChange={(e) => setForm({ ...form, apk_due: e.target.value })}
                    />
                  </Field>
                  <Field label="Insurance due" htmlFor="insurance_due">
                    <TextInput
                      id="insurance_due"
                      type="date"
                      value={form.insurance_due}
                      onChange={(e) => setForm({ ...form, insurance_due: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Service interval (km)" htmlFor="service_interval_km">
                    <TextInput
                      id="service_interval_km"
                      type="number"
                      value={form.service_interval_km}
                      onChange={(e) => setForm({ ...form, service_interval_km: e.target.value })}
                    />
                  </Field>
                  <Field label="Service interval (months)" htmlFor="service_interval_months">
                    <TextInput
                      id="service_interval_months"
                      type="number"
                      value={form.service_interval_months}
                      onChange={(e) => setForm({ ...form, service_interval_months: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Last service odometer (km)" htmlFor="last_service_km">
                    <TextInput
                      id="last_service_km"
                      type="number"
                      value={form.last_service_km}
                      onChange={(e) => setForm({ ...form, last_service_km: e.target.value })}
                    />
                  </Field>
                  <Field label="Last service date" htmlFor="last_service_date">
                    <TextInput
                      id="last_service_date"
                      type="date"
                      value={form.last_service_date}
                      onChange={(e) => setForm({ ...form, last_service_date: e.target.value })}
                    />
                  </Field>
                </div>
                {error && <p className="text-[12px] text-loss">{error}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="secondary" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={save} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
            </Card>
          ) : reminders.length === 0 ? (
            <p className="mt-4 text-sm text-ink-2">No reminders configured.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {reminders.map((r) => (
                <ReminderRow key={r.kind} reminder={r} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
