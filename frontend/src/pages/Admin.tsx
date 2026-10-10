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
          <BackupsCard />
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
interface BackupRow { at: string; ok: number; trigger: string; file: string | null; dbBytes: number | null; gzBytes: number | null; ms: number; remote: string | null; error: string | null }
interface BackupData {
  running: boolean; healthy: boolean; lastOkAt: string | null; lastError: string | null; schedule: string; localKeep: number
  remote: { configured: boolean; encrypted: boolean; ready: boolean; keepDays: number; copies?: number; bytes?: number; latest?: { key: string; at: string } | null; listError?: string }
  local: { name: string; size: number; at: string }[]; history: BackupRow[]
  disk?: { dbBytes: number; volume: { free: number; total: number } | null; temp: { free: number; total: number } | null }
}
const mb = (n: number | null | undefined) => (n == null ? '–' : n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`)
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–')

/** Daily database backups: status, copies on the server and off-site, "Back up now", download (needs a two-step code). */
function BackupsCard() {
  const [d, setD] = useState<BackupData | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ask, setAsk] = useState<string | null>(null) // file waiting for the two-step code
  const [code, setCode] = useState('')
  const load = () => axios.get(`${API_URL}/admin/backups`).then(r => { setD(r.data.data); setErr(null) }).catch(e => setErr(errorText(e)))
  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!d?.running) return
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [d?.running])

  const runNow = async () => {
    setBusy(true)
    try { await axios.post(`${API_URL}/admin/backups/run`); await load() } catch (e) { setErr(errorText(e)) } finally { setBusy(false) }
  }
  const download = async (name: string) => {
    setBusy(true); setErr(null)
    try {
      const r = await axios.get(`${API_URL}/admin/backups/download/${encodeURIComponent(name)}`, { responseType: 'blob' })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    } catch (e: any) {
      if (e?.response?.status === 401) setAsk(name)
      else setErr('Download failed.')
    } finally { setBusy(false) }
  }
  const confirm = async () => {
    setBusy(true); setErr(null)
    try {
      await axios.post(`${API_URL}/crm/team/sudo`, { code })
      const name = ask!; setAsk(null); setCode('')
      setBusy(false); await download(name)
    } catch (e) { setErr(errorText(e)); setCode('') } finally { setBusy(false) }
  }

  if (!d) return err ? <section className="card p-5 sm:p-6 mb-8 text-sm text-loss">Backups: {err}</section> : null
  const last = d.history[0]
  return (
    <section className="card p-5 sm:p-6 mb-8">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="font-display text-lg font-bold text-ink">Database backups</h2>
        <button type="button" disabled={busy || d.running} onClick={runNow} className="rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-faint disabled:opacity-60">
          {d.running ? 'Backing up…' : 'Back up now'}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        <div className={`rounded-xl border px-4 py-3 ${d.healthy ? 'border-win/40 bg-win/10' : 'border-loss/40 bg-loss/10'}`}>
          <div className={`text-sm font-bold ${d.healthy ? 'text-win' : 'text-loss'}`}>{d.healthy ? 'Backed up' : d.lastOkAt ? 'Backup is late' : 'No backup yet'}</div>
          <div className="text-[11px] text-muted mt-0.5">Last good: {when(d.lastOkAt)} · {d.schedule}</div>
        </div>
        <div className="rounded-xl border border-line px-4 py-3">
          <div className="text-sm font-bold text-ink">On the server</div>
          <div className="text-[11px] text-muted mt-0.5">{d.local.length} of {d.localKeep} copies · database {mb(last?.dbBytes)} → {mb(last?.gzBytes)} zipped</div>
        </div>
        <div className={`rounded-xl border px-4 py-3 ${d.remote.ready && !d.remote.listError ? 'border-line' : 'border-draw/40 bg-draw/10'}`}>
          <div className={`text-sm font-bold ${d.remote.ready && !d.remote.listError ? 'text-ink' : 'text-draw'}`}>Off-site copy</div>
          <div className="text-[11px] text-muted mt-0.5">
            {!d.remote.configured ? 'Not set up yet (Cloudflare R2) — a server copy alone is lost if the volume is lost.'
              : !d.remote.encrypted ? 'Storage is set, but BACKUP_KEY is missing — nothing is uploaded.'
              : d.remote.listError ? `Storage error: ${d.remote.listError}`
              : `${d.remote.copies ?? 0} encrypted copies (${mb(d.remote.bytes)}), kept ${d.remote.keepDays} days`}
          </div>
        </div>
      </div>

      {d.disk && (() => {
        const v = d.disk.volume
        const low = !!v && (v.free < 500e6 || v.free / v.total < 0.1)
        return (
          <div className={`rounded-xl border px-3 py-2 text-xs mb-3 ${low ? 'border-loss/40 bg-loss/10 text-loss' : 'border-line text-muted'}`}>
            <b className={low ? '' : 'text-ink'}>Disk:</b> database {mb(d.disk.dbBytes)} · volume {v ? `${mb(v.free)} free of ${mb(v.total)}` : 'unknown'} · temp disk {d.disk.temp ? `${mb(d.disk.temp.free)} free` : 'unknown'}
            {low && <> — <b>the volume is almost full.</b> The site saves everything there: make the volume bigger in Railway (service → Settings → Volume).</>}
          </div>
        )
      })()}
      {d.lastError && <div className="rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss mb-3">Last attempt: {d.lastError}</div>}
      {err && <div className="rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss mb-3">{err}</div>}

      {ask && (
        <form onSubmit={e => { e.preventDefault(); confirm() }} className="rounded-xl border border-accent/40 p-4 mb-4 space-y-2">
          <div className="text-sm font-semibold text-ink">Confirm the download with two-step login</div>
          <p className="text-xs text-muted">The file holds every account (emails, password hashes). Keep it somewhere safe and delete it when you're done.</p>
          <div className="flex flex-wrap gap-2">
            <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" autoFocus aria-label="6-digit code"
              className="w-[160px] rounded-xl border border-line bg-surface2/60 px-3 py-2 text-center num text-xl tracking-[0.35em] text-ink outline-none focus:border-accent" />
            <button type="submit" disabled={busy || code.length !== 6} className="rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm disabled:opacity-60">Confirm</button>
            <button type="button" onClick={() => { setAsk(null); setCode('') }} className="rounded-xl px-3 py-2 text-sm text-muted">Cancel</button>
          </div>
        </form>
      )}

      {d.local.length > 0 && (
        <ul className="divide-y divide-line/50 text-sm">
          {d.local.map(f => (
            <li key={f.name} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="w-32 shrink-0 text-[11px] text-faint num">{when(f.at)}</span>
              <span className="text-ink truncate num text-xs">{f.name}</span>
              <span className="text-[11px] text-faint num">{mb(f.size)}</span>
              <button type="button" disabled={busy} onClick={() => download(f.name)} className="ml-auto text-xs font-semibold text-accent disabled:opacity-60">Download</button>
            </li>
          ))}
        </ul>
      )}
      {d.history.some(h => !h.ok) && (
        <p className="mt-3 text-[11px] text-faint">Failed in the last {d.history.length} attempts: {d.history.filter(h => !h.ok).length}. A failure also emails you.</p>
      )}
    </section>
  )
}

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
