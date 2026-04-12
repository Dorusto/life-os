import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, ChevronLeft, ChevronRight, Check, AlertCircle } from 'lucide-react'

// --- Types (same as api.ts) ---

interface Category { id: string; name: string; emoji: string }
interface AccountOption { id: string; name: string }

interface ImportRow {
  id: string
  date: string
  merchant: string
  amount: number
  categoryId: string
  duplicate: boolean
}

// --- Mock data ---

const CATEGORIES: Category[] = [
  { id: 'groceries',     name: 'Alimente & Băuturi',       emoji: '🛒' },
  { id: 'restaurants',  name: 'Restaurante & Cafenele',    emoji: '🍽️' },
  { id: 'transport',    name: 'Transport',                  emoji: '🚗' },
  { id: 'utilities',    name: 'Utilități',                  emoji: '💡' },
  { id: 'health',       name: 'Sănătate',                   emoji: '💊' },
  { id: 'clothing',     name: 'Îmbrăcăminte',               emoji: '👕' },
  { id: 'home',         name: 'Casă & Întreținere',         emoji: '🏠' },
  { id: 'entertainment',name: 'Divertisment & Vacanță',     emoji: '🎬' },
  { id: 'children',     name: 'Copii',                      emoji: '👨‍👩‍👧‍👦' },
  { id: 'personal',     name: 'Bani Personali',             emoji: '💰' },
  { id: 'investments',  name: 'Investiții & Economii',      emoji: '📈' },
  { id: 'other',        name: 'Altele',                     emoji: '📦' },
]

const ACCOUNTS: AccountOption[] = [
  { id: 'ing-main',   name: 'ING Rekening' },
  { id: 'crypto-com', name: 'Crypto.com' },
]

const MOCK_ROWS: ImportRow[] = [
  { id: '1', date: '2026-04-10', merchant: 'Albert Heijn',   amount: 67.45, categoryId: 'groceries',    duplicate: false },
  { id: '2', date: '2026-04-09', merchant: 'Shell Tankstati',amount: 84.20, categoryId: 'transport',    duplicate: false },
  { id: '3', date: '2026-04-08', merchant: 'Jumbo',          amount: 43.10, categoryId: 'groceries',    duplicate: true  },
  { id: '4', date: '2026-04-07', merchant: 'NS Reizen',      amount: 12.60, categoryId: 'transport',    duplicate: false },
  { id: '5', date: '2026-04-06', merchant: 'Basic Fit',      amount: 24.99, categoryId: 'health',       duplicate: false },
  { id: '6', date: '2026-04-05', merchant: 'Pathé Bioscoop', amount: 32.50, categoryId: 'entertainment',duplicate: false },
  { id: '7', date: '2026-04-04', merchant: 'Ziggo',          amount: 49.95, categoryId: 'utilities',    duplicate: true  },
  { id: '8', date: '2026-04-03', merchant: 'HEMA',           amount: 20.70, categoryId: 'home',         duplicate: false },
]

// --- Main component ---

type Step = 1 | 2 | 3 | 4

export default function ImportPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(1)
  const [file, setFile] = useState<File | null>(null)
  const [accountId, setAccountId] = useState(ACCOUNTS[0].id)
  const [rows, setRows] = useState<ImportRow[]>(MOCK_ROWS)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const activeRows = rows.filter(r => !r.duplicate)
  const duplicateCount = rows.filter(r => r.duplicate).length
  const total = activeRows.reduce((s, r) => s + r.amount, 0)

  function handleFile(f: File) { setFile(f) }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f?.name.endsWith('.csv')) handleFile(f)
  }
  function handleCategoryChange(id: string, categoryId: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, categoryId } : r))
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
              onDrop={handleDrop}
              onFileChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              onPickFile={() => fileInputRef.current?.click()}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <Step2Preview
              rows={rows}
              categories={CATEGORIES}
              accounts={ACCOUNTS}
              accountId={accountId}
              onAccountChange={setAccountId}
              onCategoryChange={handleCategoryChange}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <Step3Confirm
              activeCount={activeRows.length}
              duplicateCount={duplicateCount}
              total={total}
              onBack={() => setStep(2)}
              onImport={() => setStep(4)}
            />
          )}
          {step === 4 && <Step4Done onHome={() => navigate('/')} />}
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

function Step1Upload({ file, fileInputRef, onDrop, onFileChange, onPickFile, onNext }: {
  file: File | null
  fileInputRef: React.RefObject<HTMLInputElement>
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
        disabled={!file}
        className="
          w-full py-4 rounded-2xl bg-accent hover:bg-accent-hover
          text-white font-medium text-base
          disabled:opacity-40 disabled:cursor-not-allowed
          flex items-center justify-center gap-2 transition-all
        "
      >
        Preview transactions <ChevronRight size={18} />
      </button>
    </div>
  )
}

// --- Step 2: Preview table ---

function Step2Preview({ rows, categories, accounts, accountId, onAccountChange, onCategoryChange, onBack, onNext }: {
  rows: ImportRow[]
  categories: Category[]
  accounts: AccountOption[]
  accountId: string
  onAccountChange: (id: string) => void
  onCategoryChange: (rowId: string, categoryId: string) => void
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
        <select value={accountId} onChange={e => onAccountChange(e.target.value)} className={selectClass}>
          {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
        </select>
      </div>

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
                  €{row.amount.toFixed(2)}
                </td>
                <td className="py-2">
                  {row.duplicate ? (
                    <span className="text-muted italic">already imported</span>
                  ) : (
                    <select
                      value={row.categoryId}
                      onChange={e => onCategoryChange(row.id, e.target.value)}
                      className={selectClass}
                    >
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.emoji} {cat.name}</option>
                      ))}
                    </select>
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
        <button onClick={onNext} className="flex-1 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium text-sm flex items-center justify-center gap-1 transition-colors">
          Continue <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

// --- Step 3: Confirm summary ---

function Step3Confirm({ activeCount, duplicateCount, total, onBack, onImport }: {
  activeCount: number
  duplicateCount: number
  total: number
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

      <p className="text-muted text-xs text-center">
        Transactions will be added to Actual Budget. This cannot be undone.
      </p>

      <div className="flex gap-3 mt-auto">
        <button onClick={onBack} className="flex-1 py-3 rounded-xl border border-border text-white hover:bg-surface transition-colors text-sm flex items-center justify-center gap-1">
          <ChevronLeft size={16} /> Back
        </button>
        <button onClick={onImport} className="flex-1 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors">
          <Check size={16} /> Import
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

function Step4Done({ onHome }: { onHome: () => void }) {
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
        <p className="text-muted text-sm mt-1">Transactions added to Actual Budget</p>
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
