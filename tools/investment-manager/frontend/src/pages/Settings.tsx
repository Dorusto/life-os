import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, CircleAlert, Save } from 'lucide-react'
import { getSettings, updateSettings } from '../lib/api'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { ErrorState, Loading } from '../components/Feedback'
import { Field, TextInput } from '../components/Form'
import { PageHeader } from '../components/PageHeader'

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const settings = useQuery({ queryKey: ['settings'], queryFn: getSettings })

  const [benchmark, setBenchmark] = useState('')
  const [assumedPct, setAssumedPct] = useState('')
  const [saved, setSaved] = useState(false)
  // The API key is write-only: the backend never returns it, so this starts
  // (and is reset to) empty and is only ever sent, never read back.
  const [apiKey, setApiKey] = useState('')
  const [keySaved, setKeySaved] = useState(false)

  useEffect(() => {
    if (settings.data) {
      setBenchmark(settings.data.benchmark_ticker)
      setAssumedPct(String(Number((Number(settings.data.assumed_annual_return) * 100).toFixed(4))))
    }
  }, [settings.data])

  const save = useMutation({
    mutationFn: () =>
      updateSettings({
        benchmark_ticker: benchmark.trim(),
        assumed_annual_return: assumedPct === '' ? undefined : Number(assumedPct) / 100,
      }),
    onSuccess: () => {
      setSaved(true)
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['summary'] })
      window.setTimeout(() => setSaved(false), 2500)
    },
  })

  const saveKey = useMutation({
    mutationFn: () => updateSettings({ twelve_data_api_key: apiKey.trim() }),
    onSuccess: () => {
      setApiKey('') // never keep the key in component state longer than needed
      setKeySaved(true)
      // Refresh so the Configured / Not configured indicator reflects the save.
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['summary'] })
      window.setTimeout(() => setKeySaved(false), 2500)
    },
  })

  if (settings.isLoading) return <Loading label="Loading settings" />
  if (settings.isError) return <ErrorState message="Could not load settings." onRetry={() => settings.refetch()} />

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate()
  }

  const configured = settings.data?.market_data_configured ?? false

  return (
    <>
      <PageHeader title="Settings" description="The small set of preferences this app keeps." />

      <form onSubmit={onSubmit} className="space-y-6">
        <Card title="Performance">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Benchmark ticker"
              hint="A broad index or ETF used for the apples-to-apples comparison, e.g. VWCE.DE or SPY."
            >
              <TextInput value={benchmark} onChange={(e) => setBenchmark(e.target.value)} placeholder="VWCE.DE" />
            </Field>
            <Field
              label="Assumed annual return (%)"
              hint="Used for goal projections only when there isn't enough history for a reliable XIRR."
            >
              <TextInput
                type="number"
                step="any"
                value={assumedPct}
                onChange={(e) => setAssumedPct(e.target.value)}
                placeholder="7"
              />
            </Field>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={save.isPending}>
              <Save className="h-4 w-4" /> {save.isPending ? 'Saving…' : 'Save settings'}
            </Button>
            {saved && <span className="text-[13px] text-gain">Saved</span>}
            {save.isError && <span className="text-[13px] text-loss">{(save.error as Error).message}</span>}
          </div>
        </Card>

        <Card title="Market data">
          <Field
            label="Twelve Data API key"
            hint="Write-only: saving a new key replaces the stored one, and the value is never shown again."
          >
            <TextInput
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your Twelve Data API key"
            />
          </Field>
          <div className="mt-4 flex items-center gap-3">
            <Button
              type="button"
              variant="primary"
              disabled={saveKey.isPending || apiKey.trim() === ''}
              onClick={() => saveKey.mutate()}
            >
              <Save className="h-4 w-4" /> {saveKey.isPending ? 'Saving…' : 'Save API key'}
            </Button>
            {keySaved && <span className="text-[13px] text-gain">Saved</span>}
            {saveKey.isError && (
              <span className="text-[13px] text-loss">{(saveKey.error as Error).message}</span>
            )}
          </div>

          <div className="mt-5 flex items-start gap-3 border-t border-line pt-5">
            {configured ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-gain" aria-hidden />
            ) : (
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden />
            )}
            <div className="text-sm">
              <p className="font-medium text-ink">
                {configured ? 'Twelve Data is configured' : 'Twelve Data is not configured'}
              </p>
              <p className="mt-1 text-ink-2">
                {configured
                  ? 'Prices and FX rates refresh at most once a day per symbol; stale cached values are served if the API is unavailable.'
                  : 'Set TWELVE_DATA_API_KEY in the service environment. Prices and FX rates cannot be fetched until then, and totals that depend on them will be blank.'}
              </p>
              <p className="mt-2 text-[12px] text-ink-3">
                The API key is a server-side environment variable and is never shown or editable here.
              </p>
            </div>
          </div>
        </Card>
      </form>
    </>
  )
}
