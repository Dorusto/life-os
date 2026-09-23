import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Target } from 'lucide-react'
import { deleteGoal, getGoalProjection, getGoals, type Goal } from '../lib/api'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { ErrorState, Loading } from '../components/Feedback'
import { GoalModal } from '../components/GoalModal'
import { LineChart } from '../components/LineChart'
import { MetricTile } from '../components/MetricTile'
import { PageHeader } from '../components/shell/PageHeader'
import { Pill } from '../components/Pill'
import { formatDate, formatEur, formatPercentPoints } from '../lib/format'

function GoalCard({ goal, onDelete }: { goal: Goal; onDelete: () => void }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['goal-projection', goal.id],
    queryFn: () => getGoalProjection(goal.id),
  })

  return (
    <Card
      title={goal.name}
      action={
        <button
          type="button"
          aria-label={`Delete ${goal.name}`}
          onClick={onDelete}
          className="rounded p-1.5 text-ink-3 transition-colors hover:bg-loss-soft hover:text-loss"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      }
    >
      {isLoading ? (
        <Loading />
      ) : isError || !data ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <>
          <div className="mb-5 flex items-center gap-2">
            <Pill tone={data.on_track ? 'gain' : 'warn'}>
              {data.on_track ? 'On track' : 'Behind target'}
            </Pill>
            <span className="text-[12px] text-ink-3">
              target {formatEur(goal.target_amount)} by {formatDate(goal.target_date)}
            </span>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricTile label="Current" value={formatEur(data.current_value_eur)} />
            <MetricTile
              label="Projected"
              value={<span className={data.on_track ? 'text-gain' : 'text-warn'}>{formatEur(data.projected_value_eur)}</span>}
            />
            <MetricTile label="Rate used" value={formatPercentPoints(data.rate * 100, 2)} />
            <MetricTile
              label={data.gap_eur >= 0 ? 'Surplus' : 'Shortfall'}
              value={<span className={data.gap_eur >= 0 ? 'text-gain' : 'text-loss'}>{formatEur(Math.abs(data.gap_eur))}</span>}
            />
          </div>

          <LineChart
            labels={data.points.map((p) => p.date)}
            series={[{ name: goal.name, values: data.points.map((p) => p.value), color: 'var(--c1)', area: true }]}
            baseline={goal.target_amount}
            height={220}
            formatValue={(v) => formatEur(v, true)}
            formatLabel={(l) => formatDate(l)}
          />

          <p className="mt-3 text-[12px] text-ink-3">
            {data.rate_source === 'historical_xirr'
              ? 'Projected from this portfolio’s own historical XIRR.'
              : `Projected from the assumed annual return (${formatPercentPoints(data.assumed_return * 100, 2)}) set in Settings.`}{' '}
            Dashed line marks the target.
          </p>
        </>
      )}
    </Card>
  )
}

export default function Goals() {
  const queryClient = useQueryClient()
  const [showGoal, setShowGoal] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  const goals = useQuery({ queryKey: ['goals'], queryFn: getGoals })

  const remove = useMutation({
    mutationFn: deleteGoal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] })
      setPendingDelete(null)
    },
  })

  if (goals.isLoading) return <Loading label="Loading goals" />
  if (goals.isError) return <ErrorState message="Could not load goals." onRetry={() => goals.refetch()} />

  const list = goals.data ?? []

  return (
    <>
      <PageHeader
        title="Goals"
        description="Target portfolio values with a compounded projection toward each date."
        actions={
          <Button variant="primary" onClick={() => setShowGoal(true)}>
            <Plus className="h-4 w-4" /> Add goal
          </Button>
        }
      />

      {list.length === 0 ? (
        <EmptyState
          title="No goals yet"
          description="Set a target amount and date, and see whether your current pace reaches it."
          action={
            <Button variant="primary" onClick={() => setShowGoal(true)}>
              <Target className="h-4 w-4" /> Add goal
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {list.map((goal) => (
            <GoalCard key={goal.id} goal={goal} onDelete={() => setPendingDelete(goal.id)} />
          ))}
        </div>
      )}

      <GoalModal open={showGoal} onClose={() => setShowGoal(false)} />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete goal"
        message="This removes the goal and its projection. Your transactions and holdings are unaffected."
        confirmLabel="Delete"
        danger
        pending={remove.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete !== null && remove.mutate(pendingDelete)}
      />
    </>
  )
}
