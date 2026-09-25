import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../lib/socket'
import { errorText, useAuth } from '../lib/auth'

function fmtDay(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

export default function Account() {
  const { user, access, loading, logout } = useAuth()
  const nav = useNavigate()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!loading && !user) nav('/login?next=/account', { replace: true })
  }, [loading, user, nav])
  if (!user) return null

  const changePw = async (e: FormEvent) => {
    e.preventDefault()
    setMsg(null)
    setBusy(true)
    try {
      await axios.post(`${API_URL}/auth/password`, { current, next })
      setCurrent('')
      setNext('')
      setMsg({ ok: true, text: 'Password changed. Other devices were signed out.' })
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) })
    } finally {
      setBusy(false)
    }
  }

  const input =
    'w-full rounded-xl border border-line bg-surface2/60 px-3.5 py-2.5 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'
  const planLabel = access === 'admin' ? 'Admin (full access)' : user.plan === 'premium' ? 'Premium' : 'Free'

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">Account</h1>
        <p className="text-sm text-muted">{user.email}</p>
      </div>

      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="label">Plan</div>
            <div className="font-display text-xl font-bold text-ink mt-0.5">{planLabel}</div>
            {user.plan === 'premium' && user.premiumUntil && <div className="text-xs text-muted mt-0.5">Until {fmtDay(user.premiumUntil)}</div>}
            <div className="text-xs text-faint mt-0.5">Member since {fmtDay(user.createdAt)}</div>
          </div>
          {access === 'free' && (
            <Link to="/premium" className="px-4 py-2 rounded-xl bg-accent text-bg text-sm font-semibold">
              See Premium
            </Link>
          )}
        </div>
      </div>

      <form onSubmit={changePw} className="card p-6 space-y-3">
        <div className="font-display font-bold text-ink">Change password</div>
        <label className="block">
          <span className="label">Current password</span>
          <input className={`${input} mt-1`} type="password" required value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" />
        </label>
        <label className="block">
          <span className="label">New password</span>
          <input className={`${input} mt-1`} type="password" required minLength={8} value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" />
        </label>
        {msg && (
          <div className={`rounded-xl border px-3 py-2 text-sm ${msg.ok ? 'border-win/40 bg-win/10 text-win' : 'border-loss/40 bg-loss/10 text-loss'}`}>{msg.text}</div>
        )}
        <button type="submit" disabled={busy} className="rounded-xl bg-surface2 border border-line px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60">
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </form>

      <button
        onClick={async () => {
          await logout()
          nav('/')
        }}
        className="text-sm text-muted hover:text-loss"
      >
        Sign out
      </button>
    </div>
  )
}
