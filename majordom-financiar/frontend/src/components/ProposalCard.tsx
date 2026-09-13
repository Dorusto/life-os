import { useState, useEffect } from 'react'
import { confirmProposal, cancelProposal, getCategories, getAccounts, type CategoryItem, type Account } from '../lib/api'
import ActionCardButtons from './ActionCardButtons'
import { formatCurrency } from '../lib/formatCurrency'
import { formatDate } from '../lib/formatDate'

export interface ProposalData {
  id: string
  payee: string
  amount: number
  date: string
  category_name: string
  account_id: string
  account_name: string
  notes?: string
  notes_category_match?: boolean
  category_source?: string
}

interface Props {
  proposal: ProposalData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function ProposalCard({ proposal, onConfirmed, onCancelled }: Props) {
  const [selectedCategory, setSelectedCategory] = useState(proposal.category_name)
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState(proposal.account_id)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [createRule, setCreateRule] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getCategories().then(allCats => {
      const expenseCats = allCats.filter(c => !c.is_income)
      setCategories(expenseCats)
      const proposed = proposal.category_name.toLowerCase()
      const exactMatch = expenseCats.find(c => c.name.toLowerCase() === proposed)
      const nameMatch = !exactMatch && expenseCats.find(c =>
        c.name.toLowerCase().includes(proposed) || proposed.includes(c.name.toLowerCase())
      )
      const groupMatch = !exactMatch && !nameMatch && expenseCats.find(c =>
        c.group_name.toLowerCase() === proposed || c.group_name.toLowerCase().includes(proposed)
      )
      const best = exactMatch || nameMatch || groupMatch
      if (best) setSelectedCategory(best.name)
      // no match → keep proposal.category_name (user picks manually)
    }).catch(() => {})
    getAccounts().then(setAccounts).catch(() => {})
  }, [])

  async function handleConfirm() {
    setLoading(true)
    try {
      const result = await confirmProposal(proposal.id, selectedCategory, selectedAccountId, createRule)
      if (result.message.toLowerCase().includes('duplicate') || result.message.toLowerCase().includes('already exists')) {
        onConfirmed(`Duplicate: ${proposal.payee} ${formatCurrency(proposal.amount)} already exists in Actual Budget for this date.`)
      } else {
        onConfirmed(`Added: ${proposal.payee} ${formatCurrency(proposal.amount)} → ${selectedCategory}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      onConfirmed(`Error: could not add transaction (${msg}). Try again via chat.`)
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    setLoading(true)
    try {
      await cancelProposal(proposal.id)
    } catch {}
    onCancelled()
  }

  const formattedDate = formatDate(proposal.date)

  return (
    <div className="bg-token-surface border border-token-line rounded-2xl rounded-bl-sm px-4 py-3 max-w-[80%] space-y-3">
      <div>
        <p className="text-token-ink font-medium">{proposal.payee}</p>
        <p className="text-token-ink-3 text-sm">{formatCurrency(proposal.amount)} · {formattedDate}</p>
      </div>

      {/* Category selector */}
      <select
        value={selectedCategory}
        onChange={e => setSelectedCategory(e.target.value)}
        className="w-full bg-token-paper border border-token-line rounded-lg px-3 py-2 text-token-ink text-sm focus:outline-none focus:border-token-brand"
      >
        {categories.length === 0 ? (
          <option value={proposal.category_name}>{proposal.category_name}</option>
        ) : (
          Object.entries(
            categories.reduce((groups, cat) => {
              const g = cat.group_name || 'Other'
              if (!groups[g]) groups[g] = []
              groups[g].push(cat)
              return groups
            }, {} as Record<string, typeof categories>)
          ).map(([group, cats]) => (
            <optgroup key={group} label={group}>
              {cats.map(cat => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </optgroup>
          ))
        )}
      </select>

      {/* Category auto-fill source label — informational only, never a warning */}
      {proposal.category_source && (
        <span className="inline-block bg-token-surface-2 text-token-ink-3 text-[10px] font-bold px-1.5 py-0.5 rounded">
          {proposal.category_source === 'rule' ? 'Rule'
            : proposal.category_source === 'notes_match' ? 'Notes match'
            : proposal.category_source === 'guess' ? 'Guess'
            : proposal.category_source}
        </span>
      )}

      {/* Notes-based category match — offer an AB rule, unchecked by default */}
      {proposal.notes_category_match && (
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={createRule}
            onChange={e => setCreateRule(e.target.checked)}
            className="mt-1 accent-accent"
          />
          <span className="text-token-ink text-xs">
            Create AB rule: if payee is "{proposal.payee}" and notes contain "{selectedCategory}", always set category to "{selectedCategory}"
          </span>
        </label>
      )}

      {/* Account selector — only shown if there are multiple accounts */}
      {accounts.length > 1 && (
        <select
          value={selectedAccountId}
          onChange={e => setSelectedAccountId(e.target.value)}
          className="w-full bg-token-paper border border-token-line rounded-lg px-3 py-2 text-token-ink text-sm focus:outline-none focus:border-token-brand"
        >
          {accounts.map(acc => (
            <option key={acc.id} value={acc.id}>{acc.name}</option>
          ))}
        </select>
      )}

      <ActionCardButtons onConfirm={handleConfirm} onCancel={handleCancel} loading={loading} />
    </div>
  )
}
