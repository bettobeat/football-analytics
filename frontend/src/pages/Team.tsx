import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../lib/socket'
import { errorText, useAuth } from '../lib/auth'

interface Side { id: number; name: string; logo: string }
interface Fixture { matchId: number | null; date: string; status: string; comp: string; home: Side; away: Side; hg: number | null; ag: number | null }
interface Player {
  id: number; name: string; number: number | null; pos: string; age: number | null; photo: string | null
  apps?: number | null; minutes?: number | null; goals?: number | null; assists?: number | null; yellow?: number | null; red?: number | null; rating?: number | null
}
interface Row { rank: number; id: number; name: string; logo: string; played: number; gd: number; points: number; me: boolean }
interface TeamData {
  team: { id: number; name: string; logo: string; country: string; founded: number | null; national: boolean }
  venue: { name: string; city: string; capacity: number } | null
  league: { name: string; logo: string; season: number } | null
  standing: { rank: number; points: number; played: number; won: number; drawn: number; lost: number; gf: number; ga: number; rows: Row[] } | null
  form: ('W' | 'D' | 'L')[]
  last: Fixture[]
  next: Fixture[]
  squad: Player[]
  scorers: { name: string; value: number; detail?: string }[]
  assists: { name: string; value: number; detail?: string }[]
  premium: boolean
  locked?: string[]
  builtAt?: string
  stale?: boolean
}

const FORM_BG = { W: 'bg-win', D: 'bg-draw', L: 'bg-loss' }
const POS_LABEL: Record<string, string> = { Goalkeeper: 'Goalkeepers', Defender: 'Defenders', Midfielder: 'Midfielders', Attacker: 'Forwards' }
const DONE = new Set(['FT', 'AET', 'PEN'])

function Card({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 sm:p-6 ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-display text-base sm:text-lg font-bold text-ink">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

function Pro() {
  return <span className="text-[10px] font-extrabold text-bg bg-accent px-1.5 py-0.5 rounded-full">PRO</span>
}

function FixtureRow({ f, teamId }: { f: Fixture; teamId: number }) {
  const done = DONE.has(f.status) && f.hg !== null
  const mine = f.home.id === teamId ? (f.hg ?? 0) - (f.ag ?? 0) : (f.ag ?? 0) - (f.hg ?? 0)
  const res = !done ? null : mine > 0 ? 'W' : mine < 0 ? 'L' : 'D'
  const body = (
    <div className="flex items-center gap-3 py-2.5 border-b border-line/50 last:border-0">
      <span className="w-14 text-[11px] text-faint">{new Date(f.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
      <span className="flex-1 min-w-0 flex flex-col gap-1">
        <span className="flex items-center gap-2 text-sm"><img src={f.home.logo} alt="" className="w-4 h-4 object-contain" /><span className={`truncate ${f.home.id === teamId ? 'font-bold text-ink' : 'text-muted'}`}>{f.home.name}</span></span>
        <span className="flex items-center gap-2 text-sm"><img src={f.away.logo} alt="" className="w-4 h-4 object-contain" /><span className={`truncate ${f.away.id === teamId ? 'font-bold text-ink' : 'text-muted'}`}>{f.away.name}</span></span>
      </span>
      <span className="text-[11px] text-faint hidden sm:block w-40 truncate text-right">{f.comp}</span>
      {done ? (
        <span className="flex items-center gap-2">
          <span className="font-display font-bold text-sm num">{f.hg}–{f.ag}</span>
          <span className={`w-6 h-6 rounded-md grid place-items-center text-[11px] font-extrabold text-bg ${FORM_BG[res!]}`}>{res}</span>
        </span>
      ) : (
        <span className="text-xs text-muted whitespace-nowrap">{new Date(f.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
      )}
    </div>
  )
  return f.matchId ? <Link to={`/match/${f.matchId}`} className="block hover:bg-surface2/40 rounded-lg">{body}</Link> : body
}

function Leaders({ items, label }: { items: { name: string; value: number; detail?: string }[]; label: string }) {
  const max = Math.max(1, ...items.map(i => i.value))
  if (!items.length) return <p className="text-sm text-faint">No {label} yet this season.</p>
  return (
    <div className="space-y-2.5">
      {items.map((s, i) => (
        <div key={s.name} className="flex items-center gap-3">
          <span className="w-5 font-display text-sm font-bold text-faint">{i + 1}</span>
          <span className="flex-1 min-w-0">
            <span className="block truncate text-sm font-semibold">{s.name}</span>
            {s.detail && <span className="block truncate text-[11px] text-faint">{s.detail}</span>}
          </span>
          <span className="w-24 sm:w-32 h-2 rounded-full bg-surface2"><span className="block h-full rounded-full bg-accent" style={{ width: `${(s.value / max) * 100}%` }} /></span>
          <span className="w-6 text-right font-display font-extrabold text-sm">{s.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function Team() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const { access } = useAuth()
  const [data, setData] = useState<TeamData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData(null)
    setError(null)
    axios
      .get(`${API_URL}/team-page/${id}`, { params: { c: sp.get('c') || undefined, n: sp.get('n') || undefined } })
      .then(r => setData(r.data.data))
      .catch(e => setError(
        e?.response?.status === 404 ? "We couldn't find this team yet."
          : /budget/i.test(e?.response?.data?.message || '') ? "This team page isn't available right now — our data provider's daily limit has been reached. It comes back automatically after 03:00 (Israel time)."
          : errorText(e)))
  }, [id, sp, access])

  useEffect(() => {
    if (data) document.title = `${data.team.name} · Bet To Beat`
  }, [data])

  const groups = useMemo(() => {
    const g: Record<string, Player[]> = {}
    for (const p of data?.squad || []) (g[p.pos] ||= []).push(p)
    return Object.entries(g)
  }, [data])

  if (error) return <div className="max-w-5xl mx-auto px-4 py-16 text-center text-muted">{error}</div>
  if (!data)
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-5">
        <div className="card h-48 animate-pulse" />
        <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]"><div className="card h-96 animate-pulse" /><div className="card h-96 animate-pulse" /></div>
      </div>
    )

  const { team, standing } = data
  const full = data.premium
  const nextMatch = data.next[0]
  const rows = standing ? (() => {
    const i = standing.rows.findIndex(r => r.me)
    const from = Math.max(0, Math.min(i - 3, standing.rows.length - 7))
    return standing.rows.slice(from, from + 7)
  })() : []

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
      {/* banner */}
      <section className="relative overflow-hidden rounded-[28px] border border-line/70 p-6 sm:p-9 bg-[radial-gradient(640px_320px_at_90%_0%,rgb(var(--home)/0.25),transparent_65%),linear-gradient(150deg,#13203D,#0A0E16)] text-[#EEF1F6] flex flex-col sm:flex-row sm:items-center gap-6">
        <img src={team.logo} alt="" className="w-20 h-20 sm:w-28 sm:h-28 object-contain drop-shadow-lg" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#9AA3B2]">{team.national ? 'National team' : data.league ? `${data.league.name} · ${team.country}` : team.country}</div>
          <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight">{team.name}</h1>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-[#C9D0DB]">
            {standing && <span>{standing.rank}{['th', 'st', 'nd', 'rd'][standing.rank % 10 > 3 || [11, 12, 13].includes(standing.rank % 100) ? 0 : standing.rank % 10]} in the table · {standing.points} pts</span>}
            {data.venue && <span>{data.venue.name}{data.venue.capacity ? ` · ${data.venue.capacity.toLocaleString('en-GB')}` : ''}</span>}
            {team.founded && <span>Founded {team.founded}</span>}
          </div>
          {data.builtAt && (
            <div className="text-[11px] text-[#9AA3B2]">
              {(() => {
                const m = Math.max(1, Math.round((Date.now() - new Date(data.builtAt!).getTime()) / 60000))
                return `Updated ${m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`} ago`
              })()}
              {data.stale ? ' · live data paused (daily data limit reached), refreshes after 03:00' : ' · results and table refresh every 15 minutes'}
            </div>
          )}
        </div>
        {data.form.length > 0 && (
          <div className="flex flex-col sm:items-end gap-2">
            <span className="text-xs font-bold text-[#9AA3B2]">Form, last {data.form.length}</span>
            <div className="flex gap-1.5">
              {[...data.form].reverse().map((r, i) => (
                <span key={i} className={`w-8 h-8 rounded-lg grid place-items-center font-display text-xs font-extrabold text-[#07090D] ${FORM_BG[r]}`}>{r}</span>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-5 min-w-0">
          {/* AI analysis */}
          <section className="rounded-3xl p-6 border border-accent/30 bg-[linear-gradient(160deg,rgb(var(--accent)/0.09),rgb(var(--surface)/0.6))] space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-bold">AI analysis: where the team stands</h2>
              <span className="text-[11px] font-extrabold text-bg bg-accent px-2.5 py-1 rounded-full">Premium</span>
            </div>
            <p className="text-sm text-muted leading-relaxed">
              {full
                ? 'Coming soon: a daily written analysis of the team: form and why, attack and defence, injuries, and what v3 expects next.'
                : 'Premium members will get a daily written analysis of the team: form and why, attack and defence, injuries, and what v3 expects next.'}
            </p>
            {!full && <Link to="/premium" className="inline-block text-sm font-bold text-accent">See Premium →</Link>}
          </section>

          {nextMatch && (
            <Card title="Next match" action={<span className="text-xs text-faint">{nextMatch.comp}</span>}>
              <div className="flex items-center gap-4">
                <div className="flex-1 flex items-center gap-3 min-w-0"><img src={nextMatch.home.logo} alt="" className="w-9 h-9 object-contain" /><span className="font-bold truncate">{nextMatch.home.name}</span></div>
                <div className="text-center">
                  <div className="font-display font-bold text-sm">{new Date(nextMatch.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                  <div className="text-xs text-faint">{new Date(nextMatch.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <div className="flex-1 flex items-center justify-end gap-3 min-w-0"><span className="font-bold truncate text-right">{nextMatch.away.name}</span><img src={nextMatch.away.logo} alt="" className="w-9 h-9 object-contain" /></div>
              </div>
              {nextMatch.matchId && <Link to={`/match/${nextMatch.matchId}`} className="mt-4 inline-block text-sm font-bold text-accent">v3 prediction and analysis →</Link>}
            </Card>
          )}

          {/* squad */}
          <Card title="Squad" action={<span className="text-xs text-faint">{data.league ? `${data.league.season}-${String(data.league.season + 1).slice(2)} · official games, friendlies excluded` : ''}</span>}>
            {groups.length === 0 && <p className="text-sm text-faint">No squad list available.</p>}
            <div className="space-y-5">
              {groups.map(([pos, players]) => (
                <div key={pos}>
                  <div className="label mb-2">{POS_LABEL[pos] || pos}</div>
                  <div className="overflow-x-auto -mx-2">
                    <table className="w-full text-sm min-w-[520px]">
                      <thead>
                        <tr className="text-[11px] text-faint text-left">
                          <th className="font-medium px-2 py-1 w-10">#</th>
                          <th className="font-medium px-2 py-1">Player</th>
                          <th className="font-medium px-2 py-1 text-right w-12">Age</th>
                          <th className="font-medium px-2 py-1 text-right w-14">{full ? 'Apps' : <Pro />}</th>
                          <th className="font-medium px-2 py-1 text-right w-14">Goals</th>
                          <th className="font-medium px-2 py-1 text-right w-14">{full ? 'Assists' : <Pro />}</th>
                          <th className="font-medium px-2 py-1 text-right w-14">{full ? 'Rating' : <Pro />}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {players.map(p => (
                          <tr key={p.id} className="border-t border-line/40">
                            <td className="px-2 py-2 font-display text-xs font-bold text-faint">{p.number ?? ''}</td>
                            <td className="px-2 py-2">
                              <span className="flex items-center gap-2.5">
                                {p.photo ? <img src={p.photo} alt="" className="w-7 h-7 rounded-full object-cover bg-surface2" loading="lazy" /> : <span className="w-7 h-7 rounded-full bg-surface2" />}
                                <span className="font-semibold text-ink truncate">{p.name}</span>
                              </span>
                            </td>
                            <td className="px-2 py-2 text-right text-muted num">{p.age ?? ''}</td>
                            <td className="px-2 py-2 text-right num">{full ? p.apps ?? '–' : <span className="text-faint">·</span>}</td>
                            <td className="px-2 py-2 text-right num font-semibold">{p.goals ?? '–'}</td>
                            <td className="px-2 py-2 text-right num">{full ? p.assists ?? '–' : <span className="text-faint">·</span>}</td>
                            <td className={`px-2 py-2 text-right num font-bold ${full && p.rating ? (p.rating >= 7.3 ? 'text-win' : p.rating >= 6.9 ? 'text-accent' : 'text-draw') : 'text-faint'}`}>{full ? p.rating ?? '–' : '·'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
            {!full && data.locked && (
              <div className="mt-5 rounded-2xl bg-surface2/60 p-4 text-sm text-muted">
                <span className="font-semibold text-ink">Premium adds:</span> {data.locked.join(' · ')}. <Link to="/premium" className="font-bold text-accent">Go Premium →</Link>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5 min-w-0">
          {standing && (
            <Card title="Season in numbers">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Played', standing.played],
                  ['Points per game', standing.played ? (standing.points / standing.played).toFixed(2) : '–'],
                  ['Goals scored', standing.gf],
                  ['Goals conceded', standing.ga],
                  ['Won · drawn · lost', `${standing.won} · ${standing.drawn} · ${standing.lost}`],
                  ['Goal difference', standing.gf - standing.ga > 0 ? `+${standing.gf - standing.ga}` : standing.gf - standing.ga]
                ].map(([k, v]) => (
                  <div key={String(k)} className="rounded-2xl bg-surface2/60 p-3.5">
                    <div className="text-[11px] text-faint">{k}</div>
                    <div className="font-display font-extrabold text-xl mt-1">{v}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card title="Top scorers" action={!full ? <span className="text-[11px] text-faint">Top 3 · <Link to="/premium" className="text-accent font-bold">all</Link></span> : undefined}>
            <Leaders items={data.scorers} label="goals" />
          </Card>

          <Card title="Top assists" action={!full ? <Pro /> : undefined}>
            {full ? <Leaders items={data.assists} label="assists" /> : <p className="text-sm text-muted">Assists for every player are part of <Link to="/premium" className="font-bold text-accent">Premium</Link>.</p>}
          </Card>

          {rows.length > 0 && data.league && (
            <Card title={data.league.name} action={<img src={data.league.logo} alt="" className="w-6 h-6 object-contain" />}>
              <table className="w-full text-sm">
                <thead><tr className="text-[11px] text-faint"><th className="text-left font-medium py-1 w-8">#</th><th className="text-left font-medium py-1">Team</th><th className="text-right font-medium py-1 w-10">P</th><th className="text-right font-medium py-1 w-12">GD</th><th className="text-right font-medium py-1 w-12">Pts</th></tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className={`border-t border-line/40 ${r.me ? 'bg-accent/10' : ''}`}>
                      <td className="py-2 pl-1 font-display text-xs font-bold text-faint">{r.rank}</td>
                      <td className="py-2"><Link to={`/team/${r.id}`} className="flex items-center gap-2 min-w-0"><img src={r.logo} alt="" className="w-5 h-5 object-contain" /><span className={`truncate ${r.me ? 'font-bold text-ink' : 'text-muted hover:text-ink'}`}>{r.name}</span></Link></td>
                      <td className="py-2 text-right num text-muted">{r.played}</td>
                      <td className="py-2 text-right num text-muted">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                      <td className="py-2 pr-1 text-right num font-bold">{r.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <Card title="Results and fixtures">
            {data.next.slice(0, 3).map(f => <FixtureRow key={`n${f.date}`} f={f} teamId={team.id} />)}
            {data.last.slice(0, 8).map(f => <FixtureRow key={`l${f.date}`} f={f} teamId={team.id} />)}
          </Card>
        </div>
      </div>
    </div>
  )
}
