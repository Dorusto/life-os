import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, TrendingUp } from 'lucide-react'
import { getBudgetRealismFlags, type CategoryActionData } from '../lib/api'
import PageHeader from '../components/PageHeader'
import IconButton from '../components/IconButton'
import StandardHeaderActions from '../components/StandardHeaderActions'
import CategoryActionCard from '../components/CategoryActionCard'

/**
 * Budget realism review screen — Inbox occupant #4 (Phase C, #110,
 * docs/product-plan.md), opens from the NotificationBell's dedicated row.
 *
 * One card per category whose last closed month's overspend is driven by a
 * single one-off transaction (>5x the average of its other transactions
 * that month), not genuine recurring overspending — see
 * list_budget_realism_flags() in client.py. Confirming tags the flagged
 * transaction #one-off; it doesn't create a sinking-fund category (#111's
 * scope, deliberately not built here).
 */
export default function BudgetRealismReviewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [handledIds, setHandledIds] = useState<Set<string>>(new Set())

  const { data: items = [], isLoading, isError, error } = useQuery<CategoryActionData[]>({
    queryKey: ['budget-realism-flags'],
    queryFn: () => getBudgetRealismFlags(),
    staleTime: 60_000,
  })

  const visibleItems = items.filter(item => !handledIds.has(item.id))

  function handleDone() {
    queryClient.invalidateQueries({ queryKey: ['budget-realism-flags'] })
  }

  return (
    <div className="min-h-full bg-token-paper flex flex-col">
      <PageHeader
        label="Review"
        title="Budget Realism"
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
          Categories where last month's overspend looks like a one-off purchase, not
          recurring habit. Review each and confirm one at a time — nothing is touched
          until you tap Confirm.
        </p>
        {isLoading ? (
          <p className="text-token-ink-3 text-sm">Loading…</p>
        ) : isError ? (
          <p className="text-token-ink-3 text-xs">
            Couldn't load budget realism flags{error instanceof Error ? `: ${error.message}` : '.'}
          </p>
        ) : visibleItems.length === 0 ? (
          <div className="text-center pt-16">
            <TrendingUp size={28} className="mx-auto text-token-ink-3 mb-3" />
            <p className="text-token-ink-3 text-sm">No distorted categories — all clear 🎉</p>
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
