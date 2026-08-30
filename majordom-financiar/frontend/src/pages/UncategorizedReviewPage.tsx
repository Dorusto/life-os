import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Tags } from 'lucide-react'
import { getUncategorizedGroups, type CategoryActionData } from '../lib/api'
import PageHeader from '../components/PageHeader'
import IconButton from '../components/IconButton'
import CategoryActionCard from '../components/CategoryActionCard'

/**
 * Uncategorized-by-payee review screen — Inbox occupant #2 (Phase B,
 * docs/product-plan.md), opens from the NotificationBell's dedicated row.
 *
 * Flat list, no month drill-down (payee groups have no natural month
 * dimension, unlike DuplicatesReviewPage's duplicate pairs). Each group is
 * already a full categorize_with_rule proposal by the time it reaches here —
 * CategoryActionCard renders the editable category select + create-rule
 * checkbox and drives confirm/cancel itself.
 */
export default function UncategorizedReviewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // Locally-dismissed items (confirmed or cancelled) — filters them out of
  // the list without waiting on a refetch, same pattern as DuplicatesReviewPage.
  const [handledIds, setHandledIds] = useState<Set<string>>(new Set())

  const { data: items = [], isLoading } = useQuery<CategoryActionData[]>({
    queryKey: ['uncategorized-groups'],
    queryFn: () => getUncategorizedGroups(),
    staleTime: 60_000,
  })

  const visibleItems = items.filter(item => !handledIds.has(item.id))

  function handleDone() {
    queryClient.invalidateQueries({ queryKey: ['uncategorized-groups'] })
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col overflow-y-auto">
      <PageHeader
        label="Review"
        title="Uncategorized"
        actions={
          <IconButton
            icon={ArrowLeft}
            onClick={() => navigate('/')}
            label="Back to home"
          />
        }
      />
      <div className="flex-1 px-5 pb-24 space-y-3">
        <p className="text-xs text-muted px-1">
          Transactions grouped by payee, with a suggested category from your history.
          Review each group and confirm one at a time — nothing is touched until you tap Confirm.
        </p>
        {isLoading ? (
          <p className="text-muted text-sm">Loading…</p>
        ) : visibleItems.length === 0 ? (
          <div className="text-center pt-16">
            <Tags size={28} className="mx-auto text-muted mb-3" />
            <p className="text-muted text-sm">No uncategorized transactions — all clear 🎉</p>
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
