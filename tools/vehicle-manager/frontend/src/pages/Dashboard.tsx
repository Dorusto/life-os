import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Car } from 'lucide-react'
import VehicleSwitcher from '../components/VehicleSwitcher'
import { Button } from '../components/Button'
import { ErrorState, Loading } from '../components/Feedback'
import { Card } from '../components/kit/Card'
import { HeroValue, StatStrip } from '../components/kit/Stats'
import { DomainTabs } from '../components/shell/DomainTabs'
import { PageHeader } from '../components/shell/PageHeader'
import { getVehicleSummary } from '../lib/api'
import { formatCurrency, formatNumber } from '../lib/formatCurrency'
import { formatDate } from '../lib/formatDate'
import { useSelectedVehicle } from '../lib/useSelectedVehicle'

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

  return (
    <div>
      <DomainTabs app="transport" active="vehicles" />

      <PageHeader
        title="Home"
        eyebrow={new Date().toLocaleDateString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        })}
      />

      {isLoading ? (
        <Loading />
      ) : vehicles.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Car className="h-10 w-10 text-ink-3" strokeWidth={1.5} />
          <p className="text-sm text-ink-2">No vehicles yet</p>
          <Button size="sm" onClick={() => navigate('/import')}>
            Import from Fuelio
          </Button>
        </div>
      ) : (
        <>
          <VehicleSwitcher vehicles={vehicles} selectedId={selectedId} onSelect={select} />

          <div className="mt-3 text-center">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/vehicles/${vehicle!.id}`)}>
              View vehicle details →
            </Button>
          </div>

          {summaryQuery.isError ? (
            <div className="mt-5">
              <ErrorState
                message="Couldn't load this vehicle's summary."
                onRetry={() => void summaryQuery.refetch()}
              />
            </div>
          ) : (
            <>
              {summary && (
                <div className="mt-6">
                  <HeroValue label="Spent this year" value={formatCurrency(summary.cost_this_year)} />
                </div>
              )}

              <Card label="Fuel economy" className="mt-5">
                <StatStrip
                  stats={[
                    {
                      label: 'Average',
                      value: summary?.avg_consumption != null ? formatNumber(summary.avg_consumption, 1) : '—',
                      hint: 'L/100km',
                    },
                    {
                      label: 'Last fill',
                      value: summary?.last_consumption != null ? formatNumber(summary.last_consumption, 1) : '—',
                      hint: 'L/100km',
                    },
                    {
                      label: 'Last price',
                      value:
                        summary?.last_fuel_price != null
                          ? formatCurrency(summary.last_fuel_price, { decimals: 3 })
                          : '—',
                      hint: summary?.last_fuel_date ? formatDate(summary.last_fuel_date) : undefined,
                    },
                  ]}
                />
              </Card>

              <Card label="Costs" className="mt-5">
                <StatStrip
                  stats={[
                    { label: 'This month', value: summary ? formatCurrency(summary.cost_this_month) : '—' },
                    { label: 'This year', value: summary ? formatCurrency(summary.cost_this_year) : '—' },
                    { label: 'All time', value: summary ? formatCurrency(summary.total_cost) : '—' },
                  ]}
                />
              </Card>

              <Card label="Distance" className="mt-5">
                <StatStrip
                  stats={[
                    {
                      label: 'Odometer',
                      value: summary?.last_odo != null ? formatNumber(summary.last_odo) : '—',
                      hint: 'km',
                    },
                    {
                      label: 'This month',
                      value: summary ? formatNumber(summary.distance_this_month) : '—',
                      hint: 'km',
                    },
                    {
                      label: 'This year',
                      value: summary ? formatNumber(summary.distance_this_year) : '—',
                      hint: 'km',
                    },
                  ]}
                />
              </Card>
            </>
          )}
        </>
      )}
    </div>
  )
}
