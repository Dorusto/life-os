import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { confirmCategoryAction, cancelCategoryAction } from '../lib/api'

export interface GoalProposalData {
  id: string
  account_name: string
  target: number
  deadline?: string | null
}

interface Props {
  data: GoalProposalData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

function formatDeadline(deadline: string): string {
  const [year, month] = deadline.split('-').map(Number)
  return new Date(year, month - 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

export default function GoalProposalCard({ data, onConfirmed, onCancelled }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      const result = await confirmCategoryAction(data.id)
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

  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[80%] space-y-3">
      <div>
        <p className="text-white font-medium">Set savings goal?</p>
        <p className="text-white text-sm mt-0.5">{data.account_name}</p>
        <p className="text-muted text-sm">
          <span className="text-white font-mono">€{data.target.toLocaleString('nl-NL')}</span>
          {data.deadline && (
            <> · by <span className="text-white">{formatDeadline(data.deadline)}</span></>
          )}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors active:scale-95 disabled:opacity-50"
        >
          <Check size={14} />
          Confirm
        </button>
        <button
          onClick={handleCancel}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-surface-2 hover:bg-surface-hover border border-border text-muted hover:text-white text-sm font-medium transition-colors active:scale-95 disabled:opacity-50"
        >
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  )
}
