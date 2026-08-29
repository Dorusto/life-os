import { useState } from 'react'
import { useNavigate, type NavigateFunction } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import type { FireData, Goal } from '../lib/api'
import InfoIcon from './InfoIcon'
import NewGoalSheet from './NewGoalSheet'
import { formatCurrency, formatPercent } from '../lib/formatCurrency'
import WidgetLoading from './WidgetLoading'

const GOAL_COLORS = ['#F59E0B', '#3B82F6', '#22C55E', '#8B5CF6', '#EC4899']

// Amounts are shown in full, never abbreviated (no €14k / 1.2M). On a screen that also
// shows exact figures, an abbreviated one reintroduces exactly the ambiguity #211 removed.
function euro(n: number): string {
  return formatCurrency(n, { decimals: 0 })
}

function formatDeadline(deadline: string): string {
  const [year, month] = deadline.split('-').map(Number)
  const d = new Date(year, month - 1)
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

const FIRE_ASSUMPTIONS_PREFILL = 'I want to set my real retirement assumptions — timeline, monthly spend, and contribution.'

const GOAL_CHIPS: { label: string; colorClass: string; prefill: string }[] = [
  {
    label: 'Expense Coverage',
    colorClass: 'bg-positive-dim text-positive',
    prefill: 'I want to set up an Expense Coverage goal — how does that work?',
  },
  {
    label: 'FIRE',
    colorClass: 'bg-positive-dim text-positive',
    prefill: 'I want to check my FIRE / Portfolio Independence assumptions.',
  },
]

/**
 * Financial Goals — a single widget-card (matches the shell every other
 * Dashboard/Planned widget uses: bg-surface border rounded-2xl, title inside)
 * instead of the older label-above-separate-accent-cards layout. Rendered on
 * both Dashboard (as the existing 'goals' widget) and the new Planned page —
 * same component, not duplicated (decisions.md#nav-five-tabs supersession).
 */
export default function GoalsSection({ fireData, goals, isLoading }: { fireData: FireData | undefined; goals: Goal[] | undefined; isLoading?: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [sheetOpen, setSheetOpen] = useState(false)
  const hasContent = !!fireData || (!!goals && goals.length > 0)

  function handleCreated() {
    setSheetOpen(false)
    queryClient.invalidateQueries({ queryKey: ['home'] })
  }

  return (
    <div className="bg-surface border border-border rounded-2xl px-4 pt-4 pb-1.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-display font-bold text-[15px]">Financial Goals</span>
        <button
          onClick={() => setSheetOpen(true)}
          className="text-muted hover:text-white transition-colors"
          aria-label="New goal"
        >
          <Plus size={16} />
        </button>
      </div>

      {isLoading ? (
        <WidgetLoading label="Loading goals…" />
      ) : !hasContent ? (
        <div className="py-4 text-center">
          <p className="text-white font-semibold text-[15px] mb-2.5">Create your first goal</p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <button
              onClick={() => setSheetOpen(true)}
              className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-attention-dim text-attention"
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
          {goals?.map((goal, idx) => (
            <GoalRow key={goal.id} goal={goal} color={GOAL_COLORS[idx % GOAL_COLORS.length]} navigate={navigate} />
          ))}
        </>
      )}

      <NewGoalSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onCreated={handleCreated} />
    </div>
  )
}

function PortfolioIndependenceRow({ data, navigate }: { data: FireData; navigate: NavigateFunction }) {
  const color = '#4F8EF7' // info
  const trend = data.trend_months

  return (
    <div className="py-3.5 border-b border-border last:border-b-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-white font-semibold text-[15px]">
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
              <div className="mt-2 text-yellow-400">
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
        <p className="font-display font-bold text-lg tabular-nums flex-shrink-0" style={{ color }}>
          {formatPercent(data.fire_pct, { decimals: 0 })}
        </p>
      </div>

      <div className="relative w-full h-px bg-border/40 rounded-full overflow-hidden mt-3 mb-2.5">
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(data.fire_pct, 100)}%`, backgroundColor: color }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-muted">
        <span>{euro(data.fire_portfolio)} saved</span>
        <span>{euro(data.monthly_contribution)}/mo</span>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-2 mt-1.5">
        <span>target ~{euro(data.fire_target)}</span>
        <span>
          {data.estimated_year ? `est. ${data.estimated_year}` : '—'}
          {trend != null && trend !== 0 && (
            <span className={`font-bold ml-1 ${trend > 0 ? 'text-positive' : 'text-danger'}`}>
              {trend > 0 ? '▲' : '▼'}{Math.abs(trend)}mo
            </span>
          )}
        </span>
      </div>

      {data.is_default_assumptions && (
        <button
          onClick={() => navigate('/chat', { state: { prefill: FIRE_ASSUMPTIONS_PREFILL } })}
          className="w-full text-[10px] text-yellow-500/70 hover:text-yellow-400 mt-2 text-center underline underline-offset-2"
        >
          Placeholder assumptions — set your real numbers in Chat
        </button>
      )}
    </div>
  )
}

interface GoalRowProps {
  goal: Goal
  color: string
  navigate: NavigateFunction
}

function GoalRow({ goal, color, navigate }: GoalRowProps) {
  return (
    <div className="py-3.5 border-b border-border last:border-b-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-white font-semibold text-[15px]">
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
                  className="mt-1.5 underline underline-offset-2 font-medium text-white"
                >
                  Set a description →
                </button>
              </>
            )}
          </InfoIcon>
        </p>
        <p className="font-display font-bold text-lg tabular-nums flex-shrink-0" style={{ color }}>
          {euro(goal.target)}
        </p>
      </div>

      <div className="relative w-full h-px bg-border/40 rounded-full overflow-hidden mt-3 mb-2.5">
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(goal.percentage, 100)}%`, backgroundColor: color }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-muted">
        <span>{euro(goal.balance)} saved</span>
        {goal.monthly_needed != null && goal.monthly_needed > 0 && (
          <span>{euro(goal.monthly_needed)}/mo</span>
        )}
      </div>

      <div className="text-right text-[11px] text-muted-2 mt-1.5">
        {goal.deadline ? `target: ${formatDeadline(goal.deadline)}` : formatPercent(goal.percentage, { decimals: 0 })}
      </div>
    </div>
  )
}
