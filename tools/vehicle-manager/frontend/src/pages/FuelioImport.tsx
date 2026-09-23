import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { PageHeader } from '../components/shell/PageHeader'
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
    <div>
      <PageHeader
        title="Import from Fuelio"
        description="Upload a Fuelio sync CSV export to create or update a vehicle and its fuel/cost log."
        back={{ to: '/settings' }}
      />

      {result ? (
        <Card>
          <p className="font-semibold text-ink">{result.vehicle_name}</p>
          <p className="mt-2 text-sm text-ink-2">
            {result.fuel_entries} fuel entries imported
            {result.fuel_skipped ? ` (${result.fuel_skipped} skipped)` : ''}
          </p>
          <p className="text-sm text-ink-2">
            {result.cost_entries} cost entries imported
            {result.cost_skipped ? ` (${result.cost_skipped} skipped)` : ''}
          </p>
          <div className="mt-4">
            <Button variant="secondary" size="sm" onClick={() => navigate('/vehicles')}>
              Back to vehicles
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong bg-surface px-8 py-10 transition-colors hover:bg-surface-2"
          >
            <Upload className="h-8 w-8 text-ink-3" strokeWidth={1.5} />
            <p className="text-sm text-ink-2">{file ? file.name : 'Tap to choose a CSV file'}</p>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />

          {error && <p className="mt-3 text-sm text-loss">{error}</p>}

          <Button
            variant="primary"
            onClick={handleImport}
            disabled={!file || importing}
            className="mt-4 w-full"
          >
            {importing ? 'Importing…' : 'Import'}
          </Button>
        </>
      )}
    </div>
  )
}
