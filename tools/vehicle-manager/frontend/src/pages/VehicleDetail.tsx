import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Trash2 } from 'lucide-react'
import Chart from '../components/Chart'
import ChartSection from '../components/ChartSection'
import LogEntryForm from '../components/LogEntryForm'
import LogoutButton from '../components/LogoutButton'
import NotificationBell from '../components/NotificationBell'
import SettingsButton from '../components/SettingsButton'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Delta } from '../components/Delta'
import { Field, TextInput } from '../components/Form'
import { Loading } from '../components/Feedback'
import { MetricTile } from '../components/MetricTile'
import { TypePill } from '../components/Pill'
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
  patchVehicle,
} from '../lib/api'
import { formatCurrency, formatPercent, formatNumber } from '../lib/formatCurrency'
import { formatDate } from '../lib/formatDate'

function formatMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return formatCurrency(n)
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line py-2 last:border-0">
      <p className="shrink-0 text-[13px] text-ink-2">{label}</p>
      <p className="text-right text-[13px] font-medium text-ink">{value || '—'}</p>
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
  const [purchasePriceInput, setPurchasePriceInput] = useState('')
  const [purchaseDateInput, setPurchaseDateInput] = useState('')
  const [savingPurchase, setSavingPurchase] = useState(false)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)

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

  async function handleSavePurchasePrice() {
    if (!vehicle) return
    setSavingPurchase(true)
    setPurchaseError(null)
    try {
      await patchVehicle(vehicle.id, {
        purchase_price: purchasePriceInput ? Number(purchasePriceInput) : null,
        purchase_date: purchaseDateInput || null,
      })
      // Invalidate rather than refetch: the projection query is `retry: false`
      // because its 404 answer is permanent, so it won't pick this up on its own.
      void queryClient.invalidateQueries({ queryKey: ['vehicle', id] })
      void queryClient.invalidateQueries({ queryKey: ['vehicle-value-projection', id] })
    } catch (err) {
      setPurchaseError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSavingPurchase(false)
    }
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
    return <Loading />
  }

  if (!vehicle) {
    return (
      <div className="flex min-h-dvh flex-col bg-paper px-5 pt-14">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/vehicles')}
          className="-ml-3 self-start"
        >
          <ChevronLeft size={16} /> Vehicles
        </Button>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 pb-24">
          <p className="text-xl font-semibold text-ink">Vehicle not found</p>
          <Button variant="secondary" size="sm" onClick={() => navigate('/vehicles')}>
            Back to vehicles
          </Button>
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
    <div className="flex h-dvh flex-col overflow-y-auto bg-paper">
      <header className="flex-shrink-0 px-5 pb-3 pt-14">
        <div className="mb-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate('/vehicles')} className="-ml-3">
            <ChevronLeft size={16} /> Vehicles
          </Button>
          <div className="flex items-center gap-3">
            <NotificationBell vehicleId={vehicle.id} />
            <SettingsButton />
            <LogoutButton />
          </div>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-wide text-ink-3">Vehicle</p>
        <h1 className="truncate text-2xl font-semibold text-ink">{vehicle.name}</h1>
      </header>

      <section className="px-5 pt-2 pb-24">
        {projection404 ? (
          <Card className="mt-4">
            <p className="text-sm text-ink-2">
              This vehicle has no purchase price set — value tracking is unavailable.
            </p>
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Purchase price" htmlFor="purchase_price">
                  <TextInput
                    id="purchase_price"
                    type="number"
                    value={purchasePriceInput}
                    onChange={(e) => setPurchasePriceInput(e.target.value)}
                  />
                </Field>
                <Field label="Purchase date" htmlFor="purchase_date">
                  <TextInput
                    id="purchase_date"
                    type="date"
                    value={purchaseDateInput}
                    onChange={(e) => setPurchaseDateInput(e.target.value)}
                  />
                </Field>
              </div>
              {purchaseError && <p className="text-[12px] text-loss">{purchaseError}</p>}
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  onClick={handleSavePurchasePrice}
                  disabled={savingPurchase || !purchasePriceInput || !purchaseDateInput}
                >
                  {savingPurchase ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          projection && (
            <Card className="mt-4">
              <MetricTile
                label="Current value"
                value={formatMoney(currentValue)}
                emphasis
                hint={
                  purchasePrice != null && delta != null && deltaPct != null ? (
                    <span className="inline-flex flex-wrap items-center gap-1">
                      <Delta value={deltaPct / 100} eur={delta} />
                      <span>since acquired {formatDate(purchaseDate)}</span>
                    </span>
                  ) : undefined
                }
              />

              <div className="mt-4 grid grid-cols-3 gap-3">
                <MetricTile
                  label="Purchase price"
                  value={purchasePrice != null ? formatMoney(purchasePrice) : '—'}
                  hint={purchaseDate ? formatDate(purchaseDate) : undefined}
                />
                <MetricTile
                  label="Depreciation"
                  value={purchasePrice != null ? formatMoney(purchasePrice - currentValue) : '—'}
                />
                <MetricTile
                  label={`Projected in ${projectionYears}y`}
                  value={curveLast ? formatMoney(curveLast.value) : '—'}
                />
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
            </Card>
          )
        )}

        <Card className="mt-4">
          <InfoRow label="Class" value={vehicle.vehicle_class || '—'} />
          <InfoRow label="Year" value={vehicle.year ? String(vehicle.year) : '—'} />
          <InfoRow label="Mileage" value={mileage ? `${formatNumber(mileage)} km` : '—'} />
          <InfoRow label="Depreciation model" value={depreciationModel} />
          <InfoRow
            label="Salvage floor"
            value={salvageFloorAmount != null ? `${formatPercent(vehicle.salvage_floor_pct ?? 0)} ≈ ${formatMoney(salvageFloorAmount)}` : '—'}
          />
        </Card>

        <h3 className="mb-2 mt-6 text-xs uppercase tracking-wide text-ink-2">Reminders</h3>
        <Card>
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
        </Card>

        <Card title="Override history" className="mt-6">
          {history.length === 0 ? (
            <p className="text-sm text-ink-2">No overrides yet.</p>
          ) : (
            <div>
              {history.map(entry => (
                <div key={entry.id} className="border-b border-line py-2.5 first:pt-0 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-sm font-medium text-ink tnum">{formatMoney(entry.value)}</p>
                    <span className="text-xs text-ink-3">{formatDate(entry.date)}</span>
                  </div>
                  {entry.note && <p className="mt-1 text-xs text-ink-2">{entry.note}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>

        <h3 className="mb-3 mt-6 text-xs uppercase tracking-wide text-ink-2">Fuel & Costs</h3>
        <div className="space-y-4">
          <ChartSection data={consumptionQuery.data} />
          <ChartSection data={distanceQuery.data} />
          <ChartSection data={costPerKmQuery.data} />
          <ChartSection data={monthlyCostQuery.data} />
          <ChartSection data={mileageQuery.data} />
        </div>

        <h3 className="mb-3 mt-6 text-xs uppercase tracking-wide text-ink-2">Log</h3>
        {log.length === 0 ? (
          <p className="text-sm text-ink-2">No log entries yet.</p>
        ) : (
          <div className="space-y-2">
            {log.map(entry => (
              <div
                key={entry.id}
                className="flex items-start justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <TypePill type={entry.entry_type} />
                    <span className="text-xs text-ink-3">{formatDate(entry.date)}</span>
                  </div>
                  {entry.entry_type === 'fuel' ? (
                    <p className="mt-1 text-sm text-ink tnum">
                      {entry.fuel_liters != null ? `${entry.fuel_liters} L` : ''}
                      {entry.cost_total != null ? ` · ${formatMoney(entry.cost_total)}` : ''}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-ink">
                      {entry.cost_total != null ? formatMoney(entry.cost_total) : ''}
                      {entry.notes ? ` · ${entry.notes}` : ''}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(entry.id)}
                  disabled={deletingId === entry.id}
                  className="shrink-0 rounded p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-loss disabled:opacity-40"
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
