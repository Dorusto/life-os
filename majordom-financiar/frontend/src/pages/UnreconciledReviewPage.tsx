import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Landmark } from 'lucide-react'
import { getUnreconciledGroups, type CategoryActionData } from '../lib/api'
import PageHeader from '../components/PageHeader'
import IconButton from '../components/IconButton'
import StandardHeaderActions from '../components/StandardHeaderActions'
import CategoryActionCard from '../components/CategoryActionCard'

/**
 * Unreconciled-by-account review screen — Inbox occupant #3 (Phase C, #116,
 * docs/product-plan.md), opens from the NotificationBell's dedicated row.
 *
 * Flat list, grouped by account rather than payee (only manual/CSV accounts
 * ever show up — bank-synced ones self-resolve, see list_unreconciled_groups()
 * in client.py).
 * Each group is already a full mark_reconciled proposal by the time it
 * reaches here — CategoryActionCard renders the preview + drives confirm/cancel.
 */
export default function UnreconciledReviewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [handledIds, setHandledIds] = useState<Set<string>>(new Set())

  const { data: items = [], isLoading, isError, error } = useQuery<CategoryActionData[]>({
    queryKey: ['unreconciled-groups'],
    queryFn: () => getUnreconciledGroups(),
    staleTime: 60_000,
  })

  const visibleItems = items.filter(item => !handledIds.has(item.id))

  function handleDone() {
    queryClient.invalidateQueries({ queryKey: ['unreconciled-groups'] })
  }

  return (
    <div className="h-dvh bg-token-paper flex flex-col overflow-y-auto">
      <PageHeader
        label="Review"
        title="Unreconciled"
        actions={
          <>
            <IconButton
              icon={ArrowLeft}
              onClick={() => navigate('/')}
              label="Back to home"
            />
            <StandardHeaderActions variant="no-add" />
          </>
        }
      />
      <div className="flex-1 px-5 pb-24 space-y-3">
        <p className="text-xs text-token-ink-3 px-1">
          Transactions not yet marked cleared, grouped by account. Review each group and
          confirm one at a time — nothing is touched until you tap Confirm.
        </p>
        {isLoading ? (
          <p className="text-token-ink-3 text-sm">Loading…</p>
        ) : isError ? (
          <p className="text-token-ink-3 text-xs">
            Couldn't load unreconciled groups{error instanceof Error ? `: ${error.message}` : '.'}
          </p>
        ) : visibleItems.length === 0 ? (
          <div className="text-center pt-16">
            <Landmark size={28} className="mx-auto text-token-ink-3 mb-3" />
            <p className="text-token-ink-3 text-sm">No unreconciled transactions — all clear 🎉</p>
          </div>
        ) : (
          visibleItems.map(item => (
            <CategoryActionCard
              key={item.id}
              data={item}
              onConfirmed={() => {
                setHandledIds(prev => new Set(prev).add(item.id))
                handleDone()
              }}
              onCancelled={() => {
                setHandledIds(prev => new Set(prev).add(item.id))
                handleDone()
              }}
            />
          ))
        )}
      </div>
    </div>
  )
}
