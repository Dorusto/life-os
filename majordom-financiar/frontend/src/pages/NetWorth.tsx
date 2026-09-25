import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAccountList, getNetWorthHistory, type AccountListItem } from '../lib/api'
import { PageHeader, type PageTab } from '../components/shell/PageHeader'
import { DomainTabs } from '../components/shell/DomainTabs'
import { Card, SectionLabel } from '../components/kit/Card'
import { EmptyState, HeroValue, toneClass, toneOf, type Tone } from '../components/kit/Stats'
import { AreaChart, SERIES_COLORS, StackedBar, type Slice } from '../components/kit/Charts'
import StandardHeaderActions from '../components/StandardHeaderActions'
import WidgetLoading from '../components/WidgetLoading'
import { formatCurrency } from '../lib/formatCurrency'

/**
 * Net worth — the Finance side of the platform's "Net worth" domain tab
 * (DomainTabs links here from every app's home page).
 *
 * Read-only, and built entirely from two endpoints the app already exposes: the
 * account list (balances + account_type) and the net-worth-history snapshots
 * (assets vs. liabilities at each period end). Nothing is combined across the
 * two sources: the hero figure is the live sum of the balances, the trend is the
 * snapshots' own `net`, and the change under the hero compares the snapshots'
 * first and last points — so "then" and "now" always come from the same series.
 */

type Granularity = 'month' | 'week'

const GRANULARITY_TABS: PageTab[] = [
  { value: 'month', label: 'Monthly' },
  { value: 'week', label: 'Weekly' },
]

/** An account with no type tag (account_type is nullable) still has to be grouped. */
const UNTYPED = 'Other'

interface BreakdownGroup {
  /** Signed group total: positive for assets, negative for liabilities. */
  total: number
  /** One slice per account type, each a positive magnitude — see buildBreakdown. */
  slices: Slice[]
}

/**
 * Split the account list into what is owned and what is owed, grouped by
 * account_type.
 *
 * The split follows each balance's sign rather than its type tag: an overpaid
 * loan is money you own, and counting it as a liability because of its type
 * would misstate both totals. Amounts stay magnitudes inside the slices —
 * StackedBar clamps negatives to zero when it sizes a segment and sums the group
 * total from them — and are re-signed where they are displayed.
 */
function buildBreakdown(accounts: AccountListItem[]) {
  const owned = new Map<string, number>()
  const owed = new Map<string, number>()

  for (const account of accounts) {
    if (account.balance === 0) continue
    const bucket = account.balance > 0 ? owned : owed
    const type = account.account_type ?? UNTYPED
    bucket.set(type, (bucket.get(type) ?? 0) + Math.abs(account.balance))
  }

  const group = (
    totals: Map<string, number>,
    sign: 1 | -1,
    colorAt: (index: number) => string,
  ): BreakdownGroup => {
    const entries = [...totals.entries()].sort((a, b) => b[1] - a[1])
    return {
      total: sign * entries.reduce((sum, [, magnitude]) => sum + magnitude, 0),
      slices: entries.map(([label, magnitude], index) => ({
        label,
        value: magnitude,
        color: colorAt(index),
      })),
    }
  }

  return {
    assets: group(owned, 1, (index) => SERIES_COLORS[index % SERIES_COLORS.length]),
    // One tone for every liability slice: the group reads as "money owed" before
    // its parts are read, which the categorical palette would not say.
    liabilities: group(owed, -1, () => 'var(--loss)'),
  }
}

export default function NetWorthPage() {
  const [granularity, setGranularity] = useState<Granularity>('month')

  // Same key and args as Dashboard's account list — one shared request, not two.
  const accountsQuery = useQuery({
    queryKey: ['account-list'],
    queryFn: () => getAccountList(),
    staleTime: 120_000,
  })

  // Always every account (no type filter): the live balances the hero sums and
  // the snapshots the trend draws then cover the same set, which is why this
  // query doesn't share a cache entry with the filtered Analytics view.
  const historyQuery = useQuery({
    queryKey: ['net-worth-history', granularity],
    queryFn: () => getNetWorthHistory(granularity),
    staleTime: 120_000,
  })

  const accounts = accountsQuery.data
  const points = historyQuery.data?.points ?? []

  const netToday = accounts ? accounts.reduce((sum, account) => sum + account.balance, 0) : null

  // Two points minimum: one snapshot has nothing earlier to compare against, so
  // the change line must not render a fabricated +€0 off a single point.
  const first = points[0]
  const last = points[points.length - 1]
  const change = points.length >= 2 && first && last ? last.net - first.net : null

  const breakdown = useMemo(() => buildBreakdown(accounts ?? []), [accounts])

  function handleGranularity(value: string) {
    if (value === 'month' || value === 'week') setGranularity(value)
  }

  function renderHero() {
    if (accountsQuery.isLoading) {
      return <WidgetLoading label="Loading your accounts…" />
    }
    if (accountsQuery.isError || netToday == null) {
      return (
        <EmptyState
          title="Couldn't load your accounts."
          description="The net worth figure is the sum of your account balances, which needs the account list from Actual Budget."
        />
      )
    }
    if (accounts && accounts.length === 0) {
      return (
        <EmptyState
          title="No accounts yet."
          description="Add an account — net worth is the sum of your account balances."
        />
      )
    }
    return (
      <HeroValue
        label="Net worth · today"
        value={formatCurrency(netToday)}
        sub={
          change != null && first ? (
            <>
              <span className={toneClass(toneOf(change))}>
                {formatCurrency(change, { signDisplay: 'always' })}
              </span>
              <span className="text-token-ink-3"> vs {first.x}</span>
            </>
          ) : undefined
        }
      />
    )
  }

  function renderTrend() {
    if (historyQuery.isLoading) {
      return <WidgetLoading label="Loading net worth history…" />
    }
    if (historyQuery.isError || !historyQuery.data) {
      return (
        <EmptyState
          title="Couldn't load net worth history."
          description="The trend is built from your account balances at each period end."
        />
      )
    }

    // With no type filter on this page, a snapshot count of zero means there were
    // no accounts to sum — not the filtered-to-nothing case Analytics reports.
    if (historyQuery.data.account_count === 0) {
      return (
        <EmptyState
          title="No accounts to chart yet."
          description="Each point is the sum of your account balances at a period end, and there are none to include."
        />
      )
    }

    return (
      <AreaChart
        labels={points.map((point) => point.x)}
        series={[{ name: 'Net worth', values: points.map((point) => point.net) }]}
        height={260}
        formatValue={(value) => formatCurrency(value, { decimals: 0 })}
        emptyMessage="No net worth history yet."
      />
    )
  }

  function renderBreakdown() {
    if (accountsQuery.isLoading) {
      return <WidgetLoading label="Loading your accounts…" />
    }
    if (accountsQuery.isError || !accounts) {
      return (
        <EmptyState
          title="Couldn't load your accounts."
          description="The breakdown groups your balances by account type."
        />
      )
    }

    function renderGroup(
      label: string,
      grouped: BreakdownGroup,
      tone: Tone,
      formatSlice: (magnitude: number) => string,
      emptyText: string,
    ) {
      return (
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <SectionLabel>{label}</SectionLabel>
            <span className={`font-mono text-sm tabular-nums ${toneClass(tone)}`}>
              {formatCurrency(grouped.total)}
            </span>
          </div>
          {grouped.slices.length > 0 ? (
            <div className="mt-3">
              <StackedBar slices={grouped.slices} formatValue={formatSlice} />
            </div>
          ) : (
            <p className="mt-2 text-xs text-token-ink-3">{emptyText}</p>
          )}
        </div>
      )
    }

    const { assets, liabilities } = breakdown

    return (
      <Card label="Breakdown">
        <div className="flex flex-col gap-6">
          {renderGroup(
            'Assets',
            assets,
            'default',
            (magnitude) => formatCurrency(magnitude),
            'No asset accounts yet.',
          )}
          {renderGroup(
            'Liabilities',
            liabilities,
            'loss',
            // Slices hold magnitudes (StackedBar sizes them against the group
            // total); the legend prints what each account actually holds — a
            // negative balance.
            (magnitude) => formatCurrency(-magnitude),
            'Nothing owed — no account is in the red.',
          )}
        </div>
      </Card>
    )
  }

  return (
    <div className="flex flex-col">
      <DomainTabs app="finance" active="net-worth" />

      <PageHeader
        eyebrow="Net worth"
        title="Everything you own and owe"
        tabs={GRANULARITY_TABS}
        tab={granularity}
        onTabChange={handleGranularity}
        actions={<StandardHeaderActions />}
      />

      <section className="flex flex-col gap-6">
        {renderHero()}
        {renderTrend()}
        {renderBreakdown()}
      </section>
    </div>
  )
}
