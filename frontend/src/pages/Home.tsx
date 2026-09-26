import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { API_URL, socket } from '../lib/socket'
import { drawAlert, type Market, type Prediction } from '../lib/predict'
import { useAuth } from '../lib/auth'

interface Team { id: number; name: string; shortName?: string; tla?: string; crest?: string }
interface Match {
  id: number
  utcDate: string
  status: string
  minute?: number | string | null
  competition: { code: string; name: string; emblem?: string; rank?: number }
  homeTeam: Team
  awayTeam: Team
  score?: { fullTime?: { home: number | null; away: number | null } }
  prediction?: Prediction | null
  predictions?: Prediction[]
  market?: Market | null
}
interface Summary {
  days: number
  v3: { games: number; hitRate: number | null; strong60: { n: number; hitRate: number | null } | null }
  bookmakers: { games: number; hitRate: number | null }
  drawAlerts: { seasons: { label: string; alerts: number; hitRate: number; roi: number; drawRate: number }[]; upcoming: number } | null
}
interface News { title: string; link: string; source: string; published: string | null; summary: string; image?: string | null }
interface Alert { matchId: number; league: string; date: string; home: string; away: string; marketDraw: number; ourDraw: number; price: number; edge: number }

const LIVE = new Set(['IN_PLAY', 'PAUSED', 'LIVE'])
const MAIN = ['grid-v3', 'elo-intl', 'elo-euro']
const tn = (t: Team) => t.shortName || t.name
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const ago = (iso: string | null) => {
  if (!iso) return ''
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

/** Our main prediction for a match: v3 (leagues), v3 national-team engine, v3 European-cup engine, else what the match carries. */
function mainPred(m: Match): Prediction | null {
  return m.predictions?.find(p => MAIN.includes(p.model)) || m.prediction || null
}
const hasPct = (p: Prediction | null): p is Prediction => !!p && !p.locked && typeof p.home === 'number'
const pickName = (m: Match, p: Prediction | null) => {
  const k = p?.pick || (hasPct(p) ? (p.home >= p.draw && p.home >= p.away ? 'H' : p.away >= p.draw ? 'A' : 'D') : null)
  return k === 'H' ? tn(m.homeTeam) : k === 'A' ? tn(m.awayTeam) : k === 'D' ? 'Draw' : null
}
const topPct = (p: Prediction) => Math.max(p.home, p.draw, p.away)
const MAJOR = /champions league|world cup|euro(pean championship)?\b|nations league|copa am[eé]rica|europa league|conference league/i
/** Lower = bigger stage: Champions League, the top leagues, major national-team / European competitions, then the rest. */
function priority(m: Match) {
  if (m.competition.code === 'CL') return 0
  if ((m.competition.rank ?? 9) <= 1) return 1
  if (MAJOR.test(m.competition.name) && !/qualif/i.test(m.competition.name)) return 2
  if (MAJOR.test(m.competition.name)) return 3
  return 5
}

/** Big featured match: the two crests, blown up and blurred, paint the background in the teams' own colours. */
function FeaturedHero({ m, p }: { m: Match | null; p: Prediction | null }) {
  if (!m)
    return (
      <div className="relative overflow-hidden rounded-[32px] border border-white/10 min-h-[360px] sm:min-h-[460px] bg-[linear-gradient(160deg,#0F1A2B_0%,#0A0F17_60%,#07090D_100%)] p-10 flex flex-col justify-center gap-3 text-[#EEF1F6]">
        <div className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.05]">Football predictions,<br />tested against the bookmakers.</div>
        <p className="text-[#C9D0DB] max-w-lg">The next fixtures appear here as soon as they are scheduled.</p>
      </div>
    )
  const k = p ? (p.pick || (hasPct(p) ? (p.home >= p.draw && p.home >= p.away ? 'H' : p.away >= p.draw ? 'A' : 'D') : null)) : null
  const side = (t: Team) => (
    <Link to={`/team/${t.id}?c=${m.competition.code}&n=${encodeURIComponent(t.name)}`} className="group flex flex-col items-center gap-3 sm:gap-4 min-w-0">
      <span className="relative grid place-items-center w-24 h-24 sm:w-36 sm:h-36 rounded-full bg-white/[0.06] border border-white/10 backdrop-blur-md shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] transition-transform group-hover:scale-[1.04]">
        <Crest team={t} size={72} />
      </span>
      <span className="font-display font-extrabold text-lg sm:text-3xl tracking-tight text-center leading-tight max-w-full break-words">{tn(t)}</span>
    </Link>
  )
  const pill = (o: 'H' | 'D' | 'A', label: string, v: number) => (
    <div className={`glass px-3 py-2.5 sm:px-4 text-center ${k === o ? 'ring-2 ring-[#C8FF3D]/70' : ''}`}>
      <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9AA3B2] truncate">{label}</div>
      <div className={`font-display font-extrabold text-xl sm:text-2xl ${k === o ? 'text-[#C8FF3D]' : 'text-white'}`}>{Math.round(v)}%</div>
    </div>
  )
  return (
    <div className="relative overflow-hidden rounded-[32px] border border-white/10 min-h-[420px] sm:min-h-[480px] bg-[#0A0E15] text-[#EEF1F6] isolate">
      {/* team colours */}
      {m.homeTeam.crest && <img src={m.homeTeam.crest} alt="" aria-hidden className="absolute -z-10 -left-24 top-1/2 -translate-y-1/2 w-[560px] h-[560px] object-contain blur-[80px] opacity-50 saturate-150" />}
      {m.awayTeam.crest && <img src={m.awayTeam.crest} alt="" aria-hidden className="absolute -z-10 -right-24 top-1/2 -translate-y-1/2 w-[560px] h-[560px] object-contain blur-[80px] opacity-50 saturate-150" />}
      {/* floodlights + pitch in perspective */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(600px_260px_at_50%_-60px,rgba(255,255,255,0.16),transparent_70%),linear-gradient(to_bottom,rgba(7,9,13,0.1),rgba(7,9,13,0.75))]" />
      <svg aria-hidden viewBox="0 0 1000 400" preserveAspectRatio="none" className="absolute -z-10 left-[-10%] w-[120%] bottom-0 h-[55%] opacity-30" style={{ transform: 'perspective(600px) rotateX(55deg)', transformOrigin: 'bottom' }}>
        <g fill="none" stroke="#C8FF3D" strokeWidth="2">
          <rect x="20" y="10" width="960" height="380" />
          <line x1="500" y1="10" x2="500" y2="390" />
          <circle cx="500" cy="200" r="70" />
          <rect x="20" y="110" width="140" height="180" />
          <rect x="840" y="110" width="140" height="180" />
        </g>
      </svg>

      <div className="relative h-full p-5 sm:p-9 flex flex-col gap-6 sm:gap-8">
        <div className="flex flex-wrap items-center justify-center sm:justify-between gap-2">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#07090D] bg-[#C8FF3D] px-3 py-1.5 rounded-full">Featured match</span>
          <span className="glass !rounded-full inline-flex items-center gap-2 px-3 py-1.5 text-xs sm:text-sm text-[#C9D0DB]">
            {m.competition.emblem && <img src={m.competition.emblem} alt="" width={16} height={16} className="w-4 h-4 object-contain" />}
            {m.competition.name}
          </span>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6 flex-1">
          {side(m.homeTeam)}
          <div className="flex flex-col items-center gap-2">
            <span className="font-display font-extrabold text-3xl sm:text-6xl text-white/90 tracking-tight">VS</span>
            <span className="text-xs sm:text-sm font-bold text-white">{new Date(m.utcDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
            <span className="text-[11px] sm:text-xs text-[#9AA3B2]">{new Date(m.utcDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          </div>
          {side(m.awayTeam)}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
          <div className="flex-1 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9AA3B2] text-center sm:text-left">v3 prediction</div>
            {hasPct(p) ? (
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {pill('H', tn(m.homeTeam), p.home)}
                {pill('D', 'Draw', p.draw)}
                {pill('A', tn(m.awayTeam), p.away)}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-sm">
                <span className="glass !rounded-full px-4 py-2 font-semibold">v3 pick: <span className="text-[#C8FF3D]">{pickName(m, p) || '–'}</span></span>
                <Link to="/premium" className="inline-flex items-center gap-1.5 text-[#C8FF3D] font-semibold"><Lock /> See the %</Link>
              </div>
            )}
          </div>
          <Link to={`/match/${m.id}`} className="h-12 px-7 inline-flex items-center justify-center rounded-2xl bg-[#C8FF3D] text-[#07090D] font-extrabold shadow-[0_10px_30px_-10px_rgba(200,255,61,0.6)] hover:brightness-105">
            Full analysis
          </Link>
        </div>
      </div>
    </div>
  )
}

function Crest({ team, size = 28 }: { team: Team; size?: number }) {
  return team.crest ? (
    <img src={team.crest} alt="" width={size} height={size} className="object-contain flex-shrink-0" style={{ width: size, height: size }} />
  ) : (
    <span className="rounded-full bg-surface2 grid place-items-center text-[10px] font-display font-bold text-muted flex-shrink-0" style={{ width: size, height: size }}>
      {(team.tla || team.name).slice(0, 3).toUpperCase()}
    </span>
  )
}

function Lock() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg sm:text-xl font-bold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export default function Home() {
  const { access } = useAuth()
  const full = access === 'premium' || access === 'admin'
  const [upcoming, setUpcoming] = useState<Match[]>([])
  const [live, setLive] = useState<Match[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [news, setNews] = useState<News[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])

  useEffect(() => {
    axios.get(`${API_URL}/matches/upcoming`, { params: { days: 14 } }).then(r => setUpcoming(r.data.data || [])).catch(() => undefined)
    axios.get(`${API_URL}/matches/live`).then(r => setLive(r.data.data || [])).catch(() => undefined)
    axios.get(`${API_URL}/public/summary`).then(r => setSummary(r.data.data)).catch(() => undefined)
    axios.get(`${API_URL}/news`, { params: { limit: 10 } }).then(r => setNews(r.data.data || [])).catch(() => undefined)
    const onLive = (msg: { data: Match[] }) => setLive(msg.data || [])
    socket.on('matches:live', onLive)
    return () => { socket.off('matches:live', onLive) }
  }, [access])

  useEffect(() => {
    if (!full) { setAlerts([]); return }
    axios.get(`${API_URL}/draw-alerts`).then(r => setAlerts(r.data.data.upcoming || [])).catch(() => undefined)
  }, [full])

  const notStarted = useMemo(() => upcoming.filter(m => !LIVE.has(m.status) && new Date(m.utcDate).getTime() > Date.now()), [upcoming])

  // featured: the biggest competition playing in the next week (Champions League > top leagues > major national-team
  // competitions > the rest); premium = v3's most confident pick there, free = the next one
  const featured = useMemo(() => {
    const week = notStarted.filter(m => new Date(m.utcDate).getTime() < Date.now() + 7 * 86400000 && mainPred(m))
    if (!week.length) return null
    const best = Math.min(...week.map(priority))
    const pool = week.filter(m => priority(m) === best)
    if (full) return [...pool].filter(m => hasPct(mainPred(m))).sort((a, b) => topPct(mainPred(b)!) - topPct(mainPred(a)!))[0] || pool[0]
    return pool[0]
  }, [notStarted, full])

  const soonest = useMemo(() => notStarted.filter(m => m.id !== featured?.id).sort((a, b) => priority(a) - priority(b) || a.utcDate.localeCompare(b.utcDate)).slice(0, 5)
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate)), [notStarted, featured])

  const next = useMemo(() => {
    const ranked = [...notStarted].sort((a, b) => ((a.competition.rank ?? 9) <= 1 ? 0 : 1) - ((b.competition.rank ?? 9) <= 1 ? 0 : 1) || a.utcDate.localeCompare(b.utcDate))
    return ranked.filter(m => m.id !== featured?.id).slice(0, 10).sort((a, b) => a.utcDate.localeCompare(b.utcDate))
  }, [notStarted, featured])

  const strong = useMemo(
    () => (full ? notStarted.map(m => ({ m, p: mainPred(m) })).filter(x => hasPct(x.p) && topPct(x.p!) >= 60).sort((a, b) => topPct(b.p!) - topPct(a.p!)).slice(0, 4) : []),
    [notStarted, full]
  )

  const liveMain = live[0]
  const fp = featured ? mainPred(featured) : null

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-10">
      {/* ---------- hero: featured match (team colours from the crests) + live / next kick-offs ---------- */}
      <div className="grid gap-5 lg:grid-cols-[1.75fr_1fr]">
        <FeaturedHero m={featured} p={fp} />

        <div className="card p-5 sm:p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">{live.length ? 'Live now' : 'Next kick-offs'}</h2>
            <span className={`inline-flex items-center gap-2 text-xs font-bold px-3 py-1 rounded-full ${live.length ? 'text-live bg-live/10' : 'text-faint bg-surface2/70'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${live.length ? 'bg-live animate-pulseDot' : 'bg-faint'}`} />
              {live.length ? `${live.length} live` : 'No live games'}
            </span>
          </div>
          {liveMain ? (
            <>
              <Link to={`/match/${liveMain.id}`} className="glass p-4 space-y-3 hover:bg-white/10 transition-colors">
                <div className="text-xs text-faint text-center truncate">{liveMain.competition.name}</div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <div className="flex flex-col items-center gap-2 min-w-0"><Crest team={liveMain.homeTeam} size={52} /><span className="text-sm font-bold truncate max-w-full">{tn(liveMain.homeTeam)}</span></div>
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="font-display font-extrabold text-4xl">{liveMain.score?.fullTime?.home ?? 0} – {liveMain.score?.fullTime?.away ?? 0}</span>
                    <span className="text-xs font-extrabold text-bg bg-win px-2.5 py-0.5 rounded-full">{liveMain.minute ? `${liveMain.minute}'` : 'Live'}</span>
                  </div>
                  <div className="flex flex-col items-center gap-2 min-w-0"><Crest team={liveMain.awayTeam} size={52} /><span className="text-sm font-bold truncate max-w-full">{tn(liveMain.awayTeam)}</span></div>
                </div>
                <div className="text-center text-xs text-muted">Live stats, lineups and events →</div>
              </Link>
              <div className="space-y-1">
                {live.slice(1, 6).map(m => (
                  <Link key={m.id} to={`/match/${m.id}`} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-surface2/60 text-sm">
                    <span className="text-[11px] font-bold text-win w-8">{m.minute ? `${m.minute}'` : 'Live'}</span>
                    <span className="truncate flex-1">{tn(m.homeTeam)} – {tn(m.awayTeam)}</span>
                    <b className="font-display">{m.score?.fullTime?.home ?? 0}–{m.score?.fullTime?.away ?? 0}</b>
                  </Link>
                ))}
                {live.length > 6 && <Link to="/matches" className="block px-2 pt-1 text-sm font-semibold text-accent">All {live.length} live games →</Link>}
              </div>
            </>
          ) : soonest.length ? (
            <div className="flex flex-col gap-1.5">
              {soonest.map(m => (
                <Link key={m.id} to={`/match/${m.id}`} className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-surface2/60 transition-colors">
                  <div className="flex -space-x-2 flex-shrink-0">
                    <span className="rounded-full bg-surface2 p-1 ring-2 ring-surface"><Crest team={m.homeTeam} size={24} /></span>
                    <span className="rounded-full bg-surface2 p-1 ring-2 ring-surface"><Crest team={m.awayTeam} size={24} /></span>
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold truncate">{tn(m.homeTeam)} – {tn(m.awayTeam)}</span>
                    <span className="block text-[11px] text-faint truncate">{m.competition.name}</span>
                  </span>
                  <span className="text-right flex-shrink-0">
                    <span className="block text-xs font-bold text-ink">{new Date(m.utcDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="block text-[11px] text-faint">{new Date(m.utcDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  </span>
                </Link>
              ))}
              <Link to="/matches" className="mt-1 px-2 text-sm font-bold text-accent">All matches →</Link>
            </div>
          ) : (
            <div className="flex-1 grid place-items-center text-center text-sm text-muted py-6">No games scheduled yet.</div>
          )}
        </div>
      </div>

      {/* ---------- next matches ---------- */}
      {next.length > 0 && (
        <Section title="Next matches" action={<Link to="/matches" className="text-sm font-bold text-accent">All matches →</Link>}>
          <div className="rail flex gap-3.5 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x">
            {next.map(m => {
              const p = mainPred(m)
              const pct = hasPct(p)
              const da = pct && m.market ? drawAlert(p, m.market, m.competition.code) : null
              const strongPick = pct && topPct(p) >= 60
              const k = p ? (p.pick || (pct ? (p.home >= p.draw && p.home >= p.away ? 'H' : p.away >= p.draw ? 'A' : 'D') : null)) : null
              return (
                <Link key={m.id} to={`/match/${m.id}`} className="card card-hover snap-start flex-shrink-0 w-[272px] p-4 flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 min-w-0 text-[11px] text-faint">
                      {m.competition.emblem && <img src={m.competition.emblem} alt="" width={14} height={14} className="w-3.5 h-3.5 object-contain" />}
                      <span className="truncate">{m.competition.name}</span>
                    </span>
                    <span className="text-[11px] font-bold text-ink bg-surface2/80 px-2 py-0.5 rounded-full whitespace-nowrap">
                      {new Date(m.utcDate).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-3"><Crest team={m.homeTeam} size={32} /><span className="font-bold truncate">{tn(m.homeTeam)}</span></div>
                    <div className="flex items-center gap-3"><Crest team={m.awayTeam} size={32} /><span className="font-bold truncate">{tn(m.awayTeam)}</span></div>
                  </div>
                  {pct ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-1.5 text-center">
                        {(['H', 'D', 'A'] as const).map(o => (
                          <span key={o} className={`rounded-xl py-1.5 text-xs font-bold num ${k === o ? (o === 'H' ? 'bg-home/20 text-home' : o === 'D' ? 'bg-draw/20 text-draw' : 'bg-away/20 text-away') : 'bg-surface2/70 text-muted'}`}>
                            <span className="block text-[10px] font-semibold opacity-80">{o === 'H' ? '1' : o === 'D' ? 'X' : '2'}</span>
                            {Math.round(o === 'H' ? p.home : o === 'D' ? p.draw : p.away)}%
                          </span>
                        ))}
                      </div>
                      {da ? <span className="inline-block text-[11px] font-extrabold text-bg bg-draw px-2 py-0.5 rounded-full">Draw alert</span>
                        : strongPick ? <span className="inline-block text-[11px] font-extrabold text-bg bg-accent px-2 py-0.5 rounded-full">Strong pick</span> : null}
                    </div>
                  ) : p ? (
                    <div className="flex items-center justify-between text-xs rounded-xl bg-surface2/70 px-3 py-2">
                      <span className="text-muted">v3 pick: <b className="text-ink">{pickName(m, p)}</b></span>
                      <span className="text-faint inline-flex items-center gap-1"><Lock /> %</span>
                    </div>
                  ) : (
                    <div className="text-xs text-faint">No prediction yet</div>
                  )}
                </Link>
              )
            })}
          </div>
        </Section>
      )}

      {/* ---------- proof · draw alerts · strong picks ---------- */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-3xl p-6 border border-accent/30 bg-[linear-gradient(160deg,rgb(var(--accent)/0.10),rgb(var(--surface)/0.6))] flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold">v3 vs the bookmakers</h2>
            {summary && <span className="text-xs text-muted">{summary.v3.games} games · {summary.days} days</span>}
          </div>
          {summary && summary.v3.hitRate !== null ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex justify-between font-bold"><span>v3</span><span className="font-display text-accent">{summary.v3.hitRate}%</span></div>
                <div className="h-2.5 rounded-full bg-surface2"><div className="h-full rounded-full bg-accent" style={{ width: `${summary.v3.hitRate}%` }} /></div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between font-bold text-muted"><span>Bookmakers' favourite</span><span className="font-display">{summary.bookmakers.hitRate ?? '–'}%</span></div>
                <div className="h-2.5 rounded-full bg-surface2"><div className="h-full rounded-full bg-faint" style={{ width: `${summary.bookmakers.hitRate ?? 0}%` }} /></div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted">Loading the record…</div>
          )}
          <p className="text-sm text-muted leading-relaxed">Picks right, every game counted. Each prediction is saved before kick-off and never edited.</p>
          <Link to="/accuracy" className="mt-auto text-sm font-bold text-accent">See the full record →</Link>
        </div>

        <div className="card p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold">Draw alerts</h2>
            {summary?.drawAlerts?.seasons?.[0] && (
              <span className="text-[11px] font-extrabold text-bg bg-draw px-2.5 py-1 rounded-full">
                {summary.drawAlerts.seasons[0].roi > 0 ? '+' : ''}{summary.drawAlerts.seasons[0].roi} per 100 in {summary.drawAlerts.seasons[0].label}
              </span>
            )}
          </div>
          {full ? (
            alerts.length ? (
              alerts.slice(0, 3).map(a => (
                <Link key={a.matchId} to={`/match/${a.matchId}`} className="rounded-2xl p-4 bg-draw/10 border border-draw/25 space-y-2 hover:bg-draw/15 transition-colors">
                  <div className="flex justify-between text-[11px] text-faint"><span>{a.league}</span><span>{when(a.date)}</span></div>
                  <div className="font-extrabold">{a.home} – {a.away}</div>
                  <div className="flex flex-wrap gap-x-4 text-xs text-muted"><span>Bookmakers <b className="text-ink">{a.marketDraw}%</b></span><span>Ours <b className="text-draw">{a.ourDraw}%</b></span><span>Value <b className="text-win">+{a.edge}%</b></span></div>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted">No alerts right now. They appear when v3 sees a draw the bookmakers underrate.</p>
            )
          ) : (
            <div className="rounded-2xl p-4 bg-surface2/60 space-y-2">
              <div className="flex items-center gap-2 font-bold"><Lock /> {summary?.drawAlerts ? `${summary.drawAlerts.upcoming} alert${summary.drawAlerts.upcoming === 1 ? '' : 's'} right now` : 'Draw alerts'}</div>
              <p className="text-sm text-muted">Draws the bookmakers underrate, flagged before kick-off. Draws on alerts: {summary?.drawAlerts?.seasons?.map(s => `${s.hitRate}% (${s.label})`).join(', ') || '–'}.</p>
            </div>
          )}
          <Link to={full ? '/draw-alerts' : '/premium'} className="mt-auto text-sm font-bold text-accent">{full ? 'All draw alerts →' : 'Unlock draw alerts →'}</Link>
        </div>

        <div className="card p-6 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold">Strong picks</h2>
            {summary?.v3.strong60?.hitRate != null && <span className="text-xs text-muted">60%+ right {Math.round(summary.v3.strong60.hitRate)}% of the time</span>}
          </div>
          {full ? (
            strong.length ? (
              strong.map(({ m, p }) => (
                <Link key={m.id} to={`/match/${m.id}`} className="flex items-center gap-3.5 py-2.5 border-b border-line/50 last:border-0">
                  <span className="w-12 h-12 rounded-full grid place-items-center flex-shrink-0" style={{ background: `conic-gradient(rgb(var(--accent)) ${topPct(p!)}%, rgb(var(--surface-2)) 0)` }}>
                    <span className="w-9 h-9 rounded-full bg-surface grid place-items-center font-display font-extrabold text-xs">{Math.round(topPct(p!))}%</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-extrabold truncate">{pickName(m, p)}{pickName(m, p) === 'Draw' ? '' : ' to win'}</span>
                    <span className="block text-xs text-muted truncate">{tn(m.homeTeam)} – {tn(m.awayTeam)} · {new Date(m.utcDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  </span>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted">No 60%+ picks in the next two weeks yet.</p>
            )
          ) : (
            <div className="rounded-2xl p-4 bg-surface2/60 space-y-2">
              <div className="flex items-center gap-2 font-bold"><Lock /> v3's most confident picks</div>
              <p className="text-sm text-muted">Every match where v3 gives one result 60% or more, with the full percentages.</p>
            </div>
          )}
          {!full && <Link to="/premium" className="mt-auto text-sm font-bold text-accent">Unlock strong picks →</Link>}
        </div>
      </div>

      {/* ---------- news + premium ---------- */}
      <div className={`grid gap-5 ${full ? '' : 'xl:grid-cols-[2.4fr_1fr]'}`}>
        <Section title="Around the world">
          {news.length ? (
            <div className="grid gap-4 md:grid-cols-[1.25fr_1fr]">
              {(() => {
                const lead = news.find(n => n.image) || news[0]
                const rest = news.filter(n => n !== lead).slice(0, full ? 6 : 5)
                return (
                  <>
                    <a href={lead.link} target="_blank" rel="noreferrer" className="card card-hover overflow-hidden flex flex-col">
                      {lead.image && (
                        <span className="relative block aspect-[16/9] bg-surface2 overflow-hidden">
                          <img src={lead.image} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }} />
                          <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                          <span className="absolute left-4 bottom-3 text-[11px] font-extrabold uppercase tracking-wide text-[#C8FF3D]">{lead.source}</span>
                        </span>
                      )}
                      <span className="p-5 flex flex-col gap-2 flex-1">
                        {!lead.image && <span className="text-[11px] font-extrabold uppercase tracking-wide text-accent">{lead.source}</span>}
                        <span className="font-display text-lg sm:text-xl font-bold leading-snug text-ink">{lead.title}</span>
                        {lead.summary && <span className="text-sm text-muted line-clamp-3">{lead.summary}</span>}
                        <span className="mt-auto pt-2 text-[11px] text-faint">{lead.published ? `${ago(lead.published)} · ` : ''}opens {lead.source}</span>
                      </span>
                    </a>
                    <div className="card p-2 flex flex-col">
                      {rest.map(n => (
                        <a key={n.link} href={n.link} target="_blank" rel="noreferrer" className="flex gap-3 p-2.5 rounded-2xl hover:bg-surface2/60 transition-colors">
                          <span className="w-24 h-16 sm:w-28 sm:h-[72px] rounded-xl overflow-hidden bg-surface2 flex-shrink-0 grid place-items-center">
                            {n.image ? (
                              <img src={n.image} alt="" loading="lazy" className="w-full h-full object-cover" onError={e => { e.currentTarget.style.display = 'none' }} />
                            ) : (
                              <span className="text-[10px] font-extrabold uppercase tracking-wide text-faint px-1 text-center">{n.source}</span>
                            )}
                          </span>
                          <span className="min-w-0 flex flex-col gap-1">
                            <span className="text-sm font-bold leading-snug text-ink line-clamp-2">{n.title}</span>
                            <span className="text-[11px] text-faint">{n.source}{n.published ? ` · ${ago(n.published)}` : ''}</span>
                          </span>
                        </a>
                      ))}
                    </div>
                  </>
                )
              })()}
            </div>
          ) : (
            <div className="card p-6 text-sm text-muted">Loading the latest football news…</div>
          )}
        </Section>
        {!full && (
          <div className="rounded-3xl p-7 border border-home/40 bg-[linear-gradient(150deg,#1B2A55_0%,#101624_70%)] text-[#EEF1F6] flex flex-col gap-4 self-start">
            <span className="self-start text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#07090D] bg-[#C8FF3D] px-3 py-1 rounded-full">Premium</span>
            <h2 className="font-display text-2xl font-bold leading-tight">See the numbers behind every pick</h2>
            <p className="text-sm text-[#C9D0DB] leading-relaxed">Full percentages, the v3 breakdown, draw alerts, strong picks, team analysis and the complete track record.</p>
            <Link to="/premium" className="h-12 rounded-2xl bg-[#C8FF3D] text-[#07090D] font-extrabold grid place-items-center">Go Premium</Link>
          </div>
        )}
      </div>
    </div>
  )
}
