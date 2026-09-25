import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { errorText, useAuth } from '../lib/auth'

const RESEND_WAIT = 45

/** Enter the 6-digit code sent to the new account's email. */
export default function Verify() {
  const { user, loading, needsVerification, verify, resendCode, logout } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const next = new URLSearchParams(loc.search).get('next') || '/'
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [wait, setWait] = useState(RESEND_WAIT)

  useEffect(() => {
    if (loading) return
    if (!user) nav('/login', { replace: true })
    else if (!needsVerification) nav(next.startsWith('/') ? next : '/', { replace: true })
  }, [loading, user, needsVerification, next, nav])

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait(w => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (code.length !== 6) return setError('Enter the 6-digit code.')
    setError(null)
    setBusy(true)
    try {
      await verify(code)
    } catch (err) {
      setError(errorText(err))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    setError(null)
    setInfo(null)
    try {
      await resendCode()
      setInfo('A new code is on its way.')
      setWait(RESEND_WAIT)
    } catch (err) {
      setError(errorText(err))
    }
  }

  if (!user) return null

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <div className="card p-6 sm:p-8">
        <div className="w-12 h-12 rounded-2xl bg-accent/15 text-accent grid place-items-center mb-4">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 7l9 6 9-6" />
          </svg>
        </div>
        <h1 className="font-display text-2xl font-extrabold text-ink">Confirm your email</h1>
        <p className="text-sm text-muted mt-1">
          We sent a 6-digit code to <span className="text-ink font-medium">{user.email}</span>. It’s valid for 10 minutes. Check spam if you
          don’t see it.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            value={code}
            onChange={e => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 6)
              setCode(v)
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="000000"
            aria-label="Verification code"
            className="w-full rounded-xl border border-line bg-surface2/60 px-4 py-3 text-center num text-3xl tracking-[0.5em] text-ink placeholder:text-faint/60 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          {error && <div className="rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">{error}</div>}
          {info && !error && <div className="rounded-xl border border-win/40 bg-win/10 px-3 py-2 text-sm text-win">{info}</div>}
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="w-full rounded-xl bg-accent text-bg font-semibold py-2.5 text-sm disabled:opacity-60 transition-opacity"
          >
            {busy ? 'Checking…' : 'Confirm'}
          </button>
        </form>

        <div className="mt-5 flex items-center justify-between text-sm">
          <button onClick={resend} disabled={wait > 0} className="text-accent font-medium disabled:text-faint">
            {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
          </button>
          <button
            onClick={async () => {
              await logout()
              nav('/signup')
            }}
            className="text-muted hover:text-ink"
          >
            Wrong email?
          </button>
        </div>
      </div>
    </div>
  )
}
