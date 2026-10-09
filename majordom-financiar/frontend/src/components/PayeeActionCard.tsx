import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  confirmPayeeAction, rejectPayeeAction, getPayees, getCategories,
  type PayeeActionData,
} from '../lib/api'
import ActionCardButtons from './ActionCardButtons'
import { Card, SectionLabel } from './kit/Card'

interface Props {
  data: PayeeActionData
  onConfirmed: (message: string) => void
  onCancelled: () => void
  className?: string
}

const LABELS: Record<PayeeActionData['action'], string> = {
  rename: 'Rename payee',
  merge: 'Merge payee',
  default_category: 'Default category',
}

const SELECT_CLASS =
  'w-full bg-token-surface-2 border border-token-line rounded-lg px-3 py-2 text-token-ink text-sm focus:outline-none focus:border-token-brand disabled:opacity-50 appearance-none'

export default function PayeeActionCard({
  data, onConfirmed, onCancelled, className = 'max-w-[85%] rounded-bl-sm',
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState(data.new_name || data.payee_name)
  const [targetId, setTargetId] = useState(data.target_payee_id || '')
  const [categoryId, setCategoryId] = useState(data.category_id || '')

  const { data: payees } = useQuery({
    queryKey: ['payees'],
    queryFn: () => getPayees(),
    staleTime: 120_000,
    enabled: data.action === 'merge',
  })
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => getCategories(),
    staleTime: 120_000,
    enabled: data.action === 'default_category',
  })

  // Transfer payees (one per account) can't be a merge target, and a payee
  // can't merge into itself.
  const mergeTargets = (payees ?? [])
    .filter(p => !p.transfer_account && p.id !== data.payee_id)
    .sort((a, b) => a.name.localeCompare(b.name))

  const categoryGroups = (() => {
    const groups = new Map<string, { id: string; name: string }[]>()
    for (const c of categories ?? []) {
      const key = c.group_name || 'Other'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push({ id: c.id, name: c.name })
    }
    return Array.from(groups.entries())
  })()

  const confirmDisabled =
    data.action === 'rename'
      ? !newName.trim() || newName.trim() === data.payee_name
      : data.action === 'merge'
        ? !targetId
        : !categoryId

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      const overrides =
        data.action === 'rename'
          ? { new_name: newName.trim() }
          : data.action === 'merge'
            ? { target_payee_id: targetId }
            : { category_id: categoryId }
      const result = await confirmPayeeAction(data.id, overrides)
      onConfirmed(result.message)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(`Could not update payee (${msg}). Try again.`)
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    setLoading(true)
    try {
      await rejectPayeeAction(data.id)
    } catch (err) {
      console.warn('Failed to reject payee action proposal', err)
    }
    onCancelled()
  }

  return (
    <Card label={LABELS[data.action]} className={className}>
      <div className="space-y-3">
        <p className="text-token-ink-3 text-sm">
          <span className="text-token-ink">{data.payee_name}</span> · {data.transaction_count}{' '}
          transaction{data.transaction_count !== 1 ? 's' : ''}
        </p>

        {data.action === 'rename' && (
          <div className="space-y-1">
            <SectionLabel>New name</SectionLabel>
            <input
              name="new_name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              disabled={loading}
              className="w-full bg-token-surface-2 border border-token-line rounded-lg px-3 py-2 text-token-ink text-sm focus:outline-none focus:border-token-brand disabled:opacity-50"
            />
          </div>
        )}

        {data.action === 'merge' && (
          <div className="space-y-1">
            <SectionLabel>Merge into</SectionLabel>
            <select
              value={targetId}
              onChange={e => setTargetId(e.target.value)}
              disabled={loading}
              className={SELECT_CLASS}
            >
              <option value="" style={{ background: 'var(--surface)' }}>Choose a payee…</option>
              {mergeTargets.map(p => (
                <option key={p.id} value={p.id} style={{ background: 'var(--surface)' }}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="text-token-ink-3 text-xs">
              All {data.transaction_count} transactions of {data.payee_name} move to the chosen
              payee; {data.payee_name} is removed.
            </p>
          </div>
        )}

        {data.action === 'default_category' && (
          <div className="space-y-1">
            <SectionLabel>Category</SectionLabel>
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              disabled={loading}
              className={SELECT_CLASS}
            >
              <option value="" style={{ background: 'var(--surface)' }}>Choose a category…</option>
              {categoryGroups.map(([group, cats]) => (
                <optgroup key={group} label={group}>
                  {cats.map(c => (
                    <option key={c.id} value={c.id} style={{ background: 'var(--surface)' }}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {data.current_category_name && (
              <p className="text-token-ink-3 text-xs">Currently: {data.current_category_name}</p>
            )}
            <p className="text-token-ink-3 text-xs">Applies to new transactions from this payee.</p>
          </div>
        )}

        {error && <p className="text-token-loss text-xs">{error}</p>}

        <ActionCardButtons
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          loading={loading}
          confirmDisabled={confirmDisabled}
        />
      </div>
    </Card>
  )
}
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  confirmPayeeAction, rejectPayeeAction, getPayees, getCategories,
  type PayeeActionData,
} from '../lib/api'
import ActionCardButtons from './ActionCardButtons'
import { Card, SectionLabel } from './kit/Card'

interface Props {
  data: PayeeActionData
  onConfirmed: (message: string) => void
  onCancelled: () => void
  className?: string
}

const LABELS: Record<PayeeActionData['action'], string> = {
  rename: 'Rename payee',
  merge: 'Merge payee',
  default_category: 'Default category',
}

const SELECT_CLASS =
  'w-full bg-token-surface-2 border border-token-line rounded-lg px-3 py-2 text-token-ink text-sm focus:outline-none focus:border-token-brand disabled:opacity-50 appearance-none'

export default function PayeeActionCard({
  data, onConfirmed, onCancelled, className = 'max-w-[85%] rounded-bl-sm',
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState(data.new_name || data.payee_name)
  const [targetId, setTargetId] = useState(data.target_payee_id || '')
  const [categoryId, setCategoryId] = useState(data.category_id || '')

  const { data: payees } = useQuery({
    queryKey: ['payees'],
    queryFn: () => getPayees(),
    staleTime: 120_000,
    enabled: data.action === 'merge',
  })
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => getCategories(),
    staleTime: 120_000,
    enabled: data.action === 'default_category',
  })

  // Transfer payees (one per account) can't be a merge target, and a payee
  // can't merge into itself.
  const mergeTargets = (payees ?? [])
    .filter(p => !p.transfer_account && p.id !== data.payee_id)
    .sort((a, b) => a.name.localeCompare(b.name))

  const categoryGroups = (() => {
    const groups = new Map<string, { id: string; name: string }[]>()
    for (const c of categories ?? []) {
      const key = c.group_name || 'Other'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push({ id: c.id, name: c.name })
    }
    return Array.from(groups.entries())
  })()

  const confirmDisabled =
    data.action === 'rename'
      ? !newName.trim() || newName.trim() === data.payee_name
      : data.action === 'merge'
        ? !targetId
        : !categoryId

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      const overrides =
        data.action === 'rename'
          ? { new_name: newName.trim() }
          : data.action === 'merge'
            ? { target_payee_id: targetId }
            : { category_id: categoryId }
      const result = await confirmPayeeAction(data.id, overrides)
      onConfirmed(result.message)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(`Could not update payee (${msg}). Try again.`)
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    setLoading(true)
    try {
      await rejectPayeeAction(data.id)
    } catch (err) {
      console.warn('Failed to reject payee action proposal', err)
    }
    onCancelled()
  }

  return (
    <Card label={LABELS[data.action]} className={className}>
      <div className="space-y-3">
        <p className="text-token-ink-3 text-sm">
          <span className="text-token-ink">{data.payee_name}</span> · {data.transaction_count}{' '}
          transaction{data.transaction_count !== 1 ? 's' : ''}
        </p>

        {data.action === 'rename' && (
          <div className="space-y-1">
            <SectionLabel>New name</SectionLabel>
            <input
              name="new_name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              disabled={loading}
              className="w-full bg-token-surface-2 border border-token-line rounded-lg px-3 py-2 text-token-ink text-sm focus:outline-none focus:border-token-brand disabled:opacity-50"
            />
          </div>
        )}

        {data.action === 'merge' && (
          <div className="space-y-1">
            <SectionLabel>Merge into</SectionLabel>
            <select
              value={targetId}
              onChange={e => setTargetId(e.target.value)}
              disabled={loading}
              className={SELECT_CLASS}
            >
              <option value="" style={{ background: 'var(--surface)' }}>Choose a payee…</option>
              {mergeTargets.map(p => (
                <option key={p.id} value={p.id} style={{ background: 'var(--surface)' }}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="text-token-ink-3 text-xs">
              All {data.transaction_count} transactions of {data.payee_name} move to the chosen
              payee; {data.payee_name} is removed.
            </p>
          </div>
        )}

        {data.action === 'default_category' && (
          <div className="space-y-1">
            <SectionLabel>Category</SectionLabel>
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              disabled={loading}
              className={SELECT_CLASS}
            >
              <option value="" style={{ background: 'var(--surface)' }}>Choose a category…</option>
              {categoryGroups.map(([group, cats]) => (
                <optgroup key={group} label={group}>
                  {cats.map(c => (
                    <option key={c.id} value={c.id} style={{ background: 'var(--surface)' }}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {data.current_category_name && (
              <p className="text-token-ink-3 text-xs">Currently: {data.current_category_name}</p>
            )}
            <p className="text-token-ink-3 text-xs">Applies to new transactions from this payee.</p>
          </div>
        )}

        {error && <p className="text-token-loss text-xs">{error}</p>}

        <ActionCardButtons
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          loading={loading}
          confirmDisabled={confirmDisabled}
        />
      </div>
    </Card>
  )
}
