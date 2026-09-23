import { useState } from 'react'
import { useNavigate, type NavigateFunction } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import type { ExpenseCoverageData, FireData, Goal } from '../lib/api'
import InfoIcon from './InfoIcon'
import NewGoalSheet from './NewGoalSheet'
import { formatCurrency, formatPercent } from '../lib/formatCurrency'
import { formatMonthYear } from '../lib/formatDate'
import WidgetLoading from './WidgetLoading'
import { Card } from './kit/Card'
import { ProgressBar } from './kit/Stats'

// Amounts are shown in full, never abbreviated (no €14k / 1.2M). On a screen that also
// shows exact figures, an abbreviated one reintroduces exactly the ambiguity #211 removed.
function euro(n: number): string {
  return formatCurrency(n, { decimals: 0 })
}

function formatDeadline(deadline: string): string {
  const [year, month] = deadline.split('-').map(Number)
  const d = new Date(year, month - 1)
  return formatMonthYear(d, 'short')
}

const FIRE_ASSUMPTIONS_PREFILL = 'I want to set my real retirement assumptions — timeline, monthly spend, and contribution.'

const GOAL_CHIPS: { label: string; colorClass: string; prefill: string }[] = [
  {
    label: 'Expense Coverage',
    colorClass: 'bg-token-gain-soft text-token-gain',
    prefill: 'I want to set up an Expense Coverage goal — how does that work?',
  },
  {
    label: 'FIRE',
    colorClass: 'bg-token-gain-soft text-token-gain',
    prefill: 'I want to check my FIRE / Portfolio Independence assumptions.',
  },
]

/**
 * Financial Goals — a single widget-card (matches the shell every other
 * Dashboard/Planned widget uses: bg-token-surface border rounded-2xl, title inside)
 * instead of the older label-above-separate-accent-cards layout. Rendered on
 * both Dashboard (as the existing 'goals' widget) and the new Planned page —
 * same component, not duplicated (decisions.md#nav-five-tabs supersession).
 */
export default function GoalsSection({
  fireData, expenseCoverage, goals, isLoading,
}: {
  fireData: FireData | undefined
  expenseCoverage?: ExpenseCoverageData
  goals: Goal[] | undefined
  isLoading?: boolean
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [sheetOpen, setSheetOpen] = useState(false)
  const showExpenseCoverage = !!expenseCoverage?.has_any_classified_income
  const hasContent = !!fireData || showExpenseCoverage || (!!goals && goals.length > 0)

  function handleCreated() {
    setSheetOpen(false)
    queryClient.invalidateQueries({ queryKey: ['home'] })
  }

  return (
    <Card
      label="Financial goals"
      action={
        <button
          onClick={() => setSheetOpen(true)}
          className="p-2 text-token-ink-3 transition-colors hover:text-token-ink"
          aria-label="New goal"
        >
          <Plus size={16} />
        </button>
      }
    >
      {isLoading ? (
        <WidgetLoading label="Loading goals…" />
      ) : !hasContent ? (
        <div className="py-4 text-center">
          <p className="text-token-ink font-semibold text-[15px] mb-2.5">Create your first goal</p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <button
              onClick={() => setSheetOpen(true)}
              className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-token-warn-soft text-token-warn"
            >
              Custom goal
            </button>
            {GOAL_CHIPS.map(chip => (
              <button
                key={chip.label}
                onClick={() => navigate('/chat', { state: { prefill: chip.prefill } })}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${chip.colorClass}`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {fireData && <PortfolioIndependenceRow data={fireData} navigate={navigate} />}
          {showExpenseCoverage && expenseCoverage && <ExpenseCoverageRow data={expenseCoverage} />}
          {goals?.map((goal) => (
            <GoalRow key={goal.id} goal={goal} navigate={navigate} />
          ))}
        </>
      )}

      <NewGoalSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onCreated={handleCreated} />
    </Card>
  )
}

function PortfolioIndependenceRow({ data, navigate }: { data: FireData; navigate: NavigateFunction }) {
  const trend = data.trend_months

  return (
    <div className="py-3.5 border-b border-token-line last:border-b-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-token-ink font-semibold text-[15px]">
          Portfolio Independence
          <InfoIcon title="Portfolio Independence">
            <p className="mb-2">
              Money saved to eventually live off investments alone, for a long stretch of time — not
              forever, but for the years you've planned.
            </p>
            <p className="mb-2">
              Counts your off-budget accounts (savings, brokerage, crypto) — your home and any mortgage
              are excluded. Assumes a {formatPercent(data.accumulation_return * 100, { decimals: 0 })} return during
              accumulation, {formatPercent(data.decumulation_return * 100, { decimals: 0 })} during retirement, and your
              current {euro(data.monthly_contribution)}/mo contribution.
            </p>
            <p>
              Target ({euro(data.fire_target)}) is the principal needed today to fund{' '}
              {euro(data.desired_monthly_spend)}/mo for {data.years_in_retirement} years at{' '}
              {formatPercent(data.decumulation_return * 100, { decimals: 0 })} return.
            </p>
            {data.is_default_assumptions && (
              <div className="mt-2 text-token-warn">
                <p>
                  "Placeholder" means these numbers aren't yours yet — they're generic defaults so the
                  card has something to show before you've told Majordom your real plans. Tap below to
                  open Chat and set your real timeline, monthly spend, and contribution.
                </p>
                <button
                  onClick={() => navigate('/chat', { state: { prefill: FIRE_ASSUMPTIONS_PREFILL } })}
                  className="mt-1.5 underline underline-offset-2 font-medium"
                >
                  Set my real numbers →
                </button>
              </div>
            )}
          </InfoIcon>
        </p>
        <p className="flex-shrink-0 font-mono text-lg tabular-nums text-token-ink">
          {formatPercent(data.fire_pct, { decimals: 0 })}
        </p>
      </div>

      <ProgressBar value={data.fire_pct / 100} className="mt-3 mb-2.5" />

      <div className="flex items-center justify-between font-mono text-xs tabular-nums text-token-ink-3">
        <span>{euro(data.fire_portfolio)} saved</span>
        <span>{euro(data.monthly_contribution)}/mo</span>
      </div>

      <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] tabular-nums text-token-ink-2">
        <span>target ~{euro(data.fire_target)}</span>
        <span>
          {data.estimated_year ? `est. ${data.estimated_year}` : '—'}
          {trend != null && trend !== 0 && (
            <span className={`font-bold ml-1 ${trend > 0 ? 'text-token-gain' : 'text-token-loss'}`}>
              {trend > 0 ? '▲' : '▼'}{Math.abs(trend)}mo
            </span>
          )}
        </span>
      </div>

      {data.is_default_assumptions && (
        <button
          onClick={() => navigate('/chat', { state: { prefill: FIRE_ASSUMPTIONS_PREFILL } })}
          className="w-full text-[10px] text-token-warn hover:text-token-warn mt-2 text-center underline underline-offset-2"
        >
          Placeholder assumptions — set your real numbers in Chat
        </button>
      )}
    </div>
  )
}

function ExpenseCoverageRow({ data }: { data: ExpenseCoverageData }) {

  return (
    <div className="py-3.5 border-b border-token-line last:border-b-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-token-ink font-semibold text-[15px]">
          Expense Coverage
          <InfoIcon title="Expense Coverage">
            <p className="mb-2">
              How much of your current monthly expenses your passive and semi-passive income
              covers on its own — Coast/Barista FIRE. At 33%, you could drop a workday or a week
              of active work without falling behind. At 100%, your base expenses are covered
              independent of active work.
            </p>
            <p>
              "Current monthly expenses" excludes one-off large purchases that would otherwise
              distort the picture — the same logic Majordom already uses to flag unusually large
              transactions elsewhere.
            </p>
          </InfoIcon>
        </p>
        <p className="flex-shrink-0 font-mono text-lg tabular-nums text-token-ink">
          {formatPercent(data.coverage_pct, { decimals: 0 })}
        </p>
      </div>

      <ProgressBar value={data.coverage_pct / 100} className="mt-3 mb-2.5" />

      <div className="flex items-center justify-between font-mono text-xs tabular-nums text-token-ink-3">
        <span>{euro(data.passive_semi_passive_income)}/mo passive+semi-passive</span>
        <span>{euro(data.filtered_monthly_expenses)}/mo expenses</span>
      </div>
    </div>
  )
}

interface GoalRowProps {
  goal: Goal
  navigate: NavigateFunction
}

function GoalRow({ goal, navigate }: GoalRowProps) {
  return (
    <div className="py-3.5 border-b border-token-line last:border-b-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-token-ink font-semibold text-[15px]">
          {goal.name}
          <InfoIcon title={goal.name}>
            {goal.note ? (
              <p>{goal.note}</p>
            ) : (
              <>
                <p>No description set for this goal yet.</p>
                <button
                  onClick={() => navigate('/chat', {
                    state: { prefill: `Set the description for my ${goal.name} goal to: ` },
                  })}
                  className="mt-1.5 underline underline-offset-2 font-medium text-token-ink"
                >
                  Set a description →
                </button>
              </>
            )}
          </InfoIcon>
        </p>
        <p className="flex-shrink-0 font-mono text-lg tabular-nums text-token-ink">
          {euro(goal.target)}
        </p>
      </div>

      <ProgressBar value={goal.percentage / 100} className="mt-3 mb-2.5" />

      <div className="flex flex-wrap items-center gap-x-3 font-mono text-[11px] tabular-nums text-token-ink-3">
        <span>{euro(goal.balance)} saved</span>
        {goal.monthly_needed != null && goal.monthly_needed > 0 && (
          <span>{euro(goal.monthly_needed)}/mo</span>
        )}
        <span className="ml-auto">
          {goal.deadline ? `target ${formatDeadline(goal.deadline)}` : formatPercent(goal.percentage, { decimals: 0 })}
        </span>
      </div>
    </div>
  )
}
