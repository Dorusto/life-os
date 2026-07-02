import { useState } from 'react'
import { Loader2, AlertCircle, Check } from 'lucide-react'
import {
  confirmCsvImport,
  type ImportPreview,
  type ImportResult,
  type AccountOption,
} from '../lib/api'
import { matchAccountBySource } from '../lib/csvImportUtils'

// --- Local types (mirrors ImportRow from api.ts with local UI additions) ---

const TRANSFER_VALUE = '__transfer__'

interface LocalRow {
  id: string
  date: string
  merchant: string
  amount: number
  is_expense: boolean
  currency: string
  categoryName: string
  categoryConfirmed: boolean
  duplicate: boolean
  possibleDuplicate: boolean  // same date+merchant already in AB, different amount
  existingAmount: number | null
  isTransferCandidate: boolean
  excluded: boolean
  notes: string
  transferToAccountId: string  // non-empty → this row is a transfer to that account
  isManualTransfer: boolean    // true when user explicitly selected "↔ Transfer to…"
}

// Word-level Jaccard similarity for merchant name matching.
// Strips non-letter characters, splits on whitespace, keeps tokens ≥ 3 chars.
// Returns 0..1; used to propagate category edits to same-merchant rows even
// when bank adds a store number or address suffix.
function merchantSimilarity(a: string, b: string): number {
  const tokens = (s: string) => new Set(
    s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(t => t.length >= 3)
  )
  const ta = tokens(a)
  const tb = tokens(b)
  const intersection = [...ta].filter(t => tb.has(t)).length
  const union = new Set([...ta, ...tb]).size
  return union === 0 ? 0 : intersection / union
}

// --- Props ---

export interface CsvImportData {
  status: 'loading' | 'ready' | 'error'
  preview?: ImportPreview
  error?: string
}

interface CsvImportCardProps {
  data: CsvImportData
  onConfirmed: (message: string, result?: ImportResult) => void
  onCancelled: () => void
}

// --- Component ---

export default function CsvImportCard({ data, onConfirmed, onCancelled }: CsvImportCardProps) {
  if (data.status === 'loading') {
    return (
      <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-5 max-w-[520px] w-full">
        <div className="flex items-center gap-3">
          <Loader2 size={18} className="animate-spin text-accent" />
          <p className="text-white text-sm">Analyzing CSV…</p>
        </div>
      </div>
    )
  }

  if (data.status === 'error') {
    return (
      <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-5 max-w-[520px] w-full space-y-3">
        <div className="flex items-start gap-2">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{data.error || 'Failed to parse CSV'}</p>
        </div>
        <button
          onClick={onCancelled}
          className="text-sm text-muted hover:text-white transition-colors"
        >
          Dismiss
        </button>
      </div>
    )
  }

  // --- Ready state ---

  const preview = data.preview!
  const [accountId, setAccountId] = useState('')
  const [rows, setRows] = useState<LocalRow[]>(() =>
    preview.rows.map(r => ({
      id: r.id,
      date: r.date,
      merchant: r.merchant,
      amount: r.amount,
      is_expense: r.is_expense,
      currency: r.currency,
      categoryName: r.category_name,
      categoryConfirmed: r.category_confirmed,
      duplicate: r.duplicate,
      possibleDuplicate: r.possible_duplicate,
      existingAmount: r.existing_amount,
      isTransferCandidate: r.is_transfer_candidate ?? false,
      excluded: r.is_transfer_candidate ?? false,
      notes: '',
      transferToAccountId: '',
      isManualTransfer: false,
    }))
  )
  const [importing, setImporting] = useState(false)

  // Auto-select account if name matches source
  const matched = matchAccountBySource(preview.source_name, preview.accounts)
  if (!accountId && matched) {
    // Use setTimeout to avoid setState during render
    setTimeout(() => setAccountId(matched.id), 0)
  }

  const activeRows = rows.filter(r => !r.duplicate && !r.excluded)
  const transferRows = rows.filter(r => !r.duplicate && r.isManualTransfer && r.transferToAccountId)
  const duplicateCount = rows.filter(r => r.duplicate).length
  // A row needs action if: it's an active expense with no category AND not a transfer with account set
  const needsActionCount = activeRows.filter(r => r.categoryName === '' && r.is_expense).length
  const totalExpenses = activeRows.filter(r => r.is_expense).reduce((s, r) => s + r.amount, 0)
  const totalIncome = activeRows.filter(r => !r.is_expense).reduce((s, r) => s + r.amount, 0)

  function handleCategoryChange(id: string, categoryName: string) {
    setRows(prev => {
      const merchant = prev.find(r => r.id === id)?.merchant ?? ''
      return prev.map(r => {
        if (r.id === id) {
          // Switching to transfer clears the category; switching away clears the account
          const isTransfer = categoryName === TRANSFER_VALUE
          return {
            ...r,
            categoryName: isTransfer ? '' : categoryName,
            categoryConfirmed: !isTransfer,
            transferToAccountId: isTransfer ? r.transferToAccountId : '',
            isManualTransfer: isTransfer,
            excluded: isTransfer ? true : (r.isTransferCandidate ? r.excluded : false),
          }
        }
        if (!r.duplicate && !r.categoryConfirmed && categoryName !== TRANSFER_VALUE && merchantSimilarity(r.merchant, merchant) >= 0.5) {
          return { ...r, categoryName, categoryConfirmed: true }
        }
        return r
      })
    })
  }

  function handleTransferAccountChange(id: string, value: string) {
    if (!value) {
      // User selected "← back" — cancel and return to category mode
      setRows(prev => prev.map(r =>
        r.id === id
          ? { ...r, isManualTransfer: false, transferToAccountId: '', categoryName: '', excluded: false }
          : r
      ))
    } else {
      setRows(prev => prev.map(r =>
        r.id === id ? { ...r, transferToAccountId: value, excluded: true } : r
      ))
    }
  }

  function handleToggleExclude(id: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, excluded: !r.excluded } : r))
  }

  async function handleImport() {
    setImporting(true)
    try {
      // Include regular rows + transfer rows (those excluded but with a destination account)
      const rowsToSend = [
        ...rows.filter(r => !r.excluded),
        ...transferRows,
      ]
      const result = await confirmCsvImport({
        account_id: accountId,
        rows: rowsToSend.map(r => ({
          date: r.date,
          merchant: r.merchant,
          amount: r.amount,
          is_expense: r.is_expense,
          category_name: r.categoryName,
          category_confirmed: r.categoryConfirmed,
          duplicate: r.duplicate,
          is_transfer_candidate: r.isTransferCandidate,
          transfer_to_account_id: r.transferToAccountId || undefined,
          notes: r.notes || undefined,
        })),
      })
      const parts = [`Imported ${result.imported} transactions.`]
      if (result.merged) parts.push(`${result.merged} categories updated.`)
      if (result.skipped) parts.push(`${result.skipped} duplicates skipped.`)
      onConfirmed(parts.join(' '), result)
    } catch (err) {
      onConfirmed(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setImporting(false)
    }
  }

  const selectClass = `
    w-full bg-background border border-border rounded-lg px-2 py-1.5
    text-white text-xs appearance-none
    focus:outline-none focus:border-accent transition-colors
  `

  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[600px] w-full space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-white text-sm font-medium">
          Import CSV — {preview.source_name} — {preview.total_rows} transactions
        </p>
      </div>

      {/* Account selector */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-muted whitespace-nowrap">Account</label>
        <select
          value={accountId}
          onChange={e => setAccountId(e.target.value)}
          className={`${selectClass} ${!accountId ? 'border-yellow-500/60 text-yellow-500' : ''}`}
        >
          <option value="" disabled>— select account —</option>
          {preview.accounts.map((acc: AccountOption) => (
            <option key={acc.id} value={acc.id}>{acc.name}</option>
          ))}
        </select>
      </div>
      {!accountId && (
        <p className="text-yellow-500 text-xs">
          No account matched "{preview.source_name}". Select one.
        </p>
      )}

      {/* Transaction list */}
      <div className="max-h-72 overflow-y-auto -mx-4 px-4">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface">
            <tr className="text-muted">
              <th className="text-left pb-1 pr-2 font-medium w-[42px]">Date</th>
              <th className="text-left pb-1 pr-2 font-medium">Merchant</th>
              <th className="text-right pb-1 pr-2 font-medium w-[72px]">Amount</th>
              <th className="text-left pb-1 font-medium w-[160px]">Category</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(row => {
              const dimmed = row.duplicate || (row.isTransferCandidate && row.excluded)
              return (
                <tr key={row.id} className={dimmed ? 'opacity-40' : ''}>
                  <td className="py-1 pr-2 text-muted whitespace-nowrap">{row.date.slice(5)}</td>
                  <td className="py-1 pr-2 text-white truncate max-w-0">
                    <div className="flex items-center gap-1">
                      {row.duplicate && (
                        <span title="Already imported">
                          <AlertCircle size={10} className="text-muted flex-shrink-0" />
                        </span>
                      )}
                      {row.possibleDuplicate && (
                        <span
                          title={`Possible duplicate — €${row.existingAmount?.toFixed(2)} already recorded for this merchant on this date`}
                        >
                          <AlertCircle size={10} className="text-yellow-500 flex-shrink-0" />
                        </span>
                      )}
                      {row.merchant}
                      {row.isTransferCandidate && (
                        <span
                          className="bg-blue-500/10 text-blue-400 border border-blue-500/30 text-[10px] px-1 rounded whitespace-nowrap"
                          title="Likely internal transfer"
                        >
                          Transfer?
                        </span>
                      )}
                    </div>
                    {row.isTransferCandidate && (
                      <button
                        onClick={() => handleToggleExclude(row.id)}
                        className="text-[10px] text-blue-400 hover:text-blue-300 mt-0.5 block"
                      >
                        {row.excluded ? 'Include' : 'Exclude'}
                      </button>
                    )}
                  </td>
                  <td className="py-1 pr-2 text-white text-right whitespace-nowrap">
                    {row.is_expense ? '' : '+'}
                    {row.currency === 'EUR' ? '€' : row.currency}{row.amount.toFixed(2)}
                  </td>
                  <td className="py-1">
                    {row.duplicate ? (
                      <span className="text-muted italic">duplicate</span>
                    ) : row.isManualTransfer && row.transferToAccountId ? (
                      // Transfer confirmed — full "A → B" badge + undo button
                      (() => {
                        const thisAccName = preview.accounts.find(a => a.id === accountId)?.name ?? '?'
                        const otherAccName = preview.accounts.find(a => a.id === row.transferToAccountId)?.name ?? '?'
                        const fromName = row.is_expense ? thisAccName : otherAccName
                        const toName   = row.is_expense ? otherAccName : thisAccName
                        return (
                          <div className="flex items-center gap-1.5">
                            <span className="text-blue-400 text-[11px] bg-blue-500/10 border border-blue-500/30 px-2 py-1 rounded-lg whitespace-nowrap leading-tight">
                              {fromName} → {toName}
                            </span>
                            <button
                              onClick={() => setRows(prev => prev.map(r =>
                                r.id === row.id
                                  ? { ...r, isManualTransfer: false, transferToAccountId: '', categoryName: '', excluded: false }
                                  : r
                              ))}
                              className="text-muted hover:text-red-400 text-sm leading-none flex-shrink-0"
                              title="Remove transfer"
                            >
                              ×
                            </button>
                          </div>
                        )
                      })()
                    ) : row.isManualTransfer && !row.transferToAccountId ? (
                      // Transfer selected, waiting for the other account
                      // Use a button for cancel — select option with value="" won't trigger
                      // onChange when it's already the current value.
                      <div className="flex gap-1 items-center">
                        <select
                          value=""
                          onChange={e => handleTransferAccountChange(row.id, e.target.value)}
                          className={`${selectClass} border-yellow-500/60 flex-1`}
                          autoFocus
                        >
                          <option value="" disabled>
                            {row.is_expense ? '— to which account? —' : '— from which account? —'}
                          </option>
                          {preview.accounts
                            .filter(acc => acc.id !== accountId)
                            .map((acc: AccountOption) => (
                              <option key={acc.id} value={acc.id}>{acc.name}</option>
                            ))}
                        </select>
                        <button
                          onClick={() => handleTransferAccountChange(row.id, '')}
                          className="text-muted hover:text-white text-sm leading-none flex-shrink-0 px-1"
                          title="Cancel transfer"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      // Normal: category dropdown with Transfer as first option
                      <div className="relative">
                        <select
                          value={row.categoryName}
                          onChange={e => handleCategoryChange(row.id, e.target.value)}
                          className={`${selectClass} ${row.categoryName === '' ? 'border-yellow-500/60 pr-5' : !row.categoryConfirmed ? 'border-yellow-500/30 pr-5' : ''}`}
                        >
                          <option value={TRANSFER_VALUE}>
                            {row.is_expense ? '↔ Transfer to…' : '↔ Transfer from…'}
                          </option>
                          <option value="">— no category —</option>
                          {preview.ab_categories.map(name => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                        {(!row.categoryConfirmed || row.categoryName === '') && (
                          <span
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-yellow-500 text-xs pointer-events-none"
                            title={row.categoryName === '' ? 'Needs a category' : 'Auto-suggested — verify if correct'}
                          >
                            ?
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-3 text-xs text-muted flex-wrap">
        <span>{activeRows.filter(r => r.is_expense).length} expenses (−€{totalExpenses.toFixed(2)})</span>
        {totalIncome > 0 && <span>| {activeRows.filter(r => !r.is_expense).length} income (+€{totalIncome.toFixed(2)})</span>}
        {duplicateCount > 0 && <span>| {duplicateCount} duplicates skipped</span>}
      </div>

      {/* Warning for uncategorized */}
      {needsActionCount > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
          <AlertCircle size={14} className="text-yellow-500 flex-shrink-0 mt-0.5" />
          <p className="text-yellow-500 text-xs">
            <span className="font-medium">{needsActionCount}</span> transaction{needsActionCount > 1 ? 's' : ''} need{needsActionCount === 1 ? 's' : ''} a category
          </p>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancelled}
          disabled={importing}
          className="flex-1 py-2 rounded-xl border border-border text-muted hover:text-white hover:bg-surface-hover text-sm transition-colors disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          onClick={handleImport}
          disabled={!accountId || needsActionCount > 0 || importing}
          className="flex-1 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          {importing ? (
            <><Loader2 size={14} className="animate-spin" /> Importing...</>
          ) : (
            <><Check size={14} /> Import</>
          )}
        </button>
      </div>
    </div>
  )
}
