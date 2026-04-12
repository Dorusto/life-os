import { Upload } from 'lucide-react'

/**
 * CSV Import page — placeholder until the full import wizard is implemented.
 * Will become a multi-step flow: upload → preview → confirm → done.
 */
export default function ImportPage() {
  return (
    <div className="min-h-dvh bg-background flex flex-col pb-20">
      <header className="px-5 pt-14 pb-6">
        <p className="text-muted text-sm">Bank statements</p>
        <h1 className="text-white text-xl font-semibold mt-0.5">Import CSV</h1>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-5 gap-5 text-center">
        <div className="w-16 h-16 rounded-2xl bg-surface border border-border flex items-center justify-center">
          <Upload size={28} className="text-muted" />
        </div>
        <div>
          <p className="text-white font-medium">CSV import coming soon</p>
          <p className="text-muted text-sm mt-1 max-w-xs">
            Upload bank statements (ING, Rabobank, crypto.com) and import transactions in bulk.
          </p>
        </div>
      </main>
    </div>
  )
}
