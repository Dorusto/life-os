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

export default function GoalProposalCard({ data, onConfirmed, onCancelled }: Props) {
  const [target, setTarget] = useState(String(data.target))
  const [deadline, setDeadline] = useState(data.deadline ?? '')
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      const result = await confirmCategoryAction(data.id, {
        target: parseFloat(target) || data.target,
        deadline: deadline || null,
      })
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
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[85%] space-y-3">
      <div>
        <p className="text-white font-medium">Set savings goal?</p>
        <p className="text-muted text-xs mt-0.5">{data.account_name}</p>
      </div>

      {/* Editable amount */}
      <div className="space-y-1">
        <p className="text-muted text-xs">Target amount</p>
        <div className="flex items-center gap-1.5 bg-background border border-border rounded-xl px-3 py-2">
          <span className="text-muted text-sm">€</span>
          <input
            type="number"
            value={target}
            onChange={e => setTarget(e.target.value)}
            className="flex-1 bg-transparent text-white text-sm font-mono outline-none min-w-0"
            min={0}
          />
        </div>
      </div>

      {/* Editable deadline — input type="month" gives native picker on mobile */}
      <div className="space-y-1">
        <p className="text-muted text-xs">Deadline <span className="text-muted/60">(optional)</span></p>
        <input
          type="month"
          value={deadline}
          onChange={e => setDeadline(e.target.value)}
          className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm font-mono outline-none focus:border-accent"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={loading || !target}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors active:scale-95 disabled:opacity-50"
        >
          <Check size={14} />
          Confirm
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
