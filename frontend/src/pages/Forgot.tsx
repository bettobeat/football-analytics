import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../lib/socket'
import { errorText, useAuth } from '../lib/auth'

/** Forgot password: email → 6-digit code + new password → signed in. */
export default function Forgot() {
  const { resetPassword, user } = useAuth()
  const nav = useNavigate()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user && step === 'email') nav('/account', { replace: true })
  }, [user, step, nav])

  const input =
    'w-full rounded-xl border border-line bg-surface2/60 px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'

  const sendCode = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await axios.post(`${API_URL}/auth/forgot`, { email })
      setStep('code')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const reset = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    setBusy(true)
    try {
      await resetPassword(email, code, password)
      nav('/', { replace: true })
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <div className="card p-6 sm:p-8">
        <h1 className="font-display text-2xl font-extrabold text-ink">Reset your password</h1>
        {step === 'email' ? (
          <form onSubmit={sendCode} className="mt-6 space-y-3">
            <p className="text-sm text-muted">Enter your account email and we’ll send you a 6-digit code.</p>
            <label className="block">
              <span className="label">Email</span>
              <input className={`${input} mt-1`} type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
            </label>
            {error && <div className="rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">{error}</div>}
            <button type="submit" disabled={busy} className="w-full rounded-xl bg-accent text-bg font-semibold py-2.5 text-sm disabled:opacity-60">
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </form>
        ) : (
          <form onSubmit={reset} className="mt-6 space-y-3">
            <p className="text-sm text-muted">
              If an account exists for <span className="text-ink font-medium">{email}</span>, a code is on its way. It’s valid for 10 minutes.
            </p>
            <label className="block">
              <span className="label">Code</span>
              <input
                className={`${input} mt-1 num text-center text-xl tracking-[0.4em]`}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                required
              />
            </label>
            <label className="block">
              <span className="label">New password</span>
              <input className={`${input} mt-1`} type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
            </label>
            {error && <div className="rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">{error}</div>}
            <button type="submit" disabled={busy || code.length !== 6} className="w-full rounded-xl bg-accent text-bg font-semibold py-2.5 text-sm disabled:opacity-60">
              {busy ? 'Saving…' : 'Set new password'}
            </button>
            <button type="button" onClick={() => setStep('email')} className="w-full text-sm text-muted hover:text-ink">
              Use a different email
            </button>
          </form>
        )}
        <p className="mt-5 text-sm text-center">
          <Link to="/login" className="text-muted hover:text-ink">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
