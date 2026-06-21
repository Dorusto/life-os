// Colors from SpendingChart (shared palette)
const SEGMENT_COLORS = [
  '#6366F1', // indigo
  '#22C55E', // green
  '#F59E0B', // amber
  '#EC4899', // pink
  '#14B8A6', // teal
  '#8B5CF6', // violet
  '#F97316', // orange
  '#06B6D4', // cyan
]

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface BudgetCategory {
  name: string
  budgeted: number
  spent: number
  percentage: number
}

interface Props {
  categories: BudgetCategory[]
  month: number
  year: number
}

export default function BudgetChart({ categories, month, year }: Props) {
  if (categories.length === 0) {
    return (
      <div className="bg-surface rounded-2xl p-4">
        <p className="text-xs text-muted uppercase tracking-wide mb-2">
          BUDGET vs ACTUAL — {MONTH_NAMES[month - 1]} {year}
        </p>
        <p className="text-muted text-sm text-center py-4">No budget data for this month</p>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-2xl p-4">
      <p className="text-xs text-muted uppercase tracking-wide mb-4">
        BUDGET vs ACTUAL — {MONTH_NAMES[month - 1]} {year}
      </p>
      <div className="space-y-3">
        {categories.map((cat, i) => {
          const isOverBudget = cat.percentage > 100
          const barColor = isOverBudget ? '#FF2D2D' : SEGMENT_COLORS[i % SEGMENT_COLORS.length]
          const barWidth = Math.min(cat.percentage, 100)

          return (
            <div key={cat.name}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  {isOverBudget && <span className="text-sm">⚠️</span>}
                  <span className="text-white text-xs truncate">{cat.name}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <span
                    className="text-xs font-medium px-1.5 py-0.5 rounded"
                    style={{
                      color: isOverBudget ? '#FF2D2D' : barColor,
                      backgroundColor: isOverBudget ? 'rgba(255,45,45,0.1)' : `${barColor}20`,
                    }}
                  >
                    {cat.percentage.toFixed(0)}%
                  </span>
                  <span className="text-muted text-xs">
                    €{cat.spent.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / €{cat.budgeted.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              {/* Progress bar track */}
              <div className="h-2 bg-background rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${barWidth}%`, backgroundColor: barColor }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
