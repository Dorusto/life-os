import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { confirmCategoryAction, cancelCategoryAction, type CategoryActionData } from '../lib/api'

interface Props {
  data: CategoryActionData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function CategoryActionCard({ data, onConfirmed, onCancelled }: Props) {
  const [categoryName, setCategoryName] = useState(data.action === 'create' ? data.category_name : '')
  const [groupName, setGroupName] = useState(data.group_name ?? '')
  const [budgetAmount, setBudgetAmount] = useState<string>(
    data.action === 'set_budget' ? String(data.new_amount ?? '') : ''
  )
  const [payee, setPayee] = useState(data.payee ?? '')
  const [selectedCategory, setSelectedCategory] = useState(data.category_name ?? '')
  const [createRule, setCreateRule] = useState(data.is_consistent ?? true)
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      let overrides: Record<string, unknown> | undefined
      if (data.action === 'create') {
        overrides = { category_name: categoryName || data.category_name, group_name: groupName || data.group_name }
      } else if (data.action === 'set_budget') {
        overrides = { amount: parseFloat(budgetAmount) || data.new_amount }
      } else if (data.action === 'categorize_with_rule') {
        overrides = { payee: payee || data.payee, category_name: selectedCategory || data.category_name, create_rule: createRule }
      }
      const result = await confirmCategoryAction(data.id, overrides as any)
      onConfirmed(result.message)
    } catch (err) {
      onConfirmed(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    setLoading(true)
    try { await cancelCategoryAction(data.id) } catch {}
    onCancelled()
  }

  const isDelete = data.action === 'delete'
  const isCreate = data.action === 'create'
  const isSetBudget = data.action === 'set_budget'
  const isCategorizeWithRule = data.action === 'categorize_with_rule'
  const isSetBudgetCarryover = data.action === 'set_budget_carryover'
  const isBankResync = data.action === 'bank_resync'

  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[85%] space-y-3">
      <div>
        <p className="text-white font-medium">
          {isDelete ? 'Delete category?' : isCreate ? 'Create category?' : isSetBudget ? 'Set budget amount?' : isCategorizeWithRule ? 'Categorize transactions?' : isSetBudgetCarryover ? `${data.enabled ? 'Enable' : 'Disable'} rollover overspending?` : isBankResync ? 'Resync bank account?' : 'Rename category?'}
        </p>
        {isSetBudgetCarryover && (
          <p className="text-muted text-sm mt-0.5">
            <span className="text-white">{data.category_name}</span>
            {' · '}{data.month}
            {' — '}{data.enabled
              ? 'negative balances will carry over and reduce next month\'s available budget'
              : 'balances will reset to zero each month as usual'}
          </p>
        )}
        {isBankResync && (
          <p className="text-muted text-sm mt-0.5">
            <span className="text-white">{data.account_name}</span>
            {' — '}{data.last_sync ? `last synced ${data.last_sync}` : 'never synced'}, pulls fresh transactions from the bank
          </p>
        )}
        {isDelete && (
          <p className="text-muted text-sm mt-0.5">
            <span className="text-white">{data.category_name}</span>
            {' '}will be removed. Existing transactions won't be lost.
          </p>
        )}
        {isCategorizeWithRule && (
          <p className="text-muted text-sm mt-0.5">
            <span className="text-white">{data.count}</span> uncategorized transaction{data.count !== 1 ? 's' : ''} will be tagged.
            {data.notes_contains && (
              <span> Filtered to notes containing "<span className="text-white">{data.notes_contains}</span>".</span>
            )}
          </p>
        )}
        {isCategorizeWithRule && data.transactions && data.transactions.length > 0 && (
          <div className="bg-background border border-border rounded-xl px-2.5 py-2 max-h-32 overflow-y-auto space-y-1">
            {data.transactions.map((tx, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted whitespace-nowrap">{tx.date.slice(5)}</span>
                {tx.notes && <span className="text-muted truncate flex-1">{tx.notes}</span>}
                <span className="text-white whitespace-nowrap">€{tx.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
        {!isDelete && !isCreate && !isSetBudget && !isCategorizeWithRule && !isSetBudgetCarryover && !isBankResync && (
          <p className="text-muted text-sm mt-0.5">
            <span className="text-white">{data.category_name}</span>
            {' → '}
            <span className="text-white">{data.new_name}</span>
          </p>
        )}
      </div>

      {isSetBudget && (
        <div className="space-y-2">
          <p className="text-muted text-sm">
            <span className="text-white">{data.category_name}</span>
            {data.month && <span className="text-muted"> · {data.month}</span>}
          </p>
          <div className="space-y-1">
            <p className="text-muted text-xs">
              Current: €{(data.current_amount ?? 0).toFixed(2)} → New amount (€)
            </p>
            <input
              type="number"
              min="0"
              step="0.01"
              value={budgetAmount}
              onChange={e => setBudgetAmount(e.target.value)}
              className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-accent"
            />
          </div>
        </div>
      )}

      {isCreate && (
        <div className="space-y-2">
          <div className="space-y-1">
            <p className="text-muted text-xs">Category name</p>
            <input
              type="text"
              value={categoryName}
              onChange={e => setCategoryName(e.target.value)}
              className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="space-y-1">
            <p className="text-muted text-xs">Group</p>
            {data.available_groups && data.available_groups.length > 0 ? (
              <select
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-accent"
              >
                {data.available_groups.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-accent"
              />
            )}
          </div>
        </div>
      )}

      {isCategorizeWithRule && (
        <div className="space-y-2">
          <div className="space-y-1">
            <p className="text-muted text-xs">Payee</p>
            <input
              type="text"
              value={payee}
              onChange={e => setPayee(e.target.value)}
              className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="space-y-1">
            <p className="text-muted text-xs">Category</p>
            {data.available_categories && data.available_categories.length > 0 ? (
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-accent"
              >
                {data.available_categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-accent"
              />
            )}
          </div>
          <div className="space-y-1">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={createRule}
                onChange={e => setCreateRule(e.target.checked)}
                disabled={!data.is_consistent}
                className="mt-1 accent-accent"
              />
              <div>
                <span className="text-white text-sm">
                  Create AB rule for future '{data.rule_prefix}' transactions
                </span>
                {!data.is_consistent && (
                  <p className="text-muted text-xs mt-0.5">
                    Disabled — this payee was categorized inconsistently in the past, so auto-categorization may not be reliable.
                  </p>
                )}
              </div>
            </label>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={loading || (isCreate && !categoryName) || (isSetBudget && !budgetAmount) || (isCategorizeWithRule && (!payee || !selectedCategory))}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-white text-sm font-medium transition-colors active:scale-95 disabled:opacity-50 ${
            isDelete ? 'bg-red-600 hover:bg-red-700' : 'bg-accent hover:bg-accent-hover'
          }`}
        >
          <Check size={14} />
          {isDelete ? 'Delete' : isCreate ? 'Create' : isSetBudget ? 'Set budget' : isCategorizeWithRule ? 'Categorize' : isSetBudgetCarryover || isBankResync ? 'Confirm' : 'Rename'}
        </button>
        <button
          onClick={handleCancel}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-surface-2 border border-border text-muted hover:text-white text-sm font-medium transition-colors active:scale-95 disabled:opacity-50"
        >
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  )
}
