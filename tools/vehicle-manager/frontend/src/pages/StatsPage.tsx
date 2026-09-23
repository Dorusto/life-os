import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import ChartSection from '../components/ChartSection'
import VehicleSwitcher from '../components/VehicleSwitcher'
import { Loading } from '../components/Feedback'
import { Segmented } from '../components/Segmented'
import { Card, SectionLabel } from '../components/kit/Card'
import { HeroValue, StatStrip } from '../components/kit/Stats'
import { PageHeader } from '../components/shell/PageHeader'
import { getCostCategories, getVehicleStatsDetail } from '../lib/api'
import { formatCurrency, formatNumber } from '../lib/formatCurrency'
import { useSelectedVehicle } from '../lib/useSelectedVehicle'

type Tab = 'fillups' | 'costs' | 'distance'

const TABS: { id: Tab; label: string }[] = [
  { id: 'fillups', label: 'Fill-ups' },
  { id: 'costs', label: 'Costs' },
  { id: 'distance', label: 'Distance' },
]


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
      <PageHeader title="Statistics" />

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
            <Card label="Costs" className="mt-3">
              <HeroValue label="Total costs" value={money(d.costs.total)} />
              <StatStrip
                className="mt-4"
                stats={[
                  { label: 'This year', value: money(d.costs.this_year) },
                  { label: 'This month', value: money(d.costs.this_month) },
                  { label: 'Previous year', value: money(d.costs.prev_year) },
                  { label: 'Previous month', value: money(d.costs.prev_month) },
                ]}
              />
              <StatStrip
                className="mt-4"
                stats={[
                  { label: 'Lowest bill', value: money(d.bills.lowest), tone: 'gain' },
                  { label: 'Highest bill', value: money(d.bills.highest), tone: 'loss' },
                ]}
              />
              <StatStrip
                className="mt-4"
                stats={[
                  {
                    label: 'Best price/L',
                    value: d.gas_price.best != null ? formatCurrency(d.gas_price.best, { decimals: 3 }) : '—',
                    tone: 'gain',
                  },
                  {
                    label: 'Worst price/L',
                    value: d.gas_price.worst != null ? formatCurrency(d.gas_price.worst, { decimals: 3 }) : '—',
                    tone: 'loss',
                  },
                  { label: 'Avg cost/km', value: num(d.cost_per_km.average, 2) },
                  { label: 'Avg cost/day', value: money(d.cost_per_day) },
                ]}
              />
            </Card>
          ) : tab === 'fillups' ? (
            <Card label="Fill-ups" className="mt-3">
              <StatStrip
                stats={[
                  { label: 'Fill-ups', value: d.fillups.count },
                  { label: 'Avg consumption', value: num(d.fillups.avg_consumption, 1), hint: 'L/100km' },
                  { label: 'Total fuel', value: `${num(d.fillups.total_liters, 1)} L` },
                  { label: 'Total fuel cost', value: money(d.fillups.total_cost) },
                ]}
              />
            </Card>
          ) : (
            <Card label="Distance" className="mt-3">
              <HeroValue label="Total distance" value={`${num(d.distance.total)} km`} />
              <StatStrip
                className="mt-4"
                stats={[
                  { label: 'This year', value: `${num(d.distance.this_year)} km` },
                  { label: 'This month', value: `${num(d.distance.this_month)} km` },
                  {
                    label: 'Avg / month',
                    value: d.distance.avg_per_month != null ? `${num(d.distance.avg_per_month)} km` : '—',
                  },
                  {
                    label: 'Avg / day',
                    value: d.distance.avg_per_day != null ? `${num(d.distance.avg_per_day, 1)} km` : '—',
                  },
                ]}
              />
            </Card>
          )}

          <div className="mt-5 flex items-center justify-between">
            <SectionLabel>Cost categories</SectionLabel>
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
