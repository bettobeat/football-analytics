import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../lib/socket'
import { errorText, useAuth } from '../lib/auth'

/*
 * CRM (staff only, English): support inbox (admin + support staff), email campaigns and revenue (admin only).
 * Replies go out by email from support@; customers' answers arrive in the support@ Gmail inbox.
 */

type Tab = 'inbox' | 'campaigns' | 'revenue'
const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
const fmtDay = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const TOPIC: Record<string, string> = {
  question: 'Question', account: 'Account', billing: 'Billing', privacy: 'Privacy', bug: 'Bug', idea: 'Idea', business: 'Business', other: 'Other'
}
const STATUS_TONE: Record<string, string> = { open: 'bg-accent/15 text-accent', waiting: 'bg-draw/15 text-draw', closed: 'bg-surface2 text-muted' }
const input =
  'w-full rounded-xl border border-line bg-surface2/60 px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'
const Err = ({ e }: { e: string | null }) => (e ? <div className="rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">{e}</div> : null)

export default function Crm() {
  const { staff, user, loading } = useAuth()
  const [params, setParams] = useSearchParams()
  const want = (params.get('tab') as Tab) || 'inbox'
  const tab: Tab = staff === 'admin' ? want : 'inbox'
  useEffect(() => { document.title = 'CRM · SportLikely' }, [])

  if (loading) return null
  if (!staff)
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-3">
        <h1 className="font-display text-2xl font-extrabold text-ink">CRM</h1>
        <p className="text-sm text-muted">
          {user?.role === 'support'
            ? user.twoFactor
              ? 'Sign out and sign in again with your two-step code to open the CRM.'
              : 'Support staff need two-step login. Turn it on in your account, then come back.'
            : 'Staff only.'}
        </p>
        {user?.role === 'support' && !user.twoFactor && <Link to="/account" className="inline-block rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm">Go to account</Link>}
      </div>
    )

  const tabs: { k: Tab; label: string }[] = staff === 'admin'
    ? [{ k: 'inbox', label: 'Support inbox' }, { k: 'campaigns', label: 'Campaigns' }, { k: 'revenue', label: 'Revenue & churn' }]
    : [{ k: 'inbox', label: 'Support inbox' }]

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">CRM</h1>
          <p className="text-sm text-muted mt-1">{staff === 'admin' ? 'Admin' : 'Support staff'} · {user?.email}</p>
        </div>
        <div className="seg">
          {tabs.map(t => (
            <button key={t.k} type="button" onClick={() => setParams(t.k === 'inbox' ? {} : { tab: t.k }, { replace: true })} className={`seg-btn ${tab === t.k ? 'seg-btn-active' : ''}`}>{t.label}</button>
          ))}
        </div>
      </div>
      {tab === 'inbox' && <Inbox />}
      {tab === 'campaigns' && staff === 'admin' && <Campaigns />}
      {tab === 'revenue' && staff === 'admin' && <Revenue />}
    </div>
  )
}

/* ================================================================== */
/* Inbox                                                              */
/* ================================================================== */

interface ThreadRow { id: number; at: string; updatedAt: string | null; userId: number | null; name: string | null; email: string; topic: string; preview: string; status: string; replies: number; plan: string | null }
interface Thread {
  message: { id: number; at: string; name: string | null; email: string; topic: string; message: string; page: string | null; status: string; sent: boolean; userId: number | null }
  replies: { id: number; at: string; byName: string; kind: 'reply' | 'note'; body: string; sent: boolean }[]
  account: { id: number; plan: string; premiumUntil: string | null; createdAt: string; lastLoginAt: string | null; cancelAt: string | null } | null
  others: { id: number; at: string; topic: string; status: string }[]
}

function Inbox() {
  const [status, setStatus] = useState<'open' | 'waiting' | 'closed' | ''>('open')
  const [list, setList] = useState<{ counts: Record<string, number>; rows: ThreadRow[] } | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = () => axios.get(`${API_URL}/crm/inbox`, { params: { status: status || undefined } }).then(r => { setList(r.data.data); setError(null) }).catch(e => setError(errorText(e)))
  useEffect(() => { load() }, [status])

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr] items-start">
      <section className="card overflow-hidden">
        <div className="flex gap-1 p-2 border-b border-line/60">
          {(['open', 'waiting', 'closed', ''] as const).map(s => (
            <button key={s || 'all'} type="button" onClick={() => setStatus(s)} className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold ${status === s ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink'}`}>
              {s ? `${s[0].toUpperCase()}${s.slice(1)}` : 'All'}{s && list ? ` · ${list.counts[s] ?? 0}` : ''}
            </button>
          ))}
        </div>
        <Err e={error} />
        {!list ? <div className="p-6 text-sm text-faint">Loading…</div> : list.rows.length === 0 ? (
          <div className="p-6 text-sm text-faint">{status === 'open' ? 'Nothing open. All answered.' : 'No messages here.'}</div>
        ) : (
          <ul className="divide-y divide-line/50 max-h-[70vh] overflow-y-auto">
            {list.rows.map(r => (
              <li key={r.id}>
                <button type="button" onClick={() => setOpenId(r.id)} className={`w-full text-left px-4 py-3 hover:bg-surface2/50 ${openId === r.id ? 'bg-surface2/70' : ''}`}>
                  <div className="flex items-center gap-2 text-[11px] text-faint">
                    <span className={`px-1.5 py-0.5 rounded font-bold uppercase tracking-wide text-[9px] ${STATUS_TONE[r.status] || ''}`}>{r.status}</span>
                    <span>#{r.id}</span><span>{TOPIC[r.topic] || r.topic}</span>
                    {r.plan && r.plan !== 'free' && <span className="text-accent font-semibold">{r.plan}</span>}
                    <span className="ml-auto">{fmt(r.updatedAt || r.at)}</span>
                  </div>
                  <div className="text-sm font-semibold text-ink truncate mt-0.5">{r.name || r.email}</div>
                  <div className="text-xs text-muted line-clamp-2">{r.preview}</div>
                  {r.replies > 0 && <div className="text-[11px] text-faint mt-0.5">{r.replies} {r.replies === 1 ? 'reply' : 'replies'} sent</div>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {openId ? <ThreadView id={openId} onChange={load} /> : <section className="card p-8 text-sm text-faint hidden lg:block">Pick a message on the left.</section>}
    </div>
  )
}

function ThreadView({ id, onChange }: { id: number; onChange: () => void }) {
  const [t, setT] = useState<Thread | null>(null)
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'reply' | 'note'>('reply')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = () => axios.get(`${API_URL}/crm/inbox/${id}`).then(r => { setT(r.data.data); setError(null) }).catch(e => setError(errorText(e)))
  useEffect(() => { setT(null); setText(''); load() }, [id])
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null)
    try { await fn(); await load(); onChange() } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const send = (close: boolean) => (e?: FormEvent) => {
    e?.preventDefault()
    act(async () => {
      if (mode === 'note') await axios.post(`${API_URL}/crm/inbox/${id}/note`, { body: text })
      else await axios.post(`${API_URL}/crm/inbox/${id}/reply`, { body: text, close })
      setText('')
    })
  }
  const setStatus = (s: string) => act(() => axios.post(`${API_URL}/crm/inbox/${id}/status`, { status: s }))
  if (!t) return <section className="card p-6 text-sm text-faint">{error || 'Loading…'}</section>
  const m = t.message

  return (
    <section className="card p-5 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-faint">#{m.id} · {TOPIC[m.topic] || m.topic} · {fmt(m.at)}{m.page ? ` · from ${m.page}` : ''}</div>
          <h2 className="font-display text-xl font-bold text-ink truncate">{m.name || m.email}</h2>
          <a href={`mailto:${m.email}`} className="text-sm text-accent">{m.email}</a>
        </div>
        <div className="flex gap-1">
          {['open', 'waiting', 'closed'].map(s => (
            <button key={s} type="button" disabled={busy || m.status === s} onClick={() => setStatus(s)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${m.status === s ? STATUS_TONE[s] : 'text-muted hover:text-ink border border-line'}`}>{s}</button>
          ))}
        </div>
      </div>

      {t.account && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-xl bg-surface2/50 border border-line/60 px-3 py-2 text-xs text-muted">
          <span>Account #{t.account.id}</span>
          <span>Plan <b className="text-ink">{t.account.plan}</b>{t.account.premiumUntil ? ` until ${fmtDay(t.account.premiumUntil)}` : ''}</span>
          <span>Joined {fmtDay(t.account.createdAt)}</span>
          <span>Last sign-in {fmtDay(t.account.lastLoginAt)}</span>
          {t.account.cancelAt && <span className="text-loss">Cancelled {fmtDay(t.account.cancelAt)}</span>}
        </div>
      )}

      <div className="space-y-3">
        <div className="rounded-2xl border border-line bg-surface2/40 p-4">
          <div className="text-[11px] text-faint mb-1">{m.name || 'Customer'} wrote</div>
          <p className="text-sm text-ink whitespace-pre-wrap break-words">{m.message}</p>
        </div>
        {t.replies.map(r => (
          <div key={r.id} className={`rounded-2xl p-4 ${r.kind === 'note' ? 'border border-dashed border-draw/50 bg-draw/5' : 'border border-accent/30 bg-accent/5 ml-4 sm:ml-10'}`}>
            <div className="text-[11px] text-faint mb-1">
              {r.kind === 'note' ? 'Internal note' : 'Reply'} · {r.byName} · {fmt(r.at)}{r.kind === 'reply' && !r.sent ? ' · not delivered' : ''}
            </div>
            <p className="text-sm text-ink whitespace-pre-wrap break-words">{r.body}</p>
          </div>
        ))}
        {t.replies.some(r => r.kind === 'reply') && (
          <p className="text-[11px] text-faint">The customer's answer arrives in the support@ inbox (Gmail), with [#{m.id}] in the subject.</p>
        )}
      </div>

      <form onSubmit={send(false)} className="space-y-2">
        <div className="flex gap-1">
          <button type="button" onClick={() => setMode('reply')} className={`rounded-lg px-3 py-1 text-xs font-semibold ${mode === 'reply' ? 'bg-accent text-bg' : 'text-muted border border-line'}`}>Reply by email</button>
          <button type="button" onClick={() => setMode('note')} className={`rounded-lg px-3 py-1 text-xs font-semibold ${mode === 'note' ? 'bg-draw text-bg' : 'text-muted border border-line'}`}>Internal note</button>
        </div>
        <textarea className={`${input} min-h-[140px] resize-y`} value={text} onChange={e => setText(e.target.value)} placeholder={mode === 'reply' ? `Hi ${m.name || ''}…` : 'Only staff see this'} maxLength={10000} />
        <Err e={error} />
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy || text.trim().length < 2} className="rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm disabled:opacity-60">
            {busy ? 'Sending…' : mode === 'reply' ? 'Send reply' : 'Save note'}
          </button>
          {mode === 'reply' && (
            <button type="button" onClick={() => send(true)()} disabled={busy || text.trim().length < 2} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60">Send and close</button>
          )}
        </div>
        {mode === 'reply' && <p className="text-[11px] text-faint">Sent from support@sportlikely.com with your message quoted below it.</p>}
      </form>

      {t.others.length > 0 && (
        <div className="text-xs text-muted">
          Other messages from this email: {t.others.map(o => <span key={o.id} className="mr-2">#{o.id} ({TOPIC[o.topic] || o.topic}, {o.status})</span>)}
        </div>
      )}
    </section>
  )
}

/* ================================================================== */
/* Campaigns                                                          */
/* ================================================================== */

interface Seg { plans: string[]; joinedWithinDays: string; activeWithinDays: string; inactiveForDays: string; includeStaff: boolean }
interface Camp { id: number; createdAt: string; subject: string; total: number; sent: number; failed: number; status: string; finishedAt: string | null }

function Campaigns() {
  const [seg, setSeg] = useState<Seg>({ plans: [], joinedWithinDays: '', activeWithinDays: '', inactiveForDays: '', includeStaff: false })
  const [preview, setPreview] = useState<{ count: number; optedIn: number; sample: { email: string; plan: string }[] } | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [list, setList] = useState<Camp[]>([])
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const segment = useMemo(() => ({
    plans: seg.plans, includeStaff: seg.includeStaff,
    joinedWithinDays: seg.joinedWithinDays || null, activeWithinDays: seg.activeWithinDays || null, inactiveForDays: seg.inactiveForDays || null
  }), [seg])
  const loadList = () => axios.get(`${API_URL}/crm/campaigns`).then(r => setList(r.data.data)).catch(() => undefined)
  useEffect(() => { loadList() }, [])
  useEffect(() => {
    const t = setTimeout(() => { axios.post(`${API_URL}/crm/segment`, { segment }).then(r => setPreview(r.data.data)).catch(e => setError(errorText(e))) }, 300)
    return () => clearTimeout(t)
  }, [segment])
  useEffect(() => {
    if (!list.some(c => c.status === 'sending')) return
    const t = setInterval(loadList, 3000)
    return () => clearInterval(t)
  }, [list])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null); setInfo(null)
    try { await fn() } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const test = () => run(async () => {
    const r = await axios.post(`${API_URL}/crm/campaigns/test`, { subject, body })
    setInfo(`Test sent to ${r.data.data.sentTo}.`)
  })
  const send = () => {
    if (!preview?.count) return
    if (!window.confirm(`Send "${subject}" to ${preview.count} ${preview.count === 1 ? 'person' : 'people'} now? This cannot be undone.`)) return
    run(async () => {
      const r = await axios.post(`${API_URL}/crm/campaigns`, { subject, body, segment, confirm: true })
      setInfo(`Sending to ${r.data.data.total}…`); setSubject(''); setBody(''); await loadList()
    })
  }
  const togglePlan = (p: string) => setSeg(s => ({ ...s, plans: s.plans.includes(p) ? s.plans.filter(x => x !== p) : [...s.plans, p] }))
  const num = (k: 'joinedWithinDays' | 'activeWithinDays' | 'inactiveForDays', label: string) => (
    <label className="block">
      <span className="label">{label}</span>
      <input className={`${input} mt-1`} inputMode="numeric" value={seg[k]} onChange={e => setSeg(s => ({ ...s, [k]: e.target.value.replace(/\D/g, '').slice(0, 4) }))} placeholder="any" />
    </label>
  )

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr] items-start">
        <section className="card p-5 space-y-4">
          <h2 className="font-display text-lg font-bold text-ink">Who gets it</h2>
          <div>
            <span className="label">Plan</span>
            <div className="flex gap-2 mt-1">
              {['free', 'premium', 'pro'].map(p => (
                <button key={p} type="button" onClick={() => togglePlan(p)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold border ${seg.plans.includes(p) ? 'bg-accent text-bg border-accent' : 'border-line text-muted'}`}>{p}</button>
              ))}
            </div>
            <p className="text-[11px] text-faint mt-1">None selected = every plan.</p>
          </div>
          {num('joinedWithinDays', 'Joined in the last … days')}
          {num('activeWithinDays', 'Signed in during the last … days')}
          {num('inactiveForDays', 'No sign-in for … days (win back)')}
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={seg.includeStaff} onChange={e => setSeg(s => ({ ...s, includeStaff: e.target.checked }))} className="w-4 h-4 accent-[rgb(var(--accent))]" />
            Include admin and staff accounts
          </label>
          <div className="rounded-xl bg-surface2/60 border border-line px-3 py-2">
            <div className="num text-2xl font-extrabold text-ink">{preview ? preview.count : '–'}</div>
            <div className="text-[11px] text-muted">people in this segment · {preview?.optedIn ?? '–'} accounts accept update emails in total</div>
            {preview && preview.sample.length > 0 && <div className="text-[11px] text-faint mt-1 truncate">{preview.sample.map(x => x.email).join(', ')}</div>}
          </div>
          <p className="text-[11px] text-faint">Only accounts that ticked "email updates" and confirmed their email. Every email has a one-click unsubscribe link.</p>
        </section>

        <section className="card p-5 space-y-3">
          <h2 className="font-display text-lg font-bold text-ink">Message</h2>
          <input className={input} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" maxLength={150} />
          <textarea className={`${input} min-h-[220px] resize-y`} value={body} onChange={e => setBody(e.target.value)} maxLength={20000}
            placeholder={'Hi {name},\n\nWrite your update here. A blank line starts a new paragraph. **bold** works, links are clickable.\n\nThe SportLikely team'} />
          <p className="text-[11px] text-faint">{'{name}'} is replaced by the person's name (or "there"). Replies go to support@.</p>
          <Err e={error} />
          {info && <div className="rounded-xl border border-win/40 bg-win/10 px-3 py-2 text-sm text-win">{info}</div>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={test} disabled={busy || subject.trim().length < 3 || body.trim().length < 10} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">Send me a test</button>
            <button type="button" onClick={send} disabled={busy || !preview?.count || subject.trim().length < 3 || body.trim().length < 10} className="rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm disabled:opacity-50">
              Send to {preview?.count ?? 0}
            </button>
          </div>
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-line/60 font-display font-bold text-ink">Sent campaigns</div>
        {list.length === 0 ? <p className="p-5 text-sm text-faint">None yet.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] uppercase tracking-wide text-faint text-left"><th className="px-5 py-2">Date</th><th className="px-2 py-2">Subject</th><th className="px-2 py-2 text-right">Sent</th><th className="px-5 py-2 text-right">Status</th></tr></thead>
            <tbody className="divide-y divide-line/50">
              {list.map(c => (
                <tr key={c.id}>
                  <td className="px-5 py-2 text-muted whitespace-nowrap">{fmt(c.createdAt)}</td>
                  <td className="px-2 py-2 text-ink truncate max-w-[280px]">{c.subject}</td>
                  <td className="px-2 py-2 text-right num">{c.sent}/{c.total}{c.failed ? <span className="text-loss"> · {c.failed} failed</span> : ''}</td>
                  <td className="px-5 py-2 text-right text-xs">{c.status === 'sending' ? <span className="text-draw font-semibold">sending…</span> : <span className="text-win">done</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

/* ================================================================== */
/* Revenue & churn                                                    */
/* ================================================================== */

interface Rev {
  accounts: number
  paying: { total: number; premium: number; pro: number; fromPayments: number; testOrManual: number }
  mrr: number; arr: number; prices: Record<string, number>
  conversion: number | null; churnThisMonth: number | null; cancelledStillActive: number
  monthly: { month: string; signups: number; newPaid: number; revenue: number; cancels: number; deletes: number; testChanges: number }[]
  reasons: { reason: string; n: number }[]
  paymentsLive: boolean
}
const REASON: Record<string, string> = {
  too_expensive: 'Too expensive', not_accurate: 'Predictions not accurate enough', not_using: 'Not using it enough',
  missing_feature: 'Missing a feature', other_service: 'Found another service', technical: 'Technical problems', other: 'Other'
}

function Revenue() {
  const [d, setD] = useState<Rev | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { axios.get(`${API_URL}/crm/revenue`).then(r => setD(r.data.data)).catch(e => setError(errorText(e))) }, [])
  if (error) return <Err e={error} />
  if (!d) return <div className="card p-6 text-sm text-faint">Loading…</div>
  const maxSign = Math.max(1, ...d.monthly.map(m => m.signups))
  const tile = (label: string, value: string, sub?: string) => (
    <div className="rounded-2xl border border-line/60 bg-surface2/50 px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</div>
      <div className="num text-2xl font-extrabold text-ink leading-none mt-1.5">{value}</div>
      {sub && <div className="text-[11px] text-muted mt-1">{sub}</div>}
    </div>
  )

  return (
    <div className="space-y-5">
      {!d.paymentsLive && (
        <div className="rounded-xl border border-draw/40 bg-draw/10 px-4 py-3 text-sm text-ink">
          Payments are not live yet: money figures stay at $0 until real payments come in. Plans set by hand or in test mode are counted as accounts, not revenue ({d.paying.testOrManual} now).
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tile('Monthly revenue (MRR)', `$${d.mrr.toLocaleString('en-US')}`, `$${d.arr.toLocaleString('en-US')} a year at this rate`)}
        {tile('Paying accounts', String(d.paying.total), `${d.paying.premium} Premium · ${d.paying.pro} Pro`)}
        {tile('Free → paid', d.conversion !== null ? `${d.conversion}%` : '–', `of ${d.accounts} accounts`)}
        {tile('Churn this month', d.churnThisMonth !== null ? `${d.churnThisMonth}%` : '–', `${d.cancelledStillActive} cancelled, still active`)}
      </div>

      <section className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-line/60 flex items-baseline justify-between gap-3">
          <h2 className="font-display font-bold text-ink">Last 12 months</h2>
          <span className="text-[11px] text-faint">Premium ${d.prices.premium} · Pro ${d.prices.pro} a month</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="text-[11px] uppercase tracking-wide text-faint text-left">
              <th className="px-5 py-2">Month</th><th className="px-2 py-2">Sign-ups</th><th className="px-2 py-2 text-right">New paying</th><th className="px-2 py-2 text-right">Revenue</th><th className="px-2 py-2 text-right">Cancelled</th><th className="px-5 py-2 text-right">Deleted</th>
            </tr></thead>
            <tbody className="divide-y divide-line/50">
              {d.monthly.slice().reverse().map(m => (
                <tr key={m.month}>
                  <td className="px-5 py-2 text-muted num whitespace-nowrap">{new Date(`${m.month}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 text-right num text-ink">{m.signups}</span>
                      <span className="flex-1 max-w-[160px] h-1.5 rounded-full bg-surface2 overflow-hidden"><span className="block h-full bg-accent rounded-full" style={{ width: `${(m.signups / maxSign) * 100}%` }} /></span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right num text-ink">{m.newPaid || '–'}</td>
                  <td className="px-2 py-2 text-right num text-ink">{m.revenue ? `$${m.revenue.toLocaleString('en-US')}` : '–'}</td>
                  <td className={`px-2 py-2 text-right num ${m.cancels ? 'text-loss' : 'text-faint'}`}>{m.cancels || '–'}</td>
                  <td className={`px-5 py-2 text-right num ${m.deletes ? 'text-loss' : 'text-faint'}`}>{m.deletes || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-display font-bold text-ink mb-3">Why people leave (12 months)</h2>
        {d.reasons.length === 0 ? <p className="text-sm text-faint">Nobody has cancelled or deleted an account yet.</p> : (
          <ul className="space-y-2">
            {d.reasons.map(r => {
              const max = d.reasons[0].n
              return (
                <li key={r.reason} className="flex items-center gap-3 text-sm">
                  <span className="w-56 truncate text-ink">{REASON[r.reason] || r.reason}</span>
                  <span className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden"><span className="block h-full bg-loss/80 rounded-full" style={{ width: `${(r.n / max) * 100}%` }} /></span>
                  <span className="w-8 text-right num text-muted">{r.n}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
