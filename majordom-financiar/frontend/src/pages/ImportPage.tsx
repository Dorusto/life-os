import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, ChevronLeft, ChevronRight, Check, AlertCircle, Loader2 } from 'lucide-react'
import {
  previewCsvImport,
  confirmCsvImport,
  type AccountOption,
  type ImportResult,
} from '../lib/api'

// --- Types ---

interface Category { id: string; name: string; emoji: string }

interface ImportRow {
  id: string
  date: string
  merchant: string
  amount: number
  is_expense: boolean
  currency: string
  categoryId: string        // camelCase locally; maps to category_id in API
  categoryConfirmed: boolean // false = needs user review (never seen this merchant before)
  duplicate: boolean
  notes: string             // user-added note, appended to "[import CSV]" in Actual Budget
}

// --- Static category list (12 categories, defined in CLAUDE.md) ---

const CATEGORIES: Category[] = [
  { id: 'groceries',     name: 'Groceries & Drinks',      emoji: '🛒' },
  { id: 'restaurants',  name: 'Restaurants & Cafes',      emoji: '🍽️' },
  { id: 'transport',    name: 'Transport',                 emoji: '🚗' },
  { id: 'utilities',    name: 'Utilities',                 emoji: '💡' },
  { id: 'health',       name: 'Health',                    emoji: '💊' },
  { id: 'clothing',     name: 'Clothing',                  emoji: '👕' },
  { id: 'home',         name: 'Home & Maintenance',        emoji: '🏠' },
  { id: 'entertainment',name: 'Entertainment & Vacation',  emoji: '🎬' },
  { id: 'children',     name: 'Children',                  emoji: '👨‍👩‍👧‍👦' },
  { id: 'personal',     name: 'Personal',                  emoji: '💰' },
  { id: 'investments',  name: 'Investments & Savings',     emoji: '📈' },
  { id: 'income',       name: 'Income',                    emoji: '💵' },
  { id: 'other',        name: 'Other',                     emoji: '📦' },
]

// --- Main component ---

type Step = 1 | 2 | 3 | 4

export default function ImportPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(1)
  const [file, setFile] = useState<File | null>(null)
  const [accountId, setAccountId] = useState<string>('')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [sourceName, setSourceName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const activeRows = rows.filter(r => !r.duplicate)
  const duplicateCount = rows.filter(r => r.duplicate).length
  const needsReviewCount = activeRows.filter(r => !r.categoryConfirmed).length
  const total = activeRows.reduce((s, r) => s + (r.is_expense ? r.amount : -r.amount), 0)

  function handleFile(f: File) { setFile(f); setError(null) }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f?.name.endsWith('.csv')) handleFile(f)
  }
  function handleCategoryChange(id: string, categoryId: string) {
    setRows(prev => {
      const merchant = prev.find(r => r.id === id)?.merchant
      return prev.map(r => {
        if (r.id === id) return { ...r, categoryId, categoryConfirmed: true }
        // Auto-propagate to same merchant — only unconfirmed, non-duplicate rows
        if (r.merchant === merchant && !r.duplicate && !r.categoryConfirmed) {
          return { ...r, categoryId, categoryConfirmed: true }
        }
        return r
      })
    })
  }

  function handleNotesChange(id: string, notes: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, notes } : r))
  }

  async function handlePreview() {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const preview = await previewCsvImport(file)
      setRows(preview.rows.map(r => ({
        id: r.id,
        date: r.date,
        merchant: r.merchant,
        amount: r.amount,
        is_expense: r.is_expense,
        currency: r.currency,
        categoryId: r.category_id,
        categoryConfirmed: r.category_confirmed,
        duplicate: r.duplicate,
        notes: '',
      })))
      setAccounts(preview.accounts)
      setSourceName(preview.source_name)
      const src = preview.source_name.toLowerCase()
      const matched = preview.accounts.find(acc =>
        acc.name.toLowerCase().includes(src) || src.includes(acc.name.toLowerCase())
      )
      setAccountId(matched ? matched.id : '')
      setStep(2)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse CSV')
    } finally {
      setLoading(false)
    }
  }

  async function handleImport() {
    setLoading(true)
    setError(null)
    try {
      const result = await confirmCsvImport({
        account_id: accountId,
        rows: rows.map(r => ({
          date: r.date,
          merchant: r.merchant,
          amount: r.amount,
          is_expense: r.is_expense,
          category_id: r.categoryId,
          duplicate: r.duplicate,
          notes: r.notes || undefined,
        })),
      })
      setImportResult(result)
      setStep(4)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col pb-16">
      {/* Header */}
      <header className="px-5 pt-14 pb-4 border-b border-border flex-shrink-0">
        <p className="text-muted text-sm">Bank statements</p>
        <h1 className="text-white text-xl font-semibold mt-0.5">Import CSV</h1>
      </header>

      {/* Step indicator */}
      {step < 4 && <StepIndicator current={step} />}

      {/* Error banner */}
      {error && (
        <div className="mx-5 mt-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="flex-1 flex flex-col"
        >
          {step === 1 && (
            <Step1Upload
              file={file}
              fileInputRef={fileInputRef}
              loading={loading}
              onDrop={handleDrop}
              onFileChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              onPickFile={() => fileInputRef.current?.click()}
              onNext={handlePreview}
            />
          )}
          {step === 2 && (
            <Step2Preview
              rows={rows}
              categories={CATEGORIES}
              accounts={accounts}
              accountId={accountId}
              sourceName={sourceName}
              onAccountChange={setAccountId}
              onCategoryChange={handleCategoryChange}
              onNotesChange={handleNotesChange}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <Step3Confirm
              activeCount={activeRows.length}
              duplicateCount={duplicateCount}
              needsReviewCount={needsReviewCount}
              total={total}
              loading={loading}
              onBack={() => setStep(2)}
              onImport={handleImport}
            />
          )}
          {step === 4 && (
            <Step4Done
              imported={importResult?.imported ?? 0}
              skipped={importResult?.skipped ?? 0}
              onHome={() => navigate('/')}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// --- Step indicator ---

function StepIndicator({ current }: { current: Step }) {
  const labels = ['Upload', 'Preview', 'Confirm']
  return (
    <div className="flex items-center justify-center gap-2 py-4 px-5">
      {labels.map((label, i) => {
        const n = (i + 1) as Step
        const active = n === current
        const done = n < current
        return (
          <div key={label} className="flex items-center gap-2">
            <div className={`
              w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
              ${done  ? 'bg-success text-white' : ''}
              ${active ? 'bg-accent text-white' : ''}
              ${!done && !active ? 'bg-surface border border-border text-muted' : ''}
            `}>
              {done ? <Check size={12} /> : n}
            </div>
            <span className={`text-xs ${active ? 'text-white' : 'text-muted'}`}>{label}</span>
            {i < labels.length - 1 && <div className="w-6 h-px bg-border mx-1" />}
          </div>
        )
      })}
    </div>
  )
}

// --- Step 1: Upload ---

function Step1Upload({ file, fileInputRef, loading, onDrop, onFileChange, onPickFile, onNext }: {
  file: File | null
  fileInputRef: React.RefObject<HTMLInputElement>
  loading: boolean
  onDrop: (e: React.DragEvent) => void
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onPickFile: () => void
  onNext: () => void
}) {
  return (
    <div className="flex-1 flex flex-col px-5 pt-4 pb-6 gap-4">
      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        onClick={onPickFile}
        className="
          flex-1 flex flex-col items-center justify-center gap-4
          border-2 border-dashed border-border hover:border-accent
          rounded-2xl cursor-pointer transition-colors min-h-[200px]
        "
      >
        {file ? (
          <>
            <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
              <Check size={24} className="text-success" />
            </div>
            <div className="text-center">
              <p className="text-white font-medium text-sm">{file.name}</p>
              <p className="text-muted text-xs mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-xl bg-surface flex items-center justify-center">
              <Upload size={24} className="text-muted" />
            </div>
            <div className="text-center">
              <p className="text-white text-sm font-medium">Drop CSV here</p>
              <p className="text-muted text-xs mt-0.5">or tap to browse</p>
            </div>
          </>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept=".csv" onChange={onFileChange} className="hidden" />

      <p className="text-muted text-xs text-center">
        Supported: ING, Rabobank, crypto.com
      </p>

      <button
        onClick={onNext}
        disabled={!file || loading}
        className="
          w-full py-4 rounded-2xl bg-accent hover:bg-accent-hover
          text-white font-medium text-base
          disabled:opacity-40 disabled:cursor-not-allowed
          flex items-center justify-center gap-2 transition-all
        "
      >
        {loading ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Analyzing...
          </>
        ) : (
          <>
            Preview transactions <ChevronRight size={18} />
          </>
        )}
      </button>
    </div>
  )
}

// --- Step 2: Preview table ---

function Step2Preview({ rows, categories, accounts, accountId, sourceName, onAccountChange, onCategoryChange, onNotesChange, onBack, onNext }: {
  rows: ImportRow[]
  categories: Category[]
  accounts: AccountOption[]
  accountId: string
  sourceName: string
  onAccountChange: (id: string) => void
  onCategoryChange: (rowId: string, categoryId: string) => void
  onNotesChange: (rowId: string, notes: string) => void
  onBack: () => void
  onNext: () => void
}) {
  const selectClass = `
    w-full bg-surface border border-border rounded-lg px-2 py-1.5
    text-white text-xs appearance-none
    focus:outline-none focus:border-accent transition-colors
  `

  return (
    <div className="flex-1 flex flex-col px-5 pt-2 pb-6 gap-4 overflow-hidden">
      {/* Account selector */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-muted whitespace-nowrap">Account</label>
        <select
          value={accountId}
          onChange={e => onAccountChange(e.target.value)}
          className={`${selectClass} ${!accountId ? 'border-yellow-500/60 text-yellow-500' : ''}`}
        >
          <option value="" disabled>— select account —</option>
          {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
        </select>
      </div>
      {!accountId && (
        <p className="text-yellow-500 text-xs">
          No account matched "{sourceName}". Select one or create it first in Actual Budget.
        </p>
      )}

      {/* Table */}
      <div className="flex-1 overflow-y-auto -mx-5 px-5">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background">
            <tr className="text-muted">
              <th className="text-left pb-2 pr-2 font-medium">Date</th>
              <th className="text-left pb-2 pr-2 font-medium">Merchant</th>
              <th className="text-right pb-2 pr-2 font-medium">Amount</th>
              <th className="text-left pb-2 font-medium">Category</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(row => (
              <tr key={row.id} className={row.duplicate ? 'opacity-40' : ''}>
                <td className="py-2 pr-2 text-muted whitespace-nowrap">{row.date.slice(5)}</td>
                <td className="py-2 pr-2 text-white max-w-[80px] truncate">
                  <div className="flex items-center gap-1">
                    {row.duplicate && (
                      <span title="Already imported">
                        <AlertCircle size={10} className="text-muted flex-shrink-0" />
                      </span>
                    )}
                    {row.merchant}
                  </div>
                </td>
                <td className="py-2 pr-2 text-white text-right whitespace-nowrap">
                  {row.is_expense ? '' : '+'}{row.currency === 'EUR' ? '€' : row.currency}{row.amount.toFixed(2)}
                </td>
                <td className="py-2">
                  {row.duplicate ? (
                    <span className="text-muted italic">already imported</span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <div className="relative">
                        <select
                          value={row.categoryId}
                          onChange={e => onCategoryChange(row.id, e.target.value)}
                          className={`${selectClass} ${!row.categoryConfirmed ? 'border-yellow-500/60 pr-6' : ''}`}
                        >
                          {categories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.emoji} {cat.name}</option>
                          ))}
                        </select>
                        {!row.categoryConfirmed && (
                          <span
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-yellow-500 text-xs pointer-events-none"
                            title="Category not confirmed — please review"
                          >
                            ?
                          </span>
                        )}
                      </div>
                      {!row.categoryConfirmed && (
                        <input
                          type="text"
                          value={row.notes}
                          onChange={e => onNotesChange(row.id, e.target.value)}
                          placeholder="note..."
                          className="w-full bg-surface border border-border rounded px-2 py-1 text-white text-xs placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
                        />
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button onClick={onBack} className="flex-1 py-3 rounded-xl border border-border text-white hover:bg-surface transition-colors text-sm flex items-center justify-center gap-1">
          <ChevronLeft size={16} /> Back
        </button>
        <button
          onClick={onNext}
          disabled={!accountId}
          className="flex-1 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium text-sm flex items-center justify-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

// --- Step 3: Confirm summary ---

function Step3Confirm({ activeCount, duplicateCount, needsReviewCount, total, loading, onBack, onImport }: {
  activeCount: number
  duplicateCount: number
  needsReviewCount: number
  total: number
  loading: boolean
  onBack: () => void
  onImport: () => void
}) {
  return (
    <div className="flex-1 flex flex-col px-5 pt-4 pb-6 gap-6">
      <div className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-4">
        <h2 className="text-white font-medium">Ready to import</h2>
        <div className="space-y-2">
          <SummaryRow label="Transactions to import" value={String(activeCount)} />
          <SummaryRow label="Duplicates skipped" value={String(duplicateCount)} muted />
          <div className="h-px bg-border my-1" />
          <SummaryRow
            label="Total amount"
            value={`€${total.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            bold
          />
        </div>
      </div>

      {needsReviewCount > 0 && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
          <AlertCircle size={16} className="text-yellow-500 flex-shrink-0 mt-0.5" />
          <p className="text-yellow-500 text-sm">
            <span className="font-medium">{needsReviewCount} {needsReviewCount === 1 ? 'transaction needs' : 'transactions need'} category review.</span>
            {' '}Go back and check the rows marked with <span className="font-bold">?</span>
          </p>
        </div>
      )}

      <p className="text-muted text-xs text-center">
        Transactions will be added to Actual Budget. This cannot be undone.
      </p>

      <div className="flex gap-3 mt-auto">
        <button
          onClick={onBack}
          disabled={loading}
          className="flex-1 py-3 rounded-xl border border-border text-white hover:bg-surface transition-colors text-sm flex items-center justify-center gap-1 disabled:opacity-40"
        >
          <ChevronLeft size={16} /> Back
        </button>
        <button
          onClick={onImport}
          disabled={loading}
          className="flex-1 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
        >
          {loading ? (
            <><Loader2 size={16} className="animate-spin" /> Importing...</>
          ) : (
            <><Check size={16} /> Import</>
          )}
        </button>
      </div>
    </div>
  )
}

function SummaryRow({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${muted ? 'text-muted' : 'text-white'}`}>{label}</span>
      <span className={`text-sm ${bold ? 'text-white font-semibold' : muted ? 'text-muted' : 'text-white'}`}>{value}</span>
    </div>
  )
}

// --- Step 4: Success ---

function Step4Done({ imported, skipped, onHome }: { imported: number; skipped: number; onHome: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-5">
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 15, stiffness: 200 }}
        className="relative"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0.8 }}
          animate={{ scale: 1.4, opacity: 0 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'easeOut' }}
          className="absolute inset-0 rounded-full bg-success"
        />
        <div className="w-20 h-20 rounded-full bg-success flex items-center justify-center">
          <Check size={36} className="text-white" strokeWidth={2.5} />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-center"
      >
        <p className="text-white text-lg font-medium">Import complete!</p>
        <p className="text-muted text-sm mt-1">
          {imported} transactions added to Actual Budget
          {skipped > 0 && `, ${skipped} duplicates skipped`}
        </p>
      </motion.div>

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        onClick={onHome}
        className="px-8 py-3 rounded-xl border border-border text-white hover:bg-surface transition-colors text-sm"
      >
        Back to Home
      </motion.button>
    </div>
  )
}
