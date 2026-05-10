import { useState, useEffect } from 'react'
import { Check, X } from 'lucide-react'
import { confirmProposal, cancelProposal, getCategories, type CategoryItem } from '../lib/api'

export interface ProposalData {
  id: string
  merchant: string
  amount: number
  date: string
  category_name: string
  account_name: string
}

interface Props {
  proposal: ProposalData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function ProposalCard({ proposal, onConfirmed, onCancelled }: Props) {
  const [selectedCategory, setSelectedCategory] = useState(proposal.category_name)
  const [categories, setCategories] = useState<CategoryItem[]>([])

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {})
  }, [])

  async function handleConfirm() {
    try {
      const result = await confirmProposal(proposal.id, selectedCategory)
      if (result.message.toLowerCase().includes('duplicate') || result.message.toLowerCase().includes('already exists')) {
        onConfirmed(`Duplicate: ${proposal.merchant} €${proposal.amount.toFixed(2)} already exists in Actual Budget for this date.`)
      } else {
        onConfirmed(`Added: ${proposal.merchant} €${proposal.amount.toFixed(2)} → ${selectedCategory}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      onConfirmed(`Error: could not add transaction (${msg}). Try again via chat.`)
    }
  }

  async function handleCancel() {
    try {
      await cancelProposal(proposal.id)
    } catch {}
    onCancelled()
  }

  const formattedDate = new Date(proposal.date).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  })

  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[80%] space-y-3">
      <div>
        <p className="text-white font-medium">{proposal.merchant}</p>
        <p className="text-muted text-sm">€{proposal.amount.toFixed(2)} · {formattedDate}</p>
        <p className="text-muted text-sm">{proposal.account_name}</p>
      </div>

      {/* Category selector */}
      <select
        value={selectedCategory}
        onChange={e => setSelectedCategory(e.target.value)}
        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
      >
        {categories.length === 0 ? (
          <option value={proposal.category_name}>{proposal.category_name}</option>
        ) : (
          categories.map(cat => (
            <option key={cat.id} value={cat.name}>{cat.name}</option>
          ))
        )}
      </select>

      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors active:scale-95"
        >
          <Check size={14} />
          Confirm
        </button>
        <button
          onClick={handleCancel}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-surface-2 hover:bg-surface-hover border border-border text-muted hover:text-white text-sm font-medium transition-colors active:scale-95"
        >
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  )
}
