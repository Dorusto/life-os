import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { getPortfolioAllocation, getPortfolioHistory, getPortfolioSummary } from '../lib/api'
import { Delta } from '../components/Delta'
import { BarList } from '../components/BarList'
import { ButtonLink } from '../components/ButtonLink'
import { Card } from '../components/Card'
import { DonutChart } from '../components/DonutChart'
import { EmptyState } from '../components/EmptyState'
import { ErrorState, Loading } from '../components/Feedback'
import { LineChart } from '../components/LineChart'
import { MetricTile } from '../components/MetricTile'
import { PageHeader } from '../components/shell/PageHeader'
import { Segmented } from '../components/Segmented'
import { formatDateShort, formatEur, formatReturn, titleCase } from '../lib/format'
import { changeTextClass, seriesColor } from '../lib/ui'

const PERIODS = [
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: '2y', label: '2Y' },
  { value: '5y', label: '5Y' },
  { value: 'all', label: 'All' },
] as const

type Period = (typeof PERIODS)[number]['value']
type AllocationView = 'by_asset_type' | 'by_security' | 'by_currency'

const ALLOCATION_VIEWS = [
  { value: 'by_asset_type' as const, label: 'Asset type' },
  { value: 'by_security' as const, label: 'Holding' },
  { value: 'by_currency' as const, label: 'Currency' },
]

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>('1y')
  const [allocationView, setAllocationView] = useState<AllocationView>('by_asset_type')

  const summary = useQuery({ queryKey: ['summary', period], queryFn: () => getPortfolioSummary(period) })
  const allocation = useQuery({ queryKey: ['allocation'], queryFn: getPortfolioAllocation })
  const history = useQuery({ queryKey: ['history', period], queryFn: () => getPortfolioHistory(period) })

  const slices = useMemo(() => {
    const source = allocation.data?.[allocationView] ?? []
    return source.map((slice, index) => ({
      label: slice.label,
      value: slice.value_eur,
      percentage: slice.percentage,
      color: seriesColor(index),
    }))
  }, [allocation.data, allocationView])

  if (summary.isLoading) return <Loading label="Loading portfolio" />
  if (summary.isError) {
    return <ErrorState message="Could not load the portfolio." onRetry={() => summary.refetch()} />
  }

  const data = summary.data!
  if (!data.has_holdings && data.total_value_eur === 0) {
    return (
      <>
        <PageHeader title="Dashboard" description="Your portfolio at a glance." />
        <EmptyState
          title="No holdings yet"
          description="Add a security and a transaction, or import an XTB report, and your portfolio will appear here."
          action={
            <ButtonLink to="/transactions" variant="primary">
              Add transactions <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          }
        />
      </>
    )
  }

  const benchmarkLabel = data.benchmark_ticker ? `${data.benchmark_ticker} benchmark` : 'Benchmark'

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Portfolio value, returns and allocation in EUR."
        actions={<Segmented options={[...PERIODS]} value={period} onChange={setPeriod} />}
      />

      {/* Statement header — the app's one deliberately bold surface. */}
      <Card padded={false} className="overflow-hidden">
        <div className="statement-rule" />
        <div className="grid gap-8 p-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)] lg:p-8">
          <div>
            <p className="text-[13px] text-ink-2">Portfolio value</p>
            <p className="mt-1.5 font-mono tnum text-display font-semibold text-ink">
              {formatEur(data.total_value_eur)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <Delta value={data.period_change_pct} eur={data.period_change_eur} />
              <span className="text-ink-3">
                over {period === 'all' ? 'all time' : `the last ${period.toUpperCase()}`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
            <MetricTile label="Cost basis" value={formatEur(data.total_cost_eur)} />
            <MetricTile
              label="Unrealized gain"
              value={
                <span className={changeTextClass(data.total_unrealized_gain_eur)}>
                  {formatEur(data.total_unrealized_gain_eur)}
                </span>
              }
              hint={<Delta value={data.total_unrealized_gain_pct} />}
            />
            <MetricTile label="XIRR (money-weighted)" value={formatReturn(data.xirr)} />
            <MetricTile label="TWR (time-weighted)" value={formatReturn(data.twr)} />
            <MetricTile
              label={benchmarkLabel}
              value={formatReturn(data.benchmark_return)}
              hint={data.benchmark_return !== null ? 'same period' : 'not available'}
            />
            <MetricTile
              label="Portfolio vs benchmark"
              value={
                data.twr !== null && data.benchmark_return !== null ? (
                  <Delta value={data.twr - data.benchmark_return} />
                ) : (
                  '—'
                )
              }
              hint={data.period_start ? `since ${formatDateShort(data.period_start)}` : undefined}
            />
          </div>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card
          title="Portfolio value"
          className="lg:col-span-2"
          action={<span className="text-[12px] text-ink-3">in EUR, daily</span>}
        >
          {history.isLoading ? (
            <Loading />
          ) : history.isError ? (
            <ErrorState onRetry={() => history.refetch()} />
          ) : (
            <LineChart
              labels={history.data?.dates ?? []}
              series={[
                {
                  name: 'Portfolio',
                  values: history.data?.values ?? [],
                  color: 'var(--c1)',
                  area: true,
                },
              ]}
              formatValue={(v) => formatEur(v, true)}
              formatLabel={formatDateShort}
            />
          )}
        </Card>

        <Card
          title="Allocation"
          action={
            <Segmented options={ALLOCATION_VIEWS} value={allocationView} onChange={setAllocationView} />
          }
        >
          {allocation.isLoading ? (
            <Loading />
          ) : allocation.isError ? (
            <ErrorState onRetry={() => allocation.refetch()} />
          ) : slices.length ? (
            <>
              <DonutChart
                slices={slices}
                centerLabel="Total"
                centerValue={formatEur(allocation.data?.total_value_eur ?? 0, true)}
              />
              <div className="mt-5 border-t border-line pt-5">
                <BarList
                  items={slices.map((s) => ({
                    label: allocationView === 'by_security' ? s.label : titleCase(s.label),
                    value: s.value,
                    percentage: s.percentage,
                    color: s.color,
                  }))}
                  formatValue={(v) => formatEur(v, true)}
                />
              </div>
            </>
          ) : (
            <EmptyState title="No allocation yet" />
          )}
        </Card>
      </div>

      <Card
        title="Top movers"
        className="mt-6"
        action={<span className="text-[12px] text-ink-3">by unrealized return</span>}
      >
        {data.top_movers.length ? (
          <ul className="divide-y divide-line">
            {data.top_movers.map((mover) => (
              <li key={mover.ticker} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{mover.ticker}</p>
                  <p className="truncate text-[12px] text-ink-3">{mover.name ?? '—'}</p>
                </div>
                <Delta value={mover.change_pct} eur={mover.change_eur} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">No priced positions to rank yet.</p>
        )}
      </Card>
    </>
  )
}
