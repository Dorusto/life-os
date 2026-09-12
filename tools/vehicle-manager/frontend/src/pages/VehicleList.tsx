import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Car, Upload } from 'lucide-react'
import { getVehicles } from '../lib/api'
import { formatCurrency, formatNumber } from '../lib/formatCurrency'

/**
 * Vehicle list — the app's home page. Each row navigates to its detail page
 * (Phase 4). No manual "add vehicle" form here — vehicles are created via
 * Fuelio import (the only creation path this app has, matching the plan doc).
 */
export default function VehicleList() {
  const navigate = useNavigate()
  const { data: vehicles, isLoading, error } = useQuery({
    queryKey: ['vehicles'],
    queryFn: getVehicles,
  })

  return (
    <div className="min-h-dvh bg-background px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-white text-xl font-semibold">Vehicles</h1>
        <button
          onClick={() => navigate('/import')}
          className="flex items-center gap-1.5 text-accent text-sm font-medium hover:opacity-80 transition-opacity"
        >
          <Upload size={15} /> Import
        </button>
      </div>

      {isLoading && (
        <p className="text-muted text-sm text-center py-8">Loading…</p>
      )}

      {error && (
        <p className="text-danger text-sm text-center py-8">
          Failed to load vehicles. Is vehicle-manager running?
        </p>
      )}

      {vehicles && vehicles.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Car className="w-10 h-10 text-muted-2" strokeWidth={1.5} />
          <p className="text-muted text-sm">No vehicles yet</p>
          <button
            onClick={() => navigate('/import')}
            className="mt-1 text-accent text-sm font-semibold hover:opacity-80 transition-opacity"
          >
            Import from Fuelio
          </button>
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
                  className="w-full bg-surface hover:bg-surface-2 rounded-xl px-4 py-3 text-left transition-colors flex items-center gap-3"
                >
                  <Car className="w-5 h-5 text-muted flex-shrink-0" strokeWidth={1.5} />
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm font-medium truncate">{v.name}</p>
                    {subtitle && <p className="text-muted text-xs truncate">{subtitle}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    {v.current_value != null && (
                      <p className="font-mono text-sm text-white">{formatCurrency(v.current_value, { decimals: 0 })}</p>
                    )}
                    {v.last_odo != null && (
                      <p className="text-muted text-xs">{formatNumber(v.last_odo)} km</p>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
