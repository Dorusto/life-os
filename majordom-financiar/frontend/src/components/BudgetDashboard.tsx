import type { BudgetCategory } from '../lib/api'

/**
 * Budget Dashboard — shows budgeted vs spent per category with color-coded
 * progress bars and visual states.
 *
 * Green:   spent < 80% of budgeted
 * Yellow:  spent 80–100% of budgeted
 * Red:     spent > 100% (over budget)
 * Neutral: no budget set (budgeted === 0)
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface Props {
  categories: BudgetCategory[]
  month: number
  year: number
  totalBalance?: number | null
}

function getColor(percentage: number, budgeted: number): string {
  if (budgeted === 0) return '#71717A'
  if (percentage > 100) return '#FF2D2D'
  // Smooth HSL: hue 120 (green) → 0 (red) proportional to percentage
  const hue = Math.round(120 * (1 - percentage / 100))
  return `hsl(${hue}, 75%, 45%)`
}

export default function BudgetDashboard({ categories, month, year, totalBalance }: Props) {
  const totalSpent = categories.reduce((sum, c) => sum + c.spent, 0)
  const totalBudgeted = categories.reduce((sum, c) => sum + c.budgeted, 0)

  // Split into budgeted vs unbudgeted
  const budgetedCats = categories.filter(c => c.budgeted > 0)
  const unbudgetedCats = categories.filter(c => c.budgeted === 0)

  // Sort budgeted: over-budget first, then by percentage descending
  budgetedCats.sort((a, b) => {
    const aOver = a.percentage > 100 ? 1 : 0
    const bOver = b.percentage > 100 ? 1 : 0
    if (aOver !== bOver) return bOver - aOver
    return b.percentage - a.percentage
  })

  // Sort unbudgeted by spent descending
  unbudgetedCats.sort((a, b) => b.spent - a.spent)

  const allCats = [...budgetedCats, ...unbudgetedCats]

  return (
    <div className="bg-surface rounded-2xl p-4">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <p className="text-xs text-muted uppercase tracking-wide">
            {MONTH_NAMES[month - 1]} {year}
          </p>
          <p className="text-white text-lg font-semibold mt-0.5">Budget</p>
        </div>
        <div className="text-right">
          <p className="text-white text-lg font-semibold">
            €{totalSpent.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          {totalBudgeted > 0 && (
            <p className="text-muted text-xs">
              of €{totalBudgeted.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} budget
            </p>
          )}
          {totalBalance != null && (
            <p className="text-muted text-xs mt-0.5">
              €{totalBalance.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} available
            </p>
          )}
        </div>
      </div>

      {/* Budget rows */}
      {allCats.length === 0 ? (
        <p className="text-muted text-sm text-center py-2">No budget data this month</p>
      ) : (
        <div className="space-y-3">
          {allCats.map(cat => (
            <BudgetRow key={cat.category_id} category={cat} />
          ))}
        </div>
      )}
    </div>
  )
}

function BudgetRow({ category }: { category: BudgetCategory }) {
  const { category_name, budgeted, spent, percentage } = category
  const color = getColor(percentage, budgeted)
  const hasBudget = budgeted > 0

  return (
    <div>
      {/* Category name + spent/budgeted */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="text-white text-xs truncate">{category_name}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <span className="text-muted text-xs">
            €{spent.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            {hasBudget && (
              <> / €{budgeted.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
            )}
          </span>
          {hasBudget && (
            <span
              className="text-xs font-medium w-8 text-right"
              style={{ color }}
            >
              {percentage.toFixed(0)}%
            </span>
          )}
        </div>
      </div>

      {/* Progress bar — only if budgeted > 0 */}
      {hasBudget && (
        <div className="h-2 bg-background rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(percentage, 100)}%`,
              backgroundColor: color,
            }}
          />
        </div>
      )}
    </div>
  )
}
