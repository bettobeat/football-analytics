import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { API_URL, socket } from '../lib/socket'
import { fairOdds, bookLabel, modelInfo, CONFIDENCE_LABEL, MATCH_TYPE_LABEL, drawAlert, pickOfPrediction, type Market, type Prediction } from '../lib/predict'
import { useAuth } from '../lib/auth'
import { explainPrediction } from '../lib/explain'
import { useReveal, justRevealed } from '../lib/reveal'
import CountUp from '../components/CountUp'
import { RevealCover } from '../components/Reveal'

/* ---------- types (Football-Data.org v4 shapes, loosely) ---------- */

interface Team {
  id: number
  name: string
  shortName?: string
  tla?: string
  crest?: string
  coach?: { id: number; name: string; nationality?: string } | null
  formation?: string | null
  lineup?: Player[]
  bench?: Player[]
  statistics?: Record<string, number> | null
  basedOn?: number // probable lineups only: number of recent matches analysed
}

interface Player {
  id: number
  name: string
  position?: string | null
  shirtNumber?: number | null
}

interface Match {
  id: number
  utcDate: string
  status: string
  minute?: number | null
  injuryTime?: number | null
  matchday?: number | null
  stage?: string
  group?: string | null
  venue?: string | null
  attendance?: number | null
  competition: { id: number; name: string; code: string; emblem?: string }
  season?: { startDate: string; endDate: string }
  homeTeam: Team
  awayTeam: Team
  score: {
    winner?: string | null
    fullTime: { home: number | null; away: number | null }
    halfTime?: { home: number | null; away: number | null }
  }
  goals?: Goal[]
  bookings?: Booking[]
  substitutions?: Substitution[]
  referees?: { id: number; name: string; type?: string; nationality?: string }[]
}

interface Goal {
  minute: number
  injuryTime?: number | null
  type: string
  team: { id: number; name: string }
  scorer: { id: number; name: string }
  assist?: { id: number; name: string } | null
  score?: { home: number; away: number }
}

interface Booking {
  minute: number
  team: { id: number; name: string }
  player: { id: number; name: string }
  card: 'YELLOW' | 'YELLOW_RED' | 'RED'
}

interface Substitution {
  minute: number
  team: { id: number; name: string }
  playerOut: { id: number; name: string }
  playerIn: { id: number; name: string }
}

interface StandingRow {
  position: number
  playedGames: number
  form?: string | null
  won: number
  draw: number
  lost: number
  points: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  group?: string | null
  teamsInTable?: number
}

interface Details {
  match: Match
  prediction: Prediction | null
  predictions?: Prediction[]
  head2head: {
    aggregates: {
      numberOfMatches: number
      totalGoals: number
      homeTeam: { id: number; wins: number; draws: number; losses: number }
      awayTeam: { id: number; wins: number; draws: number; losses: number }
    }
    matches: Match[]
  } | null
  standings: { home: StandingRow | null; away: StandingRow | null }
  form: { home: Match[]; away: Match[] }
  probableLineups?: { home: Probable | null; away: Probable | null } | null
  market?: Market | null
}

/** A team's usual XI, built by the backend from its last few matches. */
interface Probable {
  teamId: number
  basedOn: number
  formation: string | null
  lineup: (Player & { starts: number })[]
}

const LIVE = new Set(['IN_PLAY', 'PAUSED'])
const DONE = new Set(['FINISHED', 'AWARDED'])

/* ---------- helpers ---------- */

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

function resultFor(teamId: number, m: Match): 'W' | 'D' | 'L' | null {
  const w = m.score?.winner
  if (!w) return null
  if (w === 'DRAW') return 'D'
  const isHome = m.homeTeam.id === teamId
  return (w === 'HOME_TEAM') === isHome ? 'W' : 'L'
}

function statusLabel(m: Match) {
  if (m.status === 'IN_PLAY') return m.minute ? `${m.minute}'${m.injuryTime ? `+${m.injuryTime}` : ''}` : 'LIVE'
  if (m.status === 'PAUSED') return 'Half-time'
  if (m.status === 'FINISHED') return 'Full-time'
  if (m.status === 'POSTPONED') return 'Postponed'
  if (m.status === 'CANCELLED') return 'Cancelled'
  if (m.status === 'SUSPENDED') return 'Suspended'
  return fmtTime(m.utcDate)
}

// Display order: the most telling numbers first (like a live-score app)
const STAT_LABELS: Record<string, string> = {
  expected_goals: 'Expected goals (xG)',
  ball_possession: 'Possession %',
  shots: 'Total shots',
  shots_on_goal: 'Shots on target',
  shots_off_goal: 'Shots off target',
  blocked_shots: 'Blocked shots',
  shots_inside_box: 'Shots inside the box',
  shots_outside_box: 'Shots outside the box',
  corner_kicks: 'Corners',
  saves: 'Goalkeeper saves',
  passes: 'Passes',
  pass_accuracy: 'Pass accuracy %',
  fouls: 'Fouls',
  offsides: 'Offsides',
  free_kicks: 'Free kicks',
  goal_kicks: 'Goal kicks',
  throw_ins: 'Throw-ins',
  yellow_cards: 'Yellow cards',
  red_cards: 'Red cards'
}

/** Two-sided stat bars (home left, away right), possession as one big split bar. */
function StatsPanel({ home, away, hs, as, keys }: { home: Team; away: Team; hs: Record<string, number>; as: Record<string, number>; keys: string[] }) {
  const fmt = (k: string, v: number) => (k === 'expected_goals' || k === 'goals_prevented' ? v.toFixed(2) : String(Math.round(v)))
  const poss = keys.includes('ball_possession') ? { h: hs.ball_possession ?? 0, a: as.ball_possession ?? 0 } : null
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold mb-3">
        <span className="text-home truncate">{home.shortName || home.name}</span>
        <span className="text-away truncate text-right">{away.shortName || away.name}</span>
      </div>
      {poss && (
        <div className="mb-5">
          <div className="text-[11px] text-faint text-center mb-1.5">Possession</div>
          <div className="flex h-7 rounded-lg overflow-hidden text-xs font-bold num">
            <div className="bg-home/80 text-bg grid place-items-center transition-all" style={{ width: `${poss.h || 50}%` }}>{Math.round(poss.h)}%</div>
            <div className="bg-away/80 text-bg grid place-items-center transition-all" style={{ width: `${poss.a || 50}%` }}>{Math.round(poss.a)}%</div>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {keys
          .filter(k => k !== 'ball_possession')
          .map(k => {
            const h = hs[k] ?? 0
            const a = as[k] ?? 0
            const total = h + a || 1
            const lead = h === a ? null : h > a ? 'H' : 'A'
            return (
              <div key={k} className="grid grid-cols-[52px_1fr_52px] items-center gap-3 text-sm">
                <span className={`num font-semibold text-right ${lead === 'H' ? 'text-ink' : 'text-muted'}`}>{fmt(k, h)}</span>
                <div>
                  <div className="text-[11px] text-faint text-center mb-1">{STAT_LABELS[k]}</div>
                  <div className="flex h-1.5 gap-0.5">
                    <div className="flex-1 flex justify-end">
                      <div className={`h-full rounded-l-full bg-home transition-all ${lead === 'A' ? 'opacity-50' : ''}`} style={{ width: `${(h / total) * 100}%` }} />
                    </div>
                    <div className="flex-1">
                      <div className={`h-full rounded-r-full bg-away transition-all ${lead === 'H' ? 'opacity-50' : ''}`} style={{ width: `${(a / total) * 100}%` }} />
                    </div>
                  </div>
                </div>
                <span className={`num font-semibold ${lead === 'A' ? 'text-ink' : 'text-muted'}`}>{fmt(k, a)}</span>
              </div>
            )
          })}
      </div>
    </div>
  )
}

/* ---------- page ---------- */


/** v3 grid breakdown: match type, 1000-point split, per-parameter values × relevance. */
function GridBreakdown({ p, home, away }: { p: Prediction; home: Team; away: Team }) {
  const g = p.grid!
  const hn = home.shortName || home.name
  const an = away.shortName || away.name
  const DRAW_ROWS = new Set(['#15', '#30', '#16'])
  const teamRows = g.rows.filter(r => !DRAW_ROWS.has(r.id))
  const drawRows = g.rows.filter(r => DRAW_ROWS.has(r.id))
  return (
    <div className="mt-5 rounded-xl border border-line/70 bg-surface/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-xs text-muted">
          <span className="font-semibold text-ink">{MATCH_TYPE_LABEL[g.matchType]}</span>
          <span className="text-faint"> · relevance weights for this match type</span>
        </div>
        <div className="num text-xs text-muted">
          <span className="text-home font-semibold">{g.points.home}</span> · <span className="text-draw font-semibold">{g.points.draw}</span> ·{' '}
          <span className="text-away font-semibold">{g.points.away}</span> <span className="text-faint">/ 1000</span>
        </div>
      </div>
      {g.reasons.length > 0 && (
        <ul className="mb-3 space-y-0.5 text-xs text-muted">
          {g.reasons.map((r, i) => (
            <li key={i}>· {r}</li>
          ))}
        </ul>
      )}
      <table className="w-full text-xs">
        <thead>
          <tr className="text-faint">
            <th className="text-left font-medium py-1">Parameter</th>
            <th className="text-right font-medium py-1 w-12">Rel.</th>
            <th className="text-right font-medium py-1 w-16">{hn}</th>
            <th className="text-right font-medium py-1 w-16">{an}</th>
            <th className="text-right font-medium py-1 w-16">Edge</th>
          </tr>
        </thead>
        <tbody>
          {teamRows.map(r => (
            <tr key={r.id} className="border-t border-line/40" title={r.note}>
              <td className="py-1 text-muted">{r.name}</td>
              <td className="py-1 text-right num text-faint">{r.rel}</td>
              <td className="py-1 text-right num text-ink">{r.home}</td>
              <td className="py-1 text-right num text-ink">{r.away}</td>
              <td className={`py-1 text-right num font-semibold ${r.edge > 0 ? 'text-home' : r.edge < 0 ? 'text-away' : 'text-faint'}`}>
                {r.edge > 0 ? '+' : ''}{r.edge}
              </td>
            </tr>
          ))}
          <tr className="border-t border-line/70 font-semibold">
            <td className="py-1 text-ink">Total</td>
            <td />
            <td className="py-1 text-right num text-ink">{g.totals.home}</td>
            <td className="py-1 text-right num text-ink">{g.totals.away}</td>
            <td className={`py-1 text-right num ${g.totals.home > g.totals.away ? 'text-home' : 'text-away'}`}>
              {g.totals.home - g.totals.away > 0 ? '+' : ''}{Math.round((g.totals.home - g.totals.away) * 10) / 10}
            </td>
          </tr>
        </tbody>
      </table>
      {drawRows.length > 0 && (
        <div className="mt-3 pt-2 border-t border-line/40 text-xs text-muted flex flex-wrap gap-x-4 gap-y-1">
          <span className="text-faint">Draw pot</span>
          {drawRows.map(r => (
            <span key={r.id} title={r.note}>
              {r.name} <span className="num text-ink">{r.home}</span>
              <span className="text-faint">×{r.rel}</span>
            </span>
          ))}
          <span>
            base <span className="num text-ink">{g.drawPot.base}</span> {g.drawPot.factors >= 0 ? '+' : '−'} <span className="num text-ink">{Math.abs(g.drawPot.factors)}</span> ={' '}
            <span className="num text-draw font-semibold">{g.drawPot.total}</span>
          </span>
        </div>
      )}
      {g.scope === 'national' || g.scope === 'cups' ? (
      <p className="mt-3 text-[11px] text-faint">
        {g.scope === 'national'
          ? "v3's national-team engine. Each parameter is scored among all active national teams (5.5 = average) and weighted by how much it predicted results since 2018. Edge = how many points (out of 1000) that parameter moves toward one side. Friendlies count for less, because teams rotate their squads."
          : "v3's European-cup engine. Each parameter is scored among all clubs playing in UEFA competitions (5.5 = average), from their league and cup games together, and weighted by how much it predicted past cup results. Edge = how many points (out of 1000) that parameter moves toward one side."}
      </p>
      ) : (
      <p className="mt-3 text-[11px] text-faint">
        Each parameter is scored within the league (5.5 = average; most teams land between 1 and 10, standouts like the league's superteams can
        go above 10) and multiplied by its relevance for this match type. The difference between the two totals sets the home/away split of the
        points left after the draw pot, which starts from the goals-based chance of a draw. Calibrated on the 2025-26 and 2026-27 results.
      </p>
      )}
    </div>
  )
}

function MatchDetail() {
  const { id } = useParams()
  const matchId = Number(id)
  const [details, setDetails] = useState<Details | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // premium "guess first": the prediction stays covered until the member taps Reveal (upcoming games only)
  const { hidden, reveal } = useReveal(matchId, details?.match.status, true)

  const load = (initial = false) => {
    if (initial) setLoading(true)
    return axios
      .get(`${API_URL}/matches/${matchId}/details`)
      .then(res => {
        setDetails(res.data.data)
        setError(null)
      })
      .catch(err => setError(err.response?.data?.message || err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!matchId) return
    load(true)
  }, [matchId])

  // browser tab: "Arsenal vs Chelsea · Bet To Beat"
  const tabTitle = details ? `${details.match.homeTeam.shortName || details.match.homeTeam.name} vs ${details.match.awayTeam.shortName || details.match.awayTeam.name}` : ''
  useEffect(() => {
    if (tabTitle) document.title = `${tabTitle} · Bet To Beat`
  }, [tabTitle])

  // Live scores arrive over the socket; full details (events, lineups) are re-fetched on a timer:
  //   live → every 60s · within 2h of kick-off → every 90s (official lineups land ~1h before) · otherwise every 5 min
  const isLive = details ? LIVE.has(details.match.status) : false
  const isDone = details ? DONE.has(details.match.status) : false
  const kickoff = details ? new Date(details.match.utcDate).getTime() : 0
  const hasOfficialLineups = details
    ? (details.match.homeTeam.lineup?.length || 0) > 0 || (details.match.awayTeam.lineup?.length || 0) > 0
    : false
  useEffect(() => {
    if (!matchId) return
    // rooms belong to one connection: subscribe again after every (re)connect
    const subscribe = () => socket.emit('subscribe_match', matchId)
    subscribe()
    socket.on('connect', subscribe)
    const onLive = (m: Match) => {
      if (m.id !== matchId) return
      // Only take the live fields — the slim live payload has no lineups/stats/events
      setDetails(prev =>
        prev
          ? { ...prev, match: { ...prev.match, status: m.status, minute: m.minute, injuryTime: m.injuryTime, score: m.score } }
          : prev
      )
    }
    socket.on('match:live', onLive)

    let timer: ReturnType<typeof setInterval> | null = null
    if (!isDone) {
      const soon = kickoff - Date.now() < 2 * 60 * 60 * 1000 && !hasOfficialLineups
      const every = isLive ? 60 : soon ? 90 : 300
      timer = setInterval(() => load(false), every * 1000)
    }
    return () => {
      socket.emit('unsubscribe_match', matchId)
      socket.off('connect', subscribe)
      socket.off('match:live', onLive)
      if (timer) clearInterval(timer)
    }
  }, [matchId, isLive, isDone, hasOfficialLineups, Math.floor((kickoff - Date.now()) / (30 * 60 * 1000))])

  // Which model the Prediction section shows (default: the one the backend prefers, v2 when available)
  const [modelId, setModelId] = useState<string | null>(null)

  // Probable lineups are built server-side from recent matches; if they weren't ready in time
  // for the first response (API quota), try again a few times shortly after.
  const [probableRetries, setProbableRetries] = useState(0)
  const probableMissing =
    !!details &&
    !isDone &&
    !hasOfficialLineups &&
    !(details.probableLineups?.home?.lineup.length || details.probableLineups?.away?.lineup.length)
  useEffect(() => {
    if (!probableMissing || probableRetries >= 4) return
    const t = setTimeout(() => {
      setProbableRetries(n => n + 1)
      load(false)
    }, 15 * 1000)
    return () => clearTimeout(t)
  }, [probableMissing, probableRetries])

  const events = useMemo(() => {
    if (!details) return []
    const m = details.match
    const list: { minute: number; extra: number; kind: string; teamId: number; text: string; sub?: string }[] = []
    ;(m.goals || []).forEach(g =>
      list.push({
        minute: g.minute,
        extra: g.injuryTime || 0,
        kind: g.type === 'OWN' ? 'own' : g.type === 'PENALTY' ? 'pen' : 'goal',
        teamId: g.team.id,
        text: g.scorer.name + (g.type === 'PENALTY' ? ' (pen)' : g.type === 'OWN' ? ' (og)' : ''),
        sub: g.assist ? `assist: ${g.assist.name}` : undefined
      })
    )
    ;(m.bookings || []).forEach(b =>
      list.push({ minute: b.minute, extra: 0, kind: b.card.toLowerCase(), teamId: b.team.id, text: b.player.name })
    )
    ;(m.substitutions || []).forEach(s =>
      list.push({
        minute: s.minute,
        extra: 0,
        kind: 'sub',
        teamId: s.team.id,
        text: s.playerIn.name,
        sub: `for ${s.playerOut.name}`
      })
    )
    return list.sort((a, b) => a.minute - b.minute || a.extra - b.extra)
  }, [details])

  if (loading) return <div className="max-w-5xl mx-auto px-4 py-16 text-center text-muted">Loading match…</div>
  if (error || !details)
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <Link to="/matches" className="text-sm text-muted hover:text-ink">← Back</Link>
        <div className="mt-4 card border-loss/40 text-loss rounded-lg p-4">
          Could not load match: {error || 'unknown error'}
        </div>
      </div>
    )

  const m = details.match
  const home = m.homeTeam
  const away = m.awayTeam
  const live = LIVE.has(m.status)
  const done = DONE.has(m.status)
  const showScore = live || done
  // v1 (standings) is a fallback only: shown when no other model covers the match
  const allModels = details.predictions && details.predictions.length ? details.predictions : details.prediction ? [details.prediction] : []
  const models = allModels.some(m => m.model !== 'poisson-dc-v1') ? allModels.filter(m => m.model !== 'poisson-dc-v1') : allModels
  const p = (modelId && models.find(m => m.model === modelId)) || details.prediction || models[0] || null
  const ft = m.score.fullTime
  const ht = m.score.halfTime
  const referee = (m.referees || []).find(r => !r.type || r.type === 'REFEREE') || (m.referees || [])[0]
  const homeStats = home.statistics || null
  const awayStats = away.statistics || null
  const statKeys = homeStats && awayStats ? Object.keys(STAT_LABELS).filter(k => k in homeStats && k in awayStats) : []
  const hasLineups = (home.lineup?.length || 0) > 0 || (away.lineup?.length || 0) > 0
  // Usual XIs (from recent matches) — shown until the official lineups arrive
  const pl = details.probableLineups
  const probable =
    !hasLineups && !done && pl && ((pl.home?.lineup.length || 0) > 0 || (pl.away?.lineup.length || 0) > 0)
      ? {
          home: { ...home, formation: pl.home?.formation || null, lineup: pl.home?.lineup || [], bench: [], basedOn: pl.home?.basedOn || 0 } as Team,
          away: { ...away, formation: pl.away?.formation || null, lineup: pl.away?.lineup || [], bench: [], basedOn: pl.away?.basedOn || 0 } as Team,
          basedOn: { home: pl.home?.basedOn || 0, away: pl.away?.basedOn || 0 }
        }
      : null

  const pick: 'H' | 'D' | 'A' | null = p ? pickOfPrediction(p) : null
  const pickVar = pick === 'H' ? '--home' : pick === 'A' ? '--away' : '--draw'

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <Link to="/matches" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors">
        <span aria-hidden>←</span> All matches
      </Link>

      {/* ---------- Hero ---------- */}
      <div className={`mt-4 card relative overflow-hidden p-6 sm:p-8 ${live ? 'shadow-glow border-live/40' : ''}`}>
        {pick && (
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.10]"
            style={{ background: `radial-gradient(700px 260px at 50% 120%, rgb(var(${pickVar})), transparent 70%)` }}
          />
        )}
        <div className="relative flex flex-wrap items-center justify-between gap-2 text-sm text-muted mb-6">
          <div className="flex items-center gap-2">
            {m.competition.emblem && <img src={m.competition.emblem} alt="" className="w-5 h-5 object-contain" />}
            <span className="font-medium text-ink/90">{m.competition.name}</span>
            {m.matchday && <span className="text-faint">· Matchday {m.matchday}</span>}
            {m.stage && m.stage !== 'REGULAR_SEASON' && <span className="text-faint">· {m.stage.replace(/_/g, ' ').toLowerCase()}</span>}
            {m.group && <span className="text-faint">· {m.group.replace(/_/g, ' ')}</span>}
          </div>
          <div className="text-faint">{fmtDate(m.utcDate)}</div>
        </div>

        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-8">
          <TeamHero team={home} align="right" code={m.competition?.code} />
          <div className="text-center min-w-[120px] sm:min-w-[170px]">
            {showScore ? (
              <div className="num text-5xl sm:text-6xl font-extrabold text-ink tracking-tight">
                {ft.home ?? 0}
                <span className="text-faint mx-2 font-light">:</span>
                {ft.away ?? 0}
              </div>
            ) : (
              <div className="num text-4xl sm:text-5xl font-extrabold text-ink tracking-tight">{fmtTime(m.utcDate)}</div>
            )}
            {showScore && ht && ht.home !== null && (done || m.status === 'PAUSED' || (m.minute ?? 0) > 45) && (
              <div className="num text-xs text-faint mt-1">HT {ht.home}–{ht.away}</div>
            )}
            <div
              className={`mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider px-3 py-1 rounded-full border ${
                live ? 'bg-live/10 text-live border-live/30' : done ? 'bg-surface2 text-muted border-line' : 'bg-accent/10 text-accent border-accent/30'
              }`}
            >
              {live && <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulseDot" />}
              {live ? statusLabel(m).toUpperCase() : done ? 'FULL-TIME' : 'KICK-OFF'}
            </div>
          </div>
          <TeamHero team={away} align="left" code={m.competition?.code} />
        </div>

        {(m.venue || referee || m.attendance) && (
          <div className="relative mt-6 pt-4 border-t border-line/60 flex flex-wrap gap-x-6 gap-y-1 justify-center text-xs text-faint">
            {m.venue && (
              <span>
                Venue <span className="text-muted">{m.venue}</span> <span className="text-faint">({home.shortName || home.name})</span>
              </span>
            )}
            {referee && <span>Referee <span className="text-muted">{referee.name}</span></span>}
            {m.attendance && <span>Attendance <span className="num text-muted">{m.attendance.toLocaleString()}</span></span>}
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        {/* ---------- Main column ---------- */}
        <div className="space-y-6 min-w-0">
          {/* Live stats first while the match is on */}
          {live && (
            <Section title="Live stats" note={m.minute ? `${m.minute}'${m.injuryTime ? `+${m.injuryTime}` : ''} · updates every minute` : 'updates every minute'}>
              {statKeys.length > 0 && homeStats && awayStats ? (
                <StatsPanel home={home} away={away} hs={homeStats} as={awayStats} keys={statKeys} />
              ) : (
                <p className="text-sm text-muted">
                  Our data provider doesn’t publish live statistics for this match (common for friendlies and some smaller
                  competitions). Score, cards, goals and substitutions still update live.
                </p>
              )}
            </Section>
          )}

          {/* Prediction */}
          <Section
            title="Prediction"
            note={p ? `${modelInfo(p.model).tag} · ${modelInfo(p.model).name} · ${CONFIDENCE_LABEL[p.confidence]}` : undefined}
          >
            {p && pick && p.locked ? (
              <LockedPrediction p={p} pick={pick} home={home} away={away} market={details.market || null} />
            ) : p && pick ? (
              hidden ? (
                <RevealCover onReveal={reveal} />
              ) : (
              <>
                {models.length > 1 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div className="seg">
                      {models.map(m => {
                        const info = modelInfo(m.model)
                        return (
                          <button
                            key={m.model}
                            onClick={() => setModelId(m.model)}
                            className={`seg-btn flex items-center gap-1.5 ${p.model === m.model ? 'seg-btn-active' : ''}`}
                            title={info.desc}
                          >
                            <span className="font-bold">{info.tag}</span>
                            <span className="hidden sm:inline">{info.name}</span>
                          </button>
                        )
                      })}
                    </div>
                    <span className="text-[11px] text-faint">{modelInfo(p.model).desc}</span>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <OutcomeTile k="H" label={home.shortName || home.name} v={p.home} active={pick === 'H'} roll={justRevealed(matchId)} delay={0} />
                  <OutcomeTile k="D" label="Draw" v={p.draw} active={pick === 'D'} roll={justRevealed(matchId)} delay={120} />
                  <OutcomeTile k="A" label={away.shortName || away.name} v={p.away} active={pick === 'A'} roll={justRevealed(matchId)} delay={240} />
                </div>
                {(() => {
                  const opts = [
                    { k: 'H' as const, label: home.shortName || home.name, v: p.home },
                    { k: 'D' as const, label: 'Draw', v: p.draw },
                    { k: 'A' as const, label: away.shortName || away.name, v: p.away }
                  ].sort((x, y) => y.v - x.v)
                  const top = opts[0]
                  if (top.v >= 50)
                    return (
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${top.v >= 60 ? 'bg-accent/15 text-accent border-accent/40' : 'bg-surface2 text-ink border-line'}`}>
                          {top.v >= 70 ? 'Very strong pick' : top.v >= 60 ? 'Strong pick' : 'Pick'}
                        </span>
                        <span className="text-muted">
                          {top.label} <span className="num text-ink font-semibold">{Math.round(top.v)}%</span>
                        </span>
                      </div>
                    )
                  const pair = opts.slice(0, 2)
                  return (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold border bg-surface2 text-ink border-line">Close game · two options</span>
                      <span className="text-muted">
                        {pair[0].label} or {pair[1].label.toLowerCase() === 'draw' ? 'draw' : pair[1].label}{' '}
                        <span className="num text-ink font-semibold">{Math.round(pair[0].v + pair[1].v)}%</span>
                      </span>
                    </div>
                  )
                })()}
                <div className="flex h-2.5 gap-[3px] mt-4">
                  <div className={`rounded-full bg-home ${pick === 'H' ? '' : 'opacity-35'}`} style={{ width: `calc(${p.home}% - 3px)` }} />
                  <div className={`rounded-full bg-draw ${pick === 'D' ? '' : 'opacity-35'}`} style={{ width: `calc(${p.draw}% - 3px)` }} />
                  <div className={`rounded-full bg-away ${pick === 'A' ? '' : 'opacity-35'}`} style={{ width: `calc(${p.away}% - 3px)` }} />
                </div>

                <WhyThisPick p={p} home={home} away={away} market={details.market || null} upcoming={['SCHEDULED', 'TIMED'].includes(m.status)} />

                {(() => {
                  const da = drawAlert(p, details.market, m.competition.code)
                  if (!da) return null
                  return (
                    <div className="mt-4 rounded-xl border border-draw/50 bg-draw/10 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold border bg-draw/20 text-draw border-draw/50">Draw alert</span>
                        <span className="text-ink">
                          The market prices the draw at <span className="num font-semibold">{da.market.toFixed(1)}%</span>; v3 rates it higher
                          (<span className="num font-semibold">{da.anchored}%</span> after anchoring to the market).
                        </span>
                      </div>
                      <div className="text-xs text-muted mt-1.5">
                        Best draw price <span className="num text-ink">{da.price.toFixed(2)}</span> · edge <span className="num text-ink">+{da.edge}%</span>.
                        In 2024-25 and 2025-26, the draw price moved toward v3 by kick-off in about 2 of 3 such matches.
                      </div>
                    </div>
                  )
                })()}

                {details.market && <MarketStrip p={p} m={details.market} home={home} away={away} />}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
                  <Stat label="Expected goals" value={`${p.expectedGoals.home} – ${p.expectedGoals.away}`} />
                  <Stat label="Over 2.5" value={`${Math.round(p.over25)}%`} />
                  <Stat label="Both teams score" value={`${Math.round(p.btts)}%`} />
                  <Stat label="Most likely score" value={p.topScores[0] ? `${p.topScores[0].home}–${p.topScores[0].away}` : '–'} sub={p.topScores[0] ? `${Math.round(p.topScores[0].prob)}%` : undefined} />
                </div>

                {p.grid && <GridBreakdown p={p} home={home} away={away} />}

                <details className="mt-4 group">
                  <summary className="cursor-pointer text-xs text-muted hover:text-ink select-none">{p.grid ? 'Goal model behind the extras' : 'How this was calculated'}</summary>
                  {p.model.startsWith('elo-') ? (
                  <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-muted">
                    <span>{home.shortName || home.name} Elo</span>
                    <span className="num text-ink">{p.factors.homeAttack}</span>
                    <span>{away.shortName || away.name} Elo</span>
                    <span className="num text-ink">{p.factors.awayAttack}</span>
                    <span>Home advantage (Elo points)</span>
                    <span className="num text-ink">{p.factors.homeAdvantage}</span>
                    <span>Squad value adjustment (Elo points, + favours {home.shortName || home.name})</span>
                    <span className="num text-ink">{p.factors.homeForm > 0 ? '+' : ''}{p.factors.homeForm}</span>
                    <span>Matches rated</span>
                    <span className="num text-ink">{p.factors.gamesPlayed.home} / {p.factors.gamesPlayed.away}</span>
                  </div>
                  ) : (
                  <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-muted">
                    <span>{home.shortName || home.name} attack / defence</span>
                    <span className="num text-ink">{p.factors.homeAttack} / {p.factors.homeDefence}</span>
                    <span>{away.shortName || away.name} attack / defence</span>
                    <span className="num text-ink">{p.factors.awayAttack} / {p.factors.awayDefence}</span>
                    <span>Home advantage</span>
                    <span className="num text-ink">×{p.factors.homeAdvantage}</span>
                    <span>Evidence (weighted games)</span>
                    <span className="num text-ink">{p.factors.gamesPlayed.home} / {p.factors.gamesPlayed.away}</span>
                    <span>League average goals per team</span>
                    <span className="num text-ink">{p.factors.leagueAvgGoals}</span>
                    <span>Other likely scores</span>
                    <span className="num text-ink">{p.topScores.slice(1).map(sc => `${sc.home}–${sc.away} (${Math.round(sc.prob)}%)`).join(' · ')}</span>
                  </div>
                  )}
                  <p className="mt-3 text-xs text-faint">
                    Strength = goals per game relative to the league average, adjusted for opponent quality and shrunk toward average
                    early in the season (1.00 = average). Attack above 1 is good; defence below 1 is good.
                  </p>
                </details>
              </>
              )
            ) : (
              <p className="text-sm text-faint">No prediction available for this match yet.</p>
            )}
          </Section>

          {/* Events */}
          {events.length > 0 && (
            <Section title="Match events">
              <ol className="relative">
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-line/70 -translate-x-1/2" />
                {events.map((e, i) => {
                  const isHome = e.teamId === home.id
                  return (
                    <li key={i} className={`relative grid grid-cols-[1fr_56px_1fr] items-center py-1.5 text-sm ${isHome ? '' : ''}`}>
                      <div className={`${isHome ? 'text-right pr-3' : ''}`}>
                        {isHome && <EventText e={e} align="right" />}
                      </div>
                      <div className="flex items-center justify-center">
                        <span className="num text-[11px] text-faint bg-surface px-1.5 py-0.5 rounded-md border border-line/60">
                          {e.minute}'{e.extra ? `+${e.extra}` : ''}
                        </span>
                      </div>
                      <div className={`${!isHome ? 'pl-3' : ''}`}>{!isHome && <EventText e={e} align="left" />}</div>
                    </li>
                  )
                })}
              </ol>
            </Section>
          )}

          {/* Statistics */}
          {!live && statKeys.length > 0 && homeStats && awayStats && (
            <Section title="Statistics">
              <StatsPanel home={home} away={away} hs={homeStats} as={awayStats} keys={statKeys} />
            </Section>
          )}

          {/* Lineups */}
          {hasLineups ? (
            <Section title="Official lineups" note={[home.formation, away.formation].filter(Boolean).join(' vs ') || undefined}>
              <Pitch home={home} away={away} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-5">
                <Bench team={home} />
                <Bench team={away} />
              </div>
            </Section>
          ) : probable ? (
            <Section title="Probable lineups" note={[probable.home.formation, probable.away.formation].filter(Boolean).join(' vs ') || undefined}>
              <Pitch home={probable.home} away={probable.away} probable />
              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-faint">
                <span>
                  Usual XI from each team's last{' '}
                  <span className="num text-muted">{Math.max(probable.basedOn.home, probable.basedOn.away)}</span> matches · the badge shows how many
                  of those a player started
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulseDot" />
                  Replaced automatically when the official lineups are published (~1h before kick-off)
                </span>
              </div>
            </Section>
          ) : (
            <p className="text-xs text-faint text-center">
              {live || done ? 'No lineup data from the provider for this match.' : 'Lineups are published about an hour before kick-off.'}
            </p>
          )}
        </div>

        {/* ---------- Side column ---------- */}
        <div className="space-y-6">
          <Section title="Teams">
            <div className="space-y-6">
              <TeamPanel team={home} row={details.standings.home} recent={details.form.home} />
              <div className="border-t border-line/60" />
              <TeamPanel team={away} row={details.standings.away} recent={details.form.away} />
            </div>
          </Section>

          <LeagueTable code={details.match.competition.code} name={details.match.competition.name} homeId={home.id} awayId={away.id} />

          {details.head2head && details.head2head.aggregates.numberOfMatches > 0 && (
            <Section title={`Head-to-head · last ${details.head2head.aggregates.numberOfMatches}`}>
              <H2H details={details} />
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------- pieces ---------- */

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="font-display text-base font-bold text-ink">{title}</h2>
        {note && <span className="text-xs text-faint">{note}</span>}
      </div>
      {children}
    </section>
  )
}

function TeamHero({ team, align, code }: { team: Team; align: 'left' | 'right'; code?: string }) {
  return (
    <Link
      to={`/team/${team.id}?${new URLSearchParams({ ...(code ? { c: code } : {}), n: team.name }).toString()}`}
      title={`${team.name}: team page`}
      className={`flex items-center gap-3 sm:gap-4 min-w-0 hover:opacity-90 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}
    >
      {team.crest ? (
        <img src={team.crest} alt="" className="w-14 h-14 sm:w-[72px] sm:h-[72px] object-contain flex-shrink-0 drop-shadow" />
      ) : (
        <span className="w-14 h-14 sm:w-[72px] sm:h-[72px] rounded-full bg-surface2 flex-shrink-0" />
      )}
      <div className="min-w-0">
        <div className="font-display font-extrabold text-lg sm:text-2xl text-ink leading-tight truncate">{team.shortName || team.name}</div>
        {team.coach?.name && <div className="text-xs text-faint mt-0.5 truncate">{team.coach.name}</div>}
        <div className="text-[11px] text-accent font-semibold mt-0.5">Team page →</div>
      </div>
    </Link>
  )
}

/** Free / signed-out view: the pick and confidence; percentages, value and the breakdown are Premium. */
function WhyThisPick({ p, home, away, market, upcoming }: { p: Prediction; home: Team; away: Team; market: Market | null; upcoming: boolean }) {
  const ex = explainPrediction(p, home.shortName || home.name, away.shortName || away.name, market, upcoming)
  if (!ex) return null
  return (
    <div className="mt-4 rounded-xl border border-line bg-surface2/50 p-4">
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-accent">Why this pick</div>
      <p className="mt-1.5 font-semibold text-ink leading-snug">{ex.headline}</p>
      {ex.forPick.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {ex.forPick.map((t, i) => (
            <li key={i} className="flex gap-2"><span className="text-win mt-[1px]">+</span><span>{t}</span></li>
          ))}
        </ul>
      )}
      {ex.against && (
        <div className="mt-1 flex gap-2 text-sm text-muted"><span className="text-loss mt-[1px]">−</span><span>On the other side: {ex.against}</span></div>
      )}
      {ex.draw.length > 0 && (
        <div className="mt-2 text-sm text-muted"><span className="text-draw font-semibold">Draw: </span>{ex.draw.join(' ')}</div>
      )}
      {ex.market && <div className="mt-2 text-sm text-muted">{ex.market}</div>}
      {ex.caution && <div className="mt-2 text-xs text-faint">{ex.caution}</div>}
    </div>
  )
}

function LockedPrediction({ p, pick, home, away, market }: { p: Prediction; pick: 'H' | 'D' | 'A'; home: Team; away: Team; market: Market | null }) {
  const { user } = useAuth()
  const name = pick === 'H' ? home.shortName || home.name : pick === 'A' ? away.shortName || away.name : 'Draw'
  const color = pick === 'H' ? 'text-home' : pick === 'D' ? 'text-draw' : 'text-away'
  const tiles: { k: 'H' | 'D' | 'A'; label: string }[] = [
    { k: 'H', label: home.shortName || home.name },
    { k: 'D', label: 'Draw' },
    { k: 'A', label: away.shortName || away.name }
  ]
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-sm mb-4">
        <span className="px-2.5 py-1 rounded-full text-xs font-bold border bg-surface2 text-ink border-line">Model pick</span>
        <span className={`font-display font-bold text-lg ${color}`}>{name}</span>
      </div>
      <div className="relative min-h-[190px]">
        <div className="grid grid-cols-3 gap-3 pt-6 select-none blur-[5px] opacity-60" aria-hidden>
          {tiles.map(t => (
            <OutcomeTile key={t.k} k={t.k} label={t.label} v={33.3} active={false} />
          ))}
        </div>
        <div className="absolute inset-0 grid place-items-center">
          <div className="rounded-2xl border border-line bg-surface/95 shadow-lift px-5 py-4 text-center max-w-sm">
            <div className="font-display font-bold text-ink">Full prediction with Premium</div>
            <div className="text-xs text-muted mt-1">
              Win / draw / loss %, why this pick in plain words, model vs market, strong picks, draw alerts and the full v3 breakdown.
            </div>
            <div className="mt-3 flex justify-center gap-2">
              <Link to="/premium" className="px-3.5 py-1.5 rounded-xl bg-accent text-bg text-sm font-semibold">
                See Premium
              </Link>
              {!user && (
                <Link to={`/login?next=${encodeURIComponent(window.location.pathname)}`} className="px-3.5 py-1.5 rounded-xl border border-line text-sm font-medium text-ink hover:border-faint">
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
      {market && <MarketStrip p={p} m={market} home={home} away={away} />}
    </div>
  )
}

function OutcomeTile({ k, label, v, active, roll = false, delay = 0 }: { k: 'H' | 'D' | 'A'; label: string; v: number; active: boolean; roll?: boolean; delay?: number }) {
  const color = k === 'H' ? 'text-home' : k === 'D' ? 'text-draw' : 'text-away'
  const border = k === 'H' ? 'border-home/50 bg-home/10' : k === 'D' ? 'border-draw/50 bg-draw/10' : 'border-away/50 bg-away/10'
  return (
    <div className={`rounded-xl border p-3 sm:p-4 text-center ${active ? border : 'border-line/70 bg-surface2/40'} ${roll && active ? 'animate-pop' : ''}`}>
      <div className="text-[11px] text-faint mb-1 truncate">
        <span className={`font-bold mr-1 ${active ? color : ''}`}>{k === 'H' ? '1' : k === 'D' ? 'X' : '2'}</span>
        {label}
      </div>
      <div className={`num text-2xl sm:text-3xl font-extrabold ${active ? color : 'text-ink/70'}`}><CountUp value={v} decimals={1} suffix="%" animate={roll} delay={delay} /></div>
      <div className="num text-[11px] text-faint mt-0.5">fair odds {fairOdds(v)}</div>
    </div>
  )
}

/** Bookmaker line vs the model: odds, margin-free probabilities and the gap on each outcome. */
function MarketStrip({ p, m, home, away }: { p: Prediction; m: Market; home: Team; away: Team }) {
  const rows: { k: 'H' | 'D' | 'A'; label: string; odds: number; mkt: number; model: number }[] = [
    { k: 'H', label: home.shortName || home.name, odds: m.msw.homeWin, mkt: m.probs.home, model: p.home },
    { k: 'D', label: 'Draw', odds: m.msw.draw, mkt: m.probs.draw, model: p.draw },
    { k: 'A', label: away.shortName || away.name, odds: m.msw.awayWin, mkt: m.probs.away, model: p.away }
  ]
  const showModel = !p.locked
  const age = Math.max(0, Math.round((Date.now() - new Date(m.fetchedAt).getTime()) / 60000))
  const ageText = age < 60 ? `${age} min ago` : age < 60 * 48 ? `${Math.round(age / 60)} h ago` : `${Math.round(age / 1440)} d ago`
  return (
    <div className="mt-4 rounded-xl border border-line/60 bg-surface2/40 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <span className="label">Market</span>
        <span className="text-[11px] text-faint num">
          {bookLabel(m)} · {m.books} book{m.books === 1 ? '' : 's'} · margin {m.overround}% · {ageText}
        </span>
      </div>
      <div className="flex h-1.5 gap-[3px] mb-3">
        <div className="rounded-full bg-home/40" style={{ width: `calc(${m.probs.home}% - 3px)` }} />
        <div className="rounded-full bg-draw/40" style={{ width: `calc(${m.probs.draw}% - 3px)` }} />
        <div className="rounded-full bg-away/40" style={{ width: `calc(${m.probs.away}% - 3px)` }} />
      </div>
      <div className="grid grid-cols-3 gap-3 text-xs">
        {rows.map(r => {
          const delta = r.model - r.mkt
          return (
            <div key={r.k} className="min-w-0">
              <div className="truncate text-faint">{r.label}</div>
              <div className="num text-ink">
                <span className="font-semibold">{r.odds.toFixed(2)}</span>
                <span className="text-muted"> · {r.mkt.toFixed(1)}%</span>
              </div>
              {showModel && (
                <div className={`num text-[11px] ${Math.abs(delta) >= 5 ? 'text-ink font-semibold' : 'text-faint'}`} title="Model minus market">
                  model {delta >= 0 ? '+' : ''}
                  {delta.toFixed(1)} pp
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl bg-surface2/60 border border-line/50 px-3 py-2.5 text-center">
      <div className="num text-lg font-bold text-ink">
        {value}
        {sub && <span className="text-xs text-faint font-medium ml-1">{sub}</span>}
      </div>
      <div className="text-[11px] text-faint">{label}</div>
    </div>
  )
}

function EventText({ e, align }: { e: { kind: string; text: string; sub?: string }; align: 'left' | 'right' }) {
  return (
    <div className={`flex items-center gap-2 ${align === 'right' ? 'justify-end' : ''}`}>
      {align === 'left' && <EventIcon kind={e.kind} />}
      <span className="min-w-0">
        <span className="text-ink font-medium">{e.text}</span>
        {e.sub && <span className="block text-[11px] text-faint">{e.sub}</span>}
      </span>
      {align === 'right' && <EventIcon kind={e.kind} />}
    </div>
  )
}

function EventIcon({ kind }: { kind: string }) {
  if (kind === 'goal' || kind === 'pen' || kind === 'own')
    return <span className={`text-base leading-none ${kind === 'own' ? 'opacity-50' : ''}`}>⚽</span>
  if (kind === 'yellow') return <span className="inline-block w-3 h-4 rounded-[2px] bg-draw" />
  if (kind === 'red') return <span className="inline-block w-3 h-4 rounded-[2px] bg-live" />
  if (kind === 'yellow_red') return <span className="inline-block w-3 h-4 rounded-[2px] bg-gradient-to-b from-draw to-live" />
  return <span className="text-faint text-sm">⇄</span>
}

function FormBadge({ r }: { r: string | null }) {
  const cls = r === 'W' ? 'bg-win text-bg' : r === 'L' ? 'bg-loss text-bg' : r === 'D' ? 'bg-faint text-bg' : 'bg-line text-muted'
  return <span className={`inline-flex w-6 h-6 items-center justify-center rounded-md text-[11px] font-bold ${cls}`}>{r || '·'}</span>
}

function TeamPanel({ team, row, recent }: { team: Team; row: StandingRow | null; recent: Match[] }) {
  const formFromTable = row?.form ? row.form.split(',').map(s => s.trim()) : null
  const formFromMatches = recent.map(m => resultFor(team.id, m)).reverse()
  const form = formFromTable && formFromTable.length ? formFromTable : formFromMatches
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {team.crest && <img src={team.crest} alt="" className="w-6 h-6 object-contain" />}
        <span className="font-display font-bold text-ink">{team.shortName || team.name}</span>
        {row && <span className="ml-auto num text-xs text-faint">#{row.position}{row.teamsInTable ? ` / ${row.teamsInTable}` : ''}</span>}
      </div>

      {row ? (
        <div className="grid grid-cols-3 gap-2 mb-3">
          <Mini label="Points" value={row.points} />
          <Mini label="W-D-L" value={`${row.won}-${row.draw}-${row.lost}`} />
          <Mini label="GF-GA" value={`${row.goalsFor}-${row.goalsAgainst}`} />
        </div>
      ) : (
        <p className="text-xs text-faint mb-3">No league table for this competition.</p>
      )}

      <div className="flex items-center gap-1 mb-3">
        <span className="text-[11px] text-faint mr-1">Form</span>
        {form.length ? form.map((r, i) => <FormBadge key={i} r={r as string} />) : <span className="text-xs text-faint">—</span>}
      </div>

      {recent.length > 0 && (
        <ul className="space-y-1 text-sm">
          {recent.map(m => {
            const isHome = m.homeTeam.id === team.id
            const opp = isHome ? m.awayTeam : m.homeTeam
            const gf = isHome ? m.score.fullTime.home : m.score.fullTime.away
            const ga = isHome ? m.score.fullTime.away : m.score.fullTime.home
            return (
              <li key={m.id} className="flex items-center gap-2">
                <span className="num w-12 text-[11px] text-faint whitespace-nowrap">{shortDate(m.utcDate)}</span>
                <FormBadge r={resultFor(team.id, m)} />
                <span className="text-[10px] text-faint w-3">{isHome ? 'H' : 'A'}</span>
                <span className="flex-1 truncate text-muted">{opp.shortName || opp.name}</span>
                <span className="num font-semibold text-ink">{gf}–{ga}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-surface2/60 border border-line/50 py-1.5 text-center">
      <div className="num text-sm font-bold text-ink">{value}</div>
      <div className="text-[10px] text-faint">{label}</div>
    </div>
  )
}

function H2H({ details }: { details: Details }) {
  const agg = details.head2head!.aggregates
  const m = details.match
  const total = agg.numberOfMatches || 1
  const hw = agg.homeTeam.wins
  const d = agg.homeTeam.draws
  const aw = agg.awayTeam.wins
  return (
    <>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="font-semibold text-home">{m.homeTeam.shortName || m.homeTeam.name} · <span className="num">{hw}</span></span>
        <span className="text-faint">Draws · <span className="num">{d}</span></span>
        <span className="font-semibold text-away"><span className="num">{aw}</span> · {m.awayTeam.shortName || m.awayTeam.name}</span>
      </div>
      <div className="flex h-2 gap-[3px] mb-1.5">
        <div className="rounded-full bg-home" style={{ width: `calc(${(hw / total) * 100}% - 3px)` }} />
        <div className="rounded-full bg-faint" style={{ width: `calc(${(d / total) * 100}% - 3px)` }} />
        <div className="rounded-full bg-away" style={{ width: `calc(${(aw / total) * 100}% - 3px)` }} />
      </div>
      <div className="text-[11px] text-faint mb-3 num">
        {agg.totalGoals} goals in {agg.numberOfMatches} · {(agg.totalGoals / total).toFixed(1)} per game
      </div>
      <ul className="space-y-1 text-sm">
        {details.head2head!.matches.filter(h => DONE.has(h.status)).map(h => (
          <li key={h.id} className="flex items-center gap-2">
            <span className="num w-12 text-[11px] text-faint whitespace-nowrap">{shortDate(h.utcDate)}</span>
            <span className="flex-1 text-right truncate text-muted">{h.homeTeam.shortName || h.homeTeam.name}</span>
            <span className="num font-semibold text-ink px-1">{h.score.fullTime.home}–{h.score.fullTime.away}</span>
            <span className="flex-1 truncate text-muted">{h.awayTeam.shortName || h.awayTeam.name}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

/* ---------- league table with both teams marked ---------- */

interface TableRow extends StandingRow {
  team: { id: number; name: string; shortName?: string; crest?: string }
}

function LeagueTable({ code, name, homeId, awayId }: { code: string; name: string; homeId: number; awayId: number }) {
  const [tables, setTables] = useState<{ type: string; group?: string | null; table: TableRow[] }[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setTables(null)
    axios
      .get(`${API_URL}/leagues/${code}/standings`)
      .then(res => !cancelled && setTables(res.data.data?.standings || []))
      .catch(() => !cancelled && setTables([]))
    return () => {
      cancelled = true
    }
  }, [code])

  if (tables === null) return null
  const totals = tables.filter(t => t.type === 'TOTAL')
  const involving = totals.filter(t => t.table.some(r => r.team.id === homeId || r.team.id === awayId))
  const show = involving.length ? involving : totals
  if (!show.length) return null

  return (
    <Section title="League table" note={name}>
      <div className="space-y-4">
        {show.map((t, i) => (
          <div key={i}>
            {t.group && <div className="label pb-2">{t.group.replace(/_/g, ' ')}</div>}
            <table className="w-full text-xs">
              <thead>
                <tr className="text-faint">
                  <th className="text-left font-medium py-1 pl-2 w-7">#</th>
                  <th className="text-left font-medium py-1">Team</th>
                  <th className="text-right font-medium py-1 num">P</th>
                  <th className="text-right font-medium py-1 num">GD</th>
                  <th className="text-right font-medium py-1 pr-2 num">Pts</th>
                </tr>
              </thead>
              <tbody>
                {t.table.map(r => {
                  const side = r.team.id === homeId ? 'home' : r.team.id === awayId ? 'away' : null
                  const rowCls =
                    side === 'home'
                      ? 'bg-home/10 shadow-[inset_3px_0_0_rgb(var(--home))]'
                      : side === 'away'
                        ? 'bg-away/10 shadow-[inset_3px_0_0_rgb(var(--away))]'
                        : ''
                  const nameCls = side === 'home' ? 'text-home font-bold' : side === 'away' ? 'text-away font-bold' : 'text-ink'
                  return (
                    <tr key={r.team.id} className={`border-t border-line/50 ${rowCls}`}>
                      <td className={`py-1.5 pl-2 num ${side ? 'text-ink font-semibold' : 'text-faint'}`}>{r.position}</td>
                      <td className="py-1.5">
                        <span className="flex items-center gap-2 min-w-0">
                          {r.team.crest ? (
                            <img src={r.team.crest} alt="" className="w-4 h-4 object-contain flex-shrink-0" />
                          ) : (
                            <span className="w-4 h-4 rounded-full bg-surface2 flex-shrink-0" />
                          )}
                          <span className={`truncate ${nameCls}`}>{r.team.shortName || r.team.name}</span>
                        </span>
                      </td>
                      <td className="py-1.5 text-right num text-muted">{r.playedGames}</td>
                      <td className={`py-1.5 text-right num ${r.goalDifference > 0 ? 'text-win' : r.goalDifference < 0 ? 'text-loss' : 'text-muted'}`}>
                        {r.goalDifference > 0 ? '+' : ''}
                        {r.goalDifference}
                      </td>
                      <td className={`py-1.5 pr-2 text-right num font-bold ${side ? 'text-ink' : 'text-ink/80'}`}>{r.points}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </Section>
  )
}

/* ---------- pitch view ---------- */

interface PitchPlayer extends Player {
  photo?: string | null
  grid?: string | null
  starts?: number // probable lineups: starts in the analysed matches
}

/** Split a lineup into rows using the formation string (e.g. "4-2-3-1"); falls back to positions. */
function formationRows(team: Team): PitchPlayer[][] {
  const lineup = (team.lineup || []) as PitchPlayer[]
  if (!lineup.length) return []
  // exact positions from the provider ("row:col", row 1 = goalkeeper) when every starter has one
  if (lineup.every(p => p.grid && /^\d+:\d+$/.test(p.grid))) {
    const byRow = new Map<number, PitchPlayer[]>()
    for (const p of lineup) {
      const [r] = p.grid!.split(':').map(Number)
      byRow.set(r, [...(byRow.get(r) || []), p])
    }
    return [...byRow.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, ps]) => ps.sort((a, b) => Number(b.grid!.split(':')[1]) - Number(a.grid!.split(':')[1])))
  }
  const gkFound = lineup.filter(p => /goal/i.test(p.position || ''))
  // no goalkeeper flagged: the provider lists him first
  const gk = gkFound.length ? gkFound : lineup.slice(0, 1)
  const outfield = lineup.filter(p => !gk.includes(p))
  const counts = (team.formation || '')
    .split('-')
    .map(n => parseInt(n, 10))
    .filter(n => Number.isFinite(n) && n > 0)
  const rows: PitchPlayer[][] = [gk]
  if (counts.length && counts.reduce((a, b) => a + b, 0) === outfield.length) {
    let i = 0
    for (const c of counts) {
      rows.push(outfield.slice(i, i + c))
      i += c
    }
  } else {
    const by = (re: RegExp) => outfield.filter(p => re.test(p.position || ''))
    const d = by(/def/i)
    const mid = by(/mid/i)
    const att = by(/off|att|for/i)
    const rest = outfield.filter(p => !d.includes(p) && !mid.includes(p) && !att.includes(p))
    ;[d, [...mid, ...rest], att].forEach(r => r.length && rows.push(r))
  }
  return rows
}

function lastName(name: string) {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? parts[parts.length - 1] : name
}

function PlayerDot({ p, side, of }: { p: PitchPlayer; side: 'home' | 'away'; of?: number }) {
  const ring = side === 'home' ? 'ring-home/70' : 'ring-away/70'
  const showStarts = typeof p.starts === 'number' && of
  const title = `${p.name}${p.position ? ` · ${p.position}` : ''}${showStarts ? ` · started ${p.starts}/${of}` : ''}`
  return (
    <div className="flex flex-col items-center w-[64px]" title={title}>
      <div className="relative">
        <div className={`relative w-9 h-9 rounded-full bg-surface ring-2 ${ring} shadow-card overflow-hidden grid place-items-center ${showStarts && p.starts! < (of || 0) ? 'opacity-90' : ''}`}>
          {p.photo ? (
            <img src={p.photo} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="num text-sm font-bold text-ink">{p.shirtNumber ?? ''}</span>
          )}
        </div>
        {showStarts && (
          <span
            className={`absolute -top-1 -right-2 num text-[9px] font-bold leading-none px-1 py-0.5 rounded-md ring-1 ring-black/20 ${
              p.starts === of ? 'bg-accent text-bg' : 'bg-surface text-ink'
            }`}
          >
            {p.starts}/{of}
          </span>
        )}
      </div>
      <span className="mt-1 text-[11px] leading-tight text-white font-medium text-center drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] truncate max-w-full">
        {lastName(p.name)}
      </span>
    </div>
  )
}

function Pitch({ home, away, probable = false }: { home: Team; away: Team; probable?: boolean }) {
  const [side, setSide] = useState<'home' | 'away'>('home')
  const team = side === 'home' ? home : away
  const of = probable ? team.basedOn : undefined
  const rows = formationRows(team) // GK first → drawn at the bottom, attackers toward the top
  const rowStyle = (i: number, n: number) => {
    const t = n <= 1 ? 0.5 : i / (n - 1) // 0 = goal line (bottom), 1 = top of the half
    return { bottom: `${8 + t * 74}%` }
  }
  const TeamBtn = ({ t, k }: { t: Team; k: 'home' | 'away' }) => (
    <button onClick={() => setSide(k)} className={`seg-btn flex items-center gap-2 ${side === k ? 'seg-btn-active' : ''}`}>
      {t.crest && <img src={t.crest} alt="" className="w-4 h-4 object-contain" />}
      {t.shortName || t.name}
      {t.formation && <span className="num text-[11px] text-faint">{t.formation}</span>}
    </button>
  )
  return (
    <div>
      <div className="flex justify-center mb-3">
        <div className="seg">
          <TeamBtn t={home} k="home" />
          <TeamBtn t={away} k="away" />
        </div>
      </div>
      <div
        className="relative mx-auto w-full max-w-[420px] rounded-2xl overflow-hidden border border-line/60"
        style={{
          aspectRatio: '4 / 3.4',
          background: 'repeating-linear-gradient(0deg, rgb(28 120 66) 0 20%, rgb(32 130 72) 20% 40%)'
        }}
      >
        {/* half-pitch markings: goal at the bottom, halfway line at the top */}
        <svg viewBox="0 0 400 340" className="absolute inset-0 w-full h-full" preserveAspectRatio="none" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5">
          <rect x="8" y="-20" width="384" height="352" rx="2" />
          <line x1="8" y1="8" x2="392" y2="8" />
          <path d="M155 8 A45 45 0 0 0 245 8" />
          <rect x="90" y="250" width="220" height="82" />
          <rect x="150" y="300" width="100" height="32" />
          <path d="M160 250 A40 40 0 0 1 240 250" />
        </svg>
        {rows.map((row, i) => (
          <div key={i} className="absolute left-0 right-0 flex justify-evenly px-2 translate-y-1/2" style={rowStyle(i, rows.length)}>
            {row.map(p => (
              <PlayerDot key={p.id} p={p} side={side} of={of} />
            ))}
          </div>
        ))}
        {probable && (
          <div className="absolute top-2 left-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80 drop-shadow">
            Probable
          </div>
        )}
        {team.coach?.name && (
          <div className="absolute top-2 right-3 text-[10px] text-white/70 drop-shadow">Coach {team.coach.name}</div>
        )}
      </div>
    </div>
  )
}

function Bench({ team }: { team: Team }) {
  const bench = team.bench || []
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          {team.crest && <img src={team.crest} alt="" className="w-4 h-4 object-contain" />}
          {team.shortName || team.name} · bench
        </div>
        {team.coach?.name && <span className="text-[11px] text-faint">Coach {team.coach.name}</span>}
      </div>
      {bench.length ? (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted">
          {bench.map(pl => (
            <li key={pl.id} className="flex items-center gap-2 min-w-0">
              <span className="num w-5 text-right text-faint">{pl.shirtNumber ?? ''}</span>
              <span className="truncate">{pl.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-faint">No bench data.</p>
      )}
    </div>
  )
}

export default MatchDetail
