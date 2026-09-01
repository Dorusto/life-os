import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Repeat } from 'lucide-react'
import { getRecurringFindings, type CategoryActionData } from '../lib/api'
import PageHeader from '../components/PageHeader'
import IconButton from '../components/IconButton'
import CategoryActionCard from '../components/CategoryActionCard'

/**
 * Recurring-transaction lifecycle review screen (Phase C, #41 rescoped,
 * docs/product-plan.md), opens from the NotificationBell's dedicated row.
 *
 * Two sections from one GET /home/recurring fetch:
 *  - New recurring: a payee+account pattern repeats but has no AB Schedule
 *    yet — confirming creates one (create_schedule).
 *  - Stopped repeating: an active Schedule AB itself considers overdue —
 *    confirming deactivates it (deactivate_schedule), never deletes.
 */
export default function RecurringReviewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [handledIds, setHandledIds] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery<{ newCandidates: CategoryActionData[]; stale: CategoryActionData[] }>({
    queryKey: ['recurring-findings'],
    queryFn: () => getRecurringFindings(),
    staleTime: 60_000,
  })

  const newCandidates = (data?.newCandidates ?? []).filter(item => !handledIds.has(item.id))
  const stale = (data?.stale ?? []).filter(item => !handledIds.has(item.id))

  function handleDone() {
    queryClient.invalidateQueries({ queryKey: ['recurring-findings'] })
  }

  function markHandled(id: string) {
    setHandledIds(prev => new Set(prev).add(id))
    handleDone()
  }

  const bothEmpty = newCandidates.length === 0 && stale.length === 0

  return (
    <div className="min-h-dvh bg-background flex flex-col overflow-y-auto">
      <PageHeader
        label="Review"
        title="Recurring"
        actions={
          <IconButton
            icon={ArrowLeft}
            onClick={() => navigate('/')}
            label="Back to home"
          />
        }
      />
      <div className="flex-1 px-5 pb-24 space-y-5">
        {isLoading ? (
          <p className="text-muted text-sm">Loading…</p>
        ) : bothEmpty ? (
          <div className="text-center pt-16">
            <Repeat size={28} className="mx-auto text-muted mb-3" />
            <p className="text-muted text-sm">No recurring findings — all clear 🎉</p>
          </div>
        ) : (
          <>
            {newCandidates.length > 0 && (
              <div className="space-y-3">
                <div>
                  <p className="text-white text-sm font-medium">New recurring</p>
                  <p className="text-xs text-muted px-1">
                    Repeats but has no schedule yet. Review each and confirm one at a time —
                    nothing is touched until you tap Confirm.
                  </p>
                </div>
                {newCandidates.map(item => (
                  <CategoryActionCard
                    key={item.id}
                    data={item}
                    onConfirmed={() => markHandled(item.id)}
                    onCancelled={() => markHandled(item.id)}
                  />
                ))}
              </div>
            )}
            {stale.length > 0 && (
              <div className="space-y-3">
                <div>
                  <p className="text-white text-sm font-medium">Stopped repeating</p>
                  <p className="text-xs text-muted px-1">
                    An active schedule with no matching transaction in a while. It will be
                    turned off, not deleted.
                  </p>
                </div>
                {stale.map(item => (
                  <CategoryActionCard
                    key={item.id}
                    data={item}
                    onConfirmed={() => markHandled(item.id)}
                    onCancelled={() => markHandled(item.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
