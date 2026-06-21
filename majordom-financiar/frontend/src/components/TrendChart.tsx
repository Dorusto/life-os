interface MonthEntry {
  month: number
  year: number
  label: string
  total: number
  income: number
}

interface Props {
  months: MonthEntry[]
}

const MAX_BAR_HEIGHT = 80
const MIN_BAR_HEIGHT = 2

export default function TrendChart({ months }: Props) {
  if (months.length === 0) {
    return (
      <div className="bg-surface rounded-2xl p-4">
        <p className="text-muted text-sm text-center py-4">No spending data available</p>
      </div>
    )
  }

  // Find global max across all totals and incomes
  const maxVal = Math.max(...months.flatMap(m => [m.total, m.income]), 1)

  function scaleHeight(value: number): number {
    if (value === 0) return MIN_BAR_HEIGHT
    return Math.max((value / maxVal) * MAX_BAR_HEIGHT, MIN_BAR_HEIGHT)
  }

  return (
    <div className="bg-surface rounded-2xl p-4">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-xs text-muted">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#6366F1' }} />
          <span>Spending</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#22C55E' }} />
          <span>Income</span>
        </div>
      </div>

      {/* Bar chart */}
      <div className="flex items-end justify-around gap-3" style={{ height: MAX_BAR_HEIGHT }}>
        {months.map((m) => (
          <div key={m.label} className="flex items-end gap-0.5 flex-1 justify-center">
            {/* Spending bar */}
            <div
              className="w-3 rounded-t-sm transition-all duration-300"
              style={{
                height: scaleHeight(m.total),
                backgroundColor: '#6366F1',
              }}
            />
            {/* Income bar */}
            <div
              className="w-3 rounded-t-sm transition-all duration-300"
              style={{
                height: scaleHeight(m.income),
                backgroundColor: '#22C55E',
              }}
            />
          </div>
        ))}
      </div>

      {/* X-axis labels */}
      <div className="flex justify-around gap-3 mt-2">
        {months.map((m) => (
          <div key={m.label} className="flex-1 text-center">
            <span className="text-xs text-muted">{m.label}</span>
          </div>
        ))}
      </div>

      {/* Numeric values */}
      <div className="flex justify-around gap-3 mt-1">
        {months.map((m) => (
          <div key={m.label} className="flex-1 text-center">
            <span className="text-[10px] text-muted">
              €{m.total.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
