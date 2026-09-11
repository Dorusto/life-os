import { useQuery } from '@tanstack/react-query'
import {
  getSpendingChartData,
  getBudgetChartData,
  getSpendingTrendData,
  getSavingsRateData,
} from '../lib/api'
import Chart from '../components/Chart'
import PageHeader from '../components/PageHeader'
import StandardHeaderActions from '../components/StandardHeaderActions'
import WidgetLoading from '../components/WidgetLoading'

/**
 * Analytics tab — 4 real charts (spending breakdown, budget vs actual,
 * spending trend, savings rate) using existing REST endpoints and the
 * same <Chart /> component already used in chat conversations.
 *
 * See docs/decisions.md#planned-folded-into-analytics.
 */
export default function AnalyticsPage() {
  const spendingQuery = useQuery({
    queryKey: ['analytics-spending-chart'],
    queryFn: () => getSpendingChartData(),
    staleTime: 120_000,
  })

  const budgetQuery = useQuery({
    queryKey: ['analytics-budget-chart'],
    queryFn: () => getBudgetChartData(),
    staleTime: 120_000,
  })

  const trendQuery = useQuery({
    queryKey: ['analytics-spending-trend'],
    queryFn: () => getSpendingTrendData(),
    staleTime: 120_000,
  })

  const savingsQuery = useQuery({
    queryKey: ['analytics-savings-rate'],
    queryFn: () => getSavingsRateData(),
    staleTime: 120_000,
  })

  function renderChart(
    query: typeof spendingQuery,
    fallbackLabel: string
  ) {
    if (query.isLoading) {
      return <WidgetLoading label={`Loading ${fallbackLabel}…`} />
    }
    if (query.isError || !query.data) {
      return (
        <p className="text-muted text-xs">
          Couldn't load {fallbackLabel}.
        </p>
      )
    }
    const { chart_type, title, data, refetch } = query.data
    return (
      <Chart
        chart_type={chart_type}
        title={title}
        data={data}
        refetch={refetch}
      />
    )
  }

  return (
    <div className="h-dvh bg-background flex flex-col overflow-y-auto">
      <PageHeader
        label="Spending, budget, and trends"
        title="Analytics"
        actions={<StandardHeaderActions />}
      />
      <section className="px-5 pt-2 pb-24 space-y-6">
        {renderChart(spendingQuery, 'spending breakdown')}
        {renderChart(budgetQuery, 'budget vs actual')}
        {renderChart(trendQuery, 'spending trend')}
        {renderChart(savingsQuery, 'savings rate')}
      </section>
    </div>
  )
}
