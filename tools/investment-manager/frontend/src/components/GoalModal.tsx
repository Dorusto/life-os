import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createGoal } from '../lib/api'
import { Modal } from './Modal'
import { Button } from './kit/Button'
import { Field, TextInput } from './Form'
import { todayIso } from '../lib/format'

export function GoalModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    if (open) {
      setName('')
      setAmount('')
      setDate('')
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: () => createGoal({ name: name.trim(), target_amount: Number(amount), target_date: date }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] })
      onClose()
    },
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !amount || !date) return
    mutation.mutate()
  }

  const minDate = todayIso()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add goal"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="goal-form"
            variant="primary"
            disabled={mutation.isPending || !name.trim() || !amount || !date}
          >
            {mutation.isPending ? 'Saving…' : 'Add goal'}
          </Button>
        </>
      }
    >
      <form id="goal-form" onSubmit={onSubmit} className="space-y-4">
        <Field label="Name">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Retirement"
            autoFocus
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Target amount (EUR)">
            <TextInput
              type="number"
              step="any"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100000"
              required
            />
          </Field>
          <Field label="Target date">
            <TextInput
              type="date"
              min={minDate}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </Field>
        </div>

        {mutation.isError && (
          <p className="rounded border border-loss bg-loss-soft px-3 py-2 text-[13px] text-loss">
            {(mutation.error as Error).message}
          </p>
        )}
      </form>
    </Modal>
  )
}
