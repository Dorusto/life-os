import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Check, Plus, X } from 'lucide-react'
import {
  uploadReceipt,
  confirmReceipt,
  createTransaction,
  splitTransaction,
  getCategories,
  getCategoryGroups,
  getAccountList,
  type ReceiptDraft,
  type ConfirmResponse,
  type NearDuplicateMatch,
  type Category,
  type AccountOption,
} from '../lib/api'
import { formatCurrency } from '../lib/formatCurrency'

/**
 * Receipt flow — the multi-step process after selecting a photo, or manual entry.
 *
 * States:
 *   uploading  → image is being uploaded + OCR running (30-60s on CPU), or manual
 *                mode is loading its account/category lists
 *   reviewing  → user sees extracted data and can edit before confirming
 *   confirming → confirm request in flight
 *   success    → checkmark animation, then auto-navigate home
 *   error      → something went wrong, with a retry option
 *
 * Two entry modes:
 *   - Photo: image comes from sessionStorage (set by Home.tsx before navigation).
 *     We upload it immediately on mount so OCR runs while the user looks at it.
 *   - Manual: `location.state?.manual` is true — blank fields, no image, no OCR.
 *
 * Split lines (#115): a transaction can be split across 2+ categories. The first
 * line's category is the transaction's primary category; each extra line carries
 * its own category + amount, and the lines must sum to the top-level amount.
 */

type FlowState = 'uploading' | 'reviewing' | 'confirming' | 'success' | 'error'

const NEW_CATEGORY_VALUE = '__new_category__'

// Today's date as YYYY-MM-DD in local time. toISOString() is UTC-based, so a
// receipt confirmed between 00:00 and the local-UTC offset would default to
// yesterday (audit finding 77) — same local-safe shape as the fixed parser in
// lib/groupByMonth.
function todayLocalIsoDate(): string {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${mm}-${dd}`
}

interface Line {
  categoryId: string
  amount: string
  isNewCategory: boolean
  newCategoryGroup: string
}

export default function ReceiptFlow() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const isManual = (location.state as { manual?: boolean } | null)?.manual === true

  const [flowState, setFlowState] = useState<FlowState>('uploading')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [draft, setDraft] = useState<ReceiptDraft | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Form fields (pre-filled from OCR, editable by user)
  const [merchant, setMerchant] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [accountId, setAccountId] = useState('')

  // Split lines — first line is the transaction's primary category
  const [lines, setLines] = useState<Line[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [categoryGroups, setCategoryGroups] = useState<string[]>([])

  // Near-duplicate match (bank-sync) awaiting user decision (#121)
  const [possibleMatch, setPossibleMatch] = useState<NearDuplicateMatch | null>(null)
  // Soft warning shown on the success screen when a split failed after save
  const [successNotice, setSuccessNotice] = useState<string | null>(null)

  // Photo mode — upload and run OCR as soon as the component mounts
  useEffect(() => {
    if (isManual) return

    const dataUrl = sessionStorage.getItem('pendingReceiptDataUrl')
    const fileName = sessionStorage.getItem('pendingReceiptName') || 'receipt.jpg'
    const fileType = sessionStorage.getItem('pendingReceiptType') || 'image/jpeg'

    if (!dataUrl) {
      navigate('/', { replace: true })
      return
    }

    // Show the image immediately while OCR runs in the background
    setImageUrl(dataUrl)

    // Convert data URL back to File for the API call
    const base64 = dataUrl.split(',')[1]
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    const file = new File([bytes], fileName, { type: fileType })

    uploadReceipt(file)
      .then(async (result) => {
        setDraft(result)
        // Pre-fill form with OCR results
        setMerchant(result.merchant || '')
        setAmount(result.amount != null ? String(result.amount) : '')
        setDate(result.date || todayLocalIsoDate())
        setCategories(result.categories)
        setAccounts(result.accounts)
        setAccountId(result.accounts[0]?.id || '')
        const firstCategory = result.suggested_category_id || result.categories[0]?.id || ''
        setLines([{
          categoryId: firstCategory,
          amount: result.amount != null ? String(result.amount) : '',
          isNewCategory: false,
          newCategoryGroup: '',
        }])
        setFlowState('reviewing')
        // Fetch category groups for new-category UI (#187)
        try {
          const groups = await getCategoryGroups()
          setCategoryGroups(groups)
        } catch {
          // non-fatal – groups will be empty, user can still type a group name freely
        }
        // Clean up sessionStorage
        sessionStorage.removeItem('pendingReceiptDataUrl')
        sessionStorage.removeItem('pendingReceiptName')
        sessionStorage.removeItem('pendingReceiptType')
      })
      .catch(err => {
        setErrorMessage(err.message || 'Failed to process image')
        setFlowState('error')
      })
  }, [isManual, navigate])

  // Manual mode — blank fields, fetch account/category lists directly (no OCR)
  useEffect(() => {
    if (!isManual) return
    let cancelled = false

    ;(async () => {
      try {
        const [cats, accts] = await Promise.all([getCategories(), getAccountList()])
        if (cancelled) return
        setCategories(cats.map(c => ({ id: c.id, name: c.name, emoji: '', group_name: c.group_name })))
        setAccounts(accts.map(a => ({ id: a.id, name: a.name })))
        setAccountId(accts[0]?.id || '')
        setMerchant('')
        setAmount('')
        setDate(todayLocalIsoDate())
        setLines([{ categoryId: '', amount: '', isNewCategory: false, newCategoryGroup: '' }])
        const groups = await getCategoryGroups()
        if (cancelled) return
        setCategoryGroups(groups)
        setFlowState('reviewing')
      } catch (err) {
        if (cancelled) return
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load accounts and categories')
        setFlowState('error')
      }
    })()

    return () => { cancelled = true }
  }, [isManual])

  // --- Line helpers ---

  function onAmountChange(v: string) {
    setAmount(v)
    // Keep the single line's amount in sync with the top-level total while
    // there's only one line, so a simple (non-split) save never mismatches.
    setLines(prev => prev.length === 1 ? [{ ...prev[0], amount: v }] : prev)
  }

  function addLine() {
    setLines(prev => [...prev, { categoryId: '', amount: '', isNewCategory: false, newCategoryGroup: '' }])
  }

  function removeLine(i: number) {
    setLines(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateLineCategory(i: number, value: string) {
    setLines(prev => prev.map((l, idx) => {
      if (idx !== i) return l
      if (value === NEW_CATEGORY_VALUE) {
        return { ...l, isNewCategory: true, categoryId: '' }
      }
      return { ...l, categoryId: value, isNewCategory: false }
    }))
  }

  function updateLineAmount(i: number, v: string) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, amount: v } : l))
  }

  // --- Derived validation ---

  const parsedTotal = parseFloat(amount) || 0
  const linesTotal = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const diff = parsedTotal - linesTotal
  // A single line always matches the total (its amount follows the top-level
  // field); only multi-line splits need the sum to balance the total.
  const isBalanced = lines.length === 0
    ? false
    : lines.length === 1
      ? true
      : Math.abs(diff) < 0.005
  const linesComplete =
    lines.length > 0 &&
    lines.every(l => l.categoryId !== '') &&
    (lines.length === 1 || lines.every(l => parseFloat(l.amount) > 0))

  const canConfirm =
    !possibleMatch &&
    !!merchant &&
    parsedTotal > 0 &&
    !!accountId &&
    isBalanced &&
    linesComplete

  // --- Confirm ---

  async function doConfirm(opts?: { forceNew?: boolean; attachTo?: string }) {
    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) return
    if (lines.length === 0 || !lines[0].categoryId) return

    setFlowState('confirming')
    setPossibleMatch(null)

    const base = {
      merchant,
      amount: parsedAmount,
      date,
      category_id: lines[0].categoryId,
      account_id: accountId,
      force_new: opts?.forceNew,
      attach_to: opts?.attachTo,
      ...(lines[0].isNewCategory ? { new_category_group: lines[0].newCategoryGroup.trim() || 'Majordom' } : {}),
    }

    try {
      const res: ConfirmResponse = isManual
        ? await createTransaction(base)
        : await confirmReceipt({ receipt_id: draft!.receipt_id, ...base })

      if (res.possible_match) {
        setPossibleMatch(res.possible_match)
        setFlowState('reviewing')
        return
      }

      const transactionId = res.transaction_id

      // Split across categories when there are 2+ lines and we created a new tx.
      // A failed split still leaves the transaction saved (just unsplit), so we
      // surface a softer warning rather than the generic error state.
      if (!opts?.attachTo && lines.length >= 2 && transactionId) {
        const splits = lines.map(l => ({
          category_id: l.categoryId,
          amount: parseFloat(l.amount) || 0,
          ...(l.isNewCategory ? { new_category_group: l.newCategoryGroup.trim() || 'Majordom' } : {}),
        }))
        try {
          await splitTransaction(transactionId, splits)
        } catch (err) {
          setSuccessNotice("Saved, but couldn't split into categories — you can split it manually in Actual Budget")
        }
      }

      setFlowState('success')
      // Invalidate every query derived from transactions so Home, balances and
      // the review counts refresh automatically (the old ['stats'] key had no
      // matching query — those stats live under ['home']).
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['home'] })
      queryClient.invalidateQueries({ queryKey: ['account-list'] })
      queryClient.invalidateQueries({ queryKey: ['duplicates', 'months'] })
      queryClient.invalidateQueries({ queryKey: ['home-pending'] })
      setTimeout(() => navigate('/', { replace: true }), 2200)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save')
      setFlowState('error')
    }
  }

  // --- Render states ---

  if (flowState === 'success') {
    return <SuccessScreen notice={successNotice ?? undefined} />
  }

  return (
    <div className="min-h-dvh bg-token-paper flex flex-col">
      {/* Back button */}
      <button
        onClick={() => navigate('/')}
        className="absolute top-12 left-4 z-10 p-2 rounded-xl text-token-ink hover:text-token-ink transition-colors"
        aria-label="Go back"
      >
        <ChevronLeft size={24} />
      </button>

      {/* Receipt image — photo mode only, takes up top portion of screen */}
      {!isManual && (
        <div className="relative w-full bg-token-surface" style={{ height: '45vh' }}>
          {imageUrl && (
            <img
              src={imageUrl}
              alt="Receipt"
              className="w-full h-full object-contain"
            />
          )}

          {/* Uploading overlay */}
          {flowState === 'uploading' && (
            <div className="absolute inset-0 bg-token-paper backdrop-blur-sm flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-2 border-token-brand border-t-transparent rounded-full animate-spin" />
              <p className="text-token-ink text-sm">Reading receipt…</p>
              <p className="text-token-ink-3 text-xs">This takes 30–60 seconds</p>
            </div>
          )}
        </div>
      )}

      {/* Manual mode loading state (no image area to overlay) */}
      {isManual && flowState === 'uploading' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-token-brand border-t-transparent rounded-full animate-spin" />
          <p className="text-token-ink-3 text-sm">Loading…</p>
        </div>
      )}

      {/* Form — slides up once reviewing starts */}
      <AnimatePresence>
        {(flowState === 'reviewing' || flowState === 'confirming') && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="flex-1 flex flex-col px-5 pt-5 pb-8 gap-4 overflow-y-auto"
          >
            {/* Category source hint (photo mode only) */}
            {draft?.category_source === 'history' && (
              <p className="text-xs text-token-gain text-center">
                ✓ Category from your history
              </p>
            )}

            <Field label="Merchant">
              <input
                type="text"
                value={merchant}
                onChange={e => setMerchant(e.target.value)}
                className={inputClass}
                placeholder="Albert Heijn"
              />
            </Field>

            <div className="flex gap-3">
              <Field label="Amount (EUR)" className="flex-1">
                <input
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={e => onAmountChange(e.target.value)}
                  className={inputClass}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </Field>

              <Field label="Date" className="flex-1">
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>

            {/* Split lines — first line carries the primary category */}
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className={labelClass}>Category</label>
                </div>
                {lines.length > 1 && (
                  <div className="w-28">
                    <label className={labelClass}>Amount</label>
                  </div>
                )}
                {lines.length > 1 && <div className="w-7" />}
              </div>

              <datalist id="receipt-category-groups">
                {categoryGroups.map(g => <option key={g} value={g} />)}
              </datalist>

              {lines.map((line, i) => (
                <div key={i} className="flex gap-2 items-center">
                  {line.isNewCategory ? (
                    <>
                      <div className="flex flex-col gap-2 flex-1">
                        <div className="flex gap-1 items-center">
                          <input
                            type="text"
                            value={line.categoryId}
                            onChange={e => updateLineCategory(i, e.target.value)}
                            placeholder="New category name"
                            autoFocus
                            className={`${inputClass} border-token-warn flex-1`}
                          />
                          <button
                            onClick={() => setLines(prev => prev.map((l, idx) =>
                              idx === i ? { ...l, isNewCategory: false, categoryId: '', newCategoryGroup: '' } : l
                            ))}
                            className="text-token-ink-3 hover:text-token-ink text-sm leading-none flex-shrink-0 px-1"
                            title="Cancel"
                          >
                            ×
                          </button>
                        </div>
                        <input
                          type="text"
                          value={line.newCategoryGroup}
                          onChange={e => setLines(prev => prev.map((l, idx) =>
                            idx === i ? { ...l, newCategoryGroup: e.target.value } : l
                          ))}
                          placeholder="Group (default: Majordom)"
                          list="receipt-category-groups"
                          className={inputClass}
                        />
                      </div>
                      {lines.length > 1 && (
                        <input
                          type="number"
                          inputMode="decimal"
                          value={line.amount}
                          onChange={e => updateLineAmount(i, e.target.value)}
                          className={`${inputClass} w-28`}
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                        />
                      )}
                      {lines.length > 1 && (
                        <button
                          onClick={() => removeLine(i)}
                          disabled={i === 0}
                          className="w-7 h-7 flex items-center justify-center rounded-full text-token-ink-3 hover:text-token-ink disabled:invisible transition-colors"
                          aria-label="Remove line"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <select
                        value={line.categoryId}
                        onChange={e => updateLineCategory(i, e.target.value)}
                        className={`${inputClass} flex-1 ${line.categoryId === '' ? 'border-token-warn' : ''}`}
                      >
                        <option value="">Select category…</option>
                        <option value={NEW_CATEGORY_VALUE}>+ Create new category</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>
                            {cat.emoji ? `${cat.emoji} ${cat.name}` : cat.name}
                          </option>
                        ))}
                      </select>
                      {lines.length > 1 && (
                        <input
                          type="number"
                          inputMode="decimal"
                          value={line.amount}
                          onChange={e => updateLineAmount(i, e.target.value)}
                          className={`${inputClass} w-28`}
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                        />
                      )}
                      {lines.length > 1 && (
                        <button
                          onClick={() => removeLine(i)}
                          disabled={i === 0}
                          className="w-7 h-7 flex items-center justify-center rounded-full text-token-ink-3 hover:text-token-ink disabled:invisible transition-colors"
                          aria-label="Remove line"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}

              {/* Running total vs top-level amount */}
              {lines.length > 1 && !isBalanced && (
                <p className="text-xs text-token-warn text-center">
                  {diff > 0
                    ? `${formatCurrency(diff)} unallocated`
                    : `${formatCurrency(Math.abs(diff))} over by`}
                </p>
              )}

              <button
                onClick={addLine}
                className="flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-token-line text-token-ink-3 hover:text-token-ink hover:border-token-line-strong text-sm transition-colors"
              >
                <Plus size={16} />
                Add line
              </button>
            </div>

            {/* Only show account selector if there are multiple accounts */}
            {accounts.length > 1 && (
              <Field label="Account">
                <select
                  value={accountId}
                  onChange={e => setAccountId(e.target.value)}
                  className={inputClass}
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {/* Possible bank-sync match found — hold off, let the user decide (#121) */}
            {possibleMatch && (
              <div className="px-3 py-2.5 rounded-xl bg-token-warn-soft border border-token-warn space-y-2">
                <p className="text-token-warn text-xs">
                  Found a similar bank transaction: <span className="text-token-ink">{possibleMatch.payee || 'Unknown'}</span>{' '}
                  {formatCurrency(possibleMatch.amount)} on {possibleMatch.date}. Attach these details to it instead of creating a new transaction?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => doConfirm({ forceNew: true })}
                    disabled={flowState === 'confirming'}
                    className="flex-1 py-1.5 rounded-lg border border-token-line text-token-ink-3 hover:text-token-ink text-xs transition-colors disabled:opacity-40"
                  >
                    Create new anyway
                  </button>
                  <button
                    onClick={() => doConfirm({ attachTo: possibleMatch.financial_id })}
                    disabled={flowState === 'confirming'}
                    className="flex-1 py-1.5 rounded-lg bg-token-brand hover:bg-token-brand-2 text-white text-xs font-medium transition-colors disabled:opacity-40"
                  >
                    Attach to this
                  </button>
                </div>
              </div>
            )}

            {/* Confirm button */}
            {!possibleMatch && (
              <button
                onClick={() => doConfirm()}
                disabled={flowState === 'confirming' || !canConfirm}
                className="
                  mt-2 w-full py-4 rounded-2xl bg-token-brand hover:bg-token-brand-2
                  text-white font-medium text-base
                  disabled:opacity-40 disabled:cursor-not-allowed
                  active:scale-[0.98] transition-all duration-150
                  flex items-center justify-center gap-2
                "
              >
                {flowState === 'confirming' ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    Confirm
                  </>
                )}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error state */}
      {flowState === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center px-5 gap-4">
          <p className="text-token-loss text-center">{errorMessage}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 rounded-xl border border-token-line text-token-ink hover:bg-token-surface transition-colors"
          >
            Go back
          </button>
        </div>
      )}
    </div>
  )
}

// --- Sub-components ---

function Field({
  label,
  children,
  className = '',
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="text-xs text-token-ink-3 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

const inputClass = `
  w-full px-4 py-3 rounded-xl bg-token-surface border border-token-line
  text-token-ink text-base appearance-none
  focus:outline-none focus:border-token-brand focus:ring-1 focus:ring-token-brand
  transition-colors
`

const labelClass = 'text-xs text-token-ink-3 uppercase tracking-wide'

/**
 * Success screen — shown after a transaction is confirmed.
 * Framer Motion animates the checkmark ring and icon.
 * Auto-navigates home after 2.2 seconds (set in doConfirm).
 */
function SuccessScreen({ notice }: { notice?: string }) {
  return (
    <div className="min-h-dvh bg-token-paper flex flex-col items-center justify-center gap-5">
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 15, stiffness: 200 }}
        className="relative"
      >
        {/* Pulsing ring */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0.8 }}
          animate={{ scale: 1.4, opacity: 0 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'easeOut' }}
          className="absolute inset-0 rounded-full bg-token-gain"
        />
        {/* Checkmark circle */}
        <div className="w-20 h-20 rounded-full bg-token-gain flex items-center justify-center">
          <Check size={36} className="text-white" strokeWidth={2.5} />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-center"
      >
        <p className="text-token-ink text-lg font-medium">Saved!</p>
        <p className="text-token-ink-3 text-sm mt-1">Transaction added to Actual Budget</p>
        {notice && (
          <p className="text-token-warn text-sm mt-2 max-w-xs mx-auto">{notice}</p>
        )}
      </motion.div>
    </div>
  )
}
