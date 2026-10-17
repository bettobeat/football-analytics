import { useEffect, useState } from 'react'
import { useReveal, justRevealed } from '../lib/reveal'
import CountUp from '../components/CountUp'
import RecentResults from '../components/RecentResults'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../lib/socket'
import { pickOfPrediction, doubleChance, dcLabel, shortTeam, type Prediction } from '../lib/predict'
import { DcBlock } from '../components/DcPick'
import { useFavorites } from '../lib/favorites'
import { t as tt, LOCALE } from '../lib/i18n'
import { useAuth } from '../lib/auth'
import { useStuck, stuckBg } from '../lib/useStuck'
import Games from '../components/sport/Games'
import { footballGames } from '../components/sport/games/football'

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
const PICK_COLOR: Record<Pick, string> = { H: 'text-home', D: 'text-draw', A: 'text-away' }

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

/** fix152a: the Matches page is the shared one (components/sport/Games) with football's adapter. */
function Dashboard() {
  return <Games a={footballGames} />
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

export function LeaguePanel({ code }: { code: string }) {
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
  const [ref, stuck] = useStuck<HTMLDivElement>()
  return (
    <div ref={sticky ? ref : undefined} className={`flex items-baseline gap-3 mb-3 ${sticky ? `sticky top-[113px] sm:top-16 z-30 py-2 -my-2 ${stuckBg(stuck)}` : ''}`}>
      <h2 className={`font-display text-lg font-bold tracking-tight ${accent === 'live' ? 'text-live' : 'text-ink'}`}>
        {accent === 'live' && <span className="inline-block w-2 h-2 rounded-full bg-live animate-pulseDot mr-2 align-middle" />}
        {label}
      </h2>
      {count !== undefined && <span className="num text-xs text-faint">{count} {tt("matches")}</span>}
      {sub && <span className="text-xs text-faint">{sub}</span>}
    </div>
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
 * One game as a thin row: time · both teams · our 1-X-2 (the two results of our double-chance pick highlighted, fix120). Locked picks show a lock, the
 * "guess first" cover shows a small Reveal button. The whole row opens the match page.
 */
export function MatchRow({ match, showComp = false, showDay = false }: { match: APIMatch; showComp?: boolean; showDay?: boolean }) {
  const favWhy = useFavorites().reasons(match)
  const { full } = useAuth()
  const isLive = LIVE.has(match.status)
  const p = match.prediction
  const { hidden: covered, reveal } = useReveal(match.id, match.status, !!p && !p.locked)
  const pick = p && !covered && !(p.locked && !p.pick) ? pickOf(p) : null
  const ft = match.score?.fullTime
  const name = (t: Team) => t.shortName || t.name
  const pickName = pick === 'H' ? name(match.homeTeam) : pick === 'A' ? name(match.awayTeam) : pick === 'D' ? 'Draw' : null
  const pickPct = p && pick && !p.locked ? Math.round(pick === 'H' ? p.home : pick === 'D' ? p.draw : p.away) : null
  // our recommended pick: the double chance (two results) — the 1X2 numbers stay as they are
  const dc = pick ? doubleChance(p) : null
  const dcName = dc ? dcLabel(dc.code, shortTeam(match.homeTeam), shortTeam(match.awayTeam)) : null
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
    <Link to={`/match/${match.id}#prediction`} state={{ match: match }} className={`group relative flex items-center gap-2.5 px-3 sm:px-4 py-1.5 hover:bg-surface2/50 transition-colors ${isLive ? 'bg-live/[0.06]' : ''}`}>
      {isLive && <span className="absolute left-0 inset-y-0 w-0.5 bg-live" aria-hidden />}
      {/* time */}
      <div className="relative w-10 flex-shrink-0 text-center leading-tight">
        {favWhy.length > 0 && (
          <span className="absolute -left-2.5 sm:-left-3 top-1/2 -translate-y-1/2 text-accent" title={tt("Favorite: {0}", { 0: favWhy.map(f => f.name).join(', ') })}>
            <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor" aria-hidden><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z" /></svg>
          </span>
        )}
        {isLive ? (
          <>
            <span className="block text-[11px] font-bold text-live">{match.status === 'PAUSED' ? tt("HT") : tt("LIVE")}</span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-live animate-pulseDot" />
          </>
        ) : (
          <>
            <span className="block num text-[12px] text-ink/90">{kickoff(match.utcDate)}</span>
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
            <div key={t.id} className="flex items-center gap-2 min-w-0 h-5">
              <Crest team={t} size={15} />
              <span className={`text-[13px] truncate ${(dc ? dc.sides.includes(side) : pick === side) ? 'font-bold text-ink' : 'text-ink/85'}`}>{name(t)}</span>
              {score !== null && score !== undefined && <span className="ml-auto pl-2 num text-[13px] font-extrabold tabular-nums text-live">{score}</span>}
            </div>
          )
        })}
        {full && p && !p.locked && !covered && ['SCHEDULED', 'TIMED'].includes(match.status) && (() => {
          const up = Math.min(p.home, p.away), fav = Math.max(p.home, p.away)
          if (up < 30 || fav - up < 10) return null
          return (
            <span className="block text-[10px] font-bold text-loss" title={tt("Our model gives the underdog {0}% to win", { 0: Math.round(up) })}>
              {tt("Upset watch")} · {Math.round(up)}%
            </span>
          )
        })()}
        {isLive && p?.live && !covered && (() => {
          const l = p.live
          const k: Pick = l.home >= l.draw && l.home >= l.away ? 'H' : l.away >= l.draw ? 'A' : 'D'
          const v = Math.min(99, Math.round(k === 'H' ? l.home : k === 'D' ? l.draw : l.away))
          return (
            <div className="text-[10px] text-live font-semibold truncate">
              {tt("Now")}: {k === 'D' ? tt("Draw") : name(k === 'H' ? match.homeTeam : match.awayTeam)} <span className="num">{v}%</span>
            </div>
          )
        })()}
        {extras && (
          <div className={`lg:hidden flex flex-wrap gap-x-3 text-[10px] text-muted ${roll ? 'pop-in' : ''}`} style={roll ? { animationDelay: '420ms' } : undefined}>
            {extras.map(x => (
              <span key={x.k} className="whitespace-nowrap">
                {x.top} <CountUp value={x.v} suffix="%" animate={roll} delay={420} className={`num font-semibold ${x.v >= 60 ? 'text-accent' : 'text-ink'}`} />
              </span>
            ))}
          </div>
        )}
      </div>

      {/* prediction */}
      <div className="flex-shrink-0 flex items-center justify-end min-w-[84px] sm:min-w-[150px]">
        {covered ? (
          <button
            type="button"
            onClick={e => { e.preventDefault(); e.stopPropagation(); reveal() }}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-bold bg-accent/10 text-accent border border-accent/30 hover:bg-accent/15"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            {tt("Reveal")}</button>
        ) : p && p.locked && !pickPct ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-faint">
            <LockIcon /> {dc ? <span className="font-semibold text-ink/85 whitespace-nowrap">{dcName}</span> : pickName ? <span className={`font-semibold ${PICK_COLOR[pick!]}`}>{pickName}</span> : tt("Locked")}
          </span>
        ) : p && pick && pickPct !== null ? (
          <>
            {/* fix127: 1 · X · 2 with the two results of our double chance highlighted, then "Our pick: … · %" in words */}
            <span className="flex items-center gap-1">
              {dc && dc.pct !== null ? (
                <DcBlock p={p} home={shortTeam(match.homeTeam)} away={shortTeam(match.awayTeam)} roll={roll} />
              ) : (
                <span className={`text-right leading-tight ${roll ? 'pop-in' : ''}`}>
                  <span className={`block text-[11px] font-bold truncate max-w-[84px] ${PICK_COLOR[pick]}`}>{pickName}</span>
                  <CountUp value={pickPct} suffix="%" animate={roll} className="block num text-[11px] font-semibold text-ink/80" />
                </span>
              )}
              {extras && (
                <>
                  <span className="hidden lg:block w-px h-5 bg-line mx-1" aria-hidden />
                  {extras.map((x, i) => (
                    <span
                      key={x.k}
                      className={`hidden lg:grid w-[60px] h-7 rounded-md place-items-center leading-none border ${x.v >= 60 ? 'border-accent/40 bg-accent/10 text-accent' : 'border-line/70 text-muted'} ${roll ? 'pop-in' : ''}`}
                      style={roll ? { animationDelay: `${300 + i * 90}ms` } : undefined}
                      title={x.k === 'o25' ? tt("Over 2.5 goals: {0}% · Under: {1}%", { 0: Math.round(p.over25), 1: Math.round(100 - p.over25) }) : tt("Both teams score: {0}% · Not both: {1}%", { 0: Math.round(p.btts), 1: Math.round(100 - p.btts) })}
                    >
                      <span className="text-[8px] font-bold opacity-75 whitespace-nowrap">{x.top}</span>
                      <CountUp value={x.v} suffix="%" animate={roll} delay={300 + i * 90} className="num text-[11px] font-bold" />
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
