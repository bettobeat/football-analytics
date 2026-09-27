import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../lib/socket'
import type { Prediction } from '../lib/predict'
import { isCovered, revealMatch, useRevealState } from '../lib/reveal'
import RecentResults from '../components/RecentResults'

/**
 * League page: /league/<code> (football-data codes like PL, API-Football codes like AF140).
 * Table, upcoming fixtures with our picks, latest results with hit/miss, top scorers & assists, and v3's record here.
 * Everything comes from endpoints the site already has, so it costs almost no extra API calls.
 */

interface Team { id: number; name: string; shortName?: string; tla?: string; crest?: string }
interface Comp { code: string; name: string; emblem?: string; area?: { name?: string; flag?: string } }
interface Match {
  id: number
  utcDate: string
  status: string
  competition: Comp
  homeTeam: Team
  awayTeam: Team
  prediction?: Prediction | null
  predictions?: Prediction[]
}
interface StandingRow {
  position: number
  team: Team
  playedGames: number
  won: number
  draw: number
  lost: number
  goalsFor?: number
  goalsAgainst?: number
  goalDifference: number
  points: number
  form?: string | null
}
interface Scorer {
  player: { id: number; name: string; nationality?: string }
  team: Team
  goals: number | null
  assists: number | null
  penalties: number | null
  playedMatches?: number | null
}
interface Record_ { n: number; hitRate: number | null; market: { n: number; hitRate: number | null } | null }

const MAIN = ['grid-v3', 'elo-intl', 'elo-euro']
const LIVE = new Set(['IN_PLAY', 'PAUSED', 'LIVE'])
const tn = (t: Team) => t.shortName || t.name
const mainPred = (m: Match) => m.predictions?.find(p => MAIN.includes(p.model)) || m.prediction || null
const hasPct = (p: Prediction | null): p is Prediction => !!p && !p.locked && typeof p.home === 'number'
const teamLink = (t: Team, code: string) => `/team/${t.id}?${new URLSearchParams({ c: code, n: t.name }).toString()}`

function Card({ title, action, children, className = '' }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Crest({ team, size = 20 }: { team: Team; size?: number }) {
  return team.crest ? (
    <img src={team.crest} alt="" width={size} height={size} className="object-contain flex-shrink-0" style={{ width: size, height: size }} />
  ) : (
    <span className="rounded-full bg-surface2 flex-shrink-0 grid place-items-center text-[9px] text-faint" style={{ width: size, height: size }}>
      {team.tla || tn(team).slice(0, 2).toUpperCase()}
    </span>
  )
}

const FORM_BG: Record<string, string> = { W: 'bg-win', D: 'bg-draw', L: 'bg-loss' }

export default function League() {
  const { code: raw = '' } = useParams()
  const code = raw.toUpperCase()
  const [comp, setComp] = useState<Comp | null>(null)
  const [tables, setTables] = useState<{ type: string; group?: string | null; table: StandingRow[] }[] | null>(null)
  const [scorers, setScorers] = useState<Scorer[] | null>(null)
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [record, setRecord] = useState<Record_ | null>(null)
  const [leaders, setLeaders] = useState<'goals' | 'assists'>('goals')
  useRevealState()

  useEffect(() => {
    let cancelled = false
    setComp(null)
    setTables(null)
    setScorers(null)
    setMatches(null)
    setRecord(null)
    axios
      .get(`${API_URL}/leagues/${code}/standings`)
      .then(r => {
        if (cancelled) return
        setTables(r.data.data?.standings || [])
        const c = r.data.data?.competition
        if (c?.name) setComp(prev => (prev ? { ...prev, area: prev.area || r.data.data?.area } : { code, name: c.name, emblem: c.emblem, area: r.data.data?.area }))
      })
      .catch(() => !cancelled && setTables([]))
    axios
      .get(`${API_URL}/leagues/${code}/scorers`, { params: { limit: 40 } })
      .then(r => !cancelled && setScorers(r.data.data?.scorers || []))
      .catch(() => !cancelled && setScorers([]))
    axios
      .get(`${API_URL}/matches/upcoming`, { params: { days: 30 } })
      .then(r => {
        if (cancelled) return
        const list = ((r.data.data || []) as Match[]).filter(m => m.competition.code === code)
        setMatches(list)
        if (list[0]) setComp(prev => ({ ...list[0].competition, area: list[0].competition.area || prev?.area }))
      })
      .catch(() => !cancelled && setMatches([]))
    axios
      .get(`${API_URL}/public/results`, { params: { days: 365, competition: code, limit: 1 } })
      .then(r => !cancelled && setRecord(r.data.data?.record || null))
      .catch(() => undefined)
    // name and emblem for competitions with no table and no fixtures right now
    axios
      .get(`${API_URL}/leagues`)
      .then(r => {
        if (cancelled) return
        const c = (r.data.data || []).find((x: any) => String(x.code).toUpperCase() === code)
        if (c) setComp(prev => (prev ? { ...prev, area: prev.area || c.area } : { code, name: c.name, emblem: c.emblem, area: c.area }))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [code])

  useEffect(() => {
    if (comp?.name) document.title = `${comp.name} · Bet To Beat`
  }, [comp])

  const totals = useMemo(() => {
    if (!tables) return []
    const t = tables.filter(x => x.type === 'TOTAL')
    return t.length ? t : tables
  }, [tables])

  const top = useMemo(() => {
    if (!scorers) return []
    const key = leaders === 'goals' ? 'goals' : 'assists'
    const other = leaders === 'goals' ? 'assists' : 'goals'
    return [...scorers].filter(s => (s[key] || 0) > 0).sort((a, b) => (b[key] || 0) - (a[key] || 0) || (b[other] || 0) - (a[other] || 0)).slice(0, 15)
  }, [scorers, leaders])

  const hasForm = totals.some(t => t.table.some(r => r.form))
  const upcoming = (matches || []).filter(m => !LIVE.has(m.status)).slice(0, 12)
  const live = (matches || []).filter(m => LIVE.has(m.status))

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* ---------- header ---------- */}
      <section className="card relative overflow-hidden p-5 sm:p-7">
        <div className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ background: 'radial-gradient(600px 220px at 10% 0%, rgb(var(--accent)), transparent 70%)' }} />
        <div className="relative flex flex-wrap items-center gap-5">
          <span className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/90 grid place-items-center flex-shrink-0 p-2">
            {comp?.emblem ? <img src={comp.emblem} alt="" className="w-full h-full object-contain" /> : <span className="text-2xl">🏆</span>}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-faint">
              {comp?.area?.flag && <img src={comp.area.flag} alt="" className="w-4 h-3 object-cover rounded-[2px]" />}
              <span>{comp?.area?.name || 'League'}</span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink truncate">{comp?.name || code}</h1>
          </div>
          {record && record.hitRate !== null && record.n > 0 && (
            <div className="flex gap-3">
              <div className="glass px-4 py-3 text-center">
                <div className="text-[11px] text-faint">v3 picks right</div>
                <div className="font-display text-2xl font-extrabold text-accent num">{Math.round(record.hitRate)}%</div>
                <div className="text-[10px] text-faint num">{record.n} games · 12 months</div>
              </div>
              {record.market && record.market.hitRate !== null && (
                <div className="glass px-4 py-3 text-center">
                  <div className="text-[11px] text-faint">Bookmakers' favourite</div>
                  <div className="font-display text-2xl font-extrabold text-ink num">{Math.round(record.market.hitRate)}%</div>
                  <div className="text-[10px] text-faint num">{record.market.n} games</div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start">
        {/* ---------- left: table + leaders ---------- */}
        <div className="space-y-6 min-w-0">
          <Card title="Table">
            {!tables ? (
              <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-7 rounded-lg bg-surface2/60 animate-pulse" />)}</div>
            ) : totals.length === 0 ? (
              <p className="text-sm text-faint">No table for this competition (cup or friendlies).</p>
            ) : (
              <div className="space-y-5">
                {totals.map((t, i) => (
                  <div key={i} className="overflow-x-auto">
                    {t.group && totals.length > 1 && <div className="label pb-2">{t.group.replace(/_/g, ' ')}</div>}
                    <table className="w-full text-sm min-w-[520px]">
                      <thead>
                        <tr className="text-[11px] text-faint">
                          <th className="text-left font-medium py-1.5 pl-2 w-8">#</th>
                          <th className="text-left font-medium py-1.5">Team</th>
                          <th className="text-right font-medium py-1.5 num w-9">P</th>
                          <th className="text-right font-medium py-1.5 num w-9">W</th>
                          <th className="text-right font-medium py-1.5 num w-9">D</th>
                          <th className="text-right font-medium py-1.5 num w-9">L</th>
                          <th className="text-right font-medium py-1.5 num w-16 hidden sm:table-cell">Goals</th>
                          <th className="text-right font-medium py-1.5 num w-10">GD</th>
                          <th className="text-right font-medium py-1.5 num w-10 pr-2">Pts</th>
                          {hasForm && <th className="text-center font-medium py-1.5 w-[104px] hidden md:table-cell">Form</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {t.table.map(r => (
                          <tr key={r.team.id} className="border-t border-line/50 hover:bg-surface2/40">
                            <td className="py-2 pl-2 num text-faint">{r.position}</td>
                            <td className="py-2">
                              <Link to={teamLink(r.team, code)} className="flex items-center gap-2 min-w-0 hover:text-accent">
                                <Crest team={r.team} />
                                <span className="truncate font-medium text-ink">{tn(r.team)}</span>
                              </Link>
                            </td>
                            <td className="py-2 text-right num text-muted">{r.playedGames}</td>
                            <td className="py-2 text-right num text-muted">{r.won}</td>
                            <td className="py-2 text-right num text-muted">{r.draw}</td>
                            <td className="py-2 text-right num text-muted">{r.lost}</td>
                            <td className="py-2 text-right num text-muted hidden sm:table-cell">{r.goalsFor ?? '–'}:{r.goalsAgainst ?? '–'}</td>
                            <td className={`py-2 text-right num ${r.goalDifference > 0 ? 'text-win' : r.goalDifference < 0 ? 'text-loss' : 'text-muted'}`}>
                              {r.goalDifference > 0 ? '+' : ''}
                              {r.goalDifference}
                            </td>
                            <td className="py-2 pr-2 text-right num font-bold text-ink">{r.points}</td>
                            {hasForm && <td className="py-2 hidden md:table-cell">
                              <span className="flex justify-center gap-1">
                                {String(r.form || '')
                                  .split(/[,\s]*/)
                                  .filter(x => FORM_BG[x])
                                  .slice(-5)
                                  .map((x, j) => (
                                    <span key={j} className={`w-4 h-4 rounded-[4px] grid place-items-center text-[9px] font-extrabold text-bg ${FORM_BG[x]}`}>{x}</span>
                                  ))}
                              </span>
                            </td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            title={leaders === 'goals' ? 'Top scorers' : 'Top assists'}
            action={
              <div className="seg">
                {(['goals', 'assists'] as const).map(k => (
                  <button key={k} onClick={() => setLeaders(k)} className={`seg-btn ${leaders === k ? 'seg-btn-active' : ''}`}>
                    {k === 'goals' ? 'Goals' : 'Assists'}
                  </button>
                ))}
              </div>
            }
          >
            {!scorers ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 rounded-lg bg-surface2/60 animate-pulse" />)}</div>
            ) : top.length === 0 ? (
              <p className="text-sm text-faint">No data yet this season.</p>
            ) : (
              <ol className="space-y-1">
                {top.map((s, i) => {
                  const v = leaders === 'goals' ? s.goals || 0 : s.assists || 0
                  const max = leaders === 'goals' ? top[0].goals || 1 : top[0].assists || 1
                  return (
                    <li key={s.player.id} className="flex items-center gap-3 py-1.5">
                      <span className="w-5 text-xs num text-faint text-right">{i + 1}</span>
                      <Crest team={s.team} size={22} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink truncate">{s.player.name}</span>
                        <span className="block h-1.5 mt-1 rounded-full bg-surface2">
                          <span className="block h-full rounded-full bg-accent" style={{ width: `${(v / max) * 100}%` }} />
                        </span>
                      </span>
                      <span className="text-[11px] text-faint w-28 truncate text-right hidden sm:block">{tn(s.team)}</span>
                      <span className="font-display font-bold text-ink num w-6 text-right">{v}</span>
                    </li>
                  )
                })}
                {leaders === 'assists' && <li className="text-[10px] text-faint pt-1">Assists among the league's top-40 scorers list.</li>}
              </ol>
            )}
          </Card>
        </div>

        {/* ---------- right: fixtures, results ---------- */}
        <div className="space-y-6 min-w-0">
          {live.length > 0 && (
            <Card title="Live now">
              <ul className="space-y-1">
                {live.map(m => (
                  <li key={m.id}>
                    <Link to={`/match/${m.id}`} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-surface2/60 text-sm">
                      <span className="w-2 h-2 rounded-full bg-live animate-pulseDot" />
                      <span className="truncate flex-1 font-semibold">{tn(m.homeTeam)} – {tn(m.awayTeam)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Next fixtures" action={<Link to={`/matches?league=${code}`} className="text-xs font-bold text-accent">All →</Link>}>
            {!matches ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 rounded-xl bg-surface2/60 animate-pulse" />)}</div>
            ) : upcoming.length === 0 ? (
              <p className="text-sm text-faint">No fixtures in the next 30 days.</p>
            ) : (
              <ul className="max-h-[430px] overflow-y-auto overscroll-contain pr-1 space-y-1">
                {upcoming.map(m => (
                  <li key={m.id}>
                    <FixtureRow m={m} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <section className="card p-3">
            <RecentResults code={code} limit={50} days={120} compact large listClass="max-h-[430px] overflow-y-auto overscroll-contain pr-1" />
          </section>
        </div>
      </div>
    </div>
  )
}

function FixtureRow({ m }: { m: Match }) {
  const p = mainPred(m)
  const pct = hasPct(p)
  const covered = pct && isCovered(m.id, m.status, true)
  const k = p ? p.pick || (pct ? (p.home >= p.draw && p.home >= p.away ? 'H' : p.away >= p.draw ? 'A' : 'D') : null) : null
  const name = k === 'H' ? tn(m.homeTeam) : k === 'A' ? tn(m.awayTeam) : k === 'D' ? 'Draw' : null
  const color = k === 'H' ? 'text-home' : k === 'A' ? 'text-away' : 'text-draw'
  const val = pct && k ? (k === 'H' ? p.home : k === 'A' ? p.away : p.draw) : null
  return (
    <Link to={`/match/${m.id}`} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-surface2/60 transition-colors">
      <span className="w-12 flex-shrink-0 text-center">
        <span className="block text-[10px] text-faint">{new Date(m.utcDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}</span>
        <span className="block text-xs font-bold text-ink num">{new Date(m.utcDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-center gap-2 text-sm"><Crest team={m.homeTeam} size={16} /><span className="truncate text-ink">{tn(m.homeTeam)}</span></span>
        <span className="flex items-center gap-2 text-sm"><Crest team={m.awayTeam} size={16} /><span className="truncate text-ink">{tn(m.awayTeam)}</span></span>
      </span>
      <span className="flex-shrink-0 text-right w-24">
        {covered ? (
          <button
            onClick={e => {
              e.preventDefault()
              revealMatch(m.id)
            }}
            className="text-[11px] font-bold text-bg bg-accent px-2.5 py-1 rounded-full"
          >
            Reveal
          </button>
        ) : name ? (
          <>
            <span className="block text-[10px] text-faint">Pick</span>
            <span className={`block text-xs font-bold truncate ${color}`}>
              {name}
              {val !== null && <span className="num"> {Math.round(val)}%</span>}
            </span>
          </>
        ) : (
          <span className="text-[11px] text-faint">–</span>
        )}
      </span>
    </Link>
  )
}
