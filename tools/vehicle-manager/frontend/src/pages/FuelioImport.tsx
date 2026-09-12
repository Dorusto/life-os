import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Upload } from 'lucide-react'
import { importFuelio, type FuelioImportResult } from '../lib/api'

/**
 * Fuelio CSV import — the only vehicle-creation path this app has (no manual
 * "add vehicle" form, per the plan doc). Backend: POST /import/fuelio,
 * multipart/form-data, field name "file".
 */
export default function FuelioImport() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<FuelioImportResult | null>(null)

  async function handleImport() {
    if (!file) return
    setImporting(true)
    setError(null)
    try {
      const res = await importFuelio(file)
      setResult(res)
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="min-h-dvh bg-background px-5 pt-[3.5rem] pb-24">
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1 text-muted hover:text-white transition-colors text-sm mb-6"
      >
        <ChevronLeft size={16} /> Vehicles
      </button>

      <h1 className="text-white text-xl font-semibold mb-1">Import from Fuelio</h1>
      <p className="text-muted text-sm mb-6">
        Upload a Fuelio sync CSV export to create or update a vehicle and its fuel/cost log.
      </p>

      {result ? (
        <div className="bg-surface border border-border rounded-2xl p-4 space-y-2">
          <p className="text-white font-semibold">{result.vehicle_name}</p>
          <p className="text-sm text-muted">
            {result.fuel_entries} fuel entries imported{result.fuel_skipped ? ` (${result.fuel_skipped} skipped)` : ''}
          </p>
          <p className="text-sm text-muted">
            {result.cost_entries} cost entries imported{result.cost_skipped ? ` (${result.cost_skipped} skipped)` : ''}
          </p>
          <button
            onClick={() => navigate('/')}
            className="mt-2 text-accent text-sm font-semibold hover:opacity-80 transition-opacity"
          >
            Back to vehicles
          </button>
        </div>
      ) : (
        <>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border border-dashed border-border rounded-2xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-border-hover transition-colors"
          >
            <Upload className="w-8 h-8 text-muted-2" strokeWidth={1.5} />
            <p className="text-sm text-muted">{file ? file.name : 'Tap to choose a CSV file'}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {error && <p className="text-danger text-sm mt-3">{error}</p>}

          <button
            onClick={handleImport}
            disabled={!file || importing}
            className="mt-4 w-full py-3 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-40 transition-colors"
          >
            {importing ? 'Importing…' : 'Import'}
          </button>
        </>
      )}
    </div>
  )
}
