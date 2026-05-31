import { useState } from 'react'
import type { BudgetCategory } from '../lib/api'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const GROUP_ORDER = ['Housing', 'Daily Living', 'Transport', 'Health', 'Lifestyle', 'Finance', 'Unexpected']

const GROUP_EMOJI: Record<string, string> = {
  Housing: '🏠',
  'Daily Living': '🛒',
  Transport: '🚗',
  Health: '💊',
  Lifestyle: '🎯',
  Finance: '💰',
  Unexpected: '⚡',
}

interface Props {
  categories: BudgetCategory[]
  month: number
  year: number
  totalBalance?: number | null
}

function getColor(percentage: number, budgeted: number): string {
  if (budgeted === 0) return '#71717A'
  if (percentage > 100) return '#FF2D2D'
  const hue = Math.round(120 * (1 - percentage / 100))
  return `hsl(${hue}, 75%, 45%)`
}

function fmt(n: number): string {
  return n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function BudgetDashboard({ categories, month, year, totalBalance }: Props) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const totalSpent = categories.reduce((sum, c) => sum + c.spent, 0)
  const totalBudgeted = categories.reduce((sum, c) => sum + c.budgeted, 0)
  const budgetBalance = totalBudgeted - totalSpent
  const isOver = budgetBalance < 0

  // Group categories — skip Income and zero-activity entries
  const spendingCats = categories.filter(
    c => c.group_name !== 'Income' && (c.budgeted > 0 || c.spent > 0)
  )

  // Build groups map
  const groupMap: Record<string, BudgetCategory[]> = {}
  for (const cat of spendingCats) {
    const g = cat.group_name || 'Unexpected'
    if (!groupMap[g]) groupMap[g] = []
    groupMap[g].push(cat)
  }

  // Ordered list of groups that have data, plus any extra groups not in GROUP_ORDER at the end
  const orderedGroups = [
    ...GROUP_ORDER.filter(g => groupMap[g]),
    ...Object.keys(groupMap).filter(g => !GROUP_ORDER.includes(g)),
  ]

  function toggleGroup(name: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

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
            €{fmt(totalSpent)} / €{fmt(totalBudgeted)} spent
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
                {isOver ? '−' : '+'}€{fmt(Math.abs(budgetBalance))}
              </p>
            </>
          )}
          {totalBalance != null && (
            <span className="inline-block text-xs text-muted border border-border rounded-full px-3 py-1 mt-2 font-mono tabular-nums">
              €{fmt(totalBalance)} in accounts
            </span>
          )}
        </div>
      </div>

      {/* Group rows */}
      {orderedGroups.length === 0 ? (
        <p className="text-muted text-sm text-center py-2">No budget data this month</p>
      ) : (
        <div>
          {orderedGroups.map((groupName, idx) => {
            const cats = groupMap[groupName]
            const groupBudgeted = cats.reduce((s, c) => s + c.budgeted, 0)
            const groupSpent = cats.reduce((s, c) => s + c.spent, 0)
            const groupPct = groupBudgeted > 0 ? Math.round(groupSpent / groupBudgeted * 100) : 0
            const isExpanded = expandedGroups.has(groupName)
            const isLast = idx === orderedGroups.length - 1

            return (
              <div key={groupName} className={isLast ? '' : 'border-b border-border/20'}>
                <GroupRow
                  name={groupName}
                  emoji={GROUP_EMOJI[groupName] ?? '📦'}
                  budgeted={groupBudgeted}
                  spent={groupSpent}
                  percentage={groupPct}
                  isExpanded={isExpanded}
                  onToggle={() => toggleGroup(groupName)}
                />
                {isExpanded && (
                  <div className="ml-4 mb-1">
                    {cats.map((cat, catIdx) => (
                      <SubcategoryRow
                        key={cat.category_id}
                        category={cat}
                        isLast={catIdx === cats.length - 1}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function GroupRow({
  name, emoji, budgeted, spent, percentage, isExpanded, onToggle,
}: {
  name: string
  emoji: string
  budgeted: number
  spent: number
  percentage: number
  isExpanded: boolean
  onToggle: () => void
}) {
  const color = getColor(percentage, budgeted)
  const hasBudget = budgeted > 0

  return (
    <button
      className="w-full text-left py-3"
      onClick={onToggle}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base leading-none">{emoji}</span>
          <span className="text-white text-sm font-medium truncate">{name}</span>
          <span className="text-muted text-xs">{isExpanded ? '▲' : '▼'}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-2">
          {hasBudget ? (
            <>
              <span className="text-muted text-xs font-mono tabular-nums">
                €{fmt(spent)} / €{fmt(budgeted)}
              </span>
              <span
                className="text-xs font-mono w-8 text-right tabular-nums"
                style={{ color }}
              >
                {percentage}%
              </span>
            </>
          ) : (
            <span className="text-muted text-xs font-mono tabular-nums">
              €{fmt(spent)}
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
    </button>
  )
}

function SubcategoryRow({ category, isLast }: { category: BudgetCategory; isLast: boolean }) {
  const { category_name, budgeted, spent, percentage } = category
  const color = getColor(percentage, budgeted)
  const hasBudget = budgeted > 0

  return (
    <div className={`py-2 ${isLast ? '' : 'border-b border-border/10'}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="text-muted text-xs truncate">{category_name}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-2">
          {hasBudget ? (
            <>
              <span className="text-muted text-xs font-mono tabular-nums">
                €{fmt(spent)} / €{fmt(budgeted)}
              </span>
              <span
                className="text-xs font-mono w-8 text-right tabular-nums"
                style={{ color }}
              >
                {percentage.toFixed(0)}%
              </span>
            </>
          ) : (
            <span className="text-muted text-xs font-mono tabular-nums">
              €{fmt(spent)}
            </span>
          )}
        </div>
      </div>
      {hasBudget && (
        <div className="h-0.5 bg-border/20 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(percentage, 100)}%`, backgroundColor: color }}
          />
        </div>
      )}
    </div>
  )
}
