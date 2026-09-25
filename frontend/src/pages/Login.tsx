import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { errorText, useAuth } from '../lib/auth'

/** Sign in and create account on one page: /login and /signup. */
export default function Login({ mode: initial }: { mode: 'login' | 'signup' }) {
  const { login, signup, user, needsVerification } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const next = new URLSearchParams(loc.search).get('next') || '/'
  const [mode, setMode] = useState(initial)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [optIn, setOptIn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setMode(initial), [initial])
  useEffect(() => {
    if (!user) return
    const target = next.startsWith('/') ? next : '/'
    if (needsVerification) nav(`/verify?next=${encodeURIComponent(target)}`, { replace: true })
    else nav(target, { replace: true })
  }, [user, needsVerification, next, nav])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (mode === 'signup' && password.length < 8) return setError('Password must be at least 8 characters.')
    setBusy(true)
    try {
      if (mode === 'login') await login(email, password)
      else await signup(email, password, name, optIn)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const input =
    'w-full rounded-xl border border-line bg-surface2/60 px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <div className="card p-6 sm:p-8">
        <h1 className="font-display text-2xl font-extrabold text-ink">{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
        <p className="text-sm text-muted mt-1">
          {mode === 'login' ? 'Welcome back.' : 'Free account: every match, live scores, market odds and the model’s pick.'}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          {mode === 'signup' && (
            <label className="block">
              <span className="label">Name (optional)</span>
              <input className={`${input} mt-1`} value={name} onChange={e => setName(e.target.value)} autoComplete="name" maxLength={80} />
            </label>
          )}
          <label className="block">
            <span className="label">Email</span>
            <input
              className={`${input} mt-1`}
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
            />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input
              className={`${input} mt-1`}
              type="password"
              required
              minLength={mode === 'signup' ? 8 : undefined}
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            {mode === 'signup' && <span className="text-[11px] text-faint">At least 8 characters.</span>}
          </label>

          {mode === 'signup' && (
            <label className="flex items-start gap-2.5 text-sm text-muted cursor-pointer select-none">
              <input type="checkbox" checked={optIn} onChange={e => setOptIn(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[rgb(var(--accent))]" />
              <span>Email me about new features, Premium and weekly picks. You can turn this off anytime.</span>
            </label>
          )}

          {error && <div className="rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">{error}</div>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-accent text-bg font-semibold py-2.5 text-sm disabled:opacity-60 transition-opacity"
          >
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="mt-5 text-sm text-muted text-center">
          {mode === 'login' ? (
            <>
              New here?{' '}
              <Link to={`/signup${loc.search}`} className="text-accent font-medium">
                Create an account
              </Link>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <Link to={`/login${loc.search}`} className="text-accent font-medium">
                Sign in
              </Link>
            </>
          )}
        </div>
        {mode === 'login' && (
          <p className="mt-3 text-xs text-center">
            <Link to="/forgot" className="text-muted hover:text-ink">
              Forgot your password?
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
