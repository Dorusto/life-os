import { useQuery } from '@tanstack/react-query'
import { getIncome } from '../lib/api'
import { BarList } from '../components/BarList'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { ErrorState, Loading } from '../components/Feedback'
import { MetricTile } from '../components/MetricTile'
import { PageHeader } from '../components/PageHeader'
import { formatDate, formatEur, formatMoney } from '../lib/format'
import { seriesColor } from '../lib/ui'

export default function Income() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['income'], queryFn: getIncome })

  if (isLoading) return <Loading label="Loading income" />
  if (isError) return <ErrorState message="Could not load dividend history." onRetry={() => refetch()} />

  const income = data!
  if (!income.events.length) {
    return (
      <>
        <PageHeader title="Income" description="Dividend payments received over time." />
        <EmptyState
          title="No dividends recorded"
          description="Dividends appear here once they're added as transactions — manually or via an XTB import."
        />
      </>
    )
  }

  const total = income.total_eur || 1
  const years = income.by_year.length
  const latestYear = income.by_year[income.by_year.length - 1]

  return (
    <>
      <PageHeader title="Income" description="Dividend payments received over time, converted to EUR." />

      <Card className="mb-6">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <MetricTile label="Total received" value={formatEur(income.total_eur)} emphasis />
          <MetricTile label="Payments" value={String(income.events.length)} />
          <MetricTile label="Years covered" value={String(years)} />
          <MetricTile
            label={latestYear ? `Latest year (${latestYear.year})` : 'Latest year'}
            value={latestYear ? formatEur(latestYear.amount_eur) : '—'}
          />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="By year">
          <BarList
            items={income.by_year.map((y, i) => ({
              label: y.year,
              value: y.amount_eur,
              percentage: (y.amount_eur / total) * 100,
              color: seriesColor(i),
            }))}
            formatValue={formatEur}
          />
        </Card>
        <Card title="By holding">
          <BarList
            items={income.by_security.map((s, i) => ({
              label: s.ticker,
              value: s.amount_eur,
              percentage: (s.amount_eur / total) * 100,
              color: seriesColor(i),
            }))}
            formatValue={formatEur}
          />
        </Card>
      </div>

      <Card padded={false} title="Dividend history" className="mt-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-ink-3">
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-3 py-3 font-medium">Security</th>
                <th className="px-3 py-3 text-right font-medium">Native</th>
                <th className="px-5 py-3 text-right font-medium">EUR</th>
              </tr>
            </thead>
            <tbody>
              {income.events.map((event) => (
                <tr key={event.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="whitespace-nowrap px-5 py-3 font-mono tnum text-ink-2">{formatDate(event.date)}</td>
                  <td className="px-3 py-3">
                    <p className="font-mono text-[13px] font-medium text-ink">{event.ticker}</p>
                    <p className="max-w-[200px] truncate text-[12px] text-ink-3">{event.name ?? '—'}</p>
                  </td>
                  <td className="px-3 py-3 text-right font-mono tnum text-ink-2">
                    {formatMoney(event.amount_native, event.currency)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono tnum font-medium text-gain">
                    {formatEur(event.amount_eur)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
