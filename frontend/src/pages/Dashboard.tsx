import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { API_URL, socket } from '../lib/socket'
import { bookLabel, pickOfPrediction, type Market, type Prediction } from '../lib/predict'

interface Team {
  id: number
  name: string
  shortName?: string
  tla?: string
  crest?: string
}

interface Competition {
  id: number
  name: string
  code: string
  emblem?: string
  type?: string // NATIONAL / CUP / LEAGUE (extra competitions from API-Football)
  rank?: number // 0 = core leagues, 1 = European cups, 2 = more leagues, 3 = national teams
}

const GROUP_TITLE: Record<number, string> = { 0: 'Top leagues', 1: 'European cups', 2: 'More leagues', 3: 'National teams' }

interface APIMatch {
  id: number
  utcDate: string
  status: string
  matchday?: number
  stage?: string
  competition: Competition
  homeTeam: Team
  awayTeam: Team
  score?: {
    winner?: string | null
    fullTime?: { home: number | null; away: number | null }
    halfTime?: { home: number | null; away: number | null }
  }
  prediction?: Prediction | null
  market?: Market | null
}

type Pick = 'H' | 'D' | 'A'

const LIVE = new Set(['IN_PLAY', 'PAUSED'])
const DAY_OPTIONS = [3, 7, 14, 30]
const PICK_COLOR: Record<Pick, string> = { H: 'text-home', D: 'text-draw', A: 'text-away' }
const PICK_BG: Record<Pick, string> = { H: 'bg-home', D: 'bg-draw', A: 'bg-away' }
const PICK_VAR: Record<Pick, string> = { H: '--home', D: '--draw', A: '--away' }

function dayKey(iso: string) {
  const d = new Date(iso)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function dayLabel(ts: number) {
  const today = dayKey(new Date().toISOString())
  const diff = Math.round((ts - today) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return new Date(ts).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
}

function kickoff(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function pickOf(p: Prediction): Pick {
  return pickOfPrediction(p)
}

/** Free / signed-out view of a prediction: the pick, blurred bars, and what Premium adds. */
function LockedPick({ match, p, pick, big }: { match: APIMatch; p: Prediction; pick: Pick; big?: boolean }) {
  const name = pick === 'H' ? match.homeTeam.shortName || match.homeTeam.name : pick === 'A' ? match.awayTeam.shortName || match.awayTeam.name : 'Draw'
  return (
    <div className="relative">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="label whitespace-nowrap">Model pick</span>
        <span className={`font-display font-bold truncate ${big ? '' : 'text-sm'} ${PICK_COLOR[pick]}`}>{name}</span>
      </div>
      <div className={`flex ${big ? 'h-2.5' : 'h-2'} gap-[3px] blur-[1.5px] opacity-50`} aria-hidden>
        {(['H', 'D', 'A'] as Pick[]).map(k => (
          <div key={k} className={`${pick === k ? PICK_BG[k] : 'bg-faint/40'} rounded-full`} style={{ width: pick === k ? 'calc(46% - 3px)' : 'calc(27% - 3px)' }} />
        ))}
      </div>
      {match.market && <MarketRow p={p} m={match.market} pick={pick} />}
      <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-faint">
        <span className="inline-flex items-center gap-1">
          <LockIcon /> Win % and value with Premium
        </span>
        {p.confidence && <ConfidenceTag c={p.confidence} />}
      </div>
    </div>
  )
}

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

// "Big club" ranking for the Spotlight — global recognition, not current form.
const FAME: [RegExp, number][] = [
  [/real madrid|barcelona|manchester united|liverpool|manchester city|bayern|paris saint|juventus|chelsea|arsenal/i, 10],
  [/\bac milan|internazionale|atl[ée]tico de madrid|borussia dortmund|tottenham/i, 9],
  [/napoli|as roma|ajax|benfica|fc porto|sporting clube de portugal|sevilla|leverkusen|marseille|lyonnais|newcastle|aston villa|lazio|atalanta/i, 7],
  [/villarreal|real sociedad|athletic club|leipzig|psv|feyenoord|west ham|everton|monaco|lille|fiorentina|real betis|valencia|eintracht frankfurt|m[öo]nchengladbach|leeds|nottingham|bologna|stuttgart|braga/i, 5],
  [/girona|brighton|wolverhampton|torino|celta|wolfsburg|schalke|hamburger|werder|k[öo]ln|union berlin|nice|lens|rennes|strasbourg|crystal palace|fulham|brentford|bournemouth|getafe|osasuna|udinese|genoa|parma|freiburg|hoffenheim|mainz|augsburg|toulouse|nantes|twente|az|utrecht|vit[óo]ria|guimar/i, 3]
]
function fame(t: Team) {
  const n = `${t.name} ${t.shortName || ''}`
  for (const [re, score] of FAME) if (re.test(n)) return score
  return 1
}

function Dashboard() {
  const [matches, setMatches] = useState<APIMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(7)
  // League menu categories: Top leagues open by default; remembered in this browser
  const [openGroups, setOpenGroups] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem('b2b-league-groups')
      if (saved) return new Set(JSON.parse(saved) as number[])
    } catch {
      /* storage unavailable */
    }
    return new Set([0])
  })
  const toggleGroup = (g: number) =>
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      try {
        localStorage.setItem('b2b-league-groups', JSON.stringify([...next]))
      } catch {
        /* storage unavailable */
      }
      return next
    })
  const [league, setLeague] = useState<string>('ALL')

  useEffect(() => {
    let cancelled = false
    const load = (initial: boolean) => {
      if (initial) setLoading(true)
      axios
        .get(`${API_URL}/matches/upcoming`, { params: { days: 30 } })
        .then(res => {
          if (cancelled) return
          setMatches(res.data.data || [])
          setError(null)
        })
        .catch(err => {
          if (!cancelled && initial) setError(err.response?.data?.message || err.message)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }
    load(true)
    const timer = setInterval(() => load(false), 5 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const onLive = (payload: { data: APIMatch[] }) => {
      const live = new Map(payload.data.map(m => [m.id, m]))
      if (live.size === 0) return
      setMatches(prev => prev.map(m => live.get(m.id) || m))
    }
    socket.on('matches:live', onLive)
    return () => {
      socket.off('matches:live', onLive)
    }
  }, [])

  const competitions = useMemo(() => {
    const map = new Map<string, Competition>()
    matches.forEach(m => map.set(m.competition.code, m.competition))
    return Array.from(map.values())
      .map(c => ({ ...c, rank: c.rank ?? (c.code === 'CL' ? 1 : 0) }))
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || a.name.localeCompare(b.name))
  }, [matches])

  const visible = useMemo(() => {
    const cutoff = Date.now() + days * 86400000
    return matches.filter(
      m => new Date(m.utcDate).getTime() <= cutoff && (league === 'ALL' || m.competition.code === league)
    )
  }, [matches, league, days])

  const live = matches.filter(m => LIVE.has(m.status)) // all leagues, always
  const upcoming = visible.filter(m => !LIVE.has(m.status))

  // Spotlight: the three biggest games of the coming days — big clubs first, then model strength
  const spotlight = useMemo(() => {
    const soon = Date.now() + 4 * 86400000
    return upcoming
      .filter(m => new Date(m.utcDate).getTime() <= soon)
      .map(m => {
        const fh = fame(m.homeTeam)
        const fa = fame(m.awayTeam)
        // the biggest club decides, the opponent adds a little; model strength only breaks ties
        const f = Math.max(fh, fa) + 0.4 * Math.min(fh, fa)
        const s = m.prediction?.factors ? (m.prediction.factors.homeAttack + m.prediction.factors.awayAttack) / 20 : 0
        return { m, s: f + s }
      })
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map(x => x.m)
  }, [upcoming])
  const spotlightIds = useMemo(() => new Set(spotlight.map(m => m.id)), [spotlight])

  // Day lists never repeat a Spotlight match
  const grouped = useMemo(() => {
    const groups = new Map<number, APIMatch[]>()
    upcoming
      .filter(m => !spotlightIds.has(m.id))
      .forEach(m => {
        const k = dayKey(m.utcDate)
        groups.set(k, [...(groups.get(k) || []), m])
      })
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0])
  }, [upcoming, spotlightIds])

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 lg:py-8">
      <div className={`grid grid-cols-1 gap-6 lg:gap-8 items-start ${league === 'ALL' ? 'lg:grid-cols-[250px_1fr]' : 'lg:grid-cols-[250px_1fr] xl:grid-cols-[250px_1fr_320px]'}`}>
        {/* ---------- Sidebar ---------- */}
        <aside className="lg:sticky lg:top-20 space-y-6">
          {/* Live */}
          <section className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-bold text-ink flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${live.length ? 'bg-live animate-pulseDot' : 'bg-faint'}`} />
                Live
              </h2>
              <span className="num text-xs text-faint">{live.length}</span>
            </div>
            {live.length === 0 ? (
              <p className="text-xs text-faint">No matches in play right now.</p>
            ) : (
              <ul className="space-y-1">
                {live.map(m => (
                  <li key={m.id}>
                    <LiveRow match={m} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Leagues */}
          <section className="card p-2">
            <div className="px-2 pt-2 pb-1 label">Leagues</div>
            <ul className="space-y-0.5">
              <li>
                <button onClick={() => setLeague('ALL')} className={`side-item ${league === 'ALL' ? 'side-item-active' : ''}`}>
                  <span className="w-5 h-5 rounded-md bg-surface2 grid place-items-center text-[10px] font-bold text-muted">★</span>
                  All leagues
                  <span className="ml-auto num text-xs text-faint">{matches.length}</span>
                </button>
              </li>
              {[0, 1, 2, 3].map(g => {
                const list = competitions.filter(c => (c.rank ?? 0) === g)
                if (!list.length) return null
                const total = list.reduce((s, c) => s + matches.filter(m => m.competition.code === c.code).length, 0)
                const hasActive = list.some(c => c.code === league)
                const open = openGroups.has(g) || hasActive
                return (
                  <li key={`g${g}`}>
                    <button
                      onClick={() => toggleGroup(g)}
                      className="w-full flex items-center gap-2 px-2 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-faint hover:text-muted transition-colors"
                      aria-expanded={open}
                    >
                      <span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
                      {GROUP_TITLE[g]}
                      <span className="ml-auto num normal-case tracking-normal font-medium">{total}</span>
                    </button>
                    {open && (
                      <ul className="space-y-0.5">
                        {list.map(c => {
                          const n = matches.filter(m => m.competition.code === c.code).length
                          return (
                            <li key={c.code}>
                              <button onClick={() => setLeague(c.code)} className={`side-item ${league === c.code ? 'side-item-active' : ''}`}>
                                {c.emblem ? (
                                  <img src={c.emblem} alt="" className="w-5 h-5 object-contain" />
                                ) : (
                                  <span className="w-5 h-5 rounded-md bg-surface2" />
                                )}
                                <span className="truncate">{c.name}</span>
                                <span className="ml-auto num text-xs text-faint">{n}</span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        </aside>

        {/* ---------- Main ---------- */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
            <div>
              <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">
                {league === 'ALL' ? 'Matches' : competitions.find(c => c.code === league)?.name || 'Matches'}
              </h1>
              <p className="mt-1 text-sm text-muted">
                <span className="num text-ink font-semibold">{upcoming.length}</span> fixtures in the next {days} days
              </p>
            </div>
            <div className="seg">
              {DAY_OPTIONS.map(d => (
                <button key={d} onClick={() => setDays(d)} className={`seg-btn ${days === d ? 'seg-btn-active' : ''}`}>
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="card h-44 animate-pulse bg-surface2/60" />
              ))}
            </div>
          )}

          {error && <div className="card p-5 border-loss/40 text-loss">Failed to load matches: {error}</div>}

          {!loading && !error && upcoming.length === 0 && (
            <div className="card p-12 text-center text-muted">No matches for this selection.</div>
          )}

          {/* Spotlight */}
          {!loading && spotlight.length > 0 && (
            <section className="mb-10">
              <SectionTitle label="Spotlight" sub="the biggest games of the coming days" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {spotlight.map(m => (
                  <SpotlightCard key={m.id} match={m} />
                ))}
              </div>
            </section>
          )}

          {/* By day */}
          {!loading &&
            grouped.map(([ts, dayMatches]) => (
              <section key={ts} className="mb-10">
                <SectionTitle label={dayLabel(ts)} count={dayMatches.length} sticky />
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {dayMatches.map((m, i) => (
                    <MatchCard key={m.id} match={m} delay={i} />
                  ))}
                </div>
              </section>
            ))}
        </div>

        {/* ---------- League panel ---------- */}
        {league !== 'ALL' && <LeaguePanel code={league} />}
      </div>
    </div>
  )
}

/* ---------- league panel: table, scorers, assists ---------- */

interface StandingRow {
  position: number
  team: Team
  playedGames: number
  won: number
  draw: number
  lost: number
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

function LeaguePanel({ code }: { code: string }) {
  const [tables, setTables] = useState<{ type: string; group?: string | null; table: StandingRow[] }[]>([])
  const [scorers, setScorers] = useState<Scorer[]>([])
  const [tab, setTab] = useState<'table' | 'scorers' | 'assists'>('table')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    Promise.all([axios.get(`${API_URL}/leagues/${code}/standings`), axios.get(`${API_URL}/leagues/${code}/scorers`, { params: { limit: 40 } })])
      .then(([st, sc]) => {
        if (cancelled) return
        setTables(st.data.data?.standings || [])
        setScorers(sc.data.data?.scorers || [])
      })
      .catch(err => !cancelled && setError(err.response?.data?.message || err.message))
    return () => {
      cancelled = true
    }
  }, [code])

  const totals = tables.filter(t => t.type === 'TOTAL')
  const topScorers = [...scorers].sort((a, b) => (b.goals || 0) - (a.goals || 0) || (b.assists || 0) - (a.assists || 0)).slice(0, 15)
  const topAssists = [...scorers].filter(s => (s.assists || 0) > 0).sort((a, b) => (b.assists || 0) - (a.assists || 0) || (b.goals || 0) - (a.goals || 0)).slice(0, 15)

  return (
    <aside className="xl:sticky xl:top-20 space-y-4">
      <div className="seg w-full">
        {(['table', 'scorers', 'assists'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`seg-btn flex-1 ${tab === t ? 'seg-btn-active' : ''}`}>
            {t === 'table' ? 'Table' : t === 'scorers' ? 'Scorers' : 'Assists'}
          </button>
        ))}
      </div>

      {error && <div className="card p-4 text-xs text-loss">{error}</div>}

      {tab === 'table' &&
        (totals.length ? totals : tables).map((t, i) => (
          <section key={i} className="card p-3">
            {t.group && <div className="label px-1 pb-2">{t.group.replace(/_/g, ' ')}</div>}
            <table className="w-full text-xs">
              <thead>
                <tr className="text-faint">
                  <th className="text-left font-medium py-1 pl-1 w-6">#</th>
                  <th className="text-left font-medium py-1">Team</th>
                  <th className="text-right font-medium py-1 num">P</th>
                  <th className="text-right font-medium py-1 num">GD</th>
                  <th className="text-right font-medium py-1 pr-1 num">Pts</th>
                </tr>
              </thead>
              <tbody>
                {t.table.map(r => (
                  <tr key={r.team.id} className="border-t border-line/50">
                    <td className="py-1.5 pl-1 num text-faint">{r.position}</td>
                    <td className="py-1.5">
                      <span className="flex items-center gap-2 min-w-0">
                        <Crest team={r.team} size={16} />
                        <span className="truncate text-ink">{r.team.shortName || r.team.name}</span>
                      </span>
                    </td>
                    <td className="py-1.5 text-right num text-muted">{r.playedGames}</td>
                    <td className={`py-1.5 text-right num ${r.goalDifference > 0 ? 'text-win' : r.goalDifference < 0 ? 'text-loss' : 'text-muted'}`}>
                      {r.goalDifference > 0 ? '+' : ''}
                      {r.goalDifference}
                    </td>
                    <td className="py-1.5 pr-1 text-right num font-bold text-ink">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

      {tab !== 'table' && (
        <section className="card p-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-faint">
                <th className="text-left font-medium py-1 pl-1 w-6">#</th>
                <th className="text-left font-medium py-1">Player</th>
                <th className="text-right font-medium py-1 num">{tab === 'scorers' ? 'G' : 'A'}</th>
                <th className="text-right font-medium py-1 pr-1 num">{tab === 'scorers' ? 'A' : 'G'}</th>
              </tr>
            </thead>
            <tbody>
              {(tab === 'scorers' ? topScorers : topAssists).map((sc, i) => (
                <tr key={sc.player.id} className="border-t border-line/50">
                  <td className="py-1.5 pl-1 num text-faint">{i + 1}</td>
                  <td className="py-1.5">
                    <span className="flex items-center gap-2 min-w-0">
                      <Crest team={sc.team} size={16} />
                      <span className="min-w-0">
                        <span className="block truncate text-ink">{sc.player.name}</span>
                        <span className="block truncate text-[10px] text-faint">{sc.team.shortName || sc.team.name}</span>
                      </span>
                    </span>
                  </td>
                  <td className="py-1.5 text-right num font-bold text-ink">{tab === 'scorers' ? sc.goals ?? 0 : sc.assists ?? 0}</td>
                  <td className="py-1.5 pr-1 text-right num text-muted">{tab === 'scorers' ? sc.assists ?? 0 : sc.goals ?? 0}</td>
                </tr>
              ))}
              {(tab === 'scorers' ? topScorers : topAssists).length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-faint">No data yet this season.</td>
                </tr>
              )}
            </tbody>
          </table>
          {tab === 'assists' && <p className="text-[10px] text-faint mt-2 px-1">Assists from the top-40 scorers list.</p>}
        </section>
      )}
    </aside>
  )
}

/* ---------- pieces ---------- */

function SectionTitle({
  label,
  sub,
  count,
  accent,
  sticky
}: {
  label: string
  sub?: string
  count?: number
  accent?: 'live'
  sticky?: boolean
}) {
  return (
    <div className={`flex items-baseline gap-3 mb-3 ${sticky ? 'sticky top-[113px] sm:top-16 z-30 py-2 -my-2 bg-bg/90 backdrop-blur' : ''}`}>
      <h2 className={`font-display text-lg font-bold tracking-tight ${accent === 'live' ? 'text-live' : 'text-ink'}`}>
        {accent === 'live' && <span className="inline-block w-2 h-2 rounded-full bg-live animate-pulseDot mr-2 align-middle" />}
        {label}
      </h2>
      {count !== undefined && <span className="num text-xs text-faint">{count} matches</span>}
      {sub && <span className="text-xs text-faint">{sub}</span>}
    </div>
  )
}

function LiveRow({ match }: { match: APIMatch }) {
  const ft = match.score?.fullTime
  return (
    <Link to={`/match/${match.id}`} className="block rounded-xl px-2 py-2 hover:bg-surface2 transition-colors">
      <div className="flex items-center justify-between text-[10px] text-faint mb-1">
        <span className="truncate">{match.competition.name}</span>
        <span className="font-bold text-live tracking-wider">{match.status === 'PAUSED' ? 'HT' : 'LIVE'}</span>
      </div>
      {[match.homeTeam, match.awayTeam].map((t, i) => (
        <div key={t.id} className="flex items-center justify-between gap-2 py-0.5">
          <span className="flex items-center gap-2 min-w-0">
            <Crest team={t} size={18} />
            <span className="text-sm font-medium text-ink truncate">{t.shortName || t.name}</span>
          </span>
          <span className="num text-sm font-bold text-ink">{i === 0 ? ft?.home ?? 0 : ft?.away ?? 0}</span>
        </div>
      ))}
    </Link>
  )
}

function Crest({ team, size = 32 }: { team: Team; size?: number }) {
  return team.crest ? (
    <img src={team.crest} alt="" width={size} height={size} className="object-contain flex-shrink-0 drop-shadow-sm" style={{ width: size, height: size }} />
  ) : (
    <span className="rounded-full bg-surface2 flex-shrink-0 grid place-items-center text-[10px] text-faint" style={{ width: size, height: size }}>
      {team.tla || '?'}
    </span>
  )
}

function ProbBar({ p, pick, height = 'h-2' }: { p: Prediction; pick: Pick; height?: string }) {
  const seg = (k: Pick, v: number) => (
    <div
      className={`${PICK_BG[k]} rounded-full transition-all ${pick === k ? 'opacity-100' : 'opacity-35'}`}
      style={{ width: `calc(${v}% - 3px)` }}
    />
  )
  return (
    <div className={`flex ${height} gap-[3px]`}>
      {seg('H', p.home)}
      {seg('D', p.draw)}
      {seg('A', p.away)}
    </div>
  )
}

function ProbRow({ p, pick, big }: { p: Prediction; pick: Pick; big?: boolean }) {
  const cell = (k: Pick, v: number, label: string) => (
    <div className={`flex items-baseline gap-1.5 ${pick === k ? PICK_COLOR[k] : 'text-faint'}`}>
      <span className={`text-[11px] font-semibold ${pick === k ? '' : 'text-faint'}`}>{label}</span>
      <span className={`num font-semibold ${big ? 'text-xl' : 'text-sm'}`}>{Math.round(v)}%</span>
    </div>
  )
  return (
    <div className="flex justify-between">
      {cell('H', p.home, '1')}
      {cell('D', p.draw, 'X')}
      {cell('A', p.away, '2')}
    </div>
  )
}

function ConfidenceTag({ c }: { c: Prediction['confidence'] }) {
  const cls = c === 'high' ? 'text-win border-win/30 bg-win/10' : c === 'medium' ? 'text-muted border-line' : 'text-draw border-draw/30 bg-draw/10'
  return <span className={`px-1.5 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wider ${cls}`}>{c}</span>
}

/** Bookmaker line under the model: thin bar + margin-free percentages, and how far the model sits from it. */
function MarketRow({ p, m, pick }: { p: Prediction; m: Market; pick: Pick }) {
  const modelPick = pick === 'H' ? p.home : pick === 'D' ? p.draw : p.away
  const marketPick = pick === 'H' ? m.probs.home : pick === 'D' ? m.probs.draw : m.probs.away
  const delta = p.locked ? null : modelPick - marketPick
  const seg = (v: number) => <div className="rounded-full bg-faint/50" style={{ width: `calc(${v}% - 3px)` }} />
  return (
    <div className="mt-2">
      <div className="flex h-1 gap-[3px]">
        {seg(m.probs.home)}
        {seg(m.probs.draw)}
        {seg(m.probs.away)}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-faint">
        <span className="num">
          <span className="font-semibold mr-1.5">{bookLabel(m)}</span>
          {Math.round(m.probs.home)} · {Math.round(m.probs.draw)} · {Math.round(m.probs.away)}
        </span>
        {delta !== null && (
          <span className={`num ${Math.abs(delta) >= 5 ? 'text-ink font-semibold' : ''}`} title="Model minus market on the pick">
            {delta >= 0 ? '+' : ''}
            {delta.toFixed(1)} pp
          </span>
        )}
      </div>
    </div>
  )
}

function MatchCard({ match, delay = 0 }: { match: APIMatch; delay?: number }) {
  const isLive = LIVE.has(match.status)
  const p = match.prediction
  const pick = p ? pickOf(p) : null
  const ft = match.score?.fullTime

  return (
    <Link
      to={`/match/${match.id}`}
      className={`card card-hover relative overflow-hidden p-4 block animate-rise ${isLive ? 'shadow-glow border-live/40' : ''}`}
      style={{ animationDelay: `${Math.min(delay, 8) * 40}ms` }}
    >
      {/* favourite tint */}
      {pick && (
        <div
          className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-[0.14] blur-2xl"
          style={{ background: `rgb(var(${PICK_VAR[pick]}))` }}
        />
      )}

      <div className="relative flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-xs text-muted min-w-0">
          {match.competition.emblem && <img src={match.competition.emblem} alt="" className="w-4 h-4 object-contain" />}
          <span className="truncate">{match.competition.name}</span>
          {match.matchday && <span className="text-faint">· MD {match.matchday}</span>}
        </div>
        {isLive ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-live tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulseDot" />
            {match.status === 'PAUSED' ? 'HT' : 'LIVE'}
          </span>
        ) : (
          <span className="num text-xs text-muted">{kickoff(match.utcDate)}</span>
        )}
      </div>

      <div className="relative space-y-2 mb-4">
        {[match.homeTeam, match.awayTeam].map((t, i) => {
          const side: Pick = i === 0 ? 'H' : 'A'
          const score = isLive ? (i === 0 ? ft?.home : ft?.away) : undefined
          return (
            <div key={t.id} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Crest team={t} size={30} />
                <span className={`font-display font-semibold truncate ${pick === side ? 'text-ink' : 'text-ink/80'}`}>{t.shortName || t.name}</span>
              </div>
              {score !== undefined && score !== null && <span className="num text-2xl font-bold text-ink">{score}</span>}
            </div>
          )
        })}
      </div>

      {p && pick && p.locked ? (
        <LockedPick match={match} p={p} pick={pick} />
      ) : p && pick ? (
        <div className="relative">
          <ProbBar p={p} pick={pick} />
          <div className="mt-2">
            <ProbRow p={p} pick={pick} />
          </div>
          {match.market && <MarketRow p={p} m={match.market} pick={pick} />}
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-faint">
            <span className="num">
              xG {p.expectedGoals.home} – {p.expectedGoals.away}
            </span>
            <span className="num">O2.5 {Math.round(p.over25)}%</span>
            <ConfidenceTag c={p.confidence} />
          </div>
        </div>
      ) : (
        <div className="text-xs text-faint">No prediction available</div>
      )}
    </Link>
  )
}

function SpotlightCard({ match }: { match: APIMatch }) {
  // Matches without a model prediction (friendlies, knockout ties) use the market's probabilities
  const mk = match.market
  const p: Prediction | null =
    match.prediction ||
    (mk
      ? ({ home: mk.probs.home, draw: mk.probs.draw, away: mk.probs.away } as unknown as Prediction)
      : null)
  if (!p) return <MatchCard match={match} />
  const fromMarket = !match.prediction
  const pick = pickOf(p)
  const favName = pick === 'H' ? match.homeTeam.shortName || match.homeTeam.name : pick === 'A' ? match.awayTeam.shortName || match.awayTeam.name : 'Draw'
  const favProb = pick === 'H' ? p.home : pick === 'A' ? p.away : p.draw
  const d = new Date(match.utcDate)
  const locked = !!p.locked

  return (
    <Link to={`/match/${match.id}`} className="card card-hover relative overflow-hidden p-5 block">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{ background: `radial-gradient(400px 200px at 50% 110%, rgb(var(${PICK_VAR[pick]})), transparent 70%)` }}
      />
      <div className="relative flex items-center justify-between text-xs text-muted mb-4">
        <span className="flex items-center gap-1.5">
          {match.competition.emblem && <img src={match.competition.emblem} alt="" className="w-4 h-4 object-contain" />}
          {match.competition.name}
        </span>
        <span className="num">
          {d.toLocaleDateString('en-GB', { weekday: 'short' })} {kickoff(match.utcDate)}
        </span>
      </div>

      <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex flex-col items-center text-center gap-2 min-w-0">
          <Crest team={match.homeTeam} size={56} />
          <span className="font-display font-bold text-ink leading-tight text-sm truncate max-w-full" title={match.homeTeam.name}>{match.homeTeam.shortName || match.homeTeam.name}</span>
        </div>
        <div className="font-display text-faint text-sm font-bold">VS</div>
        <div className="flex flex-col items-center text-center gap-2 min-w-0">
          <Crest team={match.awayTeam} size={56} />
          <span className="font-display font-bold text-ink leading-tight text-sm truncate max-w-full" title={match.awayTeam.name}>{match.awayTeam.shortName || match.awayTeam.name}</span>
        </div>
      </div>

      {locked ? (
        <div className="relative mt-5">
          <LockedPick match={match} p={p} pick={pick} big />
        </div>
      ) : (
      <div className="relative mt-5">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <span className="label whitespace-nowrap">{fromMarket ? 'Market favourite' : 'Pick'}</span>
          <span className={`font-display font-bold truncate ${PICK_COLOR[pick]}`}>
            {favName} <span className="num">{Math.round(favProb)}%</span>
          </span>
        </div>
        <ProbBar p={p} pick={pick} height="h-2.5" />
        <div className="mt-2">
          <ProbRow p={p} pick={pick} />
        </div>
        {match.market && !fromMarket && <MarketRow p={p} m={match.market} pick={pick} />}
        {fromMarket && <div className="mt-2 text-[11px] text-faint">No model prediction for this competition · bookmaker odds</div>}
      </div>
      )}
    </Link>
  )
}

export default Dashboard
