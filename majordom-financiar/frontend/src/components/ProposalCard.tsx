import { Check, X } from 'lucide-react'
import { confirmProposal, cancelProposal } from '../lib/api'

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
  async function handleConfirm() {
    try {
      await confirmProposal(proposal.id)
      onConfirmed(`Added: ${proposal.merchant} €${proposal.amount.toFixed(2)} → ${proposal.category_name}`)
    } catch {
      onConfirmed('Error: could not add transaction. Try again.')
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
        <p className="text-muted text-sm">€{proposal.amount.toFixed(2)} · {proposal.category_name}</p>
        <p className="text-muted text-sm">{formattedDate} · {proposal.account_name}</p>
      </div>
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
