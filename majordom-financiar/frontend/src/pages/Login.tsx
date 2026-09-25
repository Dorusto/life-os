import { useState, FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { login } from '../lib/api'
import { saveAuth } from '../lib/auth'
import { BrandMark } from '../components/BrandMark'
import { Button } from '../components/kit/Button'

/**
 * Only ever follow an in-app path as the post-login destination — a `next`
 * value arriving in the URL must not become an open redirect.
 */
function safeNext(next: string | null): string | null {
  if (!next) return null
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null
  return next
}

/**
 * Login page.
 *
 * Design goal: as minimal as possible. This is a private household tool —
 * no marketing copy, no "forgot password", no sign-up link. Just a form.
 * The M logo and the tagline give it personality without clutter.
 */
export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await login(username, password)
      saveAuth(res.access_token, res.username)
      // Return to the route the guard bounced us off (#12) — e.g. a cross-app
      // /majordom?prefill=… deep link — instead of always the Dashboard.
      const next = safeNext(new URLSearchParams(location.search).get('next'))
      navigate(next ?? '/', { replace: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed'
      setError(
        message === 'Invalid credentials'
          ? 'Incorrect password. Please try again.'
          : message
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-token-paper flex flex-col items-center justify-center px-6">
      {/* Logo */}
      <div className="mb-10 flex flex-col items-center gap-3">
        <BrandMark size={56} />
        <div className="text-center">
          <h1 className="text-token-ink text-xl font-semibold tracking-tight">Majordom</h1>
          <p className="text-token-ink-3 text-sm mt-0.5">Your personal finance assistant</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="username" className="text-sm text-token-ink-3">Username</label>
          <input
            id="username"
            type="text"
            autoCapitalize="none"
            autoComplete="username"
            autoCorrect="off"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="username"
            required
            className="
              w-full px-4 py-3 rounded-xl bg-token-surface border border-token-line
              text-token-ink placeholder-muted-2 text-base
              focus:outline-none focus:border-token-brand focus:ring-1 focus:ring-accent
              transition-colors
            "
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm text-token-ink-3">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="
              w-full px-4 py-3 rounded-xl bg-token-surface border border-token-line
              text-token-ink placeholder-muted-2 text-base
              focus:outline-none focus:border-token-brand focus:ring-1 focus:ring-accent
              transition-colors
            "
          />
        </div>

        {/* Error message */}
        {error && (
          <p className="text-token-loss text-sm text-center">{error}</p>
        )}

        <Button
          type="submit"
          disabled={loading || !username || !password}
          variant="primary"
          size="md"
          className="mt-2 w-full"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {/* Footer */}
      <p className="mt-12 text-token-ink-2 text-xs">
        Self-hosted · Zero cloud · 100% yours
      </p>
    </div>
  )
}
