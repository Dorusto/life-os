import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { getPortfolioAllocation, getPortfolioHistory, getPortfolioSummary } from '../lib/api'
import { Delta } from '../components/Delta'
import { ButtonLink } from '../components/ButtonLink'
import { Card, SectionLabel } from '../components/kit/Card'
import { AreaChart, BarList, DonutChart, SERIES_COLORS } from '../components/kit/Charts'
import { EmptyState, HeroValue, StatStrip, toneOf } from '../components/kit/Stats'
import { ErrorState, Loading } from '../components/Feedback'
import { DomainTabs } from '../components/shell/DomainTabs'
import { PageHeader } from '../components/shell/PageHeader'
import { Segmented } from '../components/Segmented'
import { formatDateShort, formatEur, formatReturn, titleCase } from '../lib/format'

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
      color: SERIES_COLORS[index % SERIES_COLORS.length],
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
  const excessReturn =
    data.twr !== null && data.benchmark_return !== null ? data.twr - data.benchmark_return : null

  return (
    <>
      <div className="mb-6">
        <DomainTabs app="invest" active="investments" />
      </div>

      <PageHeader
        title="Dashboard"
        description="Portfolio value, returns and allocation in EUR."
        actions={<Segmented options={[...PERIODS]} value={period} onChange={setPeriod} />}
      />

      {/* Statement header — the app's one deliberately bold surface. */}
      <Card padded={false} className="overflow-hidden">
        <div className="statement-rule" />
        <div className="p-6 lg:p-8">
          <HeroValue
            label="Portfolio value"
            value={formatEur(data.total_value_eur)}
            sub={
              <>
                <Delta value={data.period_change_pct} eur={data.period_change_eur} />{' '}
                <span className="text-ink-3">
                  over {period === 'all' ? 'all time' : `the last ${period.toUpperCase()}`}
                </span>
              </>
            }
          />
          <div className="mt-8">
            <div className="flex items-center justify-between">
              <SectionLabel>Performance</SectionLabel>
              <span className="text-[12px] text-ink-3">in EUR, daily</span>
            </div>
            <div className="mt-3">
              {history.isLoading ? (
                <Loading />
              ) : history.isError ? (
                <ErrorState onRetry={() => history.refetch()} />
              ) : (
                <AreaChart
                  labels={history.data?.dates ?? []}
                  series={[{ name: 'Portfolio', values: history.data?.values ?? [], area: true }]}
                  formatValue={(v) => formatEur(v, true)}
                  formatLabel={formatDateShort}
                />
              )}
            </div>
          </div>
        </div>
      </Card>

      <StatStrip
        className="mt-6"
        stats={[
          { label: 'Cost basis', value: formatEur(data.total_cost_eur) },
          {
            label: 'Unrealized gain',
            value: formatEur(data.total_unrealized_gain_eur),
            tone: toneOf(data.total_unrealized_gain_eur),
            hint: <Delta value={data.total_unrealized_gain_pct} />,
          },
          { label: 'XIRR (money-weighted)', value: formatReturn(data.xirr) },
          { label: 'TWR (time-weighted)', value: formatReturn(data.twr) },
        ]}
      />

      <StatStrip
        className="mt-4"
        stats={[
          {
            label: benchmarkLabel,
            value: formatReturn(data.benchmark_return),
            hint: data.benchmark_return !== null ? 'same period' : 'not available',
          },
          {
            label: 'Portfolio vs benchmark',
            value: excessReturn === null ? '—' : formatReturn(excessReturn),
            tone: toneOf(excessReturn),
            hint: data.period_start ? `since ${formatDateShort(data.period_start)}` : undefined,
          },
        ]}
      />

      <Card
        label="Allocation"
        className="mt-6"
        action={
          <Segmented options={ALLOCATION_VIEWS} value={allocationView} onChange={setAllocationView} />
        }
      >
        {allocation.isLoading ? (
          <Loading />
        ) : allocation.isError ? (
          <ErrorState onRetry={() => allocation.refetch()} />
        ) : slices.length ? (
          <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
            <DonutChart
              slices={slices}
              centerLabel="Total"
              centerValue={formatEur(allocation.data?.total_value_eur ?? 0, true)}
            />
            <BarList
              items={slices.map((s) => ({
                label: allocationView === 'by_security' ? s.label : titleCase(s.label),
                value: s.value,
                color: s.color,
              }))}
              formatValue={(v) => formatEur(v, true)}
            />
          </div>
        ) : (
          <EmptyState title="No allocation yet" />
        )}
      </Card>

      <Card
        label="Top movers"
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
