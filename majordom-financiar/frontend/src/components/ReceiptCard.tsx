import { useState, useEffect } from 'react'
import { Loader2, Check, AlertCircle } from 'lucide-react'
import { confirmReceipt, type ReceiptDraft } from '../lib/api'

interface ReceiptCardProps {
  imageUrl: string
  status: 'loading' | 'reviewing' | 'error'
  draft?: ReceiptDraft
  error?: string
  onConfirmed: (message: string) => void
  onCancelled: () => void
  onSwitchToFuel?: () => void  // NEW: show fuel tab header when receipt_type was fuel
}

export default function ReceiptCard({
  imageUrl,
  status,
  draft,
  error,
  onConfirmed,
  onCancelled,
  onSwitchToFuel,
}: ReceiptCardProps) {
  const [merchant, setMerchant] = useState(draft?.merchant ?? '')
  const [amount, setAmount] = useState(draft?.amount != null ? String(draft.amount) : '')
  const [date, setDate] = useState(draft?.date ?? new Date().toISOString().split('T')[0])
  const [categoryId, setCategoryId] = useState(
    draft?.suggested_category_id ?? draft?.categories[0]?.id ?? ''
  )
  const [accountId, setAccountId] = useState(draft?.accounts[0]?.id ?? '')
  const [saving, setSaving] = useState(false)

  // Sync form state when draft arrives (loading → reviewing transition)
  useEffect(() => {
    if (!draft) return
    setMerchant(draft.merchant ?? '')
    setAmount(draft.amount != null ? String(draft.amount) : '')
    setDate(draft.date ?? new Date().toISOString().split('T')[0])
    setCategoryId(draft.suggested_category_id ?? draft.categories[0]?.id ?? '')
    setAccountId(draft.accounts[0]?.id ?? '')
  }, [draft])

  async function handleConfirm() {
    if (!draft) return
    const parsed = parseFloat(amount)
    if (isNaN(parsed) || parsed <= 0) return
    setSaving(true)
    try {
      await confirmReceipt({
        receipt_id: draft.receipt_id,
        merchant,
        amount: parsed,
        date,
        category_id: categoryId,
        account_id: accountId,
      })
      onConfirmed(`Receipt saved — ${merchant} €${parsed.toFixed(2)}`)
    } catch (err) {
      onConfirmed(`Failed to save receipt: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = `
    w-full px-3 py-2 rounded-xl bg-background border border-border
    text-white text-sm appearance-none
    focus:outline-none focus:border-accent transition-colors
  `

  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm max-w-[420px] w-full overflow-hidden">
      {/* Photo thumbnail with loading overlay */}
      <div className="relative w-full h-[112px] bg-black flex-shrink-0">
        <img
          src={imageUrl}
          alt="Receipt"
          className="w-full h-full object-cover opacity-80"
        />
        {status === 'loading' && (
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
            <Loader2 size={20} className="animate-spin text-accent" />
            <p className="text-white text-xs">Reading receipt…</p>
          </div>
        )}
      </div>

      {status === 'error' && (
        <div className="px-4 py-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-400 text-sm">{error || 'Failed to read receipt'}</p>
          </div>
          <button
            onClick={onCancelled}
            className="text-sm text-muted hover:text-white transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {status === 'reviewing' && draft && (
        <div className="px-4 py-3 space-y-3">
          {/* Fuel/Grocery tab header — shown when receipt_type was fuel */}
          {onSwitchToFuel && (
            <div className="flex gap-2 mb-2 border-b border-border">
              <button
                onClick={onSwitchToFuel}
                className="tab-inactive text-sm pb-2 px-1 text-muted hover:text-white transition-colors"
              >
                ⛽ Fuel Receipt
              </button>
              <button className="tab-active text-sm pb-2 px-1 text-accent font-medium border-b-2 border-accent">
                🛒 Grocery Receipt
              </button>
            </div>
          )}

          {draft.category_source === 'history' && (
            <p className="text-xs text-green-400">✓ Category from your history</p>
          )}

          {/* Merchant */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted uppercase tracking-wide">Merchant</label>
            <input
              type="text"
              value={merchant}
              onChange={e => setMerchant(e.target.value)}
              className={inputCls}
              placeholder="Albert Heijn"
            />
          </div>

          {/* Amount + Date row */}
          <div className="flex gap-2">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-muted uppercase tracking-wide">Amount (EUR)</label>
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className={inputCls}
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-muted uppercase tracking-wide">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted uppercase tracking-wide">Category</label>
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              className={inputCls}
            >
              {draft.categories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.emoji} {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Account — only if multiple */}
          {draft.accounts.length > 1 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted uppercase tracking-wide">Account</label>
              <select
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                className={inputCls}
              >
                {draft.accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onCancelled}
              disabled={saving}
              className="flex-1 py-2 rounded-xl border border-border text-muted hover:text-white hover:bg-surface-hover text-sm transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving || !merchant || !amount || !categoryId || !accountId}
              className="flex-1 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {saving ? (
                <><Loader2 size={14} className="animate-spin" /> Saving…</>
              ) : (
                <><Check size={14} /> Confirm</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
