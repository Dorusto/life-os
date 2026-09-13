import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Car, Upload } from 'lucide-react'
import BottomNav from '../components/BottomNav'
import LogoutButton from '../components/LogoutButton'
import { Button } from '../components/Button'
import { ErrorState, Loading } from '../components/Feedback'
import { getVehicles } from '../lib/api'
import { formatCurrency, formatNumber } from '../lib/formatCurrency'

/**
 * Vehicle list — the Vehicles tab. Each row navigates to its detail page.
 * No manual "add vehicle" form here — vehicles are created via Fuelio import
 * (the only creation path this app has, matching the plan doc).
 */
export default function VehicleList() {
  const navigate = useNavigate()
  const { data: vehicles, isLoading, error, refetch } = useQuery({
    queryKey: ['vehicles'],
    queryFn: getVehicles,
  })

  return (
    <div className="min-h-dvh bg-paper px-4 pb-24 pt-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Vehicles</h1>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/import')} className="-mr-2 text-brand">
            <Upload size={15} /> Import
          </Button>
          <LogoutButton />
        </div>
      </header>

      {isLoading && <Loading />}

      {error && (
        <ErrorState
          message="Failed to load vehicles. Is vehicle-manager running?"
          onRetry={() => void refetch()}
        />
      )}

      {vehicles && vehicles.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Car className="h-10 w-10 text-ink-3" strokeWidth={1.5} />
          <p className="text-sm text-ink-2">No vehicles yet</p>
          <Button size="sm" onClick={() => navigate('/import')}>
            Import from Fuelio
          </Button>
        </div>
      )}

      {vehicles && vehicles.length > 0 && (
        <ul className="space-y-2">
          {vehicles.map((v) => {
            const subtitle = [v.make, v.model, v.year].filter(Boolean).join(' ')
            return (
              <li key={v.id}>
                <button
                  onClick={() => navigate(`/vehicles/${v.id}`)}
                  className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-2"
                >
                  <Car className="h-5 w-5 flex-shrink-0 text-ink-3" strokeWidth={1.5} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{v.name}</p>
                    {subtitle && <p className="truncate text-xs text-ink-3">{subtitle}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    {v.current_value != null && (
                      <p className="font-mono text-sm text-ink tnum">
                        {formatCurrency(v.current_value, { decimals: 0 })}
                      </p>
                    )}
                    {v.last_odo != null && (
                      <p className="text-xs text-ink-3 tnum">{formatNumber(v.last_odo)} km</p>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <BottomNav />
    </div>
  )
}
