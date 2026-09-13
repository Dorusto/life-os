import { useMemo, useState } from 'react'
import Chart, { type LineData } from './Chart'
import { colorForKey } from '../lib/chartColors'
import { formatCurrency } from '../lib/formatCurrency'

/**
 * InvestmentProjection — the Analytics "Projection" section.
 *
 * A compound-growth calculator over the user's own inputs: every assumption is
 * an editable slider, nothing is fetched, and nothing is said about a specific
 * security (decisions.md#coach-not-consultant). The "S&P 500 ~10%/yr" button is
 * an illustrative shortcut that only moves the return slider — it doesn't lock
 * it, and the card says so.
 *
 * The maths is monthly compounding sampled once a year, so the shared line
 * renderer (rule 23) gets one point per projected year, labelled with the year
 * itself. "Projected value" is the nominal balance; "In today's money" is that
 * same balance deflated by the inflation assumption. Contributions are nominal
 * and added at each month's end.
 *
 * Points carry no month/year, deliberately: a projection is not a period of
 * transactions, so the renderer's "View transactions" drill-down stays off
 * (the same choice the Net Worth charts make).
 */

/** Projected x labels are calendar years, so the horizon reads as real years. */
const START_YEAR = new Date().getFullYear()

/** A horizon of ≥1 year keeps the series at ≥2 points, which the line renderer needs. */
const HORIZON_MIN = 1
const HORIZON_MAX = 50

interface ProjectionInputs {
  initialBalance: number
  monthlyContribution: number
  years: number
  annualReturn: number
  annualInflation: number
}

interface ProjectionPoint {
  x: string
  y: number
}

interface Projection {
  horizon: number
  nominalPoints: ProjectionPoint[]
  realPoints: ProjectionPoint[]
  chartData: LineData
}

/**
 * The calculator itself, split out from the component so the maths can be read
 * (and reasoned about) on its own. Every slider's minimum is 0 and the horizon
 * is clamped to ≥1 year, so there is no division to guard and no way for the
 * chart to receive an empty series.
 */
function project({
  initialBalance,
  monthlyContribution,
  years,
  annualReturn,
  annualInflation,
}: ProjectionInputs): Projection {
  const horizon = Math.min(HORIZON_MAX, Math.max(HORIZON_MIN, Math.round(years)))
  // Effective monthly rates — dividing the annual rate by 12 would understate
  // compounding, and the whole point here is that the user sets the rate.
  const monthlyReturn = Math.pow(1 + annualReturn / 100, 1 / 12) - 1
  const monthlyInflation = Math.pow(1 + annualInflation / 100, 1 / 12) - 1

  const opening: ProjectionPoint = {
    x: String(START_YEAR),
    y: Math.round(initialBalance),
  }
  const nominalPoints: ProjectionPoint[] = [opening]
  const realPoints: ProjectionPoint[] = [{ ...opening }]

  let balance = initialBalance
  let deflator = 1
  for (let month = 1; month <= horizon * 12; month++) {
    balance = balance * (1 + monthlyReturn) + monthlyContribution
    deflator *= 1 + monthlyInflation
    if (month % 12 !== 0) continue
    const x = String(START_YEAR + month / 12)
    nominalPoints.push({ x, y: Math.round(balance) })
    realPoints.push({ x, y: Math.round(balance / deflator) })
  }

  return {
    horizon,
    nominalPoints,
    realPoints,
    chartData: {
      series: [
        {
          label: 'Projected value',
          color: colorForKey('Projected value'),
          points: nominalPoints,
        },
        {
          label: "In today's money",
          color: colorForKey("In today's money"),
          points: realPoints,
        },
      ],
    },
  }
}

/** One labelled range input whose current value is always visible beside it. */
function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (value: number) => void
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] text-token-ink-3 uppercase tracking-wide">{label}</span>
        <span className="font-plex-mono tabular-nums text-token-ink text-sm">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full mt-1.5 accent-token-brand"
      />
    </label>
  )
}

export default function InvestmentProjection() {
  const [initialBalance, setInitialBalance] = useState(10_000)
  const [monthlyContribution, setMonthlyContribution] = useState(500)
  const [years, setYears] = useState(20)
  const [annualReturn, setAnnualReturn] = useState(7)
  const [annualInflation, setAnnualInflation] = useState(2)

  const projection = useMemo(
    () =>
      project({
        initialBalance,
        monthlyContribution,
        years,
        annualReturn,
        annualInflation,
      }),
    [initialBalance, monthlyContribution, years, annualReturn, annualInflation]
  )

  const finalNominal = projection.nominalPoints[projection.nominalPoints.length - 1]
  const finalReal = projection.realPoints[projection.realPoints.length - 1]

  return (
    <div className="space-y-6">
      <div className="bg-token-surface rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] text-token-ink-3 uppercase tracking-wide">
              Projection · with your assumptions
            </p>
            <p className="text-token-ink-3 text-xs mt-1">
              Every figure below is yours to change — this is arithmetic on your inputs, not a
              forecast or a recommendation.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAnnualReturn(10)}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-full border border-token-line text-token-ink-3 hover:text-token-ink transition-colors"
          >
            S&P 500 ~10%/yr
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Slider
            label="Initial balance"
            value={initialBalance}
            min={0}
            max={200_000}
            step={500}
            display={formatCurrency(initialBalance, { decimals: 0 })}
            onChange={setInitialBalance}
          />
          <Slider
            label="Monthly contribution"
            value={monthlyContribution}
            min={0}
            max={5_000}
            step={50}
            display={`${formatCurrency(monthlyContribution, { decimals: 0 })}/mo`}
            onChange={setMonthlyContribution}
          />
          <Slider
            label="Horizon"
            value={years}
            min={HORIZON_MIN}
            max={HORIZON_MAX}
            step={1}
            display={`${years} ${years === 1 ? 'year' : 'years'}`}
            onChange={setYears}
          />
          <Slider
            label="Annual return"
            value={annualReturn}
            min={0}
            max={15}
            step={0.5}
            display={`${annualReturn}%/yr`}
            onChange={setAnnualReturn}
          />
          <Slider
            label="Annual inflation"
            value={annualInflation}
            min={0}
            max={10}
            step={0.5}
            display={`${annualInflation}%/yr`}
            onChange={setAnnualInflation}
          />
        </div>

        <p className="text-[11px] text-token-ink-3">
          The preset only fills the return slider with a round illustration — it isn't advice, it
          doesn't lock the slider, and you can move it straight back.
        </p>
      </div>

      <div className="bg-token-surface rounded-2xl p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] text-token-ink-3 uppercase tracking-wide">
              Projected value · {finalNominal.x}
            </p>
            <p className="font-plex-mono tabular-nums text-token-ink text-lg mt-0.5">
              {formatCurrency(finalNominal.y, { decimals: 0 })}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-token-ink-3 uppercase tracking-wide">
              In today's money · {finalReal.x}
            </p>
            <p className="font-plex-mono tabular-nums text-token-ink text-lg mt-0.5">
              {formatCurrency(finalReal.y, { decimals: 0 })}
            </p>
          </div>
        </div>
        <p className="text-[11px] text-token-ink-3 mt-3">
          {formatCurrency(initialBalance, { decimals: 0 })} plus{' '}
          {formatCurrency(monthlyContribution, { decimals: 0 })}/month, compounded monthly at{' '}
          {annualReturn}% a year and deflated at {annualInflation}% a year over {projection.horizon}{' '}
          {projection.horizon === 1 ? 'year' : 'years'}.
        </p>
      </div>

      <Chart
        chart_type="line"
        title={`With your assumptions · ${START_YEAR}–${START_YEAR + projection.horizon}`}
        data={projection.chartData}
      />
    </div>
  )
}
