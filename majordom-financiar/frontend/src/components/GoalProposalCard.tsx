import { useState } from 'react'
import { confirmCategoryAction, cancelCategoryAction } from '../lib/api'
import ActionCardButtons from './ActionCardButtons'
import { Card, SectionLabel } from './kit/Card'

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
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      const result = await confirmCategoryAction(data.id, {
        target: parseFloat(target) || data.target,
        deadline: deadline || null,
        note: note || null,
      })
      onConfirmed(result.message, result.monthly_needed)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(`Could not set savings goal (${msg}). Try again.`)
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
    <Card label="Set savings goal?" className="max-w-[85%] rounded-bl-sm">
      <div className="space-y-3">
        <p className="text-token-ink-3 text-xs">{data.account_name}</p>

        {/* Editable amount */}
        <div className="space-y-1">
          <SectionLabel>Target amount</SectionLabel>
          <div className="flex items-center gap-1.5 bg-token-paper border border-token-line rounded-xl px-3 py-2">
            <span className="text-token-ink-3 text-sm">€</span>
            <input
              type="number"
              value={target}
              onChange={e => setTarget(e.target.value)}
              className="flex-1 bg-transparent text-token-ink text-sm font-mono tabular-nums outline-none min-w-0"
              min={0}
            />
          </div>
        </div>

        {/* Editable deadline — input type="month" gives native picker on mobile */}
        <div className="space-y-1">
          <SectionLabel>Deadline (optional)</SectionLabel>
          <input
            type="month"
            value={deadline}
            onChange={e => setDeadline(e.target.value)}
            className="w-full bg-token-paper border border-token-line rounded-xl px-3 py-2 text-token-ink text-sm font-mono outline-none focus:border-token-brand"
          />
        </div>

        {/* Editable purpose — shown later in the goal card's (i) info popup */}
        <div className="space-y-1">
          <SectionLabel>Description (optional)</SectionLabel>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. trip to Scandinavia"
            className="w-full bg-token-paper border border-token-line rounded-xl px-3 py-2 text-token-ink text-sm outline-none focus:border-token-brand"
          />
        </div>

        {error && <p className="text-token-loss text-xs">{error}</p>}

        <ActionCardButtons onConfirm={handleConfirm} onCancel={handleCancel} loading={loading} confirmDisabled={!target} />
      </div>
    </Card>
  )
}
