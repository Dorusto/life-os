import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import Chart from '../components/Chart'
import {
  ApiError,
  getVehicle,
  getValueProjection,
  getValueHistory,
  getConsumptionChart,
  getCostPerKmChart,
  getMonthlyCostChart,
  getMileageChart,
  type ValueHistoryEntry,
} from '../lib/vehicleValueApi'
import EditVehicleModal from '../components/vehicles/EditVehicleModal'
import OverrideValueModal from '../components/vehicles/OverrideValueModal'

function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return `€${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
 * Vehicle drill-down (#208) — vehicle-manager record. Uses the new vehicle
 * value/projection API and the existing generic line <Chart> component.
 */
export default function VehicleDetail() {
  const { vehicleId } = useParams<{ vehicleId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [editOpen, setEditOpen] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)

  const vehicleQuery = useQuery({
    queryKey: ['vehicle', vehicleId],
    queryFn: () => getVehicle(vehicleId!),
    enabled: !!vehicleId,
    staleTime: 120_000,
  })

  const vehicle = vehicleQuery.data

  const projectionQuery = useQuery({
    queryKey: ['vehicle-value-projection', vehicleId],
    queryFn: () => getValueProjection(vehicleId!),
    enabled: !!vehicle,
    staleTime: 120_000,
    // A 404 here means "this vehicle has no purchase price set" — a real,
    // permanent answer, not a transient failure. The app-wide QueryClient
    // default (main.tsx) retries every error for 15s and then polls every
    // 5s forever assuming the backend is still coming up — wrong for this
    // query specifically, so both are disabled here.
    retry: false,
    refetchInterval: false,
  })

  const historyQuery = useQuery({
    queryKey: ['vehicle-value-history', vehicleId],
    queryFn: () => getValueHistory(vehicleId!),
    enabled: !!vehicle,
    staleTime: 120_000,
  })

  const consumptionQuery = useQuery({
    queryKey: ['vehicle-chart', 'consumption', vehicle?.name],
    queryFn: () => getConsumptionChart(vehicle!.name),
    enabled: !!vehicle?.name,
    staleTime: 120_000,
  })

  const costPerKmQuery = useQuery({
    queryKey: ['vehicle-chart', 'cost-per-km', vehicle?.name],
    queryFn: () => getCostPerKmChart(vehicle!.name),
    enabled: !!vehicle?.name,
    staleTime: 120_000,
  })

  const monthlyCostQuery = useQuery({
    queryKey: ['vehicle-chart', 'monthly-cost', vehicle?.name],
    queryFn: () => getMonthlyCostChart(vehicle!.name),
    enabled: !!vehicle?.name,
    staleTime: 120_000,
  })

  const mileageQuery = useQuery({
    queryKey: ['vehicle-chart', 'mileage', vehicle?.name],
    queryFn: () => getMileageChart(vehicle!.name),
    enabled: !!vehicle?.name,
    staleTime: 120_000,
  })

  if (vehicleQuery.isLoading) {
    return <div className="min-h-dvh bg-background" />
  }

  if (!vehicle) {
    return (
      <div className="min-h-dvh bg-background flex flex-col px-5 pt-14">
        <button
          onClick={() => navigate('/accounts')}
          className="flex items-center gap-1 text-muted hover:text-white transition-colors text-sm self-start"
        >
          <ChevronLeft size={16} /> Accounts
        </button>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 pb-24">
          <p className="font-display text-xl font-bold text-white">Vehicle not found</p>
          <button
            onClick={() => navigate('/accounts')}
            className="text-accent text-sm font-medium hover:opacity-80 transition-opacity"
          >
            Back to accounts
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

  const history: ValueHistoryEntry[] = historyQuery.data ?? []

  const currentValue = vehicle.current_value ?? 0
  const purchasePrice = vehicle.purchase_price
  const purchaseDate = vehicle.purchase_date
  const delta = purchasePrice != null ? currentValue - purchasePrice : null
  const deltaPct =
    purchasePrice != null && purchasePrice !== 0 ? (delta! / purchasePrice) * 100 : null
  const totalDepreciation = purchasePrice != null ? purchasePrice - currentValue : null
  const totalDepreciationPct =
    purchasePrice != null && purchasePrice !== 0
      ? ((totalDepreciation ?? 0) / purchasePrice) * 100
      : null

  const curveLast = projection?.curve?.length ? projection.curve[projection.curve.length - 1] : undefined
  const projectionYears = projection?.curve ? projection.curve.length - 1 : 0
  const additionalDeclinePct =
    curveLast && currentValue !== 0
      ? ((currentValue - curveLast.value) / currentValue) * 100
      : null

  const salvageFloorAmount =
    projection?.salvage_floor ??
    (purchasePrice != null ? purchasePrice * (vehicle.salvage_floor_pct / 100) : null)

  const mileage = vehicle.last_odo ?? vehicle.manual_mileage

  const depreciationModel = vehicle.annual_depreciation_pct
    ? `Custom (${vehicle.annual_depreciation_pct}%/yr)`
    : 'Class default'

  function handleSaved() {
    void queryClient.invalidateQueries({ queryKey: ['vehicle', vehicleId] })
    void queryClient.invalidateQueries({ queryKey: ['vehicle-list'] })
    void queryClient.invalidateQueries({ queryKey: ['account-list'] })
    void queryClient.invalidateQueries({ queryKey: ['vehicle-value-projection', vehicleId] })
    void queryClient.invalidateQueries({ queryKey: ['vehicle-value-history', vehicleId] })
    void queryClient.invalidateQueries({ queryKey: ['vehicle-chart'] })
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col overflow-y-auto">
      <header className="flex-shrink-0 px-5 pb-3 pt-14">
        <button
          onClick={() => navigate('/accounts')}
          className="flex items-center gap-1 text-muted hover:text-white transition-colors text-sm mb-3"
        >
          <ChevronLeft size={16} /> Accounts
        </button>

        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-wide text-muted">
              Vehicle value
            </p>
            <h1 className="font-display text-3xl font-bold text-white truncate">{vehicle.name}</h1>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setOverrideOpen(true)}
              className="text-accent text-[12px] font-semibold hover:opacity-80 transition-opacity"
            >
              Override value
            </button>
            <button
              onClick={() => setEditOpen(true)}
              className="text-accent text-[12px] font-semibold hover:opacity-80 transition-opacity"
            >
              Edit
            </button>
          </div>
        </div>
      </header>

      <section className="px-5 pt-2 pb-24">
        {projection404 ? (
          <div className="mt-4 bg-surface border border-border rounded-2xl p-4">
            <p className="text-muted text-sm">
              Add a purchase price to track this vehicle's value
            </p>
            <button
              onClick={() => setEditOpen(true)}
              className="mt-3 text-accent text-sm font-semibold hover:opacity-80 transition-opacity"
            >
              Add purchase price
            </button>
          </div>
        ) : (
          projection && (
            <>
              <p className="font-mono text-[11px] uppercase tracking-wide text-muted mt-4">
                Current value
              </p>
              <p className="font-mono font-medium text-3xl mt-1 tabular-nums">
                {formatMoney(currentValue)}
              </p>
              {purchasePrice != null && delta != null && deltaPct != null && (
                <p className="text-xs text-muted mt-1">
                  {delta >= 0 ? '+' : ''}
                  {formatMoney(delta)} ({deltaPct.toFixed(1)}%) since acquired {formatDate(purchaseDate)}
                </p>
              )}

              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="bg-surface border border-border rounded-2xl p-3">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Purchase price</p>
                  <p className="font-mono text-sm font-semibold mt-1">
                    {purchasePrice != null ? formatMoney(purchasePrice) : '—'}
                  </p>
                  {purchaseDate && (
                    <p className="text-[10px] text-muted mt-0.5">{formatDate(purchaseDate)}</p>
                  )}
                </div>
                <div className="bg-surface border border-border rounded-2xl p-3">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Depreciation</p>
                  <p className="font-mono text-sm font-semibold mt-1">
                    {totalDepreciation != null ? formatMoney(totalDepreciation) : '—'}
                  </p>
                  {totalDepreciationPct != null && (
                    <p className="text-[10px] text-muted mt-0.5">
                      {totalDepreciationPct.toFixed(1)}%
                    </p>
                  )}
                </div>
                <div className="bg-surface border border-border rounded-2xl p-3">
                  <p className="text-[10px] text-muted uppercase tracking-wide">
                    Projected in {projectionYears} years
                  </p>
                  <p className="font-mono text-sm font-semibold mt-1">
                    {curveLast ? formatMoney(curveLast.value) : '—'}
                  </p>
                  {additionalDeclinePct != null && (
                    <p className="text-[10px] text-muted mt-0.5">
                      {Math.abs(additionalDeclinePct).toFixed(0)}% additional decline
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6">
                <Chart
                  chart_type="line"
                  title="Value over time"
                  data={{
                    series: [
                      {
                        label: 'Estimated value',
                        color: '#818CF8',
                        points: projection.curve.map(p => ({ x: p.date, y: p.value })),
                      },
                      {
                        label: 'Salvage floor',
                        color: '#71717A',
                        points: [
                          { x: projection.curve[0].date, y: projection.salvage_floor },
                          {
                            x: projection.curve[projection.curve.length - 1].date,
                            y: projection.salvage_floor,
                          },
                        ],
                      },
                    ],
                  }}
                />
              </div>
            </>
          )
        )}

        <div className="mt-4 bg-surface border border-border rounded-2xl px-4 py-3 space-y-2.5">
          <InfoRow label="Class" value={vehicle.vehicle_class || '—'} />
          <InfoRow label="Year" value={vehicle.year ? String(vehicle.year) : '—'} />
          <InfoRow
            label="Mileage"
            value={mileage ? `${mileage.toLocaleString('nl-NL')} km` : '—'}
          />
          <InfoRow label="Depreciation model" value={depreciationModel} />
          <InfoRow
            label="Salvage floor"
            value={`${vehicle.salvage_floor_pct}% ≈ ${formatMoney(salvageFloorAmount)}`}
          />
        </div>

        <h3 className="mt-6 mb-2 text-xs text-muted uppercase tracking-wide">
          Override history
        </h3>
        {history.length === 0 ? (
          <p className="text-muted text-sm">No overrides yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map(entry => (
              <div
                key={entry.id}
                className="bg-surface border border-border rounded-xl px-3 py-2.5"
              >
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
          {consumptionQuery.data && (
            <Chart
              chart_type="line"
              title={consumptionQuery.data.title}
              data={consumptionQuery.data.data}
              refetch={consumptionQuery.data.refetch}
            />
          )}
          {costPerKmQuery.data && (
            <Chart
              chart_type="line"
              title={costPerKmQuery.data.title}
              data={costPerKmQuery.data.data}
              refetch={costPerKmQuery.data.refetch}
            />
          )}
          {mileageQuery.data && (
            <Chart
              chart_type="line"
              title={mileageQuery.data.title}
              data={mileageQuery.data.data}
              refetch={mileageQuery.data.refetch}
            />
          )}
          {monthlyCostQuery.data && (
            <Chart
              chart_type="line"
              title={monthlyCostQuery.data.title}
              data={monthlyCostQuery.data.data}
              refetch={monthlyCostQuery.data.refetch}
            />
          )}
        </div>
      </section>

      <EditVehicleModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        vehicleId={Number(vehicleId)}
        initialData={vehicle}
        onSaved={() => handleSaved()}
      />
      <OverrideValueModal
        open={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        vehicleId={Number(vehicleId)}
        currentValue={currentValue}
        onSaved={handleSaved}
      />
    </div>
  )
}
