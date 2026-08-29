import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronUp, ChevronDown, Trash2, Plus } from 'lucide-react'
import type { BudgetCategory } from '../lib/api'
import { applyCategoryOverview } from '../lib/api'
import { loadGroupOrder, saveGroupOrder } from '../lib/categoryGroupOrder'

const GROUP_ORDER = ['Housing', 'Daily Living', 'Transport', 'Health', 'Lifestyle', 'Finance', 'Unexpected']

const GROUP_COLORS = ['#F59E0B', '#3B82F6', '#22C55E', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316']
const INCOME_COLOR = '#EAB308' // yellow, distinct from expense palette

interface Props {
  categories: BudgetCategory[]
  editing: boolean
  onDataChange?: () => void
}

function getBudgetColor(percentage: number, budgeted: number): string {
  if (budgeted === 0) return '#71717A'
  if (percentage > 100) return '#FF2D2D'
  const hue = Math.round(120 * (1 - percentage / 100))
  return `hsl(${hue}, 75%, 45%)`
}

function fmt(n: number): string {
  return n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * This widget always shows the real current calendar month (no per-widget
 * period picker) — category/group clicks must filter Transactions to that
 * same month, or old transactions from other months show up alongside it.
 */
function currentMonthRange(): { dateFrom: string; dateTo: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const lastDay = new Date(year, month + 1, 0).getDate()
  return {
    dateFrom: `${year}-${pad2(month + 1)}-01`,
    dateTo: `${year}-${pad2(month + 1)}-${pad2(lastDay)}`,
  }
}

export default function BudgetDashboard({ categories, editing, onDataChange }: Props) {
  const navigate = useNavigate()
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [, setOrderVersion] = useState(0)
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupValue, setNewGroupValue] = useState('')
  const [addingCategoryGroup, setAddingCategoryGroup] = useState<string | null>(null)
  const [newCategoryValue, setNewCategoryValue] = useState('')
  const [extraGroups, setExtraGroups] = useState<string[]>([])
  const [uiError, setUiError] = useState<string | null>(null)

  // Group categories — skip zero-activity entries (Income included, unlike the old Budget widget)
  const spendingCats = categories.filter(c => (c.budgeted > 0 || c.spent > 0))

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
      const result = await applyCategoryOverview({ deleted_groups: [name] })
      if (result.errors && result.errors.length > 0) {
        setUiError(result.errors.join('; '))
        return
      }
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

  async function handleAddCategory(groupName: string) {
    const trimmed = newCategoryValue.trim()
    if (!trimmed) return
    try {
      await applyCategoryOverview({ new_categories: [{ name: trimmed, group_name: groupName }] })
      setNewCategoryValue('')
      setAddingCategoryGroup(null)
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
        categoryIds: [category.category_id],
        ...currentMonthRange(),
      },
    })
  }

  function openGroupTransactions(groupName: string) {
    const cats = groupMap[groupName] ?? []
    navigate('/transactions', {
      state: {
        categoryIds: cats.map(cat => cat.category_id),
        ...currentMonthRange(),
      },
    })
  }

  return (
    <div className="border-t border-border/40 px-4 pb-2">
      {orderedGroups.length === 0 && !editing ? (
        <p className="text-muted text-sm text-center py-4">No budget data this month</p>
      ) : (
        <div>
          {orderedGroups.map((groupName, idx) => {
            const cats = groupMap[groupName] ?? []
            const groupSpent = cats.reduce((s, c) => s + c.spent, 0)
            const groupBudgeted = cats.reduce((s, c) => s + c.budgeted, 0)
            const groupPct = groupBudgeted > 0 ? Math.round(groupSpent / groupBudgeted * 100) : 0
            const isExpanded = expandedGroups.has(groupName)
            const isLast = idx === orderedGroups.length - 1
            const groupColor = groupName === 'Income' ? INCOME_COLOR : GROUP_COLORS[idx % GROUP_COLORS.length]

            return (
              <div key={groupName} className={isLast ? '' : 'border-b border-border/20'}>
                <GroupRow
                  name={groupName}
                  color={groupColor}
                  isIncome={groupName === 'Income'}
                  spent={groupSpent}
                  budgeted={groupBudgeted}
                  percentage={groupPct}
                  isExpanded={isExpanded}
                  editing={editing}
                  index={idx}
                  total={orderedGroups.length}
                  onToggle={() => toggleGroup(groupName)}
                  onGroupClick={() => openGroupTransactions(groupName)}
                  onMove={(dir) => swapGroup(idx, dir)}
                  onDelete={() => handleDeleteGroup(groupName)}
                />
                {isExpanded && (
                  <div className="ml-4 mb-1">
                    {cats.map((cat, catIdx) => (
                      <SubcategoryRow
                        key={cat.category_id}
                        category={cat}
                        color={groupColor}
                        percentage={cat.budgeted > 0 ? Math.round(cat.spent / cat.budgeted * 100) : 0}
                        isLast={catIdx === cats.length - 1}
                        onClick={() => openCategoryTransactions(cat)}
                      />
                    ))}
                    {editing && (
                      <div className="mt-1">
                        {addingCategoryGroup === groupName ? (
                          <input
                            autoFocus
                            placeholder="Category name"
                            value={newCategoryValue}
                            onChange={e => setNewCategoryValue(e.target.value)}
                            onBlur={() => handleAddCategory(groupName)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleAddCategory(groupName)
                              if (e.key === 'Escape') { setAddingCategoryGroup(null); setNewCategoryValue('') }
                            }}
                            className="w-full bg-background border border-accent rounded-lg px-3 py-1.5 text-white text-sm outline-none"
                          />
                        ) : (
                          <button
                            onClick={() => { setAddingCategoryGroup(groupName); setNewCategoryValue('') }}
                            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl border border-dashed border-border text-accent text-sm font-medium hover:bg-surface-hover transition-colors"
                          >
                            <Plus size={14} /> Add category
                          </button>
                        )}
                      </div>
                    )}
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
  )
}

function GroupRow({
  name,
  color,
  isIncome,
  spent,
  budgeted,
  percentage,
  isExpanded,
  onToggle,
  onGroupClick,
  editing,
  index,
  total,
  onMove,
  onDelete,
}: {
  name: string
  color: string
  isIncome: boolean
  spent: number
  budgeted: number
  percentage: number
  isExpanded: boolean
  onToggle: () => void
  onGroupClick: () => void
  editing: boolean
  index: number
  total: number
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
}) {
  const hasBudget = budgeted > 0 && !isIncome
  const barColor = getBudgetColor(percentage, budgeted)

  return (
    <div className="py-3">
      <div
        className="flex items-center justify-between gap-3"
        onClick={editing ? undefined : onGroupClick}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="text-white text-sm font-semibold truncate">{name}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            className="text-muted hover:text-white transition-colors"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? '▲' : '▼'}
          </button>
          {editing && index === 0 && (
            <span className="text-muted-2 text-[10px] uppercase tracking-wide ml-1">top</span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-2">
          {editing && (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
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
          <span className={`font-mono text-sm tabular-nums ${isIncome ? 'text-positive' : 'text-white'}`}>
            €{fmt(spent)}
          </span>
        </div>
      </div>
      {hasBudget && (
        <div className="h-px bg-border/40 rounded-full overflow-hidden mt-2 ml-[18px]">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(percentage, 100)}%`, backgroundColor: barColor }}
          />
        </div>
      )}
    </div>
  )
}

function SubcategoryRow({
  category,
  color,
  percentage,
  isLast,
  onClick,
}: {
  category: BudgetCategory
  color: string
  percentage: number
  isLast: boolean
  onClick: () => void
}) {
  const { category_name, spent, budgeted } = category
  const hasBudget = budgeted > 0
  const barColor = getBudgetColor(percentage, budgeted)
  return (
    <button onClick={onClick} className={`w-full text-left py-2 ${isLast ? '' : 'border-b border-border/10'}`}>
      <div className="flex items-center justify-between gap-3 ml-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="text-muted text-xs truncate">{category_name}</span>
        </div>
        <span className="font-mono text-xs tabular-nums text-white">€{fmt(spent)}</span>
      </div>
      {hasBudget && (
        <div className="h-px bg-border/30 rounded-full overflow-hidden mt-1.5 ml-[15px]">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(percentage, 100)}%`, backgroundColor: barColor }}
          />
        </div>
      )}
    </button>
  )
}
