import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ChevronRight, Copy, GitCompareArrows } from 'lucide-react'
import {
  getDuplicateMonths,
  getDuplicatePairs,
  confirmCategoryAction,
  cancelCategoryAction,
  type DuplicateMonth,
  type DuplicatePair,
  type DuplicateTransactionSide,
} from '../lib/api'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import ActionCardButtons from '../components/ActionCardButtons'
import IconButton from '../components/IconButton'
import { formatCurrency } from '../lib/formatCurrency'

/**
 * Duplicate review screen (#181) — opens from the Home header icon.
 *
 * Single page, two internal states (month list ↔ month detail) — this is a
 * screen, not a new navigation architecture, so a `useState(selectedMonth)` is
 * enough (no route param, matches how `/import`/`/receipt` structure their flows).
 * Each pair is rendered via the shared Card + ActionCardButtons components and
 * confirmed/cancelled individually through the existing category-actions
 * endpoints — never automatic, never bulk.
 */
export default function DuplicatesReviewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  // Locally-dismissed pairs (confirmed or cancelled) — filters them out of the
  // month detail without a backend "dismissed" state (#181 known limitation).
  const [handledIds, setHandledIds] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)

  const { data: months = [], isLoading: monthsLoading } = useQuery<DuplicateMonth[]>({
    queryKey: ['duplicates', 'months'],
    queryFn: () => getDuplicateMonths(),
    staleTime: 120_000,
  })

  const { data: pairs = [], isLoading: pairsLoading } = useQuery<DuplicatePair[]>({
    queryKey: ['duplicates', 'month', selectedMonth],
    queryFn: () => getDuplicatePairs(selectedMonth!),
    enabled: !!selectedMonth,
    staleTime: 60_000,
  })

  function invalidateCounts() {
    queryClient.invalidateQueries({ queryKey: ['duplicates', 'months'] })
  }

  async function handleConfirm(pair: DuplicatePair) {
    setBusyId(pair.action_id)
    try {
      await confirmCategoryAction(pair.action_id)
      setHandledIds(prev => new Set(prev).add(pair.action_id))
      invalidateCounts()
    } catch {
      // Leave it in place so the user can retry.
    } finally {
      setBusyId(null)
    }
  }

  async function handleCancel(pair: DuplicatePair) {
    setBusyId(pair.action_id)
    try {
      await cancelCategoryAction(pair.action_id)
      setHandledIds(prev => new Set(prev).add(pair.action_id))
      invalidateCounts()
    } finally {
      setBusyId(null)
    }
  }

  // Filter out pairs the user already resolved this session.
  const visiblePairs = pairs.filter(p => !handledIds.has(p.action_id))

  const backToMonths = selectedMonth
    ? (
      <IconButton
        icon={ArrowLeft}
        onClick={() => { setSelectedMonth(null); setHandledIds(new Set()) }}
        label="Back to months"
      />
    )
    : (
      <IconButton
        icon={ArrowLeft}
        onClick={() => navigate('/')}
        label="Back to home"
      />
    )


  if (selectedMonth) {
    return (
      <div className="min-h-dvh bg-background flex flex-col overflow-y-auto">
        <PageHeader
          label="Review"
          title={formatMonthTitle(selectedMonth)}
          actions={backToMonths}
        />
        <div className="flex-1 px-5 pb-24 space-y-3">
          {pairsLoading ? (
            <p className="text-muted text-sm">Loading pairs…</p>
          ) : visiblePairs.length === 0 ? (
            <div className="text-center pt-16">
              <GitCompareArrows size={28} className="mx-auto text-muted mb-3" />
              <p className="text-muted text-sm">
                No suspected duplicates here — all cleared for this month.
              </p>
            </div>
          ) : (
            visiblePairs.map(pair => (
              <DuplicatePairCard
                key={pair.action_id}
                pair={pair}
                busy={busyId === pair.action_id}
                onConfirm={() => handleConfirm(pair)}
                onCancel={() => handleCancel(pair)}
              />
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col overflow-y-auto">
      <PageHeader
        label="Review"
        title="Duplicates"
        actions={backToMonths}
      />
      <div className="flex-1 px-5 pb-24 space-y-3">
        <p className="text-xs text-muted px-1">
          Bank-sync vs. manual entries that look like the same payment. Review each
          pair side by side and merge one at a time — nothing is touched until you tap Confirm.
        </p>
        {monthsLoading ? (
          <p className="text-muted text-sm">Loading…</p>
        ) : months.length === 0 ? (
          <div className="text-center pt-16">
            <Copy size={28} className="mx-auto text-muted mb-3" />
            <p className="text-muted text-sm">No suspected duplicates found. 🎉</p>
          </div>
        ) : (
          months.map(m => (
            <button
              key={m.month}
              onClick={() => setSelectedMonth(m.month)}
              className="w-full text-left"
            >
              <Card variant="list-item" className="hover:bg-surface-hover transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm font-medium capitalize">{formatMonthTitle(m.month)}</p>
                    <p className="text-muted text-xs mt-0.5">
                      {m.count} {m.count === 1 ? 'pair' : 'pairs'} to review
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-muted flex-shrink-0" />
                </div>
              </Card>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function DuplicatePairCard({
  pair, busy, onConfirm, onCancel,
}: {
  pair: DuplicatePair
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const isTransfer = pair.kind === 'transfer'
  return (
    <Card variant="list-item" accentColor="#F59E0B" accentSide="left">
      <div className="grid grid-cols-2 gap-3">
        <SideBlock title={isTransfer ? 'Transfer' : 'Manual entry'} side={pair.manual} keep={isTransfer} />
        <SideBlock title="Bank-synced" side={pair.synced} keep={!isTransfer} />
      </div>
      <p className="text-xs text-attention mt-3 px-1">
        {isTransfer
          ? 'This is one side of a transfer — resolving keeps the transfer linked and removes the duplicate bank-sync entry instead. Your account balance is checked before and after.'
          : 'Double-check every detail before confirming — this deletes the manual entry. Its category/notes are copied onto the bank-synced transaction first, if missing.'}
      </p>
      <div className="mt-4">
        <ActionCardButtons
          onConfirm={onConfirm}
          onCancel={onCancel}
          loading={busy}
          confirmLabel={isTransfer ? 'Resolve' : 'Merge'}
          confirmIcon={GitCompareArrows}
        />
      </div>
    </Card>
  )
}

function SideBlock({ title, side, keep }: { title: string; side: DuplicateTransactionSide; keep?: boolean }) {
  return (
    <div>
      <p className={`text-[11px] tracking-[0.15em] uppercase mb-2 ${keep ? 'text-success' : 'text-muted'}`}>{title}</p>
      <div className="space-y-1">
        <Row label="Date" value={formatDate(side.date)} />
        <Row label="Amount" value={formatCurrency(side.amount)} strong />
        <Row label="Payee" value={side.payee || '—'} />
        <Row label="Category" value={side.category_name || 'Uncategorized'} />
        <Row label="Notes" value={side.notes || '—'} />
      </div>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="text-xs">
      <span className="text-muted mr-1.5">{label}:</span>
      <span className={strong ? 'text-white font-medium' : 'text-white'}>{value}</span>
    </div>
  )
}

function formatMonthTitle(month: string): string {
  const [year, m] = month.split('-').map(Number)
  const d = new Date(year, m - 1, 1)
  return d.toLocaleDateString('en-NL', { month: 'long', year: 'numeric' })
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-NL', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}
