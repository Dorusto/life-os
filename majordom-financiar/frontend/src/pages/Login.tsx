import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../lib/api'
import { saveAuth } from '../lib/auth'

/**
 * Login page.
 *
 * Design goal: as minimal as possible. This is a private household tool —
 * no marketing copy, no "forgot password", no sign-up link. Just a form.
 * The M logo and the tagline give it personality without clutter.
 */
export default function Login() {
  const navigate = useNavigate()
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
      navigate('/', { replace: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed'
      setError(message === 'Invalid credentials' ? 'Wrong username or password' : message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-6">
      {/* Logo */}
      <div className="mb-10 flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center">
          <span className="text-white text-2xl font-bold">M</span>
        </div>
        <div className="text-center">
          <h1 className="text-white text-xl font-semibold tracking-tight">Majordom</h1>
          <p className="text-muted text-sm mt-0.5">Your personal finance assistant</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="username" className="text-sm text-muted">Username</label>
          <input
            id="username"
            type="text"
            autoCapitalize="none"
            autoComplete="username"
            autoCorrect="off"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="doru"
            required
            className="
              w-full px-4 py-3 rounded-xl bg-surface border border-border
              text-white placeholder-muted-2 text-base
              focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent
              transition-colors
            "
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm text-muted">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="
              w-full px-4 py-3 rounded-xl bg-surface border border-border
              text-white placeholder-muted-2 text-base
              focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent
              transition-colors
            "
          />
        </div>

        {/* Error message */}
        {error && (
          <p className="text-danger text-sm text-center">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !username || !password}
          className="
            mt-2 w-full py-3.5 rounded-xl bg-accent text-white text-base font-medium
            hover:bg-accent-hover active:scale-[0.98]
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-all duration-150
          "
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {/* Footer */}
      <p className="mt-12 text-muted-2 text-xs">
        Self-hosted · Zero cloud · 100% yours
      </p>
    </div>
  )
}
