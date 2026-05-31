import { useState } from 'react'
import { Loader2, Check } from 'lucide-react'
import { confirmFuelReceipt, type ReceiptDraft, type FuelConfirmResponse } from '../lib/api'

interface FuelReceiptCardProps {
  draft: ReceiptDraft
  imageUrl: string
  onConfirmed: (stats: FuelConfirmResponse) => void
  onCancelled: () => void
  onSwitchToGrocery: () => void  // called when user clicks Grocery tab
}

export default function FuelReceiptCard({
  draft,
  imageUrl,
  onConfirmed,
  onCancelled,
  onSwitchToGrocery,
}: FuelReceiptCardProps) {
  const [vehicle, setVehicle] = useState(draft.suggested_vehicle_id ?? draft.vehicles[0]?.id ?? '')
  const [liters, setLiters] = useState(draft.liters?.toString() ?? '')
  const [pricePerL, setPricePerL] = useState(draft.price_per_liter?.toString() ?? '')
  const [total, setTotal] = useState(draft.amount?.toString() ?? '')
  const [odo, setOdo] = useState('')
  const [fullTank, setFullTank] = useState(true)
  const [missedFill, setMissedFill] = useState(false)
  const [station, setStation] = useState(draft.merchant ?? '')
  const [date, setDate] = useState(draft.date ?? new Date().toISOString().split('T')[0])
  const [accountId, setAccountId] = useState(draft.accounts[0]?.id ?? '')
  const [category, setCategory] = useState(draft.suggested_category_id ?? 'Car Costs')
  const [saving, setSaving] = useState(false)

  // ODO validation
  const selectedVehicle = draft.vehicles.find(v => v.id === vehicle)
  const odoNum = odo ? parseFloat(odo) : null
  const odoDiff = selectedVehicle?.last_odo != null && odoNum != null
    ? Math.abs(odoNum - selectedVehicle.last_odo)
    : null
  const odoWarning = odoDiff != null && odoDiff > 1500

  // Numeric values
  const litersNum = liters ? parseFloat(liters) : null
  const priceNum = pricePerL ? parseFloat(pricePerL) : null
  const totalNum = total ? parseFloat(total) : null

  // Auto-fill: any two fields → third is calculated
  function handleLitersChange(val: string) {
    setLiters(val)
    const l = parseFloat(val)
    if (!isNaN(l) && l > 0) {
      if (priceNum) setTotal((l * priceNum).toFixed(2))
      else if (totalNum) setPricePerL((totalNum / l).toFixed(3))
    }
  }
  function handlePriceChange(val: string) {
    setPricePerL(val)
    const p = parseFloat(val)
    if (!isNaN(p) && p > 0) {
      if (litersNum) setTotal((litersNum * p).toFixed(2))
      else if (totalNum) setLiters((totalNum / p).toFixed(2))
    }
  }
  function handleTotalChange(val: string) {
    setTotal(val)
    const t = parseFloat(val)
    if (!isNaN(t) && t > 0) {
      if (litersNum) setPricePerL((t / litersNum).toFixed(3))
      else if (priceNum) setLiters((t / priceNum).toFixed(2))
    }
  }

  async function handleConfirm() {
    if (!draft || !litersNum || !totalNum || !vehicle) return
    setSaving(true)
    try {
      const response = await confirmFuelReceipt({
        receipt_id: draft.receipt_id,
        account_id: accountId,
        category_name: category,
        date,
        station,
        total_eur: totalNum,
        vehicle_id: Number(vehicle),
        liters: litersNum,
        price_per_liter: priceNum ?? (litersNum && totalNum ? totalNum / litersNum : null),
        odo_km: odoNum,
        full_tank: fullTank,
        missed_fill: missedFill,
        fuel_grade: draft.fuel_grade,
        notes: null,
      })
      onConfirmed(response)
    } catch (err) {
      onConfirmed({
        success: false,
        duplicate: false,
        transaction_id: null,
        vehicle_log_id: null,
        km_since_last: null,
        consumption_l100km: null,
        cost_per_km: null,
        vehicle_name: null,
        liters: null,
        price_per_liter: null,
        fuel_grade: null,
      })
    } finally {
      setSaving(false)
    }
  }

  const inputCls = `
    w-full px-3 py-2 rounded-xl bg-background border border-border
    text-white text-sm appearance-none
    focus:outline-none focus:border-accent transition-colors
  `
  const labelCls = 'text-xs text-muted uppercase tracking-wide'

  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm max-w-[420px] w-full overflow-hidden">
      {/* Photo thumbnail */}
      <div className="relative w-full h-[112px] bg-black flex-shrink-0">
        <img
          src={imageUrl}
          alt="Fuel Receipt"
          className="w-full h-full object-cover opacity-80"
        />
      </div>

      {/* Tab header */}
      <div className="flex gap-2 px-4 pt-3 border-b border-border">
        <button className="tab-active text-sm pb-2 px-1 text-accent font-medium border-b-2 border-accent">
          ⛽ Fuel Receipt
        </button>
        <button
          onClick={onSwitchToGrocery}
          className="tab-inactive text-sm pb-2 px-1 text-muted hover:text-white transition-colors"
        >
          🛒 Grocery Receipt
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Vehicle selector */}
        {draft.vehicles.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Vehicle</label>
            <select
              value={vehicle}
              onChange={e => setVehicle(Number(e.target.value))}
              className={inputCls}
            >
              {draft.vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.name}{v.last_odo ? ` (${v.last_odo.toLocaleString()} km)` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Liters + Price/L + Total — any two filled auto-calculates the third */}
        <div className="flex gap-2">
          <div className="flex flex-col gap-1 flex-1">
            <label className={labelCls}>Liters</label>
            <input
              type="number"
              inputMode="decimal"
              value={liters}
              onChange={e => handleLitersChange(e.target.value)}
              className={inputCls}
              placeholder="0.00"
              step="0.01"
              min="0"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className={labelCls}>Price/L</label>
            <input
              type="number"
              inputMode="decimal"
              value={pricePerL}
              onChange={e => handlePriceChange(e.target.value)}
              className={inputCls}
              placeholder="0.000"
              step="0.001"
              min="0"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className={labelCls}>Total (€)</label>
            <input
              type="number"
              inputMode="decimal"
              value={total}
              onChange={e => handleTotalChange(e.target.value)}
              className={inputCls}
              placeholder="0.00"
              step="0.01"
              min="0"
            />
          </div>
        </div>

        {/* ODO */}
        <div className="flex flex-col gap-1">
          <label className={labelCls}>ODO (km)</label>
          <input
            type="number"
            inputMode="numeric"
            value={odo}
            onChange={e => setOdo(e.target.value)}
            className={inputCls}
            placeholder="49453"
          />
          {odoDiff != null && !odoWarning && (
            <span className="text-xs text-green-400">
              +{odoDiff.toLocaleString()} km ✓
            </span>
          )}
          {odoWarning && (
            <span className="text-xs text-yellow-400">
              ⚠️ ODO difference is {odoDiff!.toLocaleString()} km — check if correct
            </span>
          )}
        </div>

        {/* Full tank + Missed fill */}
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
            <input
              type="checkbox"
              checked={fullTank}
              onChange={e => setFullTank(e.target.checked)}
              className="rounded border-border bg-background text-accent focus:ring-accent"
            />
            Full tank
          </label>
          <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
            <input
              type="checkbox"
              checked={missedFill}
              onChange={e => setMissedFill(e.target.checked)}
              className="rounded border-border bg-background text-accent focus:ring-accent"
            />
            Missed fill
          </label>
        </div>

        {/* Station */}
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Station</label>
          <input
            type="text"
            value={station}
            onChange={e => setStation(e.target.value)}
            className={inputCls}
            placeholder="Shell Alphen aan den Rijn"
          />
        </div>

        {/* Date + Account row */}
        <div className="flex gap-2">
          <div className="flex flex-col gap-1 flex-1">
            <label className={labelCls}>Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className={labelCls}>Account</label>
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
        </div>

        {/* Category */}
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Category</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className={inputCls}
          >
            {draft.categories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.emoji} {cat.name}
              </option>
            ))}
          </select>
        </div>

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
            disabled={saving || !liters || !total || !vehicle}
            className="flex-1 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            {saving ? (
              <><Loader2 size={14} className="animate-spin" /> Saving…</>
            ) : (
              <><Check size={14} /> Confirm & Save</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
