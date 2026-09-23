import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { login } from '../lib/api'
import { isAuthenticated, saveAuth } from '../lib/auth'
import { BrandMark } from '../components/BrandMark'
import { Button } from '../components/Button'
import { Field, TextInput } from '../components/Form'

export default function Login() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () => login(username.trim(), password),
    onSuccess: (data) => {
      saveAuth(data.access_token, data.username)
      navigate('/', { replace: true })
    },
  })

  useEffect(() => {
    document.title = 'Sign in · Majordom Invest'
  }, [])

  if (isAuthenticated()) return <Navigate to="/" replace />

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) return
    mutation.mutate()
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Statement panel — the one bold surface in the app. */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-surface-sunken px-[3rem] py-12 text-ink lg:flex">
        <div className="flex items-center gap-3">
          <BrandMark size={36} />
          <span className="text-sm font-semibold tracking-wide">Majordom Invest</span>
        </div>

        <div className="relative z-10 max-w-md">
          <p className="text-[13px] text-ink-2">Portfolio tracker</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight">
            Every position, contribution and dividend in one ledger.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-ink-2">
            Track holdings and cost basis, compare time-weighted and money-weighted returns against
            a benchmark, and watch a projection toward each goal.
          </p>
        </div>

        <svg
          viewBox="0 0 400 160"
          className="absolute -bottom-2 left-0 w-full text-line-strong"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            d="M0,140 C60,120 90,135 140,100 C190,65 230,95 280,55 C320,25 360,40 400,10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-paper px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandMark size={36} />
          </div>
          <h2 className="text-xl font-semibold text-ink">Sign in</h2>
          <p className="mt-1 text-sm text-ink-2">Use your investment-manager account.</p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <Field label="Username" htmlFor="username">
              <TextInput
                id="username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <TextInput
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            {mutation.isError && (
              <p className="rounded border border-loss bg-loss-soft px-3 py-2 text-[13px] text-loss">
                {(mutation.error as Error).message || 'Invalid credentials'}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={mutation.isPending || !username.trim() || !password}
            >
              {mutation.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
