import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Copy, GitCompareArrows } from 'lucide-react'
import {
  getDuplicateMonths,
  getDuplicatePairs,
  confirmCategoryAction,
  cancelCategoryAction,
  type DuplicateMonth,
  type DuplicatePair,
  type DuplicateTransactionSide,
} from '../lib/api'
import { PageHeader } from '../components/shell/PageHeader'
import { Card } from '../components/ui/Card'
import ActionCardButtons from '../components/ActionCardButtons'
import StandardHeaderActions from '../components/StandardHeaderActions'
import { formatCurrency } from '../lib/formatCurrency'
import { formatDate, formatMonthYear } from '../lib/formatDate'

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
  const queryClient = useQueryClient()
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  // Locally-dismissed pairs (confirmed or cancelled) — filters them out of the
  // month detail without a backend "dismissed" state (#181 known limitation).
  const [handledIds, setHandledIds] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data: months = [], isLoading: monthsLoading } = useQuery<DuplicateMonth[]>({
    queryKey: ['duplicates', 'months'],
    queryFn: () => getDuplicateMonths(),
    staleTime: 120_000,
  })

  const { data: duplicatesData, isLoading: pairsLoading } = useQuery<{ pairs: DuplicatePair[]; available_categories: string[] }>({
    queryKey: ['duplicates', 'month', selectedMonth],
    queryFn: () => getDuplicatePairs(selectedMonth!),
    enabled: !!selectedMonth,
    staleTime: 60_000,
  })
  const pairs = duplicatesData?.pairs ?? []
  const availableCategories = duplicatesData?.available_categories ?? []

  // A merge deletes one transaction and recategorizes the survivor, so every
  // query derived from transactions goes stale — not just the duplicate counts
  // the bell and this page display. A cancel only dismisses the suggestion.
  function invalidateAfterMerge() {
    queryClient.invalidateQueries({ queryKey: ['duplicates', 'months'] })
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: ['home'] })
    queryClient.invalidateQueries({ queryKey: ['account-list'] })
    queryClient.invalidateQueries({ queryKey: ['uncategorized-groups'] })
    queryClient.invalidateQueries({ queryKey: ['home-pending'] })
  }

  function invalidateAfterCancel() {
    queryClient.invalidateQueries({ queryKey: ['duplicates', 'months'] })
  }

  async function handleConfirm(pair: DuplicatePair, override?: { duplicate_payee?: string; duplicate_category_name?: string; duplicate_notes?: string; duplicate_date?: string }) {
    setBusyId(pair.action_id)
    try {
      await confirmCategoryAction(pair.action_id, override)
      setActionError(null)
      setHandledIds(prev => new Set(prev).add(pair.action_id))
      invalidateAfterMerge()
    } catch (err) {
      setActionError(
        `Couldn't merge the pair${err instanceof Error ? `: ${err.message}` : ''} — it stays in place so you can retry.`
      )
    } finally {
      setBusyId(null)
    }
  }

  async function handleCancel(pair: DuplicatePair) {
    setBusyId(pair.action_id)
    try {
      await cancelCategoryAction(pair.action_id)
      setActionError(null)
      setHandledIds(prev => new Set(prev).add(pair.action_id))
      invalidateAfterCancel()
    } catch (err) {
      setActionError(
        `Couldn't cancel the pair${err instanceof Error ? `: ${err.message}` : ''} — it stays in place so you can retry.`
      )
    } finally {
      setBusyId(null)
    }
  }

  // Filter out pairs the user already resolved this session.
  const visiblePairs = pairs.filter(p => !handledIds.has(p.action_id))

  if (selectedMonth) {
    return (
      <div className="flex flex-col">
        <PageHeader
          eyebrow="Review"
          title={formatMonthTitle(selectedMonth)}
          back={{ onClick: () => { setSelectedMonth(null); setHandledIds(new Set()); setActionError(null) } }}
          actions={<StandardHeaderActions variant="no-add" />}
        />
        <div className="flex-1 space-y-3">
          {actionError && (
            <p className="text-token-ink-3 text-xs">{actionError}</p>
          )}
          {pairsLoading ? (
            <p className="text-token-ink-3 text-sm">Loading pairs…</p>
          ) : visiblePairs.length === 0 ? (
            <div className="text-center pt-16">
              <GitCompareArrows size={28} className="mx-auto text-token-ink-3 mb-3" />
              <p className="text-token-ink-3 text-sm">
                No suspected duplicates here — all cleared for this month.
              </p>
            </div>
          ) : (
            visiblePairs.map(pair => (
              <DuplicatePairCard
                key={pair.action_id}
                pair={pair}
                busy={busyId === pair.action_id}
                onConfirm={(override) => handleConfirm(pair, override)}
                onCancel={() => handleCancel(pair)}
                availableCategories={availableCategories}
              />
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        eyebrow="Review"
        title="Duplicates"
        back={{ to: '/' }}
        actions={<StandardHeaderActions variant="no-add" />}
      />
      <div className="flex-1 space-y-3">
        <p className="text-xs text-token-ink-3 px-1">
          Bank-sync vs. manual entries that look like the same payment. Review each
          pair side by side and merge one at a time — nothing is touched until you tap Confirm.
        </p>
        {monthsLoading ? (
          <p className="text-token-ink-3 text-sm">Loading…</p>
        ) : months.length === 0 ? (
          <div className="text-center pt-16">
            <Copy size={28} className="mx-auto text-token-ink-3 mb-3" />
            <p className="text-token-ink-3 text-sm">No suspected duplicates found. 🎉</p>
          </div>
        ) : (
          months.map(m => (
            <button
              key={m.month}
              onClick={() => setSelectedMonth(m.month)}
              className="w-full text-left"
            >
              <Card variant="list-item" className="hover:bg-token-surface-2 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-token-ink text-sm font-medium capitalize">{formatMonthTitle(m.month)}</p>
                    <p className="text-token-ink-3 text-xs mt-0.5">
                      {m.count} {m.count === 1 ? 'pair' : 'pairs'} to review
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-token-ink-3 flex-shrink-0" />
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
  pair, busy, onConfirm, onCancel, availableCategories,
}: {
  pair: DuplicatePair
  busy: boolean
  onConfirm: (override: { duplicate_payee: string; duplicate_category_name: string; duplicate_notes: string; duplicate_date: string }) => void
  onCancel: () => void
  availableCategories: string[]
}) {
  const isTransfer = pair.kind === 'transfer'
  const surviving = isTransfer ? pair.manual : pair.synced

  const [payee, setPayee] = useState(surviving.payee)
  const [category, setCategory] = useState(surviving.category_name)
  const [notes, setNotes] = useState(surviving.notes)
  // Seeded from the bank-synced side, not `surviving` — for a transfer pair the
  // surviving transfer leg's own date is exactly the unreliable value #242 fixes;
  // defaulting the field to it would silently undo that fix on every untouched confirm.
  const [date, setDate] = useState(pair.synced.date)

  const handleConfirm = () => {
    onConfirm({ duplicate_payee: payee, duplicate_category_name: category, duplicate_notes: notes, duplicate_date: date })
  }

  return (
    <Card variant="list-item" className="border-l-[3px] border-l-token-warn">
      <div className="grid grid-cols-2 gap-3">
        <SideBlock title={isTransfer ? 'Transfer' : 'Manual entry'} side={pair.manual} keep={isTransfer} />
        <SideBlock title="Bank-synced" side={pair.synced} keep={!isTransfer} />
      </div>

      {/* edit fields for the surviving side */}
      <div className="mt-3 space-y-2">
        <div className="space-y-1">
          <label className="text-xs text-token-ink-3">Payee</label>
          <input
            type="text"
            value={payee}
            onChange={e => setPayee(e.target.value)}
            className="w-full bg-token-paper border border-token-line rounded-xl px-3 py-2 text-token-ink text-sm outline-none focus:border-token-brand"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-token-ink-3">Category</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="w-full bg-token-paper border border-token-line rounded-xl px-3 py-2 text-token-ink text-sm outline-none focus:border-token-brand"
          >
            {!category && <option value="" disabled>Select a category…</option>}
            {availableCategories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-token-ink-3">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full bg-token-paper border border-token-line rounded-xl px-3 py-2 text-token-ink text-sm outline-none focus:border-token-brand"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-token-ink-3">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full bg-token-paper border border-token-line rounded-xl px-3 py-2 text-token-ink text-sm outline-none focus:border-token-brand"
          />
        </div>
      </div>

      <p className="text-xs text-token-warn mt-3 px-1">
        {isTransfer
          ? 'This is one side of a transfer — resolving keeps the transfer linked and removes the duplicate bank-sync entry instead. Your account balance is checked before and after.'
          : 'Double-check every detail before confirming — this deletes the manual entry. Its category/notes are copied onto the bank-synced transaction first, if missing.'}
      </p>
      <div className="mt-4">
        <ActionCardButtons
          onConfirm={handleConfirm}
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
      <p className={`text-[11px] tracking-[0.15em] uppercase mb-2 ${keep ? 'text-token-gain' : 'text-token-ink-3'}`}>{title}</p>
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
      <span className="text-token-ink-3 mr-1.5">{label}:</span>
      <span className={strong ? 'text-token-ink font-medium' : 'text-token-ink'}>{value}</span>
    </div>
  )
}

function formatMonthTitle(month: string): string {
  const [year, m] = month.split('-').map(Number)
  const d = new Date(year, m - 1, 1)
  return formatMonthYear(d)
}
