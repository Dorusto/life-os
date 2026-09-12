import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Trash2 } from 'lucide-react'
import Chart from '../components/Chart'
import ChartSection from '../components/ChartSection'
import LogEntryForm from '../components/LogEntryForm'
import LogoutButton from '../components/LogoutButton'
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
  deleteLogEntry,
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

/**
 * Vehicle detail — the standalone app's own version, calling vehicle-manager's
 * id-based REST endpoints directly (not majordom-financiar's name-based chat-
 * tool wrappers). Value/projection, reminders, all charts, and the fuel/expense
 * log, with the shared add-entry form (Fuelio-style cost categories).
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
    void queryClient.invalidateQueries({ queryKey: ['vehicle-summary', id] })
    void queryClient.invalidateQueries({ queryKey: ['vehicle-stats-detail', id] })
    void queryClient.invalidateQueries({ queryKey: ['vehicle-cost-categories', id] })
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
          onClick={() => navigate('/vehicles')}
          className="flex items-center gap-1 text-muted hover:text-white transition-colors text-sm self-start"
        >
          <ChevronLeft size={16} /> Vehicles
        </button>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 pb-24">
          <p className="text-white text-xl font-bold">Vehicle not found</p>
          <button
            onClick={() => navigate('/vehicles')}
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
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => navigate('/vehicles')}
            className="flex items-center gap-1 text-muted hover:text-white transition-colors text-sm"
          >
            <ChevronLeft size={16} /> Vehicles
          </button>
          <LogoutButton />
        </div>
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
