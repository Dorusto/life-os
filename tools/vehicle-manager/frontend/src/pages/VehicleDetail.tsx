import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Trash2 } from 'lucide-react'
import Chart from '../components/Chart'
import {
  ApiError,
  getVehicle,
  getValueProjection,
  getValueHistory,
  getConsumptionChart,
  getDistanceChart,
  getCostPerKmChart,
  getMonthlyCostChart,
  getMileageChart,
  getVehicleLog,
  addLogEntry,
  deleteLogEntry,
  type ChartResponse,
  type NewVehicleLogEntry,
} from '../lib/api'
import { formatCurrency, formatPercent, formatNumber } from '../lib/formatCurrency'
import { formatDate } from '../lib/formatDate'

function formatMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return formatCurrency(n)
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <p className="text-[13.5px] text-muted shrink-0">{label}</p>
      <p className="text-[13.5px] font-semibold text-right">{value || '—'}</p>
    </div>
  )
}

/** Renders one Chart from a ChartResponse, or nothing while loading/on error/empty. */
function ChartSection({ data }: { data: ChartResponse | undefined }) {
  if (!data || data.type !== 'chart' || !data.chart_type) return null
  return (
    <Chart
      chart_type={data.chart_type}
      title={data.title ?? ''}
      data={data.data as never}
      refetch={data.refetch as never}
    />
  )
}

const ENTRY_TYPES = ['fuel', 'service', 'other']

function LogEntryForm({ vehicleId, onAdded }: { vehicleId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [entryType, setEntryType] = useState('fuel')
  const [odoKm, setOdoKm] = useState('')
  const [fuelLiters, setFuelLiters] = useState('')
  const [fuelPricePerLiter, setFuelPricePerLiter] = useState('')
  const [fuelFullTank, setFuelFullTank] = useState(true)
  const [fuelMissed, setFuelMissed] = useState(false)
  const [costTotal, setCostTotal] = useState('')
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
        notes: notes || null,
      }
      if (entryType === 'fuel') {
        entry.fuel_liters = fuelLiters ? Number(fuelLiters) : null
        entry.fuel_price_per_liter = fuelPricePerLiter ? Number(fuelPricePerLiter) : null
        entry.fuel_full_tank = fuelFullTank
        entry.fuel_missed = fuelMissed
        entry.cost_total = fuelLiters && fuelPricePerLiter
          ? Number((Number(fuelLiters) * Number(fuelPricePerLiter)).toFixed(2))
          : (costTotal ? Number(costTotal) : null)
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
        + Add log entry
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 bg-surface border border-border rounded-2xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Date</label>
          <input
            type="date" required value={date} onChange={e => setDate(e.target.value)}
            className="px-3 py-2 rounded-lg bg-background border border-border text-white text-sm focus:outline-none focus:border-accent"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Type</label>
          <select
            value={entryType} onChange={e => setEntryType(e.target.value)}
            className="px-3 py-2 rounded-lg bg-background border border-border text-white text-sm focus:outline-none focus:border-accent"
          >
            {ENTRY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Odometer (km)</label>
        <input
          type="number" step="1" value={odoKm} onChange={e => setOdoKm(e.target.value)}
          className="px-3 py-2 rounded-lg bg-background border border-border text-white text-sm focus:outline-none focus:border-accent"
        />
      </div>

      {entryType === 'fuel' ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted">Liters</label>
              <input
                type="number" step="0.01" value={fuelLiters} onChange={e => setFuelLiters(e.target.value)}
                className="px-3 py-2 rounded-lg bg-background border border-border text-white text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted">Price/L</label>
              <input
                type="number" step="0.001" value={fuelPricePerLiter} onChange={e => setFuelPricePerLiter(e.target.value)}
                className="px-3 py-2 rounded-lg bg-background border border-border text-white text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={fuelFullTank} onChange={e => setFuelFullTank(e.target.checked)} />
              Full tank
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={fuelMissed} onChange={e => setFuelMissed(e.target.checked)} />
              Missed fill-up
            </label>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Cost total</label>
          <input
            type="number" step="0.01" value={costTotal} onChange={e => setCostTotal(e.target.value)}
            className="px-3 py-2 rounded-lg bg-background border border-border text-white text-sm focus:outline-none focus:border-accent"
          />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Notes</label>
        <input
          type="text" value={notes} onChange={e => setNotes(e.target.value)}
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

/**
 * Vehicle detail — the standalone app's own version, calling vehicle-manager's
 * id-based REST endpoints directly (not majordom-financiar's name-based chat-
 * tool wrappers). Mirrors majordom-financiar/frontend/src/pages/VehicleDetail.tsx's
 * structure/visual style, plus: distance chart (that page never wired it up),
 * fuel/service log list + entry form, and reminder-field display — none of
 * which exist in that reference page.
 */
export default function VehicleDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const vehicleQuery = useQuery({
    queryKey: ['vehicle', id],
    queryFn: () => getVehicle(id!),
    enabled: !!id,
    staleTime: 120_000,
    // A 404 here means "no vehicle with this id" — a real, permanent answer,
    // not a transient failure. Without this, the app-wide QueryClient default
    // (main.tsx) retries for a while then polls forever.
    retry: false,
    refetchInterval: false,
  })
  const vehicle = vehicleQuery.data

  const projectionQuery = useQuery({
    queryKey: ['vehicle-value-projection', id],
    queryFn: () => getValueProjection(id!),
    enabled: !!vehicle,
    staleTime: 120_000,
    // A 404 here means "this vehicle has no purchase price set" — same
    // permanent-answer reasoning as vehicleQuery above.
    retry: false,
    refetchInterval: false,
  })

  const historyQuery = useQuery({
    queryKey: ['vehicle-value-history', id],
    queryFn: () => getValueHistory(id!),
    enabled: !!vehicle,
    staleTime: 120_000,
  })

  const consumptionQuery = useQuery({
    queryKey: ['vehicle-chart', 'consumption', id],
    queryFn: () => getConsumptionChart(id!),
    enabled: !!vehicle,
    staleTime: 120_000,
  })
  const distanceQuery = useQuery({
    queryKey: ['vehicle-chart', 'distance', id],
    queryFn: () => getDistanceChart(id!),
    enabled: !!vehicle,
    staleTime: 120_000,
  })
  const costPerKmQuery = useQuery({
    queryKey: ['vehicle-chart', 'cost-per-km', id],
    queryFn: () => getCostPerKmChart(id!),
    enabled: !!vehicle,
    staleTime: 120_000,
  })
  const monthlyCostQuery = useQuery({
    queryKey: ['vehicle-chart', 'monthly-cost', id],
    queryFn: () => getMonthlyCostChart(id!),
    enabled: !!vehicle,
    staleTime: 120_000,
  })
  const mileageQuery = useQuery({
    queryKey: ['vehicle-chart', 'mileage', id],
    queryFn: () => getMileageChart(id!),
    enabled: !!vehicle,
    staleTime: 120_000,
  })

  const logQuery = useQuery({
    queryKey: ['vehicle-log', id],
    queryFn: () => getVehicleLog(id!, 20),
    enabled: !!vehicle,
    staleTime: 60_000,
  })

  const [deletingId, setDeletingId] = useState<number | null>(null)

  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: ['vehicle', id] })
    void queryClient.invalidateQueries({ queryKey: ['vehicles'] })
    void queryClient.invalidateQueries({ queryKey: ['vehicle-value-projection', id] })
    void queryClient.invalidateQueries({ queryKey: ['vehicle-value-history', id] })
    void queryClient.invalidateQueries({ queryKey: ['vehicle-chart'] })
    void queryClient.invalidateQueries({ queryKey: ['vehicle-log', id] })
  }

  async function handleDelete(entryId: number) {
    setDeletingId(entryId)
    try {
      await deleteLogEntry(entryId)
      invalidateAll()
    } finally {
      setDeletingId(null)
    }
  }

  if (vehicleQuery.isLoading) {
    return <p className="text-muted text-sm text-center py-16">Loading…</p>
  }

  if (!vehicle) {
    return (
      <div className="min-h-dvh bg-background flex flex-col px-5 pt-14">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 text-muted hover:text-white transition-colors text-sm self-start"
        >
          <ChevronLeft size={16} /> Vehicles
        </button>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 pb-24">
          <p className="text-white text-xl font-bold">Vehicle not found</p>
          <button
            onClick={() => navigate('/')}
            className="text-accent text-sm font-medium hover:opacity-80 transition-opacity"
          >
            Back to vehicles
          </button>
        </div>
      </div>
    )
  }

  const projection = projectionQuery.data
  const projection404 =
    projectionQuery.isError &&
    projectionQuery.error instanceof ApiError &&
    projectionQuery.error.status === 404

  const history = historyQuery.data ?? []
  const log = logQuery.data ?? []

  const currentValue = vehicle.current_value ?? 0
  const purchasePrice = vehicle.purchase_price
  const purchaseDate = vehicle.purchase_date
  const delta = purchasePrice != null ? currentValue - purchasePrice : null
  const deltaPct =
    purchasePrice != null && purchasePrice !== 0 ? (delta! / purchasePrice) * 100 : null

  const curveLast = projection?.curve?.length ? projection.curve[projection.curve.length - 1] : undefined
  const projectionYears = projection?.curve ? projection.curve.length - 1 : 0

  const salvageFloorAmount =
    projection?.salvage_floor ??
    (purchasePrice != null ? purchasePrice * (vehicle.salvage_floor_pct / 100) : null)

  const mileage = vehicle.last_odo ?? vehicle.manual_mileage

  const depreciationModel = vehicle.annual_depreciation_pct
    ? `Custom (${formatPercent(vehicle.annual_depreciation_pct)}/yr)`
    : 'Class default'

  return (
    <div className="h-dvh bg-background flex flex-col overflow-y-auto">
      <header className="flex-shrink-0 px-5 pb-3 pt-14">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 text-muted hover:text-white transition-colors text-sm mb-3"
        >
          <ChevronLeft size={16} /> Vehicles
        </button>
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Vehicle</p>
        <h1 className="text-3xl font-bold text-white truncate">{vehicle.name}</h1>
      </header>

      <section className="px-5 pt-2 pb-24">
        {projection404 ? (
          <div className="mt-4 bg-surface border border-border rounded-2xl p-4">
            <p className="text-muted text-sm">This vehicle has no purchase price set — value tracking is unavailable.</p>
          </div>
        ) : (
          projection && (
            <>
              <p className="font-mono text-[11px] uppercase tracking-wide text-muted mt-4">Current value</p>
              <p className="font-mono font-medium text-3xl mt-1 tabular-nums">{formatMoney(currentValue)}</p>
              {purchasePrice != null && delta != null && deltaPct != null && (
                <p className="text-xs text-muted mt-1">
                  {delta >= 0 ? '+' : ''}{formatMoney(delta)} ({formatPercent(deltaPct)}) since acquired {formatDate(purchaseDate)}
                </p>
              )}

              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="bg-surface border border-border rounded-2xl p-3">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Purchase price</p>
                  <p className="font-mono text-sm font-semibold mt-1">{purchasePrice != null ? formatMoney(purchasePrice) : '—'}</p>
                  {purchaseDate && <p className="text-[10px] text-muted mt-0.5">{formatDate(purchaseDate)}</p>}
                </div>
                <div className="bg-surface border border-border rounded-2xl p-3">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Depreciation</p>
                  <p className="font-mono text-sm font-semibold mt-1">
                    {purchasePrice != null ? formatMoney(purchasePrice - currentValue) : '—'}
                  </p>
                </div>
                <div className="bg-surface border border-border rounded-2xl p-3">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Projected in {projectionYears}y</p>
                  <p className="font-mono text-sm font-semibold mt-1">{curveLast ? formatMoney(curveLast.value) : '—'}</p>
                </div>
              </div>

              {projection.curve.length > 0 && (
                <div className="mt-6">
                  <Chart
                    chart_type="line"
                    title="Value over time"
                    data={{
                      series: [
                        { label: 'Estimated value', color: '#818CF8', points: projection.curve.map(p => ({ x: p.date, y: p.value })) },
                        { label: 'Salvage floor', color: '#71717A', points: [
                          { x: projection.curve[0].date, y: projection.salvage_floor },
                          { x: projection.curve[projection.curve.length - 1].date, y: projection.salvage_floor },
                        ] },
                      ],
                    } as never}
                  />
                </div>
              )}
            </>
          )
        )}

        <div className="mt-4 bg-surface border border-border rounded-2xl px-4 py-3 space-y-2.5">
          <InfoRow label="Class" value={vehicle.vehicle_class || '—'} />
          <InfoRow label="Year" value={vehicle.year ? String(vehicle.year) : '—'} />
          <InfoRow label="Mileage" value={mileage ? `${formatNumber(mileage)} km` : '—'} />
          <InfoRow label="Depreciation model" value={depreciationModel} />
          <InfoRow
            label="Salvage floor"
            value={salvageFloorAmount != null ? `${formatPercent(vehicle.salvage_floor_pct ?? 0)} ≈ ${formatMoney(salvageFloorAmount)}` : '—'}
          />
        </div>

        <h3 className="mt-6 mb-2 text-xs text-muted uppercase tracking-wide">Reminders</h3>
        <div className="bg-surface border border-border rounded-2xl px-4 py-3 space-y-2.5">
          <InfoRow label="APK / inspection due" value={formatDate(vehicle.apk_due)} />
          <InfoRow label="Insurance due" value={formatDate(vehicle.insurance_due)} />
          <InfoRow
            label="Service interval"
            value={
              vehicle.service_interval_km || vehicle.service_interval_months
                ? [
                    vehicle.service_interval_km ? `${formatNumber(vehicle.service_interval_km)} km` : null,
                    vehicle.service_interval_months ? `${vehicle.service_interval_months} months` : null,
                  ].filter(Boolean).join(' / ')
                : '—'
            }
          />
        </div>

        <h3 className="mt-6 mb-2 text-xs text-muted uppercase tracking-wide">Override history</h3>
        {history.length === 0 ? (
          <p className="text-muted text-sm">No overrides yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map(entry => (
              <div key={entry.id} className="bg-surface border border-border rounded-xl px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-sm font-semibold">{formatMoney(entry.value)}</p>
                  <span className="text-xs text-muted">{formatDate(entry.date)}</span>
                </div>
                {entry.note && <p className="text-xs text-muted mt-1">{entry.note}</p>}
              </div>
            ))}
          </div>
        )}

        <h3 className="mt-6 mb-3 text-xs text-muted uppercase tracking-wide">Fuel & Costs</h3>
        <div className="space-y-4">
          <ChartSection data={consumptionQuery.data} />
          <ChartSection data={distanceQuery.data} />
          <ChartSection data={costPerKmQuery.data} />
          <ChartSection data={monthlyCostQuery.data} />
          <ChartSection data={mileageQuery.data} />
        </div>

        <h3 className="mt-6 mb-3 text-xs text-muted uppercase tracking-wide">Log</h3>
        {log.length === 0 ? (
          <p className="text-muted text-sm">No log entries yet.</p>
        ) : (
          <div className="space-y-2">
            {log.map(entry => (
              <div key={entry.id} className="bg-surface border border-border rounded-xl px-3 py-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wide text-muted-2">{entry.entry_type}</span>
                    <span className="text-xs text-muted">{formatDate(entry.date)}</span>
                  </div>
                  {entry.entry_type === 'fuel' ? (
                    <p className="text-sm mt-0.5">
                      {entry.fuel_liters != null ? `${entry.fuel_liters} L` : ''}
                      {entry.cost_total != null ? ` · ${formatMoney(entry.cost_total)}` : ''}
                    </p>
                  ) : (
                    <p className="text-sm mt-0.5">
                      {entry.cost_total != null ? formatMoney(entry.cost_total) : ''}
                      {entry.notes ? ` · ${entry.notes}` : ''}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(entry.id)}
                  disabled={deletingId === entry.id}
                  className="text-muted hover:text-danger transition-colors shrink-0 p-1 disabled:opacity-40"
                  aria-label="Delete entry"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <LogEntryForm vehicleId={id!} onAdded={invalidateAll} />
      </section>
    </div>
  )
}
