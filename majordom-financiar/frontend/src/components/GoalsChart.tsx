interface Goal {
  id: string
  name: string
  balance: number
  target: number
  percentage: number
  deadline: string | null
  monthly_needed: number | null
  months_remaining: number | null
}

interface Props {
  goals: Goal[]
}

function fillColor(percentage: number): string {
  if (percentage >= 100) return '#6366F1' // indigo
  if (percentage >= 80) return '#F59E0B'  // amber
  return '#22C55E'                         // green
}

export default function GoalsChart({ goals }: Props) {
  return (
    <div className="bg-surface rounded-2xl p-4">
      <p className="text-xs text-muted uppercase tracking-wide mb-4">
        SAVINGS GOALS
      </p>

      {goals.length === 0 ? (
        <p className="text-muted text-sm">
          No savings goals set. Add <span className="text-white font-medium">TARGET: amount</span> to an account's notes in Actual Budget.
        </p>
      ) : (
        <div className="space-y-4">
          {goals.map((goal) => {
            const pct = goal.percentage
            const barWidth = Math.min(pct, 100)
            const color = fillColor(pct)

            return (
              <div key={goal.id}>
                {/* Name + percentage */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white text-sm font-medium truncate mr-2">{goal.name}</span>
                  <span className="text-muted text-xs flex-shrink-0">{pct.toFixed(0)}%</span>
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-background rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${barWidth}%`, backgroundColor: color }}
                  />
                </div>

                {/* Balance / target */}
                <div className="flex items-center justify-between mt-1">
                  <span className="text-muted text-xs">
                    €{goal.balance.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / €{goal.target.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  {goal.deadline && goal.months_remaining != null && (
                    <span className="text-muted text-xs">
                      {goal.deadline} ({goal.months_remaining} months)
                    </span>
                  )}
                </div>

                {/* Monthly needed */}
                {goal.monthly_needed != null && (
                  <p className="text-xs text-muted mt-0.5">
                    Need €{goal.monthly_needed.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/month
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
