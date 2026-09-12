import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import BottomNav from '../components/BottomNav'
import ChartSection from '../components/ChartSection'
import LogoutButton from '../components/LogoutButton'
import VehicleSwitcher from '../components/VehicleSwitcher'
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
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="font-mono text-sm font-semibold text-white">{value}</span>
    </div>
  )
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 mt-3">
      {title && <p className="text-xs text-muted uppercase tracking-wide mb-2">{title}</p>}
      {children}
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
    <div className="min-h-dvh bg-background px-4 pt-8 pb-24">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-white text-xl font-semibold">Statistics</h1>
        <LogoutButton />
      </div>

      {isLoading ? (
        <p className="text-muted text-sm text-center py-8">Loading…</p>
      ) : !vehicle ? (
        <p className="text-muted text-sm text-center py-8">No vehicles yet.</p>
      ) : (
        <>
          <VehicleSwitcher vehicles={vehicles} selectedId={selectedId} onSelect={select} />

          <div className="flex mt-4 border-b border-border">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 pb-2 text-xs font-medium uppercase tracking-wide transition-colors ${
                  tab === t.id ? 'text-accent border-b-2 border-accent' : 'text-muted hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {!d ? (
            <p className="text-muted text-sm text-center py-8">No statistics yet.</p>
          ) : tab === 'costs' ? (
            <Card>
              <p className="text-xs text-muted uppercase tracking-wide">Total costs</p>
              <p className="font-mono text-2xl font-semibold text-white mt-1">{money(d.costs.total)}</p>
              <div className="mt-2">
                <Row label="This year" value={money(d.costs.this_year)} />
                <Row label="This month" value={money(d.costs.this_month)} />
                <Row label="Previous year" value={money(d.costs.prev_year)} />
                <Row label="Previous month" value={money(d.costs.prev_month)} />
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="bg-background rounded-xl p-3">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Lowest bill</p>
                  <p className="font-mono text-sm text-success mt-0.5">{money(d.bills.lowest)}</p>
                </div>
                <div className="bg-background rounded-xl p-3">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Highest bill</p>
                  <p className="font-mono text-sm text-danger mt-0.5">{money(d.bills.highest)}</p>
                </div>
                <div className="bg-background rounded-xl p-3">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Best price/L</p>
                  <p className="font-mono text-sm text-success mt-0.5">
                    {d.gas_price.best != null ? formatCurrency(d.gas_price.best, { decimals: 3 }) : '—'}
                  </p>
                </div>
                <div className="bg-background rounded-xl p-3">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Worst price/L</p>
                  <p className="font-mono text-sm text-danger mt-0.5">
                    {d.gas_price.worst != null ? formatCurrency(d.gas_price.worst, { decimals: 3 }) : '—'}
                  </p>
                </div>
                <div className="bg-background rounded-xl p-3">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Avg cost/km</p>
                  <p className="font-mono text-sm mt-0.5">{num(d.cost_per_km.average, 2)}</p>
                </div>
                <div className="bg-background rounded-xl p-3">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Avg cost/day</p>
                  <p className="font-mono text-sm mt-0.5">{money(d.cost_per_day)}</p>
                </div>
              </div>
            </Card>
          ) : tab === 'fillups' ? (
            <Card>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-background rounded-xl p-3">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Fill-ups</p>
                  <p className="font-mono text-lg font-semibold mt-0.5">{d.fillups.count}</p>
                </div>
                <div className="bg-background rounded-xl p-3">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Avg consumption</p>
                  <p className="font-mono text-lg font-semibold mt-0.5">
                    {num(d.fillups.avg_consumption, 1)} <span className="text-xs text-muted">L/100km</span>
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <Row label="Total fuel" value={`${num(d.fillups.total_liters, 1)} L`} />
                <Row label="Total fuel cost" value={money(d.fillups.total_cost)} />
              </div>
            </Card>
          ) : (
            <Card>
              <p className="text-xs text-muted uppercase tracking-wide">Total distance</p>
              <p className="font-mono text-2xl font-semibold text-white mt-1">
                {num(d.distance.total)} <span className="text-sm text-muted">km</span>
              </p>
              <div className="mt-2">
                <Row label="This year" value={`${num(d.distance.this_year)} km`} />
                <Row label="This month" value={`${num(d.distance.this_month)} km`} />
                <Row label="Avg / month" value={d.distance.avg_per_month != null ? `${num(d.distance.avg_per_month)} km` : '—'} />
                <Row label="Avg / day" value={d.distance.avg_per_day != null ? `${num(d.distance.avg_per_day, 1)} km` : '—'} />
              </div>
            </Card>
          )}

          <div className="flex items-center justify-between mt-5">
            <h2 className="text-xs text-muted uppercase tracking-wide">Cost categories</h2>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={includeFuel} onChange={(e) => setIncludeFuel(e.target.checked)} />
              Include fuel
            </label>
          </div>
          <ChartSection data={categoriesQuery.data} className="mt-3" />
        </>
      )}

      <BottomNav />
    </div>
  )
}
