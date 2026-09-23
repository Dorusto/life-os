import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { getHoldings } from '../lib/api'
import { ButtonLink } from '../components/ButtonLink'
import { Card } from '../components/kit/Card'
import { Delta } from '../components/Delta'
import { EmptyState, StatStrip, toneOf } from '../components/kit/Stats'
import { ErrorState, Loading } from '../components/Feedback'
import { PageHeader } from '../components/shell/PageHeader'
import { Pill } from '../components/Pill'
import { formatEur, formatMoney, formatPercentPoints, formatShares, titleCase } from '../lib/format'
import { changeTextClass, cn } from '../lib/ui'

export default function Holdings() {
  const [includeClosed, setIncludeClosed] = useState(false)
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['holdings', includeClosed],
    queryFn: () => getHoldings(includeClosed),
  })

  if (isLoading) return <Loading label="Loading holdings" />
  if (isError) return <ErrorState message="Could not load holdings." onRetry={() => refetch()} />

  const holdings = data ?? []
  const open = holdings.filter((h) => h.shares > 0)
  const totalValue = open.reduce((sum, h) => sum + (h.market_value_eur ?? 0), 0)
  const totalCost = open.reduce((sum, h) => sum + h.cost_basis_eur, 0)
  const totalGain = open.reduce((sum, h) => sum + (h.unrealized_gain_eur ?? 0), 0)

  return (
    <>
      <PageHeader
        title="Holdings"
        description="Open positions with average cost, market value and unrealized gain."
        actions={
          <ButtonLink to="/transactions" variant="primary">
            Add transaction <ArrowRight className="h-4 w-4" />
          </ButtonLink>
        }
      />

      {holdings.length === 0 ? (
        <EmptyState
          title="No positions yet"
          description="Once you record a buy, your open positions and their cost basis will appear here."
          action={
            <Link to="/transactions" className="text-sm font-medium text-brand-ink hover:underline">
              Go to Transactions
            </Link>
          }
        />
      ) : (
        <>
          <StatStrip
            className="mb-6"
            stats={[
              { label: 'Market value', value: formatEur(totalValue) },
              { label: 'Cost basis', value: formatEur(totalCost) },
              {
                label: 'Unrealized gain',
                value: formatEur(totalGain),
                tone: toneOf(totalGain),
                hint: <Delta value={totalCost > 0 ? totalGain / totalCost : null} />,
              },
              { label: 'Positions', value: String(open.length) },
            ]}
          />

          <Card
            padded={false}
            label="Positions"
            action={
              <label className="flex cursor-pointer items-center gap-2 text-[12px] text-ink-2">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded-sm border-line-strong accent-brand"
                  checked={includeClosed}
                  onChange={(e) => setIncludeClosed(e.target.checked)}
                />
                Include closed
              </label>
            }
          >
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[12px] text-ink-3">
                    <th className="px-5 py-3 font-medium">Security</th>
                    <th className="px-3 py-3 text-right font-medium">Shares</th>
                    <th className="px-3 py-3 text-right font-medium">Avg cost</th>
                    <th className="px-3 py-3 text-right font-medium">Price</th>
                    <th className="px-3 py-3 text-right font-medium">Value</th>
                    <th className="px-3 py-3 text-right font-medium">Weight</th>
                    <th className="px-5 py-3 text-right font-medium">Gain / loss</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => (
                    <tr key={h.security_id} className="border-b border-line last:border-0 hover:bg-surface-2">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[13px] font-medium text-ink">{h.ticker}</span>
                          <Pill>{titleCase(h.asset_type)}</Pill>
                        </div>
                        <p className="mt-0.5 max-w-[200px] truncate text-[12px] text-ink-3">{h.name ?? '—'}</p>
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono tnum">{formatShares(h.shares)}</td>
                      <td className="px-3 py-3.5 text-right font-mono tnum text-ink-2">
                        {formatMoney(h.avg_cost_native, h.currency)}
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono tnum text-ink-2">
                        {formatMoney(h.price_native, h.currency)}
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono tnum font-medium text-ink">
                        {formatEur(h.market_value_eur)}
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono tnum text-ink-2">
                        {formatPercentPoints(h.weight_pct)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {h.shares > 0 ? (
                          <>
                            <p
                              className={cn(
                                'font-mono tnum font-medium',
                                changeTextClass(h.unrealized_gain_eur),
                              )}
                            >
                              {formatEur(h.unrealized_gain_eur)}
                            </p>
                            <p className={cn('font-mono tnum text-[12px]', changeTextClass(h.unrealized_gain_pct))}>
                              {formatPercentPoints((h.unrealized_gain_pct ?? 0) * 100)}
                            </p>
                          </>
                        ) : (
                          <span className="text-ink-3">
                            closed · realized {formatMoney(h.realized_gain_native, h.currency)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phones: same holdings as the table above, laid out as two-line list items. */}
            <ul className="divide-y divide-line md:hidden">
              {holdings.map((h) => (
                <li key={h.security_id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-[13px] font-medium text-ink">{h.ticker}</span>
                    <span className="shrink-0 font-mono tnum font-medium text-ink">
                      {formatEur(h.market_value_eur)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-xs text-ink-2">
                      {h.name ?? '—'}
                      <span className="text-ink-3">
                        {' · '}
                        {formatShares(h.shares)} · {formatPercentPoints(h.weight_pct)}
                      </span>
                    </p>
                    {h.shares > 0 ? (
                      <span
                        className={cn(
                          'shrink-0 whitespace-nowrap font-mono tnum text-xs',
                          changeTextClass(h.unrealized_gain_eur),
                        )}
                      >
                        {formatEur(h.unrealized_gain_eur)} ·{' '}
                        {formatPercentPoints((h.unrealized_gain_pct ?? 0) * 100)}
                      </span>
                    ) : (
                      <span className="shrink-0 whitespace-nowrap text-xs text-ink-3">
                        closed · realized {formatMoney(h.realized_gain_native, h.currency)}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p className="px-5 py-3 text-[12px] text-ink-3">
              Cost basis uses the average-cost method, not FIFO — a tracking figure, not a tax figure.
              Native-currency prices are shown where a security isn't EUR.
            </p>
          </Card>
        </>
      )}
    </>
  )
}
