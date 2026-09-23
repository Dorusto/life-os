import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { Button } from '../components/Button'
import { Field, TextInput } from '../components/Form'
import { login } from '../lib/api'
import { saveAuth } from '../lib/auth'

/**
 * Login page.
 *
 * Design goal: as minimal as possible, same philosophy as majordom-financiar's
 * own Login page — a private household tool, no marketing copy, just a form.
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
    <div className="flex min-h-dvh flex-col items-center justify-center bg-paper px-6">
      {/* Logo */}
      <div className="mb-10 flex flex-col items-center gap-3">
        <BrandMark size={56} />
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Majordom Transport</h1>
          <p className="mt-0.5 text-sm text-ink-2">Your vehicles, tracked</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
        <Field label="Username" htmlFor="username">
          <TextInput
            id="username"
            type="text"
            autoCapitalize="none"
            autoComplete="username"
            autoCorrect="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            required
            className="py-3 text-base"
          />
        </Field>

        <Field label="Password" htmlFor="password">
          <TextInput
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="py-3 text-base"
          />
        </Field>

        {/* Error message */}
        {error && <p className="text-center text-sm text-loss">{error}</p>}

        <Button
          type="submit"
          variant="primary"
          disabled={loading || !username || !password}
          className="mt-2 w-full"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {/* Footer */}
      <p className="mt-12 text-xs text-ink-3">Self-hosted · Zero cloud · 100% yours</p>
    </div>
  )
}
