import { Loader2, AlertCircle, Check, Car } from 'lucide-react'
import type { FuelioImportResult } from '../lib/api'

export interface FuelioImportData {
  status: 'loading' | 'done' | 'error'
  result?: FuelioImportResult
  error?: string
}

interface FuelioImportCardProps {
  data: FuelioImportData
}

export default function FuelioImportCard({ data }: FuelioImportCardProps) {
  if (data.status === 'loading') {
    return (
      <div className="bg-token-surface border border-token-line rounded-2xl rounded-bl-sm px-4 py-5 max-w-[520px] w-full">
        <div className="flex items-center gap-3">
          <Loader2 size={18} className="animate-spin text-token-brand-ink" />
          <p className="text-token-ink text-sm">Importing Fuelio history…</p>
        </div>
      </div>
    )
  }

  if (data.status === 'error') {
    return (
      <div className="bg-token-surface border border-token-line rounded-2xl rounded-bl-sm px-4 py-5 max-w-[520px] w-full space-y-3">
        <div className="flex items-start gap-2">
          <AlertCircle size={16} className="text-token-loss flex-shrink-0 mt-0.5" />
          <p className="text-token-loss text-sm">{data.error || 'Fuelio import failed'}</p>
        </div>
      </div>
    )
  }

  // Done state
  const result = data.result!
  const hasFuel = result.fuel_entries > 0 || result.fuel_skipped > 0
  const hasCost = result.cost_entries > 0 || result.cost_skipped > 0

  return (
    <div className="bg-token-surface border border-token-line rounded-xl p-4 shadow-sm max-w-[520px] w-full space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Car size={18} className="text-token-brand-ink" />
        <p className="text-token-ink text-sm font-medium">
          Fuelio Import — {result.vehicle_name}
        </p>
      </div>

      {/* Fuel entries */}
      {hasFuel && (
        <div className="flex items-center gap-2 text-sm">
          <Check size={14} className="text-token-gain flex-shrink-0" />
          <span className="text-token-ink">
            {result.fuel_entries} refuels imported
            {result.fuel_skipped > 0 && (
              <span className="text-token-ink-3"> ({result.fuel_skipped} skipped)</span>
            )}
          </span>
        </div>
      )}

      {/* Cost entries */}
      {hasCost && (
        <div className="flex items-center gap-2 text-sm">
          <Check size={14} className="text-token-gain flex-shrink-0" />
          <span className="text-token-ink">
            {result.cost_entries} cost entries imported
            {result.cost_skipped > 0 && (
              <span className="text-token-ink-3"> ({result.cost_skipped} skipped)</span>
            )}
          </span>
        </div>
      )}

      {/* Footer */}
      <p className="text-token-ink-3 text-xs">
        Vehicle history imported successfully.
      </p>
    </div>
  )
}
