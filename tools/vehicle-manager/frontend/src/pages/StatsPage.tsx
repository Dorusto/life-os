import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import ChartSection from '../components/ChartSection'
import VehicleSwitcher from '../components/VehicleSwitcher'
import { Card } from '../components/Card'
import { Loading } from '../components/Feedback'
import { MetricTile } from '../components/MetricTile'
import { Segmented } from '../components/Segmented'
import { getCostCategories, getVehicleStatsDetail } from '../lib/api'
import { formatCurrency, formatNumber } from '../lib/formatCurrency'
import { useSelectedVehicle } from '../lib/useSelectedVehicle'

type Tab = 'fillups' | 'costs' | 'distance'

const TABS: { id: Tab; label: string }[] = [
  { id: 'fillups', label: 'Fill-ups' },
  { id: 'costs', label: 'Costs' },
  { id: 'distance', label: 'Distance' },
]

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-1.5 last:border-0">
      <span className="text-sm text-ink-2">{label}</span>
      <span className="font-mono text-sm font-medium text-ink tnum">{value}</span>
    </div>
  )
}

export default function StatsPage() {
  const { vehicles, vehicle, selectedId, select, isLoading } = useSelectedVehicle()
  const [tab, setTab] = useState<Tab>('costs')
  const [includeFuel, setIncludeFuel] = useState(true)

  const detailQuery = useQuery({
    queryKey: ['vehicle-stats-detail', vehicle?.id, ''],
    queryFn: () => getVehicleStatsDetail(vehicle!.id),
    enabled: !!vehicle,
    staleTime: 60_000,
  })
  const categoriesQuery = useQuery({
    queryKey: ['vehicle-cost-categories', vehicle?.id, includeFuel],
    queryFn: () => getCostCategories(vehicle!.id, includeFuel),
    enabled: !!vehicle,
    staleTime: 60_000,
  })

  const d = detailQuery.data
  const money = (n: number | null | undefined) => (n != null ? formatCurrency(n) : '—')
  const num = (n: number | null | undefined, dec: 0 | 1 | 2 = 0) =>
    n != null ? formatNumber(n, dec) : '—'

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-ink">Statistics</h1>
      </header>

      {isLoading ? (
        <Loading />
      ) : !vehicle ? (
        <p className="py-8 text-center text-sm text-ink-2">No vehicles yet.</p>
      ) : (
        <>
          <VehicleSwitcher vehicles={vehicles} selectedId={selectedId} onSelect={select} />

          <Segmented
            className="mt-4"
            options={TABS.map((t) => ({ value: t.id, label: t.label }))}
            value={tab}
            onChange={setTab}
          />

          {!d ? (
            <p className="py-8 text-center text-sm text-ink-2">No statistics yet.</p>
          ) : tab === 'costs' ? (
            <Card className="mt-3">
              <MetricTile label="Total costs" value={money(d.costs.total)} emphasis />
              <div className="mt-2">
                <Row label="This year" value={money(d.costs.this_year)} />
                <Row label="This month" value={money(d.costs.this_month)} />
                <Row label="Previous year" value={money(d.costs.prev_year)} />
                <Row label="Previous month" value={money(d.costs.prev_month)} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-surface-2 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-ink-3">Lowest bill</p>
                  <p className="mt-0.5 font-mono text-sm text-gain tnum">{money(d.bills.lowest)}</p>
                </div>
                <div className="rounded-lg bg-surface-2 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-ink-3">Highest bill</p>
                  <p className="mt-0.5 font-mono text-sm text-loss tnum">{money(d.bills.highest)}</p>
                </div>
                <div className="rounded-lg bg-surface-2 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-ink-3">Best price/L</p>
                  <p className="mt-0.5 font-mono text-sm text-gain tnum">
                    {d.gas_price.best != null ? formatCurrency(d.gas_price.best, { decimals: 3 }) : '—'}
                  </p>
                </div>
                <div className="rounded-lg bg-surface-2 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-ink-3">Worst price/L</p>
                  <p className="mt-0.5 font-mono text-sm text-loss tnum">
                    {d.gas_price.worst != null ? formatCurrency(d.gas_price.worst, { decimals: 3 }) : '—'}
                  </p>
                </div>
                <div className="rounded-lg bg-surface-2 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-ink-3">Avg cost/km</p>
                  <p className="mt-0.5 font-mono text-sm text-ink tnum">{num(d.cost_per_km.average, 2)}</p>
                </div>
                <div className="rounded-lg bg-surface-2 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-ink-3">Avg cost/day</p>
                  <p className="mt-0.5 font-mono text-sm text-ink tnum">{money(d.cost_per_day)}</p>
                </div>
              </div>
            </Card>
          ) : tab === 'fillups' ? (
            <Card className="mt-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-surface-2 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-ink-3">Fill-ups</p>
                  <p className="mt-0.5 font-mono text-lg font-semibold text-ink tnum">{d.fillups.count}</p>
                </div>
                <div className="rounded-lg bg-surface-2 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-ink-3">Avg consumption</p>
                  <p className="mt-0.5 font-mono text-lg font-semibold text-ink tnum">
                    {num(d.fillups.avg_consumption, 1)} <span className="text-xs text-ink-3">L/100km</span>
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <Row label="Total fuel" value={`${num(d.fillups.total_liters, 1)} L`} />
                <Row label="Total fuel cost" value={money(d.fillups.total_cost)} />
              </div>
            </Card>
          ) : (
            <Card className="mt-3">
              <MetricTile label="Total distance" value={`${num(d.distance.total)} km`} emphasis />
              <div className="mt-2">
                <Row label="This year" value={`${num(d.distance.this_year)} km`} />
                <Row label="This month" value={`${num(d.distance.this_month)} km`} />
                <Row
                  label="Avg / month"
                  value={d.distance.avg_per_month != null ? `${num(d.distance.avg_per_month)} km` : '—'}
                />
                <Row
                  label="Avg / day"
                  value={d.distance.avg_per_day != null ? `${num(d.distance.avg_per_day, 1)} km` : '—'}
                />
              </div>
            </Card>
          )}

          <div className="mt-5 flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-wide text-ink-2">Cost categories</h2>
            <label className="flex items-center gap-1.5 text-xs text-ink-2">
              <input
                type="checkbox"
                checked={includeFuel}
                onChange={(e) => setIncludeFuel(e.target.checked)}
                className="accent-brand"
              />
              Include fuel
            </label>
          </div>
          <ChartSection data={categoriesQuery.data} className="mt-3" />
        </>
      )}
    </div>
  )
}
