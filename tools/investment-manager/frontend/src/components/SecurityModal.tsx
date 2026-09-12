import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createSecurity, type AssetType } from '../lib/api'
import { Modal } from './Modal'
import { Button } from './Button'
import { Field, Select, TextInput } from './Form'

const ASSET_TYPES: AssetType[] = ['stock', 'etf', 'crypto', 'bond', 'fund', 'other']

export function SecurityModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [ticker, setTicker] = useState('')
  const [name, setName] = useState('')
  const [assetType, setAssetType] = useState<AssetType>('stock')
  const [currency, setCurrency] = useState('')

  useEffect(() => {
    if (open) {
      setTicker('')
      setName('')
      setAssetType('stock')
      setCurrency('')
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: createSecurity,
    onSuccess: () => {
      queryClient.invalidateQueries()
      onClose()
    },
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    mutation.mutate({
      ticker: ticker.trim(),
      name: name.trim() || null,
      asset_type: assetType,
      currency: currency.trim().toUpperCase() || null,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add security"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="security-form" variant="primary" disabled={mutation.isPending || !ticker.trim()}>
            {mutation.isPending ? 'Saving…' : 'Add security'}
          </Button>
        </>
      }
    >
      <form id="security-form" onSubmit={onSubmit} className="space-y-4">
        <Field
          label="Ticker"
          hint="Twelve Data symbol, e.g. VWCE.DE or AAPL. Name and currency are filled in automatically when left blank."
        >
          <TextInput
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="VWCE.DE"
            autoFocus
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
          </Field>
          <Field label="Currency">
            <TextInput
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              placeholder="e.g. EUR"
              maxLength={8}
            />
          </Field>
        </div>
        <Field label="Asset type">
          <Select value={assetType} onChange={(e) => setAssetType(e.target.value as AssetType)}>
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </Select>
        </Field>

        {mutation.isError && (
          <p className="rounded border border-loss bg-loss-soft px-3 py-2 text-[13px] text-loss">
            {(mutation.error as Error).message}
          </p>
        )}
      </form>
    </Modal>
  )
}
