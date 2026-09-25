import { useEffect, useState } from 'react'
import { Loader2, AlertCircle, Check } from 'lucide-react'
import {
  confirmCsvImport,
  createAccount,
  type ImportPreview,
  type ImportResult,
  type AccountOption,
} from '../lib/api'
import { matchAccountBySource, tokenizeName } from '../lib/csvImportUtils'
import { formatCurrency, formatNumber } from '../lib/formatCurrency'
import { Button } from './kit/Button'

// --- Local types (mirrors ImportRow from api.ts with local UI additions) ---

const TRANSFER_VALUE = '__transfer__'
const NEW_CATEGORY_VALUE = '__new_category__'

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
  createRule: boolean          // user checked "save as rule" for this row (#99)
  isNewCategory: boolean       // true when user selected "+ Create new category" (#99)
  newCategoryGroup: string     // group to create the new category in
}

// Word-level Jaccard similarity for merchant name matching (tokens from the
// shared tokenizeName() in lib/csvImportUtils.ts). Returns 0..1; used to
// propagate category edits to same-merchant rows even when bank adds a store
// number or address suffix.
function merchantSimilarity(a: string, b: string): number {
  const ta = new Set(tokenizeName(a))
  const tb = new Set(tokenizeName(b))
  const intersection = [...ta].filter(t => tb.has(t)).length
  const union = new Set([...ta, ...tb]).size
  return union === 0 ? 0 : intersection / union
}

// Map an ImportPreview's rows to the local editable-row shape. Extracted so the
// rows initializer and the preview-arrival effect below share one implementation.
function previewToRows(preview: ImportPreview): LocalRow[] {
  return preview.rows.map(r => ({
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
    // An existing AB rule already resolved this to a known transfer target —
    // treat it the same as a manually-confirmed transfer so it's actually
    // imported, not silently dropped or re-asked about later (#99).
    transferToAccountId: r.transfer_to_account_id ?? '',
    isManualTransfer: !!r.transfer_to_account_id,
    createRule: false,
    isNewCategory: false,
    newCategoryGroup: '',
  }))
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
  // Hooks run unconditionally on every render (Rules of Hooks): Chat mounts the
  // card as 'loading' and later updates the same instance to 'ready'.
  const [accountId, setAccountId] = useState('')
  // No preview yet on the loading mount — the effect below seeds rows once it arrives.
  const [rows, setRows] = useState<LocalRow[]>(() => (data.preview ? previewToRows(data.preview) : []))
  const [importing, setImporting] = useState(false)
  const [creatingAccount, setCreatingAccount] = useState(false)
  const [newAccountName, setNewAccountName] = useState('')
  const [newAccountOffBudget, setNewAccountOffBudget] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  // Seed rows from the preview on the loading → ready transition (a lazy
  // initializer never re-runs, so the guarded one above can't do it alone).
  useEffect(() => {
    if (data.status === 'ready' && data.preview) {
      setRows(previewToRows(data.preview))
    }
  }, [data.status, data.preview])

  // Auto-select the account when the CSV source name matches one — in an
  // effect, not a render-phase setTimeout (audit finding 71).
  const matched = data.preview
    ? matchAccountBySource(data.preview.source_name, data.preview.accounts)
    : undefined
  useEffect(() => {
    if (!accountId && matched) setAccountId(matched.id)
  }, [accountId, matched])

  if (data.status === 'loading') {
    return (
      <div className="bg-token-surface border border-token-line rounded-2xl rounded-bl-sm px-4 py-5 max-w-[520px] w-full">
        <div className="flex items-center gap-3">
          <Loader2 size={18} className="animate-spin text-token-brand-ink" />
          <p className="text-token-ink text-sm">Analyzing CSV…</p>
        </div>
      </div>
    )
  }

  if (data.status === 'error') {
    return (
      <div className="bg-token-surface border border-token-line rounded-2xl rounded-bl-sm px-4 py-5 max-w-[520px] w-full space-y-3">
        <div className="flex items-start gap-2">
          <AlertCircle size={16} className="text-token-loss flex-shrink-0 mt-0.5" />
          <p className="text-token-loss text-sm">{data.error || 'Failed to parse CSV'}</p>
        </div>
        <Button onClick={onCancelled} variant="ghost" size="sm">
          Dismiss
        </Button>
      </div>
    )
  }

  // --- Ready state ---

  const preview = data.preview!

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
          // Switching to transfer or new-category clears the category; switching away clears the account
          const isTransfer = categoryName === TRANSFER_VALUE
          const isNewCategory = categoryName === NEW_CATEGORY_VALUE
          return {
            ...r,
            categoryName: (isTransfer || isNewCategory) ? '' : categoryName,
            categoryConfirmed: !isTransfer && !isNewCategory,
            transferToAccountId: isTransfer ? r.transferToAccountId : '',
            isManualTransfer: isTransfer,
            isNewCategory,
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

  function handleToggleCreateRule(id: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, createRule: !r.createRule } : r))
  }

  function handleMerchantChange(id: string, merchant: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, merchant } : r))
  }

  async function handleImport() {
    setImporting(true)
    setAccountError(null)
    setImportError(null)
    try {
      let targetAccountId = accountId
      if (creatingAccount) {
        try {
          const created = await createAccount(newAccountName.trim(), newAccountOffBudget)
          targetAccountId = created.id
        } catch (err) {
          setAccountError(err instanceof Error ? err.message : 'Failed to create account')
          setImporting(false)
          return
        }
      }
      // Include regular rows + transfer rows (those excluded but with a destination account)
      const rowsToSend = [
        ...rows.filter(r => !r.excluded),
        ...transferRows,
      ]
      const result = await confirmCsvImport({
        account_id: targetAccountId,
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
          create_rule: r.createRule,
          new_category_group: r.isNewCategory && r.categoryName ? (r.newCategoryGroup.trim() || 'Majordom') : undefined,
        })),
      })
      const parts = [`Imported ${result.imported} transactions.`]
      if (result.merged) parts.push(`${result.merged} categories updated.`)
      if (result.skipped) parts.push(`${result.skipped} duplicates skipped.`)
      onConfirmed(parts.join(' '), result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setImportError(`Could not import CSV (${msg}). Try again.`)
    } finally {
      setImporting(false)
    }
  }

  const selectClass = `
    w-full bg-token-paper border border-token-line rounded-lg px-2 py-1.5
    text-token-ink text-xs appearance-none
    focus:outline-none focus:border-token-brand transition-colors
  `

  return (
    <div className="bg-token-surface border border-token-line rounded-2xl rounded-bl-sm px-4 py-3 max-w-[600px] w-full space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-token-ink text-sm font-medium">
          Import CSV — {preview.source_name} — {preview.total_rows} transactions
        </p>
      </div>

      {/* Account selector */}
      {creatingAccount ? (
        <div className="space-y-1.5">
          <label className="text-xs text-token-ink-3 whitespace-nowrap">New account name</label>
          <input
            type="text"
            value={newAccountName}
            onChange={e => setNewAccountName(e.target.value)}
            placeholder={preview.source_name}
            className="w-full bg-token-paper border border-token-line rounded-lg px-3 py-2 text-token-ink text-sm placeholder:text-token-ink-3 focus:outline-none focus:border-token-brand transition-colors"
            autoFocus
          />
          <label className="flex items-center gap-1.5 text-xs text-token-ink-3 cursor-pointer">
            <input
              type="checkbox"
              checked={newAccountOffBudget}
              onChange={e => setNewAccountOffBudget(e.target.checked)}
              className="rounded border-token-line"
            />
            Off-budget (tracking only)
          </label>
          <button
            type="button"
            onClick={() => { setCreatingAccount(false); setNewAccountName('') }}
            className="text-xs text-token-brand-ink hover:underline"
          >
            Use an existing account instead
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <label className="text-xs text-token-ink-3 whitespace-nowrap">Account</label>
          <select
            value={accountId}
            onChange={e => setAccountId(e.target.value)}
            className={`${selectClass} ${!accountId ? 'border-token-warn text-token-warn' : ''}`}
          >
            <option value="" disabled>— select account —</option>
            {preview.accounts.map((acc: AccountOption) => (
              <option key={acc.id} value={acc.id}>{acc.name}</option>
            ))}
          </select>
        </div>
      )}
      {!creatingAccount && !accountId && (
        <p className="text-token-warn text-xs">
          No account matched "{preview.source_name}". Select one, or{' '}
          <button
            type="button"
            onClick={() => { setCreatingAccount(true); setNewAccountName(preview.source_name) }}
            className="text-token-brand-ink hover:underline"
          >
            create a new account
          </button>.
        </p>
      )}
      {accountError && <p className="text-token-loss text-xs">{accountError}</p>}

      <datalist id="csv-import-category-groups">
        {preview.category_groups.map(g => <option key={g} value={g} />)}
      </datalist>

      {/* Transaction list */}
      <div className="max-h-72 overflow-y-auto -mx-4 px-4">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-token-surface">
            <tr className="text-token-ink-3">
              <th className="text-left pb-1 pr-2 font-medium w-[42px]">Date</th>
              <th className="text-left pb-1 pr-2 font-medium">Merchant</th>
              <th className="text-right pb-1 pr-2 font-medium w-[72px]">Amount</th>
              <th className="text-left pb-1 font-medium w-[160px]">Category</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-token-line">
            {rows.map(row => {
              const dimmed = row.duplicate || (row.isTransferCandidate && row.excluded)
              return (
                <tr key={row.id} className={dimmed ? 'opacity-40' : ''}>
                  <td className="py-1 pr-2 text-token-ink-3 whitespace-nowrap">{row.date.slice(5)}</td>
                  <td className="py-1 pr-2 text-token-ink truncate max-w-0">
                    <div className="flex items-center gap-1">
                      {row.duplicate && (
                        <span title="Already imported">
                          <AlertCircle size={10} className="text-token-ink-3 flex-shrink-0" />
                        </span>
                      )}
                      {row.possibleDuplicate && (
                        <span
                          title={`Possible duplicate — ${formatCurrency(row.existingAmount ?? 0)} already recorded for this merchant on this date`}
                        >
                          <AlertCircle size={10} className="text-token-warn flex-shrink-0" />
                        </span>
                      )}
                      <input
                        type="text"
                        value={row.merchant}
                        onChange={e => handleMerchantChange(row.id, e.target.value)}
                        disabled={row.duplicate}
                        title="Edit — also used as the rule's match text when 'Save as rule' is checked"
                        className="min-w-0 flex-1 bg-transparent text-token-ink text-xs focus:outline-none focus:bg-token-paper rounded px-0.5 -mx-0.5 disabled:opacity-60"
                      />
                      {row.isTransferCandidate && (
                        <span
                          className="bg-token-info-soft text-token-info border border-token-info text-[10px] px-1 rounded whitespace-nowrap"
                          title="Likely internal transfer"
                        >
                          Transfer?
                        </span>
                      )}
                    </div>
                    {row.isTransferCandidate && (
                      <button
                        onClick={() => handleToggleExclude(row.id)}
                        className="text-[10px] text-token-info hover:text-token-info mt-0.5 block"
                      >
                        {row.excluded ? 'Include' : 'Exclude'}
                      </button>
                    )}
                  </td>
                  <td className="py-1 pr-2 text-token-ink text-right whitespace-nowrap">
                    {row.currency === 'EUR'
                      ? formatCurrency(row.is_expense ? -Math.abs(row.amount) : Math.abs(row.amount), { signDisplay: 'always' })
                      : `${row.is_expense ? '' : '+'}${row.currency}${formatNumber(row.amount, 2)}`}
                  </td>
                  <td className="py-1">
                    {row.duplicate ? (
                      <span className="text-token-ink-3 italic">duplicate</span>
                    ) : row.isManualTransfer && row.transferToAccountId ? (
                      // Transfer confirmed — full "A → B" badge + undo button + save-as-rule
                      (() => {
                        const thisAccName = preview.accounts.find(a => a.id === accountId)?.name ?? '?'
                        const otherAccName = preview.accounts.find(a => a.id === row.transferToAccountId)?.name ?? '?'
                        const fromName = row.is_expense ? thisAccName : otherAccName
                        const toName   = row.is_expense ? otherAccName : thisAccName
                        return (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-token-info text-[11px] bg-token-info-soft border border-token-info px-2 py-1 rounded-lg whitespace-nowrap leading-tight">
                                {fromName} → {toName}
                              </span>
                              <button
                                onClick={() => setRows(prev => prev.map(r =>
                                  r.id === row.id
                                    ? { ...r, isManualTransfer: false, transferToAccountId: '', categoryName: '', excluded: false }
                                    : r
                                ))}
                                className="text-token-ink-3 hover:text-token-loss text-sm leading-none flex-shrink-0"
                                title="Remove transfer"
                              >
                                ×
                              </button>
                            </div>
                            <label className="flex items-center gap-1 text-[10px] text-token-ink-3 mt-0.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={row.createRule}
                                onChange={() => handleToggleCreateRule(row.id)}
                                className="rounded border-token-line h-2.5 w-2.5"
                              />
                              Save as rule
                            </label>
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
                          className={`${selectClass} border-token-warn flex-1`}
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
                          className="text-token-ink-3 hover:text-token-ink text-sm leading-none flex-shrink-0 px-1"
                          title="Cancel transfer"
                        >
                          ×
                        </button>
                      </div>
                    ) : row.isNewCategory ? (
                      // New category — name + group, defaults to "Majordom" if group left blank
                      <div className="space-y-1">
                        <div className="flex gap-1 items-center">
                          <input
                            type="text"
                            value={row.categoryName}
                            onChange={e => setRows(prev => prev.map(r => r.id === row.id ? { ...r, categoryName: e.target.value } : r))}
                            placeholder="New category name"
                            autoFocus
                            className={`${selectClass} border-token-warn flex-1`}
                          />
                          <button
                            onClick={() => setRows(prev => prev.map(r => r.id === row.id ? { ...r, isNewCategory: false, categoryName: '' } : r))}
                            className="text-token-ink-3 hover:text-token-ink text-sm leading-none flex-shrink-0 px-1"
                            title="Cancel"
                          >
                            ×
                          </button>
                        </div>
                        <input
                          type="text"
                          value={row.newCategoryGroup}
                          onChange={e => setRows(prev => prev.map(r => r.id === row.id ? { ...r, newCategoryGroup: e.target.value } : r))}
                          placeholder="Group (default: Majordom)"
                          list="csv-import-category-groups"
                          className={selectClass}
                        />
                        {row.categoryName !== '' && (
                          <label className="flex items-center gap-1 text-[10px] text-token-ink-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={row.createRule}
                              onChange={() => handleToggleCreateRule(row.id)}
                              className="rounded border-token-line h-2.5 w-2.5"
                            />
                            Save as rule
                          </label>
                        )}
                      </div>
                    ) : (
                      // Normal: category dropdown with Transfer as first option
                      <div>
                        <div className="relative">
                          <select
                            value={row.categoryName}
                            onChange={e => handleCategoryChange(row.id, e.target.value)}
                            className={`${selectClass} ${row.categoryName === '' ? 'border-token-warn pr-5' : !row.categoryConfirmed ? 'border-token-warn pr-5' : ''}`}
                          >
                            <option value={TRANSFER_VALUE}>
                              {row.is_expense ? '↔ Transfer to…' : '↔ Transfer from…'}
                            </option>
                            <option value={NEW_CATEGORY_VALUE}>+ Create new category</option>
                            <option value="">— no category —</option>
                            {preview.ab_categories.map(name => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </select>
                          {(!row.categoryConfirmed || row.categoryName === '') && (
                            <span
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-token-warn text-xs pointer-events-none"
                              title={row.categoryName === '' ? 'Needs a category' : 'Auto-suggested — verify if correct'}
                            >
                              ?
                            </span>
                          )}
                        </div>
                        {row.categoryName !== '' && (
                          <label className="flex items-center gap-1 text-[10px] text-token-ink-3 mt-0.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={row.createRule}
                              onChange={() => handleToggleCreateRule(row.id)}
                              className="rounded border-token-line h-2.5 w-2.5"
                            />
                            Save as rule
                          </label>
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
      <div className="flex items-center gap-3 text-xs text-token-ink-3 flex-wrap">
        <span>{activeRows.filter(r => r.is_expense).length} expenses ({formatCurrency(-Math.abs(totalExpenses))})</span>
        {totalIncome > 0 && <span>| {activeRows.filter(r => !r.is_expense).length} income ({formatCurrency(Math.abs(totalIncome), { signDisplay: 'always' })})</span>}
        {duplicateCount > 0 && <span>| {duplicateCount} duplicates skipped</span>}
      </div>

      {/* Info for uncategorized — not a blocker, they import as uncategorized and
          surface later via the digest nudge (M4.5) */}
      {needsActionCount > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-token-warn-soft border border-token-warn">
          <AlertCircle size={14} className="text-token-warn flex-shrink-0 mt-0.5" />
          <p className="text-token-warn text-xs">
            <span className="font-medium">{needsActionCount}</span> transaction{needsActionCount > 1 ? 's' : ''} will import uncategorized — pick a category now or review later
          </p>
        </div>
      )}

      {importError && <p className="text-token-loss text-xs">{importError}</p>}

      {/* Buttons */}
      <div className="flex gap-2 pt-1">
        <Button onClick={onCancelled} disabled={importing} variant="secondary" size="sm" className="flex-1">
          Cancel
        </Button>
        <Button
          onClick={handleImport}
          disabled={(creatingAccount ? !newAccountName.trim() : !accountId) || importing}
          variant="primary"
          size="sm"
          className="flex-1"
        >
          {importing ? (
            <><Loader2 size={14} className="animate-spin" /> Importing...</>
          ) : (
            <><Check size={14} /> Import</>
          )}
        </Button>
      </div>
    </div>
  )
}
