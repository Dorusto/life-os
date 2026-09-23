import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { testAbConnection, saveAbCredentials, type AbBudgetFile } from '../lib/api'
import { BrandMark } from '../components/BrandMark'

/**
 * AB setup wizard (#190) — the one-time technical connection to Actual Budget,
 * shown instead of Home/Chat when no AB credentials are configured yet
 * (App.tsx's routing checks GET /setup/status's `ab_connected` field).
 *
 * Not the "enter your account balances" onboarding (SetupBalancesCard, a chat
 * card) — this is the step before that, establishing the connection itself.
 *
 * Flow: Test connection (live-validates, lists available budgets if the exact
 * file isn't known) → pick/confirm the budget file → Save (re-validates,
 * encrypts, persists) → explicit success screen → redirect to Home.
 */
export default function AbSetupWizard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [baseUrl, setBaseUrl] = useState('')
  const [password, setPassword] = useState('')
  const [file, setFile] = useState('')
  const [files, setFiles] = useState<AbBudgetFile[] | null>(null)

  const [testing, setTesting] = useState(false)
  const [tested, setTested] = useState(false)
  const [testError, setTestError] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [connectedBudgetName, setConnectedBudgetName] = useState<string | null>(null)

  function resetValidation() {
    // Any field edit invalidates a previous successful test — never let a
    // stale "tested" state enable Save against different, unvalidated values.
    setTested(false)
    setTestError(null)
    setFiles(null)
  }

  async function handleTest(e: FormEvent) {
    e.preventDefault()
    setTesting(true)
    setTestError(null)
    setTested(false)
    try {
      const result = await testAbConnection(baseUrl.trim(), password, file.trim() || undefined)
      if (result.success) {
        setTested(true)
        setFiles(result.files)
        // Exactly one budget on the server and no file typed yet — pick it
        // automatically, one less thing for the user to do.
        if (!file && result.files.length === 1) {
          setFile(result.files[0].id)
        }
      } else {
        setTestError(result.error || 'Connection test failed.')
        setFiles(result.files.length > 0 ? result.files : null)
      }
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Connection test failed.')
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    if (!file) {
      setSaveError('Choose a budget file first.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const result = await saveAbCredentials(baseUrl.trim(), password, file)
      if (result.success) {
        await queryClient.invalidateQueries({ queryKey: ['setup-status', 'ab-connected-gate'] })
        setConnectedBudgetName(result.budget_name || file)
      } else {
        setSaveError(result.error || 'Could not save credentials.')
        // The server may have changed between Test and Save — force a fresh
        // test before allowing another Save attempt.
        setTested(false)
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save credentials.')
      setTested(false)
    } finally {
      setSaving(false)
    }
  }

  if (connectedBudgetName) {
    return (
      <div className="min-h-dvh bg-token-paper flex flex-col items-center justify-center px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-token-gain flex items-center justify-center mb-6">
          <span className="text-token-gain text-2xl">✓</span>
        </div>
        <h1 className="text-token-ink text-xl font-semibold tracking-tight">Connected to Actual Budget</h1>
        <p className="text-token-ink-3 text-sm mt-1.5">{connectedBudgetName}</p>
        <button
          onClick={() => navigate('/', { replace: true })}
          className="
            mt-8 px-6 py-3 rounded-xl bg-token-brand text-token-on-brand text-base font-medium
            hover:bg-token-brand-2 active:scale-[0.98] transition-all duration-150
          "
        >
          Continue to Home
        </button>
      </div>
    )
  }

  const inputClass = `
    w-full px-4 py-3 rounded-xl bg-token-surface border border-token-line
    text-token-ink placeholder-token-ink-2 text-base
    focus:outline-none focus:border-token-brand focus:ring-1 focus:ring-token-brand
    transition-colors
  `

  return (
    <div className="min-h-dvh bg-token-paper flex flex-col items-center justify-center px-6 py-10">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <BrandMark size={56} />
        <div>
          <h1 className="text-token-ink text-xl font-semibold tracking-tight">Connect Actual Budget</h1>
          <p className="text-token-ink-3 text-sm mt-0.5 max-w-xs">
            Majordom needs one connection to your Actual Budget server before it can do anything.
          </p>
        </div>
      </div>

      <form onSubmit={handleTest} className="w-full max-w-sm flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ab-url" className="text-sm text-token-ink-3">Server URL</label>
          <input
            id="ab-url"
            type="text"
            autoCapitalize="none"
            autoCorrect="off"
            value={baseUrl}
            onChange={e => { setBaseUrl(e.target.value); resetValidation() }}
            placeholder="http://actual-budget:5006"
            required
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="ab-password" className="text-sm text-token-ink-3">Server password</label>
          <input
            id="ab-password"
            type="password"
            autoComplete="off"
            value={password}
            onChange={e => { setPassword(e.target.value); resetValidation() }}
            placeholder="••••••••"
            required
            className={inputClass}
          />
          <p className="text-token-ink-2 text-xs">
            The Actual Budget server's own password (Settings → Advanced) — not a bank password.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="ab-file" className="text-sm text-token-ink-3">Budget file</label>
          {files && files.length > 0 ? (
            <select
              id="ab-file"
              value={file}
              onChange={e => { setFile(e.target.value); resetValidation() }}
              className={inputClass}
            >
              <option value="" disabled>Select a budget…</option>
              {files.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          ) : (
            <input
              id="ab-file"
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              value={file}
              onChange={e => { setFile(e.target.value); resetValidation() }}
              placeholder="Leave blank to list available budgets"
              className={inputClass}
            />
          )}
          <p className="text-token-ink-2 text-xs">
            Don't know the exact name? Leave it blank and press "Test connection" — Majordom will
            list the budgets available on that server.
          </p>
        </div>

        {testError && <p className="text-token-loss text-sm text-center">{testError}</p>}
        {tested && !testError && (
          <p className="text-token-gain text-sm text-center">Connection verified.</p>
        )}
        {saveError && <p className="text-token-loss text-sm text-center">{saveError}</p>}

        <button
          type="submit"
          disabled={testing || saving || !baseUrl || !password}
          className="
            mt-2 w-full py-3.5 rounded-xl bg-token-surface border border-token-line text-token-ink text-base font-medium
            hover:bg-token-surface-2 active:scale-[0.98]
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-all duration-150
          "
        >
          {testing ? 'Testing…' : 'Test connection'}
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={!tested || !file || saving}
          className="
            w-full py-3.5 rounded-xl bg-token-brand text-token-on-brand text-base font-medium
            hover:bg-token-brand-2 active:scale-[0.98]
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-all duration-150
          "
        >
          {saving ? 'Saving…' : 'Save & connect'}
        </button>
      </form>

      <p className="mt-10 text-token-ink-2 text-xs">
        Self-hosted · Zero cloud · 100% yours
      </p>
    </div>
  )
}
