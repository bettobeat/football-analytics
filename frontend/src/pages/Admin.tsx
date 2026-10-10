import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../lib/socket'
import { errorText, useAuth, type User } from '../lib/auth'
import DataHealth from '../components/DataHealth'
import VisitorsCard from '../components/VisitorsCard'

type Row = User & { lastLoginAt: string | null }

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '–'
}

/** Admin panel: an overview (visitors, accounts, data health) and, on its own tab, the users list (the future CRM). */
export default function Admin() {
  const { access, loading } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [stats, setStats] = useState<{ total: number; premium: number; verified: number; optIn: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [params, setParams] = useSearchParams()
  const tab: 'overview' | 'users' = params.get('tab') === 'users' ? 'users' : 'overview'
  const go = (x: 'overview' | 'users') => setParams(x === 'overview' ? {} : { tab: x }, { replace: true })

  const load = () =>
    axios
      .get(`${API_URL}/admin/users`)
      .then(r => {
        setRows(r.data.data)
        setStats(r.data.stats)
        setError(null)
      })
      .catch(e => setError(errorText(e)))

  useEffect(() => {
    if (access === 'admin') load()
  }, [access])

  if (loading) return null
  if (access !== 'admin') return <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-sm text-muted">Admins only.</div>

  const setPlan = async (u: Row, plan: 'free' | 'premium' | 'pro') => {
    let until: string | null = null
    if (plan !== 'free') {
      const days = window.prompt(`${plan === 'pro' ? 'Pro' : 'Premium'} for ${u.email}: number of days (empty = no end date)`, '30')
      if (days === null) return
      const n = parseInt(days, 10)
      if (n > 0) until = new Date(Date.now() + n * 86400000).toISOString()
    }
    try {
      await axios.post(`${API_URL}/admin/users/${u.id}/plan`, { plan, until })
      load()
    } catch (e) {
      setError(errorText(e))
    }
  }

  const resetPw = async (u: Row) => {
    const pw = window.prompt(`New temporary password for ${u.email} (min 8 characters)`)
    if (!pw) return
    try {
      await axios.post(`${API_URL}/admin/users/${u.id}/password`, { password: pw })
      setError(null)
      window.alert('Password changed. Send it to the user privately and ask them to change it in Account.')
    } catch (e) {
      setError(errorText(e))
    }
  }

  const shown = rows.filter(r => !q || r.email.includes(q.toLowerCase()) || (r.name || '').toLowerCase().includes(q.toLowerCase()))

  const tile = (label: string, value: number | undefined, onClick?: () => void) => (
    <button type="button" onClick={onClick} className="text-left rounded-xl border border-line/60 bg-surface2/50 px-4 py-3 hover:border-accent/40 transition-colors">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</div>
      <div className="num text-2xl font-extrabold text-ink leading-none mt-1.5">{value ?? '–'}</div>
    </button>
  )

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">Admin</h1>
        <nav className="flex gap-1 rounded-full border border-line/60 bg-surface p-1">
          {(['overview', 'users'] as const).map(x => (
            <button key={x} type="button" onClick={() => go(x)} aria-current={tab === x ? 'page' : undefined}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${tab === x ? 'bg-accent text-bg' : 'text-muted hover:text-ink'}`}>
              {x === 'overview' ? 'Overview' : `Users${stats ? ` · ${stats.total}` : ''}`}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'overview' && (
        <>
          <VisitorsCard />
          <section className="card p-5 sm:p-6 mb-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
              <h2 className="font-display text-lg font-bold text-ink">Accounts</h2>
              <button type="button" onClick={() => go('users')} className="text-xs font-semibold text-accent">Open users →</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {tile('Accounts', stats?.total, () => go('users'))}
              {tile('Confirmed email', stats?.verified, () => go('users'))}
              {tile('Premium / Pro', stats?.premium, () => go('users'))}
              {tile('Want updates', stats?.optIn, () => go('users'))}
            </div>
          </section>
          <ContactCard />
          <SecurityCard />
          <LeaveCard />
          <DataHealth />
        </>
      )}

      {tab === 'users' && (<>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-ink">Users</h2>
          {stats && (
            <p className="text-sm text-muted">
              <span className="num">{stats.total}</span> accounts · <span className="num">{stats.verified}</span> confirmed ·{' '}
              <span className="num">{stats.premium}</span> premium · <span className="num">{stats.optIn}</span> want updates
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
        <a href={`${API_URL}/admin/users.csv`} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:border-faint whitespace-nowrap">
          Export CSV
        </a>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search email or name"
          className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent w-64 max-w-full"
        />
        </div>
      </div>
      {error && <div className="mb-4 rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">{error}</div>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-faint text-xs border-b border-line">
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Updates</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium">Last sign-in</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(u => (
              <tr key={u.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3">
                  <div className="text-ink">{u.email}</div>
                  {u.name && <div className="text-xs text-faint">{u.name}</div>}
                </td>
                <td className="px-4 py-3">
                  {u.isAdmin ? (
                    <span className="text-xs font-semibold text-accent">Admin</span>
                  ) : u.plan !== 'free' ? (
                    <span className="text-xs font-semibold text-accent">
                      {u.plan === 'pro' ? 'Pro' : 'Premium'}{u.premiumUntil ? <span className="text-faint font-normal"> · until {fmt(u.premiumUntil)}</span> : null}
                    </span>
                  ) : (
                    <span className="text-xs text-muted">Free</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">{u.emailVerified ? <span className="text-win">Confirmed</span> : <span className="text-draw">Pending</span>}</td>
                <td className="px-4 py-3 text-xs">{u.marketingOptIn ? <span className="text-win">Yes</span> : <span className="text-faint">No</span>}</td>
                <td className="px-4 py-3 num text-muted">{fmt(u.createdAt)}</td>
                <td className="px-4 py-3 num text-muted">{fmt(u.lastLoginAt)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {!u.isAdmin &&
                    <>
                      {u.plan !== 'premium' && (
                        <button onClick={() => setPlan(u, 'premium')} className="text-xs font-semibold text-accent mr-3">
                          Premium
                        </button>
                      )}
                      {u.plan !== 'pro' && (
                        <button onClick={() => setPlan(u, 'pro')} className="text-xs font-semibold text-accent mr-3">
                          Pro
                        </button>
                      )}
                      {u.plan !== 'free' && (
                        <button onClick={() => setPlan(u, 'free')} className="text-xs text-muted hover:text-loss mr-3">
                          Free
                        </button>
                      )}
                    </>}
                  {u.role && <Link to="/crm?tab=team" className="text-xs text-draw font-semibold mr-3" title="Staff role — change it in CRM → Team & roles">{u.role.replace(/_/g, ' ')}</Link>}
                  <button onClick={() => resetPw(u)} className="text-xs text-muted hover:text-ink">
                    Reset password
                  </button>
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-faint">
                  No accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </>)}
    </div>
  )
}

const REASON_LABEL: Record<string, string> = {
  too_expensive: 'Too expensive', not_accurate: 'Predictions not accurate enough', not_using: 'Not using it enough',
  missing_feature: 'Missing feature / sport', other_service: 'Found another service', technical: 'Technical problems', other: 'Something else'
}
interface Leave {
  total: number; cancels: number; deletes: number; cancelledStillActive: number
  counts: Record<string, { cancel: number; delete: number }>
  recent: { kind: 'cancel' | 'delete'; plan: string | null; reason: string; details: string | null; memberDays: number | null; at: string }[]
}

/** Why people cancel or delete (last 12 months). */
interface SecRow { id: number; at: string; userId: number | null; email: string | null; event: string; ip: string | null; ua: string | null; detail: string | null }
const EVENT_LABEL: Record<string, string> = {
  login_ok: 'Signed in', login_ok_recovery_code: 'Signed in with a recovery code', login_password_ok: 'Password OK, waiting for code',
  login_fail: 'Wrong email or password', '2fa_fail': 'Wrong two-step code', '2fa_on': 'Two-step login turned on', '2fa_off': 'Two-step login turned off',
  '2fa_recovery_new': 'New recovery codes', password_reset: 'Password reset by email', password_change: 'Password changed',
  admin_set_password: 'Admin set a user password', role_changed: 'Staff role changed', role_created: 'Role created', role_updated: 'Role permissions changed', role_deleted: 'Role deleted', staff_plan_change: 'Staff changed a plan', staff_sent_reset: 'Staff sent a password reset', staff_signed_out_user: 'Staff signed a customer out', campaign_sent: 'Email campaign sent', '2fa_device_added': 'Two-step: another device added',
  email_change_started: 'Email change started', email_changed: 'Email changed'
}
const BAD = new Set(['role_changed', 'role_updated', 'role_created', 'role_deleted', 'login_fail', '2fa_fail', '2fa_off', 'login_ok_recovery_code', 'admin_set_password', 'email_changed', '2fa_device_added'])
function browserOf(ua: string | null) {
  if (!ua) return ''
  const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : ''
  const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ''
  return [b, os].filter(Boolean).join(' · ')
}

/** Sign-ins and account security events with IP (kept 90 days). */
function SecurityCard() {
  const [d, setD] = useState<{ failed24h: number; rows: SecRow[] } | null>(null)
  const [all, setAll] = useState(false)
  useEffect(() => { axios.get(`${API_URL}/admin/security-log`).then(r => setD(r.data.data)).catch(() => setD(null)) }, [])
  if (!d) return null
  const rows = all ? d.rows : d.rows.slice(0, 12)
  return (
    <section className="card p-5 sm:p-6 mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="font-display text-lg font-bold text-ink">Security log</h2>
        <span className={`text-xs ${d.failed24h > 5 ? 'text-loss font-semibold' : 'text-faint'}`}>{d.failed24h} failed sign-ins in the last 24 h · IPs kept 90 days</span>
      </div>
      {d.rows.length === 0 ? <p className="text-sm text-faint">Nothing logged yet.</p> : (
        <>
          <ul className="divide-y divide-line/50 text-sm">
            {rows.map(r => (
              <li key={r.id} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="w-32 shrink-0 text-[11px] text-faint num">{fmt(r.at)}</span>
                <span className={`font-semibold ${BAD.has(r.event) ? 'text-loss' : 'text-ink'}`}>{EVENT_LABEL[r.event] || r.event}</span>
                <span className="text-muted truncate">{r.email || '—'}</span>
                <span className="ml-auto text-[11px] text-faint num">{r.ip || ''}{r.ua ? ` · ${browserOf(r.ua)}` : ''}</span>
              </li>
            ))}
          </ul>
          {d.rows.length > 12 && (
            <button type="button" onClick={() => setAll(v => !v)} className="mt-3 text-xs font-semibold text-accent">{all ? 'Show less' : `Show all ${d.rows.length}`}</button>
          )}
        </>
      )}
    </section>
  )
}

interface ContactMsg { id: number; at: string; userId: number | null; name: string | null; email: string; topic: string; message: string; page: string | null; sent: boolean; handled: boolean }
const TOPIC_LABEL: Record<string, string> = {
  question: 'Question', account: 'Account / sign-in', billing: 'Billing / plan', privacy: 'Privacy / my data',
  bug: 'Something is broken', idea: 'Idea / feedback', business: 'Business / partnership', other: 'Other'
}

/** Messages from the contact form (they also arrive in support@ by email; reply from there). */
function ContactCard() {
  const [d, setD] = useState<{ open: number; rows: ContactMsg[] } | null>(null)
  const [all, setAll] = useState(false)
  const load = () => axios.get(`${API_URL}/admin/contact`).then(r => setD(r.data.data)).catch(() => setD(null))
  useEffect(() => { load() }, [])
  if (!d) return null
  const mark = async (id: number, handled: boolean) => {
    setD(prev => prev && { open: prev.open + (handled ? -1 : 1), rows: prev.rows.map(r => (r.id === id ? { ...r, handled } : r)) })
    await axios.post(`${API_URL}/admin/contact/${id}`, { handled }).catch(load)
  }
  const rows = d.rows.filter(r => all || !r.handled)
  return (
    <section className="card p-5 sm:p-6 mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="font-display text-lg font-bold text-ink">Contact messages <Link to="/crm" className="ml-2 text-xs font-semibold text-accent">Open CRM inbox →</Link></h2>
        <span className="text-xs text-faint">
          {d.open} open · {d.rows.length} total ·{' '}
          <button type="button" onClick={() => setAll(v => !v)} className="text-accent font-semibold">{all ? 'Open only' : 'Show all'}</button>
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-faint">{d.rows.length ? 'Nothing open. All answered.' : 'No messages yet.'}</p>
      ) : (
        <ul className="divide-y divide-line/50 text-sm">
          {rows.slice(0, 30).map(r => (
            <li key={r.id} className={`py-3 ${r.handled ? 'opacity-55' : ''}`}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-faint">
                <span className="px-1.5 py-0.5 rounded bg-surface2 text-ink font-semibold">{TOPIC_LABEL[r.topic] || r.topic}</span>
                <span>#{r.id} · {fmt(r.at)}</span>
                <span className="text-ink">{r.name || '—'}</span>
                <a href={`mailto:${r.email}?subject=${encodeURIComponent(`Re: your message to SportLikely (#${r.id})`)}`} className="text-accent">{r.email}</a>
                {r.userId && <span>account #{r.userId}</span>}
                {!r.sent && <span className="text-loss font-semibold">email not delivered — reply from here</span>}
                <button type="button" onClick={() => mark(r.id, !r.handled)} className="ml-auto text-xs font-semibold text-accent">{r.handled ? 'Reopen' : 'Mark answered'}</button>
              </div>
              <p className="text-ink mt-1 whitespace-pre-wrap break-words">{r.message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function LeaveCard() {
  const [d, setD] = useState<Leave | null>(null)
  useEffect(() => { axios.get(`${API_URL}/admin/leave-feedback`).then(r => setD(r.data.data)).catch(() => setD(null)) }, [])
  if (!d) return null
  const rows = Object.entries(d.counts).sort((a, b) => b[1].cancel + b[1].delete - (a[1].cancel + a[1].delete))
  const max = Math.max(1, ...rows.map(([, c]) => c.cancel + c.delete))
  return (
    <section className="card p-5 sm:p-6 mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="font-display text-lg font-bold text-ink">Why people leave</h2>
        <span className="text-xs text-faint">last 12 months · {d.cancels} cancelled · {d.deletes} deleted · {d.cancelledStillActive} cancelled but still active</span>
      </div>
      {d.total === 0 ? <p className="text-sm text-faint">Nobody has cancelled or deleted an account yet.</p> : (
        <>
          <ul className="space-y-2 mb-5">
            {rows.map(([k, c]) => (
              <li key={k} className="text-sm">
                <div className="flex justify-between gap-3"><span className="text-ink">{REASON_LABEL[k] || k}</span><span className="num text-muted">{c.cancel} cancel · {c.delete} delete</span></div>
                <div className="mt-1 h-2 rounded-full bg-surface2 overflow-hidden flex">
                  <div className="h-full bg-draw" style={{ width: `${(c.cancel / max) * 100}%` }} />
                  <div className="h-full bg-loss" style={{ width: `${(c.delete / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <div className="label pb-2">Latest comments</div>
          <ul className="divide-y divide-line/50 text-sm">
            {d.recent.filter(r => r.details).slice(0, 15).map((r, i) => (
              <li key={i} className="py-2">
                <div className="text-[11px] text-faint">{fmt(r.at)} · {r.kind === 'cancel' ? 'cancelled' : 'deleted'} · {r.plan || 'free'} · {REASON_LABEL[r.reason] || r.reason}{r.memberDays !== null ? ` · member ${r.memberDays} days` : ''}</div>
                <div className="text-ink mt-0.5">{r.details}</div>
              </li>
            ))}
            {!d.recent.some(r => r.details) && <li className="py-2 text-faint">No written comments yet.</li>}
          </ul>
        </>
      )}
    </section>
  )
}
