import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Check } from 'lucide-react'
import { uploadReceipt, confirmReceipt, type ReceiptDraft } from '../lib/api'

/**
 * Receipt flow — the multi-step process after selecting a photo.
 *
 * States:
 *   uploading  → image is being uploaded + OCR running (30-60s on CPU)
 *   reviewing  → user sees extracted data and can edit before confirming
 *   confirming → confirm request in flight
 *   success    → checkmark animation, then auto-navigate home
 *   error      → something went wrong, with a retry option
 *
 * The image comes from sessionStorage (set by Home.tsx before navigation).
 * We upload it immediately on mount so the user doesn't have to wait after
 * they fill in the form — OCR runs while they look at the image.
 */

type FlowState = 'uploading' | 'reviewing' | 'confirming' | 'success' | 'error'

export default function ReceiptFlow() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [flowState, setFlowState] = useState<FlowState>('uploading')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [draft, setDraft] = useState<ReceiptDraft | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Form fields (pre-filled from OCR, editable by user)
  const [merchant, setMerchant] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')

  // Upload and run OCR as soon as the component mounts
  useEffect(() => {
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
      .then(result => {
        setDraft(result)
        // Pre-fill form with OCR results
        setMerchant(result.merchant || '')
        setAmount(result.amount != null ? String(result.amount) : '')
        setDate(result.date || new Date().toISOString().split('T')[0])
        setCategoryId(result.suggested_category_id || result.categories[0]?.id || '')
        setAccountId(result.accounts[0]?.id || '')
        setFlowState('reviewing')
        // Clean up sessionStorage
        sessionStorage.removeItem('pendingReceiptDataUrl')
        sessionStorage.removeItem('pendingReceiptName')
        sessionStorage.removeItem('pendingReceiptType')
      })
      .catch(err => {
        setErrorMessage(err.message || 'Failed to process image')
        setFlowState('error')
      })
  }, [navigate])

  async function handleConfirm() {
    if (!draft) return
    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) return

    setFlowState('confirming')

    try {
      await confirmReceipt({
        receipt_id: draft.receipt_id,
        merchant,
        amount: parsedAmount,
        date,
        category_id: categoryId,
        account_id: accountId,
      })
      setFlowState('success')
      // Invalidate both queries so Home refreshes list and chart automatically
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      setTimeout(() => navigate('/', { replace: true }), 2200)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save')
      setFlowState('error')
    }
  }

  // --- Render states ---

  if (flowState === 'success') {
    return <SuccessScreen />
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Back button */}
      <button
        onClick={() => navigate('/')}
        className="absolute top-12 left-4 z-10 p-2 rounded-xl text-white/80 hover:text-white transition-colors"
        aria-label="Go back"
      >
        <ChevronLeft size={24} />
      </button>

      {/* Receipt image — takes up top portion of screen */}
      <div className="relative w-full bg-surface" style={{ height: '45vh' }}>
        {imageUrl && (
          <img
            src={imageUrl}
            alt="Receipt"
            className="w-full h-full object-contain"
          />
        )}

        {/* Uploading overlay */}
        {flowState === 'uploading' && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-white text-sm">Reading receipt…</p>
            <p className="text-muted text-xs">This takes 30–60 seconds</p>
          </div>
        )}
      </div>

      {/* Form — slides up after OCR completes */}
      <AnimatePresence>
        {(flowState === 'reviewing' || flowState === 'confirming') && draft && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="flex-1 flex flex-col px-5 pt-5 pb-8 gap-4 overflow-y-auto"
          >
            {/* Category source hint */}
            {draft.category_source === 'history' && (
              <p className="text-xs text-success text-center">
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
                  onChange={e => setAmount(e.target.value)}
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

            <Field label="Category">
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className={inputClass}
              >
                {draft.categories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.emoji} {cat.name}
                  </option>
                ))}
              </select>
            </Field>

            {/* Only show account selector if there are multiple accounts */}
            {draft.accounts.length > 1 && (
              <Field label="Account">
                <select
                  value={accountId}
                  onChange={e => setAccountId(e.target.value)}
                  className={inputClass}
                >
                  {draft.accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {/* Confirm button */}
            <button
              onClick={handleConfirm}
              disabled={flowState === 'confirming' || !merchant || !amount || !categoryId || !accountId}
              className="
                mt-2 w-full py-4 rounded-2xl bg-accent hover:bg-accent-hover
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error state */}
      {flowState === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center px-5 gap-4">
          <p className="text-danger text-center">{errorMessage}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 rounded-xl border border-border text-white hover:bg-surface transition-colors"
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
      <label className="text-xs text-muted uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

const inputClass = `
  w-full px-4 py-3 rounded-xl bg-surface border border-border
  text-white text-base appearance-none
  focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent
  transition-colors
`

/**
 * Success screen — shown after a receipt is confirmed.
 * Framer Motion animates the checkmark ring and icon.
 * Auto-navigates home after 2.2 seconds (set in handleConfirm).
 */
function SuccessScreen() {
  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center gap-5">
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
          className="absolute inset-0 rounded-full bg-success"
        />
        {/* Checkmark circle */}
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
        <p className="text-white text-lg font-medium">Saved!</p>
        <p className="text-muted text-sm mt-1">Transaction added to Actual Budget</p>
      </motion.div>
    </div>
  )
}
