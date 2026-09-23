import Chart from './Chart'
import type { ChartResponse } from '../lib/api'

/**
 * Renders one Chart from a ChartResponse, or nothing while loading/on error/empty.
 * The card chrome (border, surface, title label) comes from Chart itself, which
 * renders the shared kit Card — this stays a thin pass-through so the two don't
 * nest.
 */
export default function ChartSection({
  data,
  className,
}: {
  data: ChartResponse | undefined
  className?: string
}) {
  if (!data || data.type !== 'chart' || !data.chart_type) return null
  return (
    <div className={className}>
      <Chart
        chart_type={data.chart_type}
        title={data.title ?? ''}
        data={data.data as never}
        refetch={data.refetch as never}
      />
    </div>
  )
}
