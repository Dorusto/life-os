import { useState } from 'react'
import { confirmCategoryAction, cancelCategoryAction } from '../lib/api'
import ActionCardButtons from './ActionCardButtons'

export interface GoalProposalData {
  id: string
  account_name: string
  target: number
  deadline?: string | null
  monthly_needed?: number | null
  note?: string | null
}

interface Props {
  data: GoalProposalData
  onConfirmed: (message: string, monthlyNeeded?: number | null) => void
  onCancelled: () => void
}

export default function GoalProposalCard({ data, onConfirmed, onCancelled }: Props) {
  const [target, setTarget] = useState(String(data.target))
  const [deadline, setDeadline] = useState(data.deadline ?? '')
  const [note, setNote] = useState(data.note ?? '')
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      const result = await confirmCategoryAction(data.id, {
        target: parseFloat(target) || data.target,
        deadline: deadline || null,
        note: note || null,
      })
      onConfirmed(result.message, result.monthly_needed)
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

      {/* Editable purpose — shown later in the goal card's (i) info popup */}
      <div className="space-y-1">
        <p className="text-muted text-xs">Description <span className="text-muted/60">(optional)</span></p>
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="e.g. trip to Scandinavia"
          className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-accent"
        />
      </div>

      <ActionCardButtons onConfirm={handleConfirm} onCancel={handleCancel} loading={loading} confirmDisabled={!target} />
    </div>
  )
}
