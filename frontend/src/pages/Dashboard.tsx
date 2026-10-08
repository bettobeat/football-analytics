import { useEffect, useMemo, useState } from 'react'
import { useReveal, justRevealed } from '../lib/reveal'
import CountUp from '../components/CountUp'
import { fame } from '../lib/fame'
import RecentResults from '../components/RecentResults'
import { Link, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { API_URL, socket } from '../lib/socket'
import { pickOfPrediction, type Prediction } from '../lib/predict'
import { useFavorites } from '../lib/favorites'
import LeagueSidebar, { MobileLeagueBar } from '../components/LeagueSidebar'
import { footballCountry, leagueShortName } from '../lib/leagueCountry'
import { t as tt, LOCALE } from '../lib/i18n'

export interface Team {
  id: number
  name: string
  shortName?: string
  tla?: string
  crest?: string
}

export interface Competition {
  id: number
  name: string
  code: string
  emblem?: string
  type?: string // NATIONAL / CUP / LEAGUE (extra competitions from API-Football)
  rank?: number // 0 = core leagues, 1 = European cups, 2 = more leagues, 3 = national teams
  trial?: boolean // new league, predictions still being tested (not in the public record yet)
}

/** Pinned in the league menu until the visitor stars leagues of their own. */
const DEFAULT_PINNED = ['PL', 'PD', 'BL1', 'SA', 'FL1', 'CL']

export interface APIMatch {
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
}

type Pick = 'H' | 'D' | 'A'

export const LIVE = new Set(['IN_PLAY', 'PAUSED'])
export const ENDED = new Set(['FINISHED', 'AWARDED', 'CANCELLED'])
const DAY_OPTIONS = [3, 7, 14, 30]
const PICK_COLOR: Record<Pick, string> = { H: 'text-home', D: 'text-draw', A: 'text-away' }
const PICK_BG: Record<Pick, string> = { H: 'bg-home', D: 'bg-draw', A: 'bg-away' }

export function dayKey(iso: string) {
  const d = new Date(iso)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function dayLabel(ts: number) {
  const today = dayKey(new Date().toISOString())
  const diff = Math.round((ts - today) / 86400000)
  if (diff === 0) return tt('Today')
  if (diff === 1) return tt('Tomorrow')
  return new Date(ts).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'short' })
}

function kickoff(iso: string) {
  return new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })
}

function pickOf(p: Prediction): Pick {
  return pickOfPrediction(p)
}

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function Dashboard() {
  const [matches, setMatches] = useState<APIMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // opened on one league (search, shared link): show its whole month, so the list is never empty between rounds
  const [days, setDays] = useState(() => (new URLSearchParams(window.location.search).get('league') ? 30 : 7))
  const [params, setParams] = useSearchParams()
  const [league, setLeagueState] = useState<string>(params.get('league') || 'ALL')
  // the league is kept in the address (?league=PL), so search results and shared links open the right league
  const setLeague = (code: string) => {
    setLeagueState(code)
    setParams(code === 'ALL' ? {} : { league: code }, { replace: true })
  }
  useEffect(() => {
    const fromUrl = params.get('league') || 'ALL'
    if (fromUrl !== league) {
      setLeagueState(fromUrl)
      if (fromUrl !== 'ALL') setDays(30)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

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
      // the live feed carries the pick only for $15 Premium: keep a prediction this user already unlocked
      setMatches(prev =>
        prev.map(m => {
          const n = live.get(m.id)
          if (!n) return m
          return n.prediction?.locked && m.prediction && !m.prediction.locked ? { ...n, prediction: m.prediction } : n
        })
      )
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

  const { list: favList, reasons } = useFavorites()
  const favMode = league === 'FAV'
  const visible = useMemo(() => {
    const cutoff = Date.now() + days * 86400000
    return matches.filter(
      m => new Date(m.utcDate).getTime() <= cutoff && (league === 'ALL' || (favMode ? reasons(m).length > 0 : m.competition.code === league))
    )
  }, [matches, league, days, favMode, reasons])
  // favorites first: their next games on top of the full list
  const favUpcoming = useMemo(
    () =>
      league !== 'ALL'
        ? []
        : matches
            .filter(m => !LIVE.has(m.status) && !ENDED.has(m.status) && new Date(m.utcDate).getTime() <= Date.now() + days * 86400000 && reasons(m).length > 0)
            .sort((a, b) => a.utcDate.localeCompare(b.utcDate))
            .slice(0, 8),
    [matches, league, days, reasons]
  )
  const favCount = useMemo(() => matches.filter(m => reasons(m).length > 0).length, [matches, reasons])

  const live = matches.filter(m => LIVE.has(m.status)) // all leagues, always
  // finished / cancelled games leave the list (they are in Latest results); live ones have their own row
  const upcoming = visible.filter(m => !LIVE.has(m.status) && !ENDED.has(m.status))

  // Spotlight: the three biggest games of the coming days — big clubs first, then model strength
  const spotlight = useMemo(() => {
    if (favMode) return []
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
  }, [upcoming, favMode])
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

  const side = {
    leagues: competitions.map(c => ({
      code: c.code, name: c.name, short: leagueShortName(c.name), logo: c.emblem || null, country: footballCountry(c),
      count: matches.filter(m => m.competition.code === c.code).length,
      fav: { kind: 'league' as const, ref: c.code, code: c.code, name: c.name, img: c.emblem || null }
    })),
    selected: league,
    onSelect: setLeague,
    pinned: (() => {
      const mine = favList.filter(f => f.kind === 'league').map(f => f.code || f.ref).filter(c => competitions.some(x => x.code === c))
      return mine.length ? mine : DEFAULT_PINNED.filter(c => competitions.some(x => x.code === c))
    })(),
    teams: favList.filter(f => f.kind === 'team').map(f => ({ key: f.ref, name: f.name, logo: f.img || null, to: f.ids?.[0] ? `/team/${f.ids[0]}?${new URLSearchParams({ n: f.name }).toString()}` : '/favorites' })),
    total: matches.length,
    favCount: favList.length ? favCount : null,
    addTeamTo: '/favorites'
  }

  return (
    <div className={`max-w-[1400px] mx-auto px-4 sm:px-6 py-6 lg:py-8 ${league === 'ALL' ? '2xl:max-w-[1760px]' : ''}`}>
      <div className={`grid grid-cols-1 gap-6 lg:gap-8 items-start ${league === 'ALL' ? 'lg:grid-cols-[250px_1fr] 2xl:grid-cols-[250px_1fr_340px]' : favMode ? 'lg:grid-cols-[250px_1fr]' : 'lg:grid-cols-[250px_1fr] xl:grid-cols-[250px_1fr_320px]'}`}>
        {/* ---------- Sidebar ---------- */}
        <aside className="hidden lg:flex lg:sticky lg:top-20 flex-col gap-6 lg:max-h-[calc(100vh-6.5rem)]">
          {/* Live */}
          <section className="card p-4 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-bold text-ink flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${live.length ? 'bg-live animate-pulseDot' : 'bg-faint'}`} />
                {tt("Live")}</h2>
              <span className="num text-xs text-faint">{live.length}</span>
            </div>
            {live.length === 0 ? (
              <p className="text-xs text-faint">{tt("No matches in play right now.")}</p>
            ) : (
              <ul className="space-y-1 max-h-60 overflow-y-auto">
                {live.map(m => (
                  <li key={m.id}>
                    <LiveRow match={m} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Leagues: pinned, my teams, international, countries (Flashscore style) */}
          <LeagueSidebar {...side} />

          {/* Latest results (medium screens; wide screens get the full column on the right) */}
          {league === 'ALL' && (
            <section className="card p-3 hidden lg:block 2xl:hidden shrink-0">
              <RecentResults limit={6} compact />
            </section>
          )}
        </aside>

        {/* ---------- Main ---------- */}
        <div className="min-w-0">
          <MobileLeagueBar side={side} liveCount={live.length} live={live.map(m => <LiveRow key={m.id} match={m} />)} />
          <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
            <div>
              <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">
                {league === 'ALL' ? tt("Matches") : favMode ? tt("My favorites") : competitions.find(c => c.code === league)?.name || tt("Matches")}
              </h1>
              <p className="mt-1 text-sm text-muted">
                {tt("{0} fixtures in the next {1} days", { 0: upcoming.length, 1: days })}{league !== 'ALL' && !favMode && (
                  <Link to={`/league/${league}`} className="ml-3 font-bold text-accent">
                    {tt("League page →")}</Link>
                )}
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

          {error && <div className="card p-5 border-loss/40 text-loss">{tt("Failed to load matches:")}{' '}{error}</div>}

          {!loading && !error && upcoming.length === 0 && (
            favMode && !favList.length ? (
              <div className="card p-10 text-center space-y-3">
                <p className="text-ink font-semibold">{tt("You have no favorites yet.")}</p>
                <p className="text-sm text-muted max-w-md mx-auto">
                  {tt("Tap the star next to a league here, or on any team, league or player page. Their games then show up in this list.")}</p>
                <Link to="/favorites" className="inline-block text-sm font-bold text-accent">{tt("Manage favorites →")}</Link>
              </div>
            ) : (
              <div className="card p-12 text-center text-muted">{favMode ? tt("None of your favorites play in this period.") : tt("No matches for this selection.")}</div>
            )
          )}

          {/* Your favorites: pinned on top of the full list */}
          {!loading && favUpcoming.length > 0 && (
            <section className="mb-8">
              <SectionTitle label={tt("Your favorites")} sub={tt("their next games")} />
              <div className="card overflow-hidden border-accent/25 divide-y divide-line/50">
                {favUpcoming.map(m => (
                  <MatchRow key={m.id} match={m} showComp showDay />
                ))}
              </div>
              <button type="button" onClick={() => setLeague('FAV')} className="mt-2 text-xs font-bold text-accent">
                {tt("Show only my favorites →")}</button>
            </section>
          )}

          {/* Spotlight: the biggest games, same compact rows */}
          {!loading && spotlight.length > 0 && (
            <section className="mb-8">
              <SectionTitle label={tt("Spotlight")} sub={tt("the biggest games of the coming days")} />
              <div className="card overflow-hidden border-accent/25 divide-y divide-line/50">
                {spotlight.map(m => (
                  <MatchRow key={m.id} match={m} showComp showDay />
                ))}
              </div>
            </section>
          )}

          {/* By day, then by competition: one thin row per game */}
          {!loading &&
            grouped.map(([ts, dayMatches]) => (
              <section key={ts} className="mb-8">
                <SectionTitle label={dayLabel(ts)} count={dayMatches.length} sticky />
                <div className="space-y-3">
                  {byCompetition(dayMatches).map(([comp, list]) => (
                    <div key={comp.code} className="card overflow-hidden">
                      <Link
                        to={`/league/${comp.code}`}
                        className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-surface2/50 border-b border-line/60 text-xs font-semibold text-muted hover:text-ink"
                      >
                        {comp.emblem ? <img src={comp.emblem} alt="" className="w-4 h-4 object-contain" /> : <span className="w-4 h-4 rounded bg-surface2" />}
                        <span className="truncate">{comp.name}</span>
                        <span className="ml-auto text-[11px] font-normal text-faint num">{list.length}</span>
                      </Link>
                      <div className="divide-y divide-line/50">
                        {list.map(m => (
                          <MatchRow key={m.id} match={m} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
        </div>

        {/* ---------- League panel ---------- */}
        {league !== 'ALL' && !favMode && <LeaguePanel code={league} />}

        {/* ---------- Latest results (wide screens) ---------- */}
        {league === 'ALL' && (
          <aside className="hidden 2xl:block 2xl:sticky 2xl:top-20">
            <section className="card p-3 max-h-[calc(100vh-6.5rem)] overflow-y-auto">
              <RecentResults limit={40} />
            </section>
          </aside>
        )}
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
  const [tab, setTab] = useState<'table' | 'scorers' | 'assists' | 'results'>('table')
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
        {(['table', 'results', 'scorers', 'assists'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`seg-btn flex-1 ${tab === t ? 'seg-btn-active' : ''}`}>
            {t === 'table' ? tt("Table") : t === 'results' ? tt("Results") : t === 'scorers' ? tt("Scorers") : tt("Assists")}
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
                  <th className="text-left font-medium py-1">{tt("Team")}</th>
                  <th className="text-right font-medium py-1 num">P</th>
                  <th className="text-right font-medium py-1 num">{tt("GD")}</th>
                  <th className="text-right font-medium py-1 pr-1 num">{tt("Pts")}</th>
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

      {tab === 'results' && (
        <section className="card p-3">
          <RecentResults code={code} limit={30} days={60} />
        </section>
      )}

      {(tab === 'scorers' || tab === 'assists') && (
        <section className="card p-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-faint">
                <th className="text-left font-medium py-1 pl-1 w-6">#</th>
                <th className="text-left font-medium py-1">{tt("Player")}</th>
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
                  <td colSpan={4} className="py-4 text-center text-faint">{tt("No data yet this season.")}</td>
                </tr>
              )}
            </tbody>
          </table>
          {tab === 'assists' && <p className="text-[10px] text-faint mt-2 px-1">{tt("Assists from the top-40 scorers list.")}</p>}
        </section>
      )}
    </aside>
  )
}

/* ---------- pieces ---------- */

export function SectionTitle({
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
      {count !== undefined && <span className="num text-xs text-faint">{count} {tt("matches")}</span>}
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
        <span className="font-bold text-live tracking-wider">{match.status === 'PAUSED' ? tt("HT") : tt("LIVE")}</span>
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

/** A day's games grouped by competition: top leagues first (competition rank), then by name; games by kick-off. */
export function byCompetition(list: APIMatch[]): [Competition, APIMatch[]][] {
  const map = new Map<string, { comp: Competition; games: APIMatch[] }>()
  for (const m of list) {
    const g = map.get(m.competition.code) || { comp: m.competition, games: [] }
    g.games.push(m)
    map.set(m.competition.code, g)
  }
  return [...map.values()]
    .sort((a, b) => (a.comp.rank ?? 0) - (b.comp.rank ?? 0) || a.comp.name.localeCompare(b.comp.name))
    .map(g => [g.comp, g.games.sort((x, y) => x.utcDate.localeCompare(y.utcDate))])
}

/**
 * One game as a thin row: time · both teams · our 1-X-2 (pick highlighted). Locked picks show a lock, the
 * "guess first" cover shows a small Reveal button. The whole row opens the match page.
 */
export function MatchRow({ match, showComp = false, showDay = false }: { match: APIMatch; showComp?: boolean; showDay?: boolean }) {
  const favWhy = useFavorites().reasons(match)
  const isLive = LIVE.has(match.status)
  const p = match.prediction
  const { hidden: covered, reveal } = useReveal(match.id, match.status, !!p && !p.locked)
  const pick = p && !covered && !(p.locked && !p.pick) ? pickOf(p) : null
  const ft = match.score?.fullTime
  const name = (t: Team) => t.shortName || t.name
  const pickName = pick === 'H' ? name(match.homeTeam) : pick === 'A' ? name(match.awayTeam) : pick === 'D' ? 'Draw' : null
  const pickPct = p && pick && !p.locked ? Math.round(pick === 'H' ? p.home : pick === 'D' ? p.draw : p.away) : null
  const roll = justRevealed(match.id)
  // goals markets next to 1-X-2: over 2.5 goals and both teams to score (yes or no, whichever is likelier)
  const extras =
    p && pick && pickPct !== null && typeof p.over25 === 'number' && typeof p.btts === 'number'
      ? [
          { k: 'o25', top: p.over25 >= 50 ? tt("Over 2.5") : tt("Under 2.5"), v: p.over25 >= 50 ? p.over25 : 100 - p.over25 },
          { k: 'btts', top: p.btts >= 50 ? tt("Both score") : tt("Not both"), v: p.btts >= 50 ? p.btts : 100 - p.btts }
        ]
      : null

  return (
    <Link to={`/match/${match.id}`} className={`group flex items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-surface2/50 transition-colors ${isLive ? 'bg-live/5' : ''}`}>
      {/* time */}
      <div className="relative w-11 flex-shrink-0 text-center">
        {favWhy.length > 0 && (
          <span className="absolute -left-2.5 sm:-left-3 top-1/2 -translate-y-1/2 text-accent" title={tt("Favorite: {0}", { 0: favWhy.map(f => f.name).join(', ') })}>
            <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor" aria-hidden><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z" /></svg>
          </span>
        )}
        {isLive ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-live">
            <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulseDot" />
            {match.status === 'PAUSED' ? tt("HT") : tt("LIVE")}
          </span>
        ) : (
          <>
            <span className="block num text-xs text-ink">{kickoff(match.utcDate)}</span>
            {showDay && <span className="block text-[10px] text-faint">{new Date(match.utcDate).toLocaleDateString(LOCALE, { weekday: 'short' })}</span>}
          </>
        )}
      </div>

      {/* teams */}
      <div className="flex-1 min-w-0">
        {showComp && (
          <div className="flex items-center gap-1 text-[10px] text-faint mb-0.5 truncate">
            {match.competition.emblem && <img src={match.competition.emblem} alt="" className="w-3 h-3 object-contain" />}
            <span className="truncate">{match.competition.name}</span>
          </div>
        )}
        {[match.homeTeam, match.awayTeam].map((t, i) => {
          const side: Pick = i === 0 ? 'H' : 'A'
          const score = isLive ? (i === 0 ? ft?.home : ft?.away) : null
          return (
            <div key={t.id} className="flex items-center gap-2 min-w-0 leading-6">
              <Crest team={t} size={18} />
              <span className={`text-sm truncate ${pick === side ? 'font-bold text-ink' : 'text-ink/85'}`}>{name(t)}</span>
              {score !== null && score !== undefined && <span className="ml-auto num text-sm font-bold text-ink">{score}</span>}
            </div>
          )
        })}
        {extras && (
          <div className={`md:hidden flex gap-3 mt-0.5 text-[11px] text-muted ${roll ? 'pop-in' : ''}`} style={roll ? { animationDelay: '420ms' } : undefined}>
            {extras.map(x => (
              <span key={x.k}>
                {x.top} <CountUp value={x.v} suffix="%" animate={roll} delay={420} className={`num font-semibold ${x.v >= 60 ? 'text-accent' : 'text-ink'}`} />
              </span>
            ))}
          </div>
        )}
      </div>

      {/* prediction */}
      <div className="flex-shrink-0 flex items-center justify-end min-w-[92px] sm:min-w-[176px]">
        {covered ? (
          <button
            type="button"
            onClick={e => { e.preventDefault(); e.stopPropagation(); reveal() }}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold bg-accent/10 text-accent border border-accent/30 hover:bg-accent/15"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            {tt("Reveal")}</button>
        ) : p && p.locked && !pickPct ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-faint">
            <LockIcon /> {pickName ? <span className={`font-semibold ${PICK_COLOR[pick!]}`}>{pickName}</span> : tt("Locked")}
          </span>
        ) : p && pick && pickPct !== null ? (
          <>
            {/* phones: the pick and its % */}
            <span className={`sm:hidden text-right leading-tight ${roll ? 'pop-in' : ''}`}>
              <span className={`block text-xs font-bold truncate max-w-[92px] ${PICK_COLOR[pick]}`}>{pickName}</span>
              <CountUp value={pickPct} suffix="%" animate={roll} className="block num text-[11px] text-muted" />
            </span>
            {/* wider screens: 1 · X · 2 with the pick highlighted */}
            <span className="hidden sm:flex items-center gap-1">
              {(['H', 'D', 'A'] as Pick[]).map((k, i) => {
                const v = Math.round(k === 'H' ? p.home : k === 'D' ? p.draw : p.away)
                const on = k === pick
                return (
                  <span
                    key={k}
                    className={`w-[54px] h-9 rounded-lg grid place-items-center leading-none transition-colors duration-500 ${on ? `${PICK_BG[k]} text-bg` : 'bg-surface2/70 text-muted'} ${roll ? 'pop-in' : ''}`}
                    style={roll ? { animationDelay: `${i * 90}ms` } : undefined}
                  >
                    <span className="text-[9px] font-bold opacity-80">{k === 'H' ? '1' : k === 'D' ? 'X' : '2'}</span>
                    <CountUp value={v} suffix="%" animate={roll} delay={i * 90} className="num text-xs font-bold" />
                  </span>
                )
              })}
              {extras && (
                <>
                  <span className="hidden md:block w-px h-6 bg-line mx-1.5" aria-hidden />
                  {extras.map((x, i) => (
                    <span
                      key={x.k}
                      className={`hidden md:grid w-[68px] h-9 rounded-lg place-items-center leading-none border ${x.v >= 60 ? 'border-accent/40 bg-accent/10 text-accent' : 'border-line/70 text-muted'} ${roll ? 'pop-in' : ''}`}
                      style={roll ? { animationDelay: `${300 + i * 90}ms` } : undefined}
                      title={x.k === 'o25' ? tt("Over 2.5 goals: {0}% · Under: {1}%", { 0: Math.round(p.over25), 1: Math.round(100 - p.over25) }) : tt("Both teams score: {0}% · Not both: {1}%", { 0: Math.round(p.btts), 1: Math.round(100 - p.btts) })}
                    >
                      <span className="text-[9px] font-bold opacity-80 whitespace-nowrap">{x.top}</span>
                      <CountUp value={x.v} suffix="%" animate={roll} delay={300 + i * 90} className="num text-xs font-bold" />
                    </span>
                  ))}
                </>
              )}
            </span>
          </>
        ) : (
          <span className="text-xs text-faint">–</span>
        )}
      </div>
    </Link>
  )
}

export default Dashboard
