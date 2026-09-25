import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createTransaction, type Security, type TransactionType } from '../lib/api'
import { Modal } from './Modal'
import { Button } from './kit/Button'
import { Field, Select, TextInput, Textarea } from './Form'
import { todayIso } from '../lib/format'

const TYPES: TransactionType[] = ['buy', 'sell', 'dividend', 'fee']

interface TransactionModalProps {
  open: boolean
  onClose: () => void
  securities: Security[]
}

export function TransactionModal({ open, onClose, securities }: TransactionModalProps) {
  const queryClient = useQueryClient()
  const [securityId, setSecurityId] = useState('')
  const [date, setDate] = useState(todayIso())
  const [type, setType] = useState<TransactionType>('buy')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [fees, setFees] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')

  const reset = () => {
    setSecurityId('')
    setDate(todayIso())
    setType('buy')
    setQuantity('')
    setPrice('')
    setFees('')
    setAmount('')
    setNotes('')
  }

  useEffect(() => {
    if (open) {
      reset()
      if (securities.length && !securityId) setSecurityId(String(securities[0].id))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const mutation = useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries()
      onClose()
    },
  })

  const isTrade = type === 'buy' || type === 'sell'
  const isCash = type === 'dividend' || type === 'fee'

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!securityId) return
    const selected = securities.find((s) => String(s.id) === securityId)
    mutation.mutate({
      security_id: Number(securityId),
      date,
      type,
      quantity: isTrade && quantity ? Number(quantity) : null,
      price_per_unit: isTrade && price ? Number(price) : null,
      fees: isTrade && fees ? Number(fees) : 0,
      currency: selected?.currency ?? null,
      notes: notes.trim() || null,
      cash_amount: isCash && amount ? (type === 'fee' ? -Math.abs(Number(amount)) : Number(amount)) : null,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add transaction"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="transaction-form" variant="primary" disabled={mutation.isPending || !securityId}>
            {mutation.isPending ? 'Saving…' : 'Add transaction'}
          </Button>
        </>
      }
    >
      {securities.length === 0 ? (
        <p className="text-sm text-ink-2">
          Add a security first — you can do that from the button above the table.
        </p>
      ) : (
        <form id="transaction-form" onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Security" className="col-span-2">
              <Select value={securityId} onChange={(e) => setSecurityId(e.target.value)} required>
                <option value="" disabled>
                  Select a security
                </option>
                {securities.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.ticker} — {s.name ?? s.currency}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type">
              <Select value={type} onChange={(e) => setType(e.target.value as TransactionType)}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date">
              <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>

            {isTrade && (
              <>
                <Field label="Quantity">
                  <TextInput
                    type="number"
                    step="any"
                    min="0"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Price per unit">
                  <TextInput
                    type="number"
                    step="any"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Fees">
                  <TextInput
                    type="number"
                    step="any"
                    min="0"
                    value={fees}
                    onChange={(e) => setFees(e.target.value)}
                    placeholder="0"
                  />
                </Field>
              </>
            )}

            {isCash && (
              <Field
                label={type === 'dividend' ? 'Dividend received' : 'Fee charged'}
                className="col-span-2"
                hint="In the security's own currency."
              >
                <TextInput
                  type="number"
                  step="any"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </Field>
            )}

            <Field label="Notes" className="col-span-2">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </Field>
          </div>

          {mutation.isError && (
            <p className="rounded border border-loss bg-loss-soft px-3 py-2 text-[13px] text-loss">
              {(mutation.error as Error).message}
            </p>
          )}
        </form>
      )}
    </Modal>
  )
}
