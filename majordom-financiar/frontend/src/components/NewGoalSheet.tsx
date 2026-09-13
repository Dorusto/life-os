import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAccountList, sendChatMessageStreaming } from '../lib/api'
import BottomSheet from './BottomSheet'
import GoalProposalCard, { type GoalProposalData } from './GoalProposalCard'
import { formatMonthYear } from '../lib/formatDate'

interface Props {
  open: boolean
  onClose: () => void
  /** Fired once the user confirms the goal proposal (goal is already saved). */
  onCreated: () => void
}

/**
 * "+ New goal" form — collects the same fields a chat message would need
 * (account, target, deadline, note), then submits a single constructed
 * message to the existing /chat tool-calling pipeline in the background
 * (finance__set_account_goal is already in _PROPOSAL_TOOLS) and renders the
 * resulting GoalProposalCard right here for confirmation. No navigation to
 * /chat, no free-text typing — but no new backend write path either, this
 * still goes through the same LLM tool-call + confirmation-card mechanism
 * every other write in the app uses.
 */
export default function NewGoalSheet({ open, onClose, onCreated }: Props) {
  const { data: accounts } = useQuery({
    queryKey: ['account-list'],
    queryFn: () => getAccountList(),
    staleTime: 120_000,
    enabled: open,
  })

  const [accountName, setAccountName] = useState('')
  const [target, setTarget] = useState('')
  const [deadline, setDeadline] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<GoalProposalData | null>(null)

  function reset() {
    setAccountName('')
    setTarget('')
    setDeadline('')
    setNote('')
    setError(null)
    setProposal(null)
    setLoading(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function buildMessage(): string {
    let msg = `I'm saving €${target} in ${accountName}`
    if (deadline) {
      const [year, month] = deadline.split('-')
      const d = new Date(Number(year), Number(month) - 1)
      msg += `, targeting ${formatMonthYear(d)}`
    }
    if (note) msg += `. ${note}`
    return msg
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!accountName || !target) return
    setLoading(true)
    setError(null)
    let gotProposal = false

    sendChatMessageStreaming(
      buildMessage(),
      [],
      (chunk) => {
        const trimmed = chunk.trim()
        if (!trimmed.startsWith('{')) return
        try {
          const parsed = JSON.parse(trimmed)
          if (parsed.type === 'goal_proposal') {
            gotProposal = true
            setProposal(parsed as GoalProposalData)
            setLoading(false)
          } else if (parsed.type === 'error') {
            setError(parsed.message || 'Something went wrong.')
            setLoading(false)
          }
        } catch {
          // Non-JSON or partial chunk — ignore, matches Chat.tsx's own parsing.
        }
      },
      () => {
        if (!gotProposal) {
          setLoading(false)
          setError(prev => prev ?? 'Could not set up the goal from those details — try again or use Chat directly.')
        }
      },
      (err) => {
        setError(err)
        setLoading(false)
      }
    )
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title="New goal">
      {proposal ? (
        <GoalProposalCard
          data={proposal}
          onConfirmed={() => { reset(); onCreated() }}
          onCancelled={handleClose}
        />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <p className="text-token-ink-3 text-xs">Account</p>
            <select
              value={accountName}
              onChange={e => setAccountName(e.target.value)}
              required
              className="w-full bg-token-paper border border-token-line rounded-xl px-3 py-2 text-token-ink text-sm outline-none focus:border-token-brand"
            >
              <option value="" disabled>Select an account</option>
              {accounts?.map(a => (
                <option key={a.id} value={a.name}>{a.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <p className="text-token-ink-3 text-xs">Target amount</p>
            <div className="flex items-center gap-1.5 bg-token-paper border border-token-line rounded-xl px-3 py-2">
              <span className="text-token-ink-3 text-sm">€</span>
              <input
                type="number"
                min={0}
                required
                value={target}
                onChange={e => setTarget(e.target.value)}
                className="flex-1 bg-transparent text-token-ink text-sm font-plex-mono outline-none min-w-0"
              />
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-token-ink-3 text-xs">Deadline <span className="text-token-ink-3">(optional)</span></p>
            <input
              type="month"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              className="w-full bg-token-paper border border-token-line rounded-xl px-3 py-2 text-token-ink text-sm font-plex-mono outline-none focus:border-token-brand"
            />
          </div>

          <div className="space-y-1">
            <p className="text-token-ink-3 text-xs">Description <span className="text-token-ink-3">(optional)</span></p>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. trip to Scandinavia"
              className="w-full bg-token-paper border border-token-line rounded-xl px-3 py-2 text-token-ink text-sm outline-none focus:border-token-brand"
            />
          </div>

          {error && <p className="text-token-loss text-xs">{error}</p>}

          <button
            type="submit"
            disabled={loading || !accountName || !target}
            className="w-full bg-token-brand hover:bg-token-brand-2 disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors"
          >
            {loading ? 'Setting up…' : 'Continue'}
          </button>
        </form>
      )}
    </BottomSheet>
  )
}
