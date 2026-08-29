import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronUp, ChevronDown, Trash2, Plus } from 'lucide-react'
import type { BudgetCategory } from '../lib/api'
import { applyCategoryOverview } from '../lib/api'
import { loadGroupOrder, saveGroupOrder } from '../lib/categoryGroupOrder'

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

function getGroupEmoji(name: string): string {
  if (GROUP_EMOJI[name]) return GROUP_EMOJI[name]
  const l = name.toLowerCase()
  if (l.includes('hous') || l.includes('home') || l.includes('rent') || l.includes('util')) return '🏠'
  if (l.includes('food') || l.includes('grocer') || l.includes('eat') || l.includes('drink')) return '🛒'
  if (l.includes('transport') || l.includes('car') || l.includes('fuel') || l.includes('travel')) return '🚗'
  if (l.includes('health') || l.includes('medical') || l.includes('gym') || l.includes('sport')) return '💊'
  if (l.includes('lifestyle') || l.includes('entertain') || l.includes('fun') || l.includes('hobby')) return '🎯'
  if (l.includes('financ') || l.includes('invest') || l.includes('saving') || l.includes('budget')) return '💰'
  if (l.includes('personal') || l.includes('self') || l.includes('care')) return '👤'
  if (l.includes('child') || l.includes('kid') || l.includes('family') || l.includes('baby')) return '👨‍👩‍👧‍👦'
  if (l.includes('cloth') || l.includes('fashion') || l.includes('wear')) return '👕'
  if (l.includes('restaurant') || l.includes('cafe') || l.includes('dining')) return '🍽️'
  if (l.includes('vacation') || l.includes('holiday') || l.includes('trip')) return '✈️'
  return '📦'
}

interface Props {
  categories: BudgetCategory[]
  month: number
  year: number
  editing: boolean
  onDataChange?: () => void
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

export default function BudgetDashboard({ categories, month, year, editing, onDataChange }: Props) {
  const navigate = useNavigate()
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [, setOrderVersion] = useState(0)
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupValue, setNewGroupValue] = useState('')
  const [extraGroups, setExtraGroups] = useState<string[]>([])
  const [uiError, setUiError] = useState<string | null>(null)

  const totalSpent = categories.reduce((sum, c) => sum + c.spent, 0)
  const totalBudgeted = categories.reduce((sum, c) => sum + c.budgeted, 0)
  const budgetBalance = totalBudgeted - totalSpent
  const isOver = budgetBalance < 0
  const pct = totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0
  const summaryColor = isOver ? '#FF2D2D' : '#22C55E'

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
  const defaultOrder = [
    ...GROUP_ORDER.filter(g => groupMap[g]),
    ...Object.keys(groupMap).filter(g => !GROUP_ORDER.includes(g)),
  ]
  const liveOrder = editing
    ? [...defaultOrder, ...extraGroups.filter(g => !defaultOrder.includes(g))]
    : defaultOrder
  const orderedGroups = loadGroupOrder(liveOrder)

  function toggleGroup(name: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function swapGroup(index: number, dir: -1 | 1) {
    const current = loadGroupOrder(liveOrder)
    const target = index + dir
    if (target < 0 || target >= current.length) return
    const next = [...current]
    ;[next[index], next[target]] = [next[target], next[index]]
    saveGroupOrder(next)
    setOrderVersion(v => v + 1)
  }

  async function handleDeleteGroup(name: string) {
    if (!window.confirm(`Delete category group "${name}"? Move or delete its categories first if needed.`)) return
    try {
      await applyCategoryOverview({ deleted_groups: [name] })
      setExtraGroups(prev => prev.filter(g => g !== name))
      setUiError(null)
      setOrderVersion(v => v + 1)
      onDataChange?.()
    } catch (err) {
      setUiError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  async function handleAddGroup() {
    const trimmed = newGroupValue.trim()
    if (!trimmed) return
    try {
      await applyCategoryOverview({ new_groups: [trimmed] })
      setExtraGroups(prev => [...prev, trimmed])
      setNewGroupValue('')
      setAddingGroup(false)
      setUiError(null)
      setOrderVersion(v => v + 1)
      onDataChange?.()
    } catch (err) {
      setUiError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  function openCategoryTransactions(category: BudgetCategory) {
    navigate('/transactions', {
      state: {
        categoryId: category.category_id,
        budgetMonth: month,
        budgetYear: year,
      },
    })
  }

  return (
    <>
      {/* Summary toggle — tap to reveal the group/category breakdown below */}
      <button
        onClick={() => setDetailsOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-white font-semibold text-[15px]">
            {totalBudgeted > 0 ? (
              <>€{fmt(totalSpent)} of €{fmt(totalBudgeted)}</>
            ) : (
              <>€{fmt(totalSpent)} spent</>
            )}
          </p>
          {totalBudgeted > 0 && (
            <>
              <div className="h-px bg-border/40 rounded-full overflow-hidden mt-2.5 max-w-[180px]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: summaryColor }}
                />
              </div>
              <p className="text-muted text-xs mt-1.5">
                {isOver ? `−€${fmt(Math.abs(budgetBalance))} over` : `+€${fmt(budgetBalance)} left`} this month
              </p>
            </>
          )}
        </div>
        {totalBudgeted > 0 && (
          <div className="text-right shrink-0 pl-2">
            <p className="font-display text-xl font-bold whitespace-nowrap" style={{ color: summaryColor }}>
              {pct}%
            </p>
            <p className="text-muted text-xs mt-1">{detailsOpen ? '▴' : '▾'} details</p>
          </div>
        )}
      </button>

      {/* Group rows */}
      {detailsOpen && (
        <div className="border-t border-border/40 px-4 pb-2">
          {orderedGroups.length === 0 && !editing ? (
            <p className="text-muted text-sm text-center py-4">No budget data this month</p>
          ) : (
            <div>
              {orderedGroups.map((groupName, idx) => {
                const cats = groupMap[groupName] ?? []
                const groupBudgeted = cats.reduce((s, c) => s + c.budgeted, 0)
                const groupSpent = cats.reduce((s, c) => s + c.spent, 0)
                const groupPct = groupBudgeted > 0 ? Math.round(groupSpent / groupBudgeted * 100) : 0
                const isExpanded = expandedGroups.has(groupName)
                const isLast = idx === orderedGroups.length - 1

                return (
                  <div key={groupName} className={isLast ? '' : 'border-b border-border/20'}>
                    <GroupRow
                      name={groupName}
                      emoji={getGroupEmoji(groupName)}
                      budgeted={groupBudgeted}
                      spent={groupSpent}
                      percentage={groupPct}
                      isExpanded={isExpanded}
                      editing={editing}
                      index={idx}
                      total={orderedGroups.length}
                      onToggle={() => toggleGroup(groupName)}
                      onMove={(dir) => swapGroup(idx, dir)}
                      onDelete={() => handleDeleteGroup(groupName)}
                    />
                    {isExpanded && (
                      <div className="ml-4 mb-1">
                        {cats.map((cat, catIdx) => (
                          <SubcategoryRow
                            key={cat.category_id}
                            category={cat}
                            isLast={catIdx === cats.length - 1}
                            onClick={() => openCategoryTransactions(cat)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              {editing && (
                <div className="pt-2">
                  {addingGroup ? (
                    <input
                      autoFocus
                      placeholder="Group name"
                      value={newGroupValue}
                      onChange={e => setNewGroupValue(e.target.value)}
                      onBlur={handleAddGroup}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddGroup()
                        if (e.key === 'Escape') { setAddingGroup(false); setNewGroupValue('') }
                      }}
                      className="w-full bg-background border border-accent rounded-lg px-3 py-2 text-white text-sm outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => setAddingGroup(true)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-border text-accent text-sm font-medium hover:bg-surface-hover transition-colors"
                    >
                      <Plus size={14} /> Add group
                    </button>
                  )}
                </div>
              )}
              {uiError && editing && (
                <p className="text-danger text-xs mt-2 px-1">{uiError}</p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}

function GroupRow({
  name, emoji, budgeted, spent, percentage, isExpanded, onToggle,
  editing, index, total, onMove, onDelete,
}: {
  name: string
  emoji: string
  budgeted: number
  spent: number
  percentage: number
  isExpanded: boolean
  onToggle: () => void
  editing: boolean
  index: number
  total: number
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
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
          <span className="text-white text-sm font-semibold truncate">{name}</span>
          <span className="text-muted text-xs">{isExpanded ? '▲' : '▼'}</span>
          {editing && index === 0 && (
            <span className="text-muted-2 text-[10px] uppercase tracking-wide ml-1">top</span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-2">
          {editing && (
            <div
              className="flex items-center gap-1"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => onMove(-1)}
                disabled={index === 0}
                className="w-6 h-6 rounded-lg bg-surface-2 border border-border text-muted hover:text-white disabled:opacity-40 flex items-center justify-center"
                aria-label={`Move ${name} up`}
              >
                <ChevronUp size={13} />
              </button>
              <button
                onClick={() => onMove(1)}
                disabled={index === total - 1}
                className="w-6 h-6 rounded-lg bg-surface-2 border border-border text-muted hover:text-white disabled:opacity-40 flex items-center justify-center"
                aria-label={`Move ${name} down`}
              >
                <ChevronDown size={13} />
              </button>
              <button
                onClick={onDelete}
                className="w-6 h-6 rounded-lg bg-danger/15 border border-danger/40 text-danger hover:bg-danger/25 flex items-center justify-center"
                aria-label={`Delete ${name} group`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          )}
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

function SubcategoryRow({
  category, isLast, onClick,
}: {
  category: BudgetCategory
  isLast: boolean
  onClick: () => void
}) {
  const { category_name, budgeted, spent, percentage } = category
  const color = getColor(percentage, budgeted)
  const hasBudget = budgeted > 0

  return (
    <button onClick={onClick} className={`w-full text-left py-2 ${isLast ? '' : 'border-b border-border/10'}`}>
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
        <div className="h-px bg-border/30 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(percentage, 100)}%`, backgroundColor: color }}
          />
        </div>
      )}
    </button>
  )
}
