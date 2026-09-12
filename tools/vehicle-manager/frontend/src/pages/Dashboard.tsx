import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, Car } from 'lucide-react'
import BottomNav from '../components/BottomNav'
import LogoutButton from '../components/LogoutButton'
import VehicleSwitcher from '../components/VehicleSwitcher'
import { getVehicleSummary } from '../lib/api'
import { formatCurrency, formatNumber } from '../lib/formatCurrency'
import { formatDate } from '../lib/formatDate'
import { reminderHorizon } from '../lib/reminders'
import { useSelectedVehicle } from '../lib/useSelectedVehicle'

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-background rounded-xl px-3 py-2.5">
      <p className="text-[10px] text-muted uppercase tracking-wide">{label}</p>
      <p className="font-mono text-base font-semibold text-white mt-0.5">{value}</p>
      {sub && <p className="text-[10px] text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { vehicles, vehicle, selectedId, select, isLoading } = useSelectedVehicle()

  const summaryQuery = useQuery({
    queryKey: ['vehicle-summary', vehicle?.id],
    queryFn: () => getVehicleSummary(vehicle!.id),
    enabled: !!vehicle,
    staleTime: 60_000,
  })
  const summary = summaryQuery.data
  const reminders = summary?.reminders ?? []

  return (
    <div className="min-h-dvh bg-background px-4 pt-8 pb-24">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-white text-xl font-semibold">Majordom Transport</h1>
        <LogoutButton />
      </div>

      {isLoading ? (
        <p className="text-muted text-sm text-center py-8">Loading…</p>
      ) : vehicles.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Car className="w-10 h-10 text-muted-2" strokeWidth={1.5} />
          <p className="text-muted text-sm">No vehicles yet</p>
          <button
            onClick={() => navigate('/import')}
            className="text-accent text-sm font-semibold hover:opacity-80 transition-opacity"
          >
            Import from Fuelio
          </button>
        </div>
      ) : (
        <>
          <VehicleSwitcher vehicles={vehicles} selectedId={selectedId} onSelect={select} />

          <button
            onClick={() => navigate(`/vehicles/${vehicle!.id}`)}
            className="mt-2 w-full text-center text-muted text-xs hover:text-white transition-colors"
          >
            View vehicle details →
          </button>

          <h2 className="mt-5 mb-2 text-xs text-muted uppercase tracking-wide">Fuel economy</h2>
          <div className="bg-surface border border-border rounded-2xl p-3 grid grid-cols-3 gap-2">
            <Metric
              label="Average"
              value={summary?.avg_consumption != null ? `${formatNumber(summary.avg_consumption, 1)}` : '—'}
              sub="L/100km"
            />
            <Metric
              label="Last fill"
              value={summary?.last_consumption != null ? `${formatNumber(summary.last_consumption, 1)}` : '—'}
              sub="L/100km"
            />
            <Metric
              label="Last price"
              value={summary?.last_fuel_price != null ? formatCurrency(summary.last_fuel_price, { decimals: 3 }) : '—'}
              sub={summary?.last_fuel_date ? formatDate(summary.last_fuel_date) : undefined}
            />
          </div>

          <h2 className="mt-5 mb-2 text-xs text-muted uppercase tracking-wide">Costs</h2>
          <div className="bg-surface border border-border rounded-2xl p-3 grid grid-cols-3 gap-2">
            <Metric label="This month" value={summary ? formatCurrency(summary.cost_this_month) : '—'} />
            <Metric label="This year" value={summary ? formatCurrency(summary.cost_this_year) : '—'} />
            <Metric label="All time" value={summary ? formatCurrency(summary.total_cost) : '—'} />
          </div>

          <h2 className="mt-5 mb-2 text-xs text-muted uppercase tracking-wide">Distance</h2>
          <div className="bg-surface border border-border rounded-2xl p-3 grid grid-cols-3 gap-2">
            <Metric
              label="Odometer"
              value={summary?.last_odo != null ? `${formatNumber(summary.last_odo)}` : '—'}
              sub="km"
            />
            <Metric
              label="This month"
              value={summary ? `${formatNumber(summary.distance_this_month)}` : '—'}
              sub="km"
            />
            <Metric
              label="This year"
              value={summary ? `${formatNumber(summary.distance_this_year)}` : '—'}
              sub="km"
            />
          </div>

          <div className="mt-5 flex items-center justify-between mb-2">
            <h2 className="text-xs text-muted uppercase tracking-wide">Reminders</h2>
            {reminders.length > 0 && (
              <Link to="/reminders" className="text-accent text-xs hover:opacity-80">
                View all
              </Link>
            )}
          </div>
          {reminders.length === 0 ? (
            <p className="text-muted text-sm">Nothing due.</p>
          ) : (
            <div className="space-y-2">
              {reminders.slice(0, 2).map((r) => (
                <div key={r.kind} className="bg-surface border border-border rounded-xl px-3 py-2.5 flex items-center gap-3">
                  <Bell size={15} className={r.overdue ? 'text-danger' : 'text-muted'} />
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm truncate">{r.label}</p>
                    <p className="text-muted text-xs">
                      {r.due_date ? formatDate(r.due_date) : r.due_odo != null ? `${formatNumber(r.due_odo)} km` : ''}
                    </p>
                  </div>
                  <span className={`text-xs shrink-0 ${r.overdue ? 'text-danger' : 'text-muted'}`}>
                    {reminderHorizon(r).text}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <BottomNav />
    </div>
  )
}
