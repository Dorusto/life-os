import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Save, X } from 'lucide-react'
import { getRebalancing, getSecurities, getTargetAllocation, setTargetAllocation } from '../lib/api'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { ErrorState, Loading } from '../components/Feedback'
import { MetricTile } from '../components/MetricTile'
import { PageHeader } from '../components/PageHeader'
import { TextInput } from '../components/Form'
import { formatEur, formatPercentPoints } from '../lib/format'
import { cn } from '../lib/ui'

interface TargetDraft {
  target_key: string
  target_percentage: string
}

export default function Rebalancing() {
  const queryClient = useQueryClient()
  const targetsQuery = useQuery({ queryKey: ['target-allocation'], queryFn: getTargetAllocation })
  const rebalancing = useQuery({ queryKey: ['rebalancing'], queryFn: getRebalancing })
  const securities = useQuery({ queryKey: ['securities'], queryFn: getSecurities })

  const [drafts, setDrafts] = useState<TargetDraft[]>([])
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!dirty && targetsQuery.data) {
      setDrafts(
        targetsQuery.data.map((t) => ({
          target_key: t.target_key,
          target_percentage: String(t.target_percentage),
        })),
      )
    }
  }, [targetsQuery.data, dirty])

  const save = useMutation({
    mutationFn: () =>
      setTargetAllocation(
        drafts
          .filter((d) => d.target_key.trim())
          .map((d) => ({
            target_key: d.target_key.trim(),
            target_percentage: Number(d.target_percentage) || 0,
          })),
      ),
    onSuccess: () => {
      setDirty(false)
      queryClient.invalidateQueries({ queryKey: ['target-allocation'] })
      queryClient.invalidateQueries({ queryKey: ['rebalancing'] })
    },
  })

  const sum = useMemo(
    () => drafts.reduce((total, d) => total + (Number(d.target_percentage) || 0), 0),
    [drafts],
  )
  const sumOk = Math.abs(sum - 100) < 0.01

  const update = (index: number, patch: Partial<TargetDraft>) => {
    setDirty(true)
    setDrafts((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const removeRow = (index: number) => {
    setDirty(true)
    setDrafts((rows) => rows.filter((_, i) => i !== index))
  }

  const addRow = () => {
    setDirty(true)
    setDrafts((rows) => [...rows, { target_key: '', target_percentage: '' }])
  }

  const suggestions = useMemo(() => {
    const set = new Set<string>()
    ;(securities.data ?? []).forEach((s) => set.add(s.ticker))
    ;(rebalancing.data?.rows ?? []).forEach((r) => set.add(r.key))
    return [...set]
  }, [securities.data, rebalancing.data])

  if (rebalancing.isLoading || targetsQuery.isLoading) return <Loading label="Loading rebalancing" />
  if (rebalancing.isError) {
    return <ErrorState message="Could not load allocation targets." onRetry={() => rebalancing.refetch()} />
  }

  const rows = rebalancing.data?.rows ?? []
  const total = rebalancing.data?.total_value_eur ?? 0

  return (
    <>
      <PageHeader
        title="Rebalancing"
        description="Compare target weights against current allocation and see the trade that closes each gap."
        actions={
          <>
            <Button variant="secondary" onClick={addRow}>
              <Plus className="h-4 w-4" /> Add target
            </Button>
            <Button
              variant="primary"
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending}
            >
              <Save className="h-4 w-4" /> {save.isPending ? 'Saving…' : 'Save targets'}
            </Button>
          </>
        }
      />

      <Card className="mb-6">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <MetricTile label="Portfolio value" value={formatEur(total)} />
          <MetricTile
            label="Targets total"
            value={
              <span className={sumOk ? 'text-gain' : 'text-warn'}>{formatPercentPoints(sum)}</span>
            }
            hint={sumOk ? 'Balanced' : 'Should sum to 100%'}
          />
          <MetricTile label="Tracked targets" value={String(drafts.filter((d) => d.target_key.trim()).length)} />
          <MetricTile label="Drifted positions" value={String(rows.filter((r) => Math.abs(r.suggested_eur) > 1).length)} />
        </div>
      </Card>

      <Card padded={false} title="Target weights">
        {drafts.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No targets set"
              description="Add a ticker or asset type and a target percentage to start."
              action={
                <Button variant="primary" onClick={addRow}>
                  Add target
                </Button>
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-line">
            {drafts.map((draft, index) => (
              <div key={index} className="flex items-center gap-3 px-5 py-3">
                <TextInput
                  list="target-keys"
                  aria-label="Target key"
                  placeholder="Ticker or asset type"
                  value={draft.target_key}
                  onChange={(e) => update(index, { target_key: e.target.value })}
                  className="flex-1"
                />
                <div className="relative w-28">
                  <TextInput
                    type="number"
                    step="any"
                    min="0"
                    max="100"
                    aria-label="Target percentage"
                    value={draft.target_percentage}
                    onChange={(e) => update(index, { target_percentage: e.target.value })}
                    className="pr-7 text-right"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3">%</span>
                </div>
                <button
                  type="button"
                  aria-label="Remove target"
                  onClick={() => removeRow(index)}
                  className="rounded p-1.5 text-ink-3 transition-colors hover:bg-loss-soft hover:text-loss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <datalist id="target-keys">
              {suggestions.map((key) => (
                <option key={key} value={key} />
              ))}
            </datalist>
          </div>
        )}
        {save.isError && (
          <p className="border-t border-line px-5 py-3 text-[13px] text-loss">
            {(save.error as Error).message}
          </p>
        )}
      </Card>

      <Card padded={false} title="Drift and suggested trades" className="mt-6">
        {rows.length === 0 ? (
          <div className="p-5">
            <p className="text-sm text-ink-3">Set targets above to see suggestions.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-ink-3">
                  <th className="px-5 py-3 font-medium">Target</th>
                  <th className="px-3 py-3 text-right font-medium">Target %</th>
                  <th className="px-3 py-3 text-right font-medium">Current %</th>
                  <th className="px-3 py-3 text-right font-medium">Current value</th>
                  <th className="px-3 py-3 text-right font-medium">Target value</th>
                  <th className="px-5 py-3 text-right font-medium">Suggested trade</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const buy = row.suggested_eur > 0
                  const sell = row.suggested_eur < 0
                  return (
                    <tr key={row.key} className="border-b border-line last:border-0 hover:bg-surface-2">
                      <td className="px-5 py-3 font-mono text-[13px] font-medium text-ink">{row.key}</td>
                      <td className="px-3 py-3 text-right font-mono tnum text-ink-2">
                        {formatPercentPoints(row.target_percentage)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tnum text-ink-2">
                        {formatPercentPoints(row.current_percentage)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tnum text-ink-2">
                        {formatEur(row.current_value_eur)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tnum text-ink-2">
                        {formatEur(row.target_value_eur)}
                      </td>
                      <td
                        className={cn(
                          'px-5 py-3 text-right font-mono tnum font-medium',
                          buy ? 'text-brand' : sell ? 'text-warn' : 'text-ink-3',
                        )}
                      >
                        {Math.abs(row.suggested_eur) < 1
                          ? 'On target'
                          : `${buy ? 'Buy ' : 'Sell '}${formatEur(Math.abs(row.suggested_eur))}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="px-5 py-3 text-[12px] text-ink-3">
          Suggested amount is <span className="font-mono">(target % − current %) × portfolio value</span>. A target
          key is matched to a held ticker first, then to an asset type.
        </p>
      </Card>
    </>
  )
}
