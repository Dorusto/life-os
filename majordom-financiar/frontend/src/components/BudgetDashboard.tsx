import type { BudgetCategory } from '../lib/api'

/**
 * Budget Dashboard — shows budgeted vs spent per category with color-coded
 * indicators and visual states.
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

  // Only show categories with a budget set — system categories (Other, Income,
  // Starting Balances) and any unbudgeted AB categories are not relevant here.
  const allCats = categories
    .filter(c => c.budgeted > 0)
    .sort((a, b) => {
      const aOver = a.percentage > 100 ? 1 : 0
      const bOver = b.percentage > 100 ? 1 : 0
      if (aOver !== bOver) return bOver - aOver
      return b.percentage - a.percentage
    })

  const budgetBalance = totalBudgeted - totalSpent
  const isOver = budgetBalance < 0

  return (
    <div className="bg-surface rounded-2xl p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs tracking-widest uppercase text-muted">
            {MONTH_NAMES[month - 1]} {year}
          </p>
          <div className="flex items-baseline gap-3 mt-1">
            <p className="font-display text-3xl font-bold text-white">Budget</p>
          </div>
          <p className="text-muted text-xs mt-1 font-mono tabular-nums">
            €{totalSpent.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            {' / €'}
            {totalBudgeted.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} spent
          </p>
        </div>
        <div className="text-right">
          {totalBudgeted > 0 && (
            <>
              <p className="text-xs text-muted">{isOver ? 'over budget' : 'remaining'}</p>
              <p
                className="font-display text-3xl font-bold"
                style={{ color: isOver ? '#FF2D2D' : '#22C55E' }}
              >
                {isOver ? '−' : '+'}€{Math.abs(budgetBalance).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </>
          )}
          {totalBalance != null && (
            <span className="inline-block text-xs text-muted border border-border rounded-full px-3 py-1 mt-2 font-mono tabular-nums">
              €{totalBalance.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} in accounts
            </span>
          )}
        </div>
      </div>

      {/* Budget rows — no progress bars, just dot + name + spent/budgeted + percentage */}
      {allCats.length === 0 ? (
        <p className="text-muted text-sm text-center py-2">No budget data this month</p>
      ) : (
        <div>
          {allCats.map((cat, idx) => (
            <BudgetRow key={cat.category_id} category={cat} isLast={idx === allCats.length - 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function BudgetRow({ category, isLast }: { category: BudgetCategory; isLast: boolean }) {
  const { category_name, budgeted, spent, percentage } = category
  const color = getColor(percentage, budgeted)
  const hasBudget = budgeted > 0

  return (
    <div className={`py-3 ${isLast ? '' : 'border-b border-border/20'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="text-white text-sm truncate">{category_name}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-2">
          {hasBudget ? (
            <>
              <span className="text-muted text-xs font-mono tabular-nums">
                €{spent.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / €{budgeted.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span
                className="text-xs font-mono w-8 text-right tabular-nums"
                style={{ color }}
              >
                {percentage.toFixed(0)}%
              </span>
            </>
          ) : (
            <span className="text-muted text-xs font-mono">
              €{spent.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
        </div>
      </div>
      {hasBudget && (
        <div className="h-px bg-border/40 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(percentage, 100)}%`, backgroundColor: color }}
          />
        </div>
      )}
    </div>
  )
}
