import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../../lib/socket'
import { t, LOCALE } from '../../lib/i18n'
import { useAuth } from '../../lib/auth'
import { useReveal, justRevealed, guessFirstOn, hideMatch } from '../../lib/reveal'
import CountUp from '../../components/CountUp'
import { RevealCover } from '../../components/Reveal'
import { BB_STATUS, liveLabel, spreadText, bbTeamFav, bbLeagueFav, useBbConfig, type BbGame as Game } from '../../lib/bb'
import { FavStar } from '../../lib/favorites'
import { Card, TeamLogo, LockedNote, rid, rstatus } from './parts'
import { StandingsTable, type Standings } from './BbLeague'
import { MarketsCard, CompareCard, PlayersCard, ModelTable, type Markets, type ModelInfo, type GamePlayer } from './GameExtras'

interface Avg {
  games: number; won: number; lost: number; pointsFor: number; pointsAgainst: number
  fgPct: number | null; threePct: number | null; threeMade: number | null; threeAttempts: number | null; ftPct: number | null
  rebounds: number | null; assists: number | null; steals: number | null; blocks: number | null; turnovers: number | null
  withStats: number; form: ('W' | 'L')[]
}
interface Brief { id: number; kickoff: string; league: string; home: boolean; opponent: string; opponentLogo: string | null; score: string | null; result: 'W' | 'L' | null }
interface Sched { restDays: number | null; backToBack: boolean; games7: number; away7: number; nextIn: number | null; recent: Brief[]; upcoming: Brief[] }
interface BoxPlayer { id: number; name: string; starter: boolean; minutes: number | null; points: number | null; fgm: number | null; fga: number | null; tpm: number | null; tpa: number | null; ftm: number | null; fta: number | null; rebounds: number | null; assists: number | null; steals?: number | null; blocks?: number | null; turnovers?: number | null; plusMinus?: number | null }
interface BoxSide { team: any; players: BoxPlayer[] }
interface Detail {
  game: Game
  why: { kind: 'strength' | 'home' | 'b2b' | 'b2bBoth' | 'injuries' | 'attack'; side: 'H' | 'A'; points: number }[]
  injuries?: { home: Injury[]; away: Injury[] } | null
  ratings: { home: { attack: number; defence: number; net: number } | null; away: { attack: number; defence: number; net: number } | null } | null
  stats: { home: Avg | null; away: Avg | null }
  schedule: { home: Sched; away: Sched }
  h2h: { id: number; kickoff: string; home: string; away: string; homeId: number; score: [number, number]; league: string }[]
  box: { home: BoxSide; away: BoxSide } | null
  standings: Standings | null
  preview?: { home: PreviewSide; away: PreviewSide; h2h: { games: number; homeWins: number; awayWins: number } }
  markets?: Markets | null
  model?: ModelInfo | null
  players?: { home: GamePlayer[]; away: GamePlayer[] }
}
interface Profile { games: number; fgPct: number | null; threePct: number | null; threeAttempts: number | null; ftPct: number | null; rebounds: number | null; assists: number | null; turnovers: number | null; steals: number | null; blocks: number | null }
interface PreviewSide {
  season: string; previousSeason: boolean
  splits: { won: number; lost: number; homeWon: number; homeLost: number; awayWon: number; awayLost: number; b2bWon: number; b2bLost: number; marginHome: number | null; marginAway: number | null; closeWon: number; closeLost: number; games: number }
  streak: { kind: 'W' | 'L'; n: number } | null
  last10: { won: number; lost: number }
  pointsFor: number | null; pointsAgainst: number | null
  ranks: { attack: number; defence: number; overall: number; of: number } | null
  profile: { team: Profile | null; league: Profile | null }
}
interface Injury { name: string; status: string; weight: number; comment: string | null; minutes: number | null; playerId: number | null }
type Tab = 'prediction' | 'stats' | 'players' | 'rest' | 'h2h' | 'table' | 'box'

/** A game page — laid out like football's match page: hero, tabs, prediction first. */
export default function BbGame() {
  const { id = '' } = useParams()
  const { access } = useAuth()
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>(() => {
    const raw = typeof window !== 'undefined' ? window.location.hash.slice(1) : ''
    const h = (raw === 'injuries' ? 'players' : raw) as Tab
    return TABS.includes(h) ? h : 'prediction'
  })
  const pickTab = (x: Tab) => {
    setTab(x)
    try { history.replaceState(null, '', x === 'prediction' ? window.location.pathname + window.location.search : `#${x}`) } catch { /* ignore */ }
  }

  useEffect(() => {
    let cancelled = false
    setD(null); setError(null)
    const load = () =>
      axios.get(`${API_URL}/basketball/game/${id}`)
        .then(r => { if (!cancelled) setD(r.data.data) })
        .catch(e => { if (!cancelled) setError(e?.response?.status === 404 ? t('Game not found') : t('Could not load the game')) })
    load()
    const iv = setInterval(load, 60000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [id, access])
  useEffect(() => {
    if (d) document.title = t('{0} · SportLikely', { 0: `${d.game.home.name} vs ${d.game.away.name}` })
  }, [d?.game.id])

  if (error) return <div className="max-w-5xl mx-auto px-4 py-10"><Link to="/basketball/games" className="text-sm text-muted hover:text-ink">{t('← All games')}</Link><div className="mt-4 card border-loss/40 text-loss rounded-lg p-4">{error}</div></div>
  if (!d) return <div className="max-w-5xl mx-auto px-4 py-16 text-center text-muted">{t('Loading game…')}</div>

  const g = d.game
  const live = g.state === 'live', done = g.state === 'done'
  const showScore = !!g.score && g.state !== 'upcoming'
  const pick = g.prediction?.pick || null
  const pickVar = pick === 'H' ? '--home' : '--away'
  const tabs: { id: Tab; label: string; short?: string; hint: string; live?: boolean }[] = [
    { id: 'prediction', label: t('Prediction'), hint: '' },
    ...(d.box ? [{ id: 'box' as Tab, label: t('Box score'), short: t('Box'), hint: live ? t('Live player stats') : t('Every player: points, shooting, rebounds, assists'), live }] : []),
    { id: 'stats', label: t('Statistics'), short: t('Stats'), hint: t('Averages from the last 10 games') },
    { id: 'players' as Tab, label: d.injuries ? t('Players & injuries') : t('Players'), short: t('Players'), hint: d.injuries ? t('Key players and the NBA injury reports') : t('Each team’s key players this season') },
    { id: 'rest', label: t('Schedule & rest'), short: t('Rest'), hint: t('Back-to-backs, rest days and the next game') },
    { id: 'h2h', label: t('H2H'), hint: t('Last meetings and recent form') },
    ...(d.standings ? [{ id: 'table' as Tab, label: t('Standings'), short: t('Table'), hint: t('{0} table', { 0: g.league.name }) }] : [])
  ]
  const q = g.quarters
  const showQ = showScore && q && q.home.some(x => x !== null)

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28 xl:pb-10">
      <Link to="/basketball/games" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors"><span aria-hidden>←</span> {t('All games')}</Link>

      {/* ---------- hero ---------- */}
      <div className={`mt-4 card relative overflow-hidden p-4 sm:p-8 ${live ? 'shadow-glow border-live/40' : ''}`}>
        {pick && <div className="pointer-events-none absolute inset-0 opacity-[0.10]" style={{ background: `radial-gradient(700px 260px at 50% 120%, rgb(var(${pickVar})), transparent 70%)` }} />}
        <div className="relative flex flex-wrap items-center justify-between gap-2 text-sm text-muted mb-6">
          <div className="flex items-center gap-2">
            <Link to={`/basketball/league/${g.league.code}`} className="font-medium text-ink/90 hover:underline">{g.league.name}</Link>
            <LeagueStar code={g.league.code} name={g.league.name} />
            {g.round && <span className="text-faint">· {g.round}</span>}
            {g.preseason && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-draw/15 text-draw">{t('Pre-season')}</span>}
          </div>
          <div className="text-faint">{new Date(g.kickoff).toLocaleString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
        </div>

        <div className="relative grid grid-cols-[1fr_auto_1fr] items-start sm:items-center gap-2 sm:gap-8">
          <TeamHero team={g.home} align="right" league={g.league.code} />
          <div className="text-center min-w-[96px] sm:min-w-[170px] self-center">
            {showScore ? (
              <div className="num text-5xl sm:text-6xl font-extrabold text-ink tracking-tight">{g.score!.home}<span className="text-faint mx-2 font-light">:</span>{g.score!.away}</div>
            ) : (
              <div className="num text-4xl sm:text-5xl font-extrabold text-ink tracking-tight">{new Date(g.kickoff).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}</div>
            )}
            <div className={`mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider px-3 py-1 rounded-full border ${live ? 'bg-live/10 text-live border-live/30' : done ? 'bg-surface2 text-muted border-line' : 'bg-accent/10 text-accent border-accent/30'}`}>
              {live && <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulseDot" />}
              {live ? liveLabel(g).toUpperCase() : done ? (BB_STATUS[g.status] || t('Final')).toUpperCase() : g.state === 'off' ? (BB_STATUS[g.status] || g.status).toUpperCase() : t('TIP-OFF')}
            </div>
          </div>
          <TeamHero team={g.away} align="left" league={g.league.code} />
        </div>

        {showQ && (
          <div className="relative mt-6 pt-4 border-t border-line/60 overflow-x-auto">
            <table className="mx-auto text-xs num">
              <thead><tr className="text-faint"><th className="px-3 text-left font-semibold" />{['Q1', 'Q2', 'Q3', 'Q4', 'OT'].map((x, i) => (i < 4 || q!.home[4] !== null) && <th key={x} className="px-3 font-semibold">{t(x)}</th>)}<th className="px-3 font-semibold">{t('Total')}</th></tr></thead>
              <tbody>
                {(['home', 'away'] as const).map(s => (
                  <tr key={s}>
                    <td className="px-3 py-0.5 text-muted font-semibold font-sans text-left">{(s === 'home' ? g.home : g.away).name}</td>
                    {q![s].map((v, i) => (i < 4 || q!.home[4] !== null) && <td key={i} className="px-3 text-center text-ink">{v ?? '–'}</td>)}
                    <td className="px-3 text-center text-ink font-bold">{s === 'home' ? g.score!.home : g.score!.away}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------- tabs ---------- */}
      <div className="sticky top-16 sm:top-[72px] z-30 -mx-4 sm:mx-0 mt-6 px-4 sm:px-0 py-2 bg-bg/80 backdrop-blur-xl">
        <nav className="flex gap-1 p-1 rounded-full bg-surface2/60 border border-line/60 overflow-x-auto no-scrollbar" aria-label={t('Game sections')}>
          {tabs.map(x => (
            <button key={x.id} type="button" onClick={() => pickTab(x.id)} aria-current={tab === x.id ? 'page' : undefined}
              className={`flex-1 min-w-max inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-full text-[13px] sm:text-sm font-semibold transition-colors ${tab === x.id ? 'bg-accent text-bg shadow' : 'text-muted hover:text-ink'}`}>
              {x.short ? (<><span className="sm:hidden">{x.short}</span><span className="hidden sm:inline">{x.label}</span></>) : x.label}
              {x.live && <span className={`w-1.5 h-1.5 rounded-full animate-pulseDot ${tab === x.id ? 'bg-bg' : 'bg-live'}`} />}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-4 space-y-6 min-w-0">
        {tab === 'prediction' && (
          <>
            <PredictionSection d={d} />
            <MarketsGate d={d} />
            {d.preview && <CompareCard g={g} home={d.preview.home} away={d.preview.away} table={d.standings ? d.standings.groups.flatMap(x => x.rows) : null} form={d.stats.home && d.stats.away ? { home: d.stats.home.form, away: d.stats.away.form } : null} />}
            {d.players && <PlayersCard g={g} home={d.players.home} away={d.players.away} limit={4} title={t('Players to watch')} />}
            <AnalysisCard d={d} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {tabs.filter(x => x.id !== 'prediction').map(x => (
                <button key={x.id} type="button" onClick={() => pickTab(x.id)} className="card p-4 text-left hover:border-accent/50 transition-colors">
                  <div className="font-display font-bold text-ink">{x.label} <span aria-hidden className="text-accent">→</span></div>
                  <div className="text-xs text-muted mt-1">{x.hint}</div>
                </button>
              ))}
            </div>
          </>
        )}
        {tab === 'box' && d.box && <BoxTab d={d} />}
        {tab === 'stats' && <StatsTab d={d} />}
        {tab === 'players' && (
          <>
            {d.injuries && <InjuriesCard d={d} />}
            {d.players && <PlayersCard g={g} home={d.players.home} away={d.players.away} limit={10} title={t('Key players')} />}
          </>
        )}
        {tab === 'rest' && <RestTab d={d} />}
        {tab === 'h2h' && (
          <Card title={t('Last meetings')}>
            {d.h2h.length ? (
              <ul className="divide-y divide-line/50">
                {d.h2h.map(m => {
                  const homeWon = m.score[0] > m.score[1]
                  return (
                    <li key={m.id}>
                      <Link to={`/basketball/game/${m.id}`} className="flex items-center gap-3 py-2 text-sm hover:bg-surface2/50 rounded-lg px-2">
                        <span className="w-20 text-xs text-faint">{new Date(m.kickoff).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                        <span className={`flex-1 truncate text-right ${homeWon ? 'font-bold text-ink' : 'text-muted'}`}>{m.home}</span>
                        <span className="num font-bold text-ink w-20 text-center">{m.score[0]}–{m.score[1]}</span>
                        <span className={`flex-1 truncate ${!homeWon ? 'font-bold text-ink' : 'text-muted'}`}>{m.away}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : <p className="text-sm text-faint">{t('These teams have not met in the seasons we hold.')}</p>}
            <p className="mt-3 text-[11px] text-faint">{t('Meetings in our leagues over the last five seasons.')}</p>
          </Card>
        )}
        {tab === 'table' && d.standings && (
          <Card title={t('Standings')} action={<span className="text-xs text-faint">{g.league.name}</span>}>
            <StandingsTable data={d.standings} mark={[g.home.id, g.away.id]} />
          </Card>
        )}
      </div>
    </div>
  )
}

const TABS: Tab[] = ['prediction', 'box', 'stats', 'players', 'rest', 'h2h', 'table']

function LeagueStar({ code, name }: { code: string; name: string }) {
  const cfg = useBbConfig()
  const logo = cfg?.leagues.find(l => l.code === code)?.logo || null
  return <FavStar size="sm" fav={bbLeagueFav({ code, name, logo })} />
}

function TeamHero({ team, align, league }: { team: Game['home']; align: 'left' | 'right'; league: string }) {
  return (
    <Link to={`/basketball/team/${team.id}`} className={`flex flex-col items-center text-center gap-2 sm:gap-4 min-w-0 hover:opacity-90 ${align === 'right' ? 'sm:flex-row-reverse sm:text-right' : 'sm:flex-row sm:text-left'}`}>
      <TeamLogo team={team} size={72} />
      <div className="min-w-0 w-full sm:w-auto">
        <div className="font-sans font-extrabold text-[15px] sm:font-display sm:text-2xl text-ink leading-tight break-words sm:truncate">{team.name}</div>
        <div className={`flex items-center justify-center gap-1 mt-1 sm:mt-0.5 ${align === 'right' ? 'sm:justify-end' : 'sm:justify-start'}`}>
          <span className="text-[11px] text-accent font-semibold whitespace-nowrap">{t('Team page →')}</span>
          <FavStar size="sm" fav={bbTeamFav(team, league)} />
        </div>
      </div>
    </Link>
  )
}

function Tile({ k, label, v, active, roll, delay = 0, text }: { k: 'H' | 'A' | 'T'; label: string; v?: number; active: boolean; roll: boolean; delay?: number; text?: string }) {
  const color = k === 'H' ? 'text-home' : k === 'A' ? 'text-away' : 'text-ink'
  const border = k === 'H' ? 'border-home/50 bg-home/10' : 'border-away/50 bg-away/10'
  return (
    <div className={`rounded-xl border p-3 sm:p-4 text-center ${active ? border : 'border-line/70 bg-surface2/40'} ${roll && active ? 'animate-pop' : ''}`}>
      <div className="text-[11px] text-faint mb-1 truncate">
        {k !== 'T' && <span className={`font-bold mr-1 ${active ? color : ''}`}>{k === 'H' ? '1' : '2'}</span>}
        {label}
      </div>
      <div className={`num text-2xl sm:text-3xl font-extrabold ${active ? color : k === 'T' ? 'text-ink' : 'text-ink/70'}`}>
        {text !== undefined ? text : <CountUp value={v || 0} decimals={1} suffix="%" animate={roll} delay={delay} />}
      </div>
    </div>
  )
}

/** Prediction: who wins (1 · total · 2), how strong the pick is, the spread, total and predicted score, and why. */
function PredictionSection({ d }: { d: Detail }) {
  const g = d.game
  const p = g.prediction
  const { hidden, reveal } = useReveal(rid(g), rstatus(g), !!p && !p.locked)
  const [anim, setAnim] = useState(false)
  const roll = justRevealed(rid(g))
  const note = p ? [p.model || 'bb-v1', g.state === 'upcoming' ? t('Updated until tip-off') : t('Saved before tip-off')].join(' · ') : undefined
  return (
    <Card title={t('Prediction')} action={note ? <span className="text-xs text-faint">{note}</span> : undefined}>
      {!p ? (
        <p className="text-sm text-faint">{t('No prediction for this game.')}</p>
      ) : p.locked ? (
        <div className="space-y-4">
          {p.pick && (
            <div className="flex items-center gap-3">
              <TeamLogo team={p.pick === 'H' ? g.home : g.away} size={40} />
              <div>
                <div className="text-xs text-faint">{t('Our pick')}</div>
                <div className={`font-display text-xl font-extrabold ${p.pick === 'H' ? 'text-home' : 'text-away'}`}>{t('{0} to win', { 0: (p.pick === 'H' ? g.home : g.away).name })}</div>
              </div>
            </div>
          )}
          <LockedNote />
        </div>
      ) : hidden || anim ? (
        <RevealCover key={anim ? 'auto' : 'cover'} autoStart={anim} onReveal={() => { setAnim(false); reveal() }} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Tile k="H" label={g.home.name} v={p.pHome} active={p.pick === 'H'} roll={roll} />
            <Tile k="T" label={t('Total points')} text={p.total !== undefined ? p.total.toFixed(1) : '–'} active={false} roll={roll} />
            <Tile k="A" label={g.away.name} v={p.pAway} active={p.pick === 'A'} roll={roll} delay={240} />
          </div>
          {(() => {
            const topV = Math.max(p.pHome || 0, p.pAway || 0)
            const team = p.pick === 'H' ? g.home : g.away
            return (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${topV >= 70 ? 'bg-accent/15 text-accent border-accent/40' : topV >= 60 ? 'bg-accent/15 text-accent border-accent/40' : 'bg-surface2 text-ink border-line'}`}>
                  {topV >= 80 ? t('Very strong pick') : topV >= 70 ? t('Strong pick') : topV >= 55 ? t('Pick') : t('Close game')}
                </span>
                <span className="text-muted">{team.name} <span className="num text-ink font-semibold">{Math.round(topV)}%</span></span>
                {p.hit !== null && <span className={`ml-auto rounded-full px-3 py-1 text-xs font-bold ${p.hit ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss'}`}>{p.hit ? t('Right') : t('Wrong')}</span>}
              </div>
            )
          })()}
          <div className="flex h-2.5 gap-[3px] mt-4">
            <div className={`rounded-full bg-home ${p.pick === 'H' ? '' : 'opacity-35'}`} style={{ width: `calc(${p.pHome}% - 2px)` }} />
            <div className={`rounded-full bg-away ${p.pick === 'A' ? '' : 'opacity-35'}`} style={{ width: `calc(${p.pAway}% - 2px)` }} />
          </div>

          {g.state !== 'upcoming' && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="px-2.5 py-1 rounded-full bg-surface2 border border-line font-semibold text-ink">{t('Saved before tip-off')}</span>
              <span>{t('This is exactly what we predicted before the game — it is never recalculated after the result.')}</span>
            </div>
          )}

          {/* points */}
          <div className="mt-5 grid grid-cols-3 gap-2">
            <Stat label={t('Point spread')} value={spreadText(g) || '–'} />
            <Stat label={t('Predicted score')} value={p.score ? `${p.score.home}–${p.score.away}` : '–'} />
            <Stat label={t('Total points')} value={p.total !== undefined ? p.total.toFixed(1) : '–'} />
          </div>

          {/* why */}
          {d.why.length > 0 && (
            <div className="mt-5 rounded-2xl border border-line/60 bg-surface2/30 p-4">
              <div className="text-sm font-bold text-ink mb-2">{t('Why we think so')}</div>
              <ul className="space-y-2">
                {d.why.map((w, i) => {
                  const team = w.side === 'H' ? g.home : g.away
                  const other = w.side === 'H' ? g.away : g.home
                  const pv = d.preview
                  const mine = pv ? (w.side === 'H' ? pv.home : pv.away) : null
                  const theirs = pv ? (w.side === 'H' ? pv.away : pv.home) : null
                  const pts = Math.abs(w.points).toFixed(1)
                  let text: string
                  let tone: 'H' | 'A' | 'N' = w.side
                  if (w.kind === 'strength') {
                    text = mine?.ranks && theirs?.ranks
                      ? t('{0} are the stronger team: about {1} points per game better in our ratings (overall rank {2} against {3}, out of {4}).', { 0: team.name, 1: pts, 2: mine.ranks.overall, 3: theirs.ranks.overall, 4: mine.ranks.of })
                      : t('{0} are the stronger team: about {1} points per game better in our ratings.', { 0: team.name, 1: pts })
                  } else if (w.kind === 'attack') {
                    const dr = theirs?.ranks?.defence
                    text = w.points > 0
                      ? (dr ? t('{0} should score about {1} points more than an average team against {2}’s defence (rank {3}).', { 0: team.name, 1: pts, 2: other.name, 3: dr }) : t('{0} should score about {1} points more than an average team against {2}’s defence.', { 0: team.name, 1: pts, 2: other.name }))
                      : (dr ? t('{0}’s defence (rank {1}) should hold {2} to about {3} points below an average team.', { 0: other.name, 1: dr, 2: team.name, 3: pts }) : t('{0}’s defence should hold {1} to about {2} points below an average team.', { 0: other.name, 1: team.name, 2: pts }))
                    tone = w.points > 0 ? w.side : (w.side === 'H' ? 'A' : 'H')
                  } else if (w.kind === 'home') {
                    const sp = mine?.splits
                    text = sp && sp.homeWon + sp.homeLost > 0 && !mine?.previousSeason
                      ? t('Home court is worth about {0} points to {1} (home record this season: {2}–{3}).', { 0: pts, 1: team.name, 2: sp.homeWon, 3: sp.homeLost })
                      : t('Home court is worth about {0} points to {1}.', { 0: pts, 1: team.name })
                  } else if (w.kind === 'b2b') {
                    text = t('{0} played last night (second game of a back-to-back), which costs about {1} points.', { 0: other.name, 1: pts })
                  } else if (w.kind === 'b2bBoth') {
                    text = t('Both teams played last night, so tiredness evens out.')
                    tone = 'N'
                  } else {
                    text = t('Injuries hurt {0} more: they are missing about {1} points of production.', { 0: other.name, 1: pts })
                  }
                  const sub = w.kind === 'attack'
                  return (
                    <li key={i} className={`flex items-start gap-3 text-sm ${sub ? 'pl-5' : ''}`}>
                      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${tone === 'H' ? 'bg-home' : tone === 'A' ? 'bg-away' : 'bg-faint'} ${sub ? 'opacity-60' : ''}`} />
                      <span className={`flex-1 leading-snug ${sub ? 'text-muted' : 'text-ink'}`}>{text}</span>
                      {w.points !== 0 && w.kind !== 'b2bBoth' && (
                        <span className={`num text-xs font-bold whitespace-nowrap ${tone === 'H' ? 'text-home' : tone === 'A' ? 'text-away' : 'text-muted'}`}>
                          {tone === 'N' ? '' : '+'}{pts} {t('pts')}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
              {d.model ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-muted hover:text-ink select-none">{t('How this was calculated')}</summary>
                  <ModelTable g={g} model={d.model} ratings={d.ratings} />
                </details>
              ) : null}
            </div>
          )}

          {guessFirstOn() && g.state === 'upcoming' && (
            <div className="mt-2 text-right">
              <button type="button" onClick={() => hideMatch(rid(g))} className="text-xs text-faint hover:text-ink underline underline-offset-4">{t('Hide prediction again')}</button>
            </div>
          )}
        </>
      )}
    </Card>
  )
}

/** Written preview: form, home/away record, ratings, rest, shooting, meetings and our verdict — in plain sentences. */
function AnalysisCard({ d }: { d: Detail }) {
  const g = d.game
  const pv = d.preview
  const { hidden } = useReveal(rid(g), rstatus(g), !!g.prediction && !g.prediction.locked)
  if (!pv) return null
  const H = g.home.name, A = g.away.name
  const paras: string[] = []
  const rec = (side: PreviewSide, name: string, home: boolean) => {
    const s = side.splits
    if (!s.games) return null
    const where = home ? t('{0}–{1} at home', { 0: s.homeWon, 1: s.homeLost }) : t('{0}–{1} on the road', { 0: s.awayWon, 1: s.awayLost })
    return side.previousSeason
      ? t('Last season {0} went {1}–{2} ({3}).', { 0: name, 1: s.won, 2: s.lost, 3: where })
      : t('{0} are {1}–{2} this season ({3}) and have won {4} of their last {5}.', { 0: name, 1: s.won, 2: s.lost, 3: where, 4: side.last10.won, 5: side.last10.won + side.last10.lost })
  }
  const form = [rec(pv.home, H, true), rec(pv.away, A, false)].filter(Boolean).join(' ')
  if (form) paras.push(form)
  const streaks = ([[pv.home, H], [pv.away, A]] as const)
    .filter(([s]) => !s.previousSeason && s.streak && s.streak.n >= 3)
    .map(([s, n]) => (s.streak!.kind === 'W' ? t('{0} have won {1} in a row.', { 0: n, 1: s.streak!.n }) : t('{0} have lost {1} in a row.', { 0: n, 1: s.streak!.n })))
  if (streaks.length) paras.push(streaks.join(' '))
  const rh = pv.home.ranks, ra = pv.away.ranks
  if (rh && ra) {
    paras.push(t('In our ratings {0} rank {1} in attack and {2} in defence out of {3} teams; {4} rank {5} and {6}.', { 0: H, 1: rh.attack, 2: rh.defence, 3: rh.of, 4: A, 5: ra.attack, 6: ra.defence }))
    // the key matchup: the bigger gap between one side's attack and the other side's defence
    const gapH = ra.defence - rh.attack, gapA = rh.defence - ra.attack
    const [att, def, ar, dr] = gapH >= gapA ? [H, A, rh.attack, ra.defence] : [A, H, ra.attack, rh.defence]
    if (Math.abs(gapH - gapA) >= 3) paras.push(t('The key matchup: {0}’s attack (rank {1}) against {2}’s defence (rank {3}).', { 0: att, 1: ar, 2: def, 3: dr }))
  }
  const sh = d.schedule.home, sa = d.schedule.away
  if (sh.backToBack || sa.backToBack) {
    paras.push([sh.backToBack ? t('{0} played last night (second game of a back-to-back).', { 0: H }) : '', sa.backToBack ? t('{0} played last night (second game of a back-to-back).', { 0: A }) : ''].filter(Boolean).join(' '))
  } else if (sh.restDays !== null && sa.restDays !== null && Math.abs(Math.floor(sh.restDays) - Math.floor(sa.restDays)) >= 2) {
    const fresher = sh.restDays > sa.restDays ? H : A
    paras.push(t('{0} are fresher, with {1} more days of rest.', { 0: fresher, 1: Math.abs(Math.floor(sh.restDays) - Math.floor(sa.restDays)) }))
  }
  const ph = pv.home.profile, pa = pv.away.profile
  if (ph.team && pa.team && ph.league && ph.team.threePct !== null && pa.team.threePct !== null && ph.league.threePct !== null) {
    const lg = ph.league.threePct
    const best = ph.team.threePct - lg >= pa.team.threePct - lg ? [H, ph.team.threePct] as const : [A, pa.team.threePct] as const
    if (Math.abs(best[1] - lg) >= 1.5) paras.push(best[1] > lg
      ? t('{0} shoot {1}% from three, above the league average of {2}%.', { 0: best[0], 1: best[1], 2: lg })
      : t('Both teams shoot below the league average from three ({0}%).', { 0: lg }))
  }
  if (d.injuries) {
    const key = (list: Injury[], name: string) => {
      const out = list.filter(x => x.weight >= 1 && (x.minutes || 0) >= 12).map(x => x.name)
      const maybe = list.filter(x => x.weight >= 0.4 && x.weight < 1 && (x.minutes || 0) >= 12).map(x => x.name)
      return [out.length ? t('{0} will be without {1}.', { 0: name, 1: out.join(', ') }) : '', maybe.length ? t('For {0}, {1} may not play.', { 0: name, 1: maybe.join(', ') }) : ''].filter(Boolean).join(' ')
    }
    const txt = [key(d.injuries.home, H), key(d.injuries.away, A)].filter(Boolean).join(' ')
    if (txt) paras.push(txt)
  }
  if (pv.h2h.games > 0) paras.push(t('In their last {0} meetings {1} won {2} and {3} won {4}.', { 0: pv.h2h.games, 1: H, 2: pv.h2h.homeWins, 3: A, 4: pv.h2h.awayWins }))
  const p = g.prediction
  if (p?.pick && !hidden) {
    const team = p.pick === 'H' ? H : A
    paras.push(!p.locked && typeof p.pHome === 'number'
      ? t('Our verdict: {0} with {1}%, by about {2} points, with around {3} points in total.', { 0: team, 1: Math.round(p.pick === 'H' ? p.pHome : p.pAway!), 2: Math.abs(p.spread || 0).toFixed(1), 3: (p.total || 0).toFixed(0) })
      : t('Our pick: {0}.', { 0: team }))
  }
  if (!paras.length) return null
  return (
    <Card title={g.state === 'upcoming' ? t('Our analysis') : t('Our analysis before the game')}>
      <div className="space-y-3 text-[15px] leading-relaxed text-ink/90">
        {paras.map((x, i) => <p key={i}>{x}</p>)}
      </div>
      <p className="mt-4 text-[11px] text-faint">{t('Written from the numbers: this season’s results, our team ratings, the schedule and box scores.')}</p>
    </Card>
  )
}

/** NBA injury list of both teams; regulars (12+ minutes) are the ones the model takes points off for. */
function InjuriesCard({ d }: { d: Detail }) {
  const g = d.game
  const side = (team: Game['home'], list: Injury[], pts?: number) => (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <TeamLogo team={team} size={22} />
        <span className="font-display font-bold text-ink">{team.name}</span>
        {pts ? <span className="ml-auto text-xs font-bold text-loss num">−{pts.toFixed(1)} {t('pts')}</span> : null}
      </div>
      {list.length === 0 ? <p className="text-sm text-faint">{t('No injuries listed.')}</p> : (
        <ul className="space-y-2">
          {list.map(x => (
            <li key={x.name} className="text-sm">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${x.weight >= 1 ? 'bg-loss' : x.weight >= 0.4 ? 'bg-draw' : 'bg-faint'}`} />
                {x.playerId ? <Link to={`/basketball/player/${x.playerId}`} className="text-ink font-semibold truncate hover:text-accent">{x.name}</Link> : <span className="text-ink font-semibold truncate">{x.name}</span>}
                {x.minutes !== null && <span className="text-[11px] text-faint num">{t('{0} min', { 0: x.minutes })}</span>}
                <span className={`ml-auto text-xs font-bold ${x.weight >= 1 ? 'text-loss' : 'text-draw'}`}>{x.status}</span>
              </div>
              {x.comment && <p className="mt-0.5 ml-4 text-xs text-muted line-clamp-2">{x.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
  return (
    <Card title={t('Injuries')} action={<span className="text-xs text-faint">{t('Updated every 15 minutes')}</span>}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        {side(g.home, d.injuries!.home, g.prediction?.injHome)}
        {side(g.away, d.injuries!.away, g.prediction?.injAway)}
      </div>
      <p className="mt-4 text-[11px] text-faint">{t('Our prediction takes off the points a team is expected to lose without its injured regulars (by minutes and production; doubtful and questionable players count partly).')}</p>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface2/60 border border-line/50 p-3 text-center">
      <div className="num text-sm sm:text-base font-bold text-ink truncate">{value}</div>
      <div className="text-[10px] text-faint mt-0.5">{label}</div>
    </div>
  )
}

const ROWS: { k: keyof Avg; label: string; pct?: boolean; lowerBetter?: boolean }[] = [
  { k: 'pointsFor', label: t('Points scored') },
  { k: 'pointsAgainst', label: t('Points allowed'), lowerBetter: true },
  { k: 'fgPct', label: t('Field goal %'), pct: true },
  { k: 'threePct', label: t('3-point %'), pct: true },
  { k: 'threeMade', label: t('3-pointers made') },
  { k: 'ftPct', label: t('Free throw %'), pct: true },
  { k: 'rebounds', label: t('Rebounds') },
  { k: 'assists', label: t('Assists') },
  { k: 'steals', label: t('Steals') },
  { k: 'blocks', label: t('Blocks') },
  { k: 'turnovers', label: t('Turnovers'), lowerBetter: true }
]

function StatsTab({ d }: { d: Detail }) {
  const { home, away } = d.stats
  if (!home || !away) return <Card><p className="text-sm text-faint">{t('Not enough games yet for averages.')}</p></Card>
  return (
    <Card title={t('Averages, last {0} games', { 0: Math.max(home.games, away.games) })}>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 text-xs font-bold text-muted mb-2">
        <span className="truncate text-home">{d.game.home.name}</span><span /><span className="truncate text-right text-away">{d.game.away.name}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 mb-3">
        <Form f={home.form} /><span className="text-[11px] text-faint">{t('Form')}</span><div className="flex justify-end"><Form f={away.form} /></div>
      </div>
      <ul className="space-y-2">
        {ROWS.map(r => {
          const a = home[r.k] as number | null, b = away[r.k] as number | null
          if (a === null || b === null) return null
          const better = a === b ? 0 : (a > b) !== !!r.lowerBetter ? -1 : 1
          return (
            <li key={r.k} className="grid grid-cols-[1fr_auto_1fr] gap-x-3 items-center text-sm">
              <span className={`num ${better === -1 ? 'text-ink font-bold' : 'text-muted'}`}>{a}{r.pct ? '%' : ''}</span>
              <span className="text-[11px] text-faint text-center w-32">{r.label}</span>
              <span className={`num text-right ${better === 1 ? 'text-ink font-bold' : 'text-muted'}`}>{b}{r.pct ? '%' : ''}</span>
            </li>
          )
        })}
      </ul>
      {(home.withStats < home.games || away.withStats < away.games) && <p className="mt-3 text-[11px] text-faint">{t('Shooting and other stats from the games with a box score.')}</p>}
    </Card>
  )
}

function Form({ f }: { f: ('W' | 'L')[] }) {
  return <div className="flex gap-1">{f.map((r, i) => <span key={i} className={`w-5 h-5 rounded text-[10px] font-bold grid place-items-center ${r === 'W' ? 'bg-win text-bg' : 'bg-loss text-bg'}`}>{r === 'W' ? t('W') : t('L')}</span>)}</div>
}

function RestTab({ d }: { d: Detail }) {
  const g = d.game
  const panel = (team: Game['home'], s: Sched) => (
    <div>
      <div className="flex items-center gap-2 mb-3"><TeamLogo team={team} size={22} /><span className="font-display font-bold text-ink">{team.name}</span></div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat label={t('Days of rest')} value={s.restDays === null ? '–' : s.backToBack ? t('B2B') : Math.floor(s.restDays)} />
        <Stat label={t('Games, last 7 days')} value={s.games7} />
        <Stat label={t('Next game in')} value={s.nextIn === null ? '–' : t('{0} d', { 0: Math.floor(s.nextIn) })} />
      </div>
      {s.backToBack && <p className="text-xs text-draw font-semibold mb-2">{t('Second night of a back-to-back')}</p>}
      {s.recent.length > 0 && <div className="label pb-1">{t('Before this game')}</div>}
      <ul className="space-y-1 mb-3">{s.recent.map(b => <BriefRow key={b.id} b={b} />)}</ul>
      {s.upcoming.length > 0 && <div className="label pb-1">{t('After this game')}</div>}
      <ul className="space-y-1">{s.upcoming.map(b => <BriefRow key={b.id} b={b} />)}</ul>
    </div>
  )
  return (
    <Card title={t('Schedule & rest')}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        {panel(g.home, d.schedule.home)}
        {panel(g.away, d.schedule.away)}
      </div>
    </Card>
  )
}

function BriefRow({ b }: { b: Brief }) {
  return (
    <li>
      <Link to={`/basketball/game/${b.id}`} className="flex items-center gap-2 text-xs py-0.5 hover:text-accent">
        <span className="num text-faint w-14 shrink-0">{new Date(b.kickoff).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}</span>
        <span className="text-faint w-4 shrink-0">{b.home ? t('H') : t('A')}</span>
        {b.opponentLogo && <img src={b.opponentLogo} alt="" className="w-4 h-4 object-contain shrink-0" loading="lazy" />}
        <span className="text-ink truncate">{b.opponent}</span>
        {b.score && <span className="ml-auto num text-muted">{b.score}</span>}
        {b.result && <span className={`w-4 text-center font-bold ${b.result === 'W' ? 'text-win' : 'text-loss'}`}>{b.result === 'W' ? t('W') : t('L')}</span>}
      </Link>
    </li>
  )
}

function BoxTab({ d }: { d: Detail }) {
  const g = d.game
  const side = (team: Game['home'], s: BoxSide) => {
    const more = s.players.some(p => p.plusMinus !== undefined && p.plusMinus !== null)
    return (
    <Card title={team.name}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs num">
          <thead>
            <tr className="text-faint">
              <th className="text-left font-semibold py-1">{t('Player')}</th>
              <th className="text-right font-semibold px-1">{t('MIN')}</th>
              <th className="text-right font-semibold px-1">{t('PTS')}</th>
              <th className="text-right font-semibold px-1">{t('FG')}</th>
              <th className="text-right font-semibold px-1">{t('3PT')}</th>
              <th className="text-right font-semibold px-1">{t('FT')}</th>
              <th className="text-right font-semibold px-1">{t('REB')}</th>
              <th className="text-right font-semibold px-1">{t('AST')}</th>
              {more && <><th className="text-right font-semibold px-1">{t('STL')}</th><th className="text-right font-semibold px-1">{t('BLK')}</th><th className="text-right font-semibold px-1">{t('TO')}</th><th className="text-right font-semibold px-1">+/−</th></>}
            </tr>
          </thead>
          <tbody>
            {s.players.map(pl => (
              <tr key={pl.id} className="border-t border-line/40">
                <td className="py-1 font-sans text-ink whitespace-nowrap"><Link to={`/basketball/player/${pl.id}`} className="hover:text-accent">{pl.name}</Link>{pl.starter && <span className="ml-1 text-[9px] text-accent font-bold">{t('S')}</span>}</td>
                <td className="text-right px-1 text-muted">{pl.minutes !== null ? Math.round(pl.minutes) : '–'}</td>
                <td className="text-right px-1 text-ink font-bold">{pl.points ?? '–'}</td>
                <td className="text-right px-1 text-muted">{pl.fgm ?? 0}/{pl.fga ?? 0}</td>
                <td className="text-right px-1 text-muted">{pl.tpm ?? 0}/{pl.tpa ?? 0}</td>
                <td className="text-right px-1 text-muted">{pl.ftm ?? 0}/{pl.fta ?? 0}</td>
                <td className="text-right px-1 text-muted">{pl.rebounds ?? '–'}</td>
                <td className="text-right px-1 text-muted">{pl.assists ?? '–'}</td>
                {more && <>
                  <td className="text-right px-1 text-muted">{pl.steals ?? '–'}</td>
                  <td className="text-right px-1 text-muted">{pl.blocks ?? '–'}</td>
                  <td className="text-right px-1 text-muted">{pl.turnovers ?? '–'}</td>
                  <td className={`text-right px-1 ${pl.plusMinus == null ? 'text-faint' : pl.plusMinus > 0 ? 'text-win' : pl.plusMinus < 0 ? 'text-loss' : 'text-muted'}`}>{pl.plusMinus == null ? '–' : pl.plusMinus > 0 ? `+${pl.plusMinus}` : pl.plusMinus}</td>
                </>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
    )
  }
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {side(g.home, d.box!.home)}
      {side(g.away, d.box!.away)}
    </div>
  )
}

/** Points markets, shown once the prediction is uncovered (never under the reveal cover). */
function MarketsGate({ d }: { d: Detail }) {
  const g = d.game
  const { hidden } = useReveal(rid(g), rstatus(g), !!g.prediction && !g.prediction.locked)
  if (!d.markets || hidden) return null
  return <MarketsCard g={g} m={d.markets} />
}
