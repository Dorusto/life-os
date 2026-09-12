import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { UploadCloud } from 'lucide-react'
import { importXtb, type XtbImportResult } from '../lib/api'
import { Modal } from './Modal'
import { Button } from './Button'

export function XtbImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<XtbImportResult | null>(null)

  useEffect(() => {
    if (open) {
      setFile(null)
      setResult(null)
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: (f: File) => importXtb(f),
    onSuccess: (data) => {
      setResult(data)
      queryClient.invalidateQueries()
    },
  })

  const close = () => {
    if (mutation.isPending) return
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import XTB report"
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={mutation.isPending}>
            Close
          </Button>
          <Button
            variant="primary"
            onClick={() => file && mutation.mutate(file)}
            disabled={!file || mutation.isPending}
          >
            {mutation.isPending ? 'Importing…' : 'Import'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-2">
          Upload the <span className="font-medium text-ink">.xlsx</span> account report; the{' '}
          <span className="font-medium text-ink">Cash Operations</span> sheet is imported. Re-importing the same
          file is safe — rows are deduplicated on XTB's own operation id.
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface-2 px-6 py-8 text-center transition-colors hover:border-brand-2 hover:bg-brand-soft"
        >
          <UploadCloud className="h-6 w-6 text-ink-3" aria-hidden />
          <span className="text-sm font-medium text-ink">{file ? file.name : 'Choose a report file'}</span>
          <span className="text-[12px] text-ink-3">{file ? 'Click to replace' : '.xlsx only'}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        {mutation.isError && (
          <p className="rounded border border-loss bg-loss-soft px-3 py-2 text-[13px] text-loss">
            {(mutation.error as Error).message}
          </p>
        )}

        {result && (
          <div className="rounded border border-line bg-surface-2 p-4 text-sm">
            <p className="font-medium text-ink">Import finished</p>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] text-ink-2">
              <li>Securities created: <span className="font-mono tnum">{result.securities_created}</span></li>
              <li>Transactions added: <span className="font-mono tnum">{result.transactions_inserted}</span></li>
              <li>Already present: <span className="font-mono tnum">{result.transactions_skipped}</span></li>
              <li>Transfers skipped: <span className="font-mono tnum">{result.transfers_skipped}</span></li>
              <li>Unparsed rows: <span className="font-mono tnum">{result.rows_unparsed}</span></li>
            </ul>
            {result.warnings.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[13px] font-medium text-warn">
                  {result.warnings.length} warning{result.warnings.length === 1 ? '' : 's'}
                </summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-ink-2">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
