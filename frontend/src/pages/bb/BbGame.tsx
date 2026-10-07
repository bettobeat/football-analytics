import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../../lib/socket'
import { t, LOCALE } from '../../lib/i18n'
import { BB_STATUS, dayOf, timeOf, spreadText, type BbGame as Game } from '../../lib/bb'
import { Card, TeamLogo, LockedNote } from './parts'
import { StandingsTable, type Standings } from './BbLeague'

interface Avg {
  games: number; won: number; lost: number; pointsFor: number; pointsAgainst: number
  fgPct: number | null; threePct: number | null; threeMade: number | null; threeAttempts: number | null; ftPct: number | null
  rebounds: number | null; assists: number | null; steals: number | null; blocks: number | null; turnovers: number | null
  withStats: number; form: ('W' | 'L')[]
}
interface Brief { id: number; kickoff: string; league: string; home: boolean; opponent: string; opponentLogo: string | null; score: string | null; result: 'W' | 'L' | null }
interface Sched { restDays: number | null; backToBack: boolean; games7: number; away7: number; nextIn: number | null; recent: Brief[]; upcoming: Brief[] }
interface BoxPlayer { id: number; name: string; starter: boolean; minutes: number | null; points: number | null; fgm: number | null; fga: number | null; tpm: number | null; tpa: number | null; ftm: number | null; fta: number | null; rebounds: number | null; assists: number | null }
interface BoxSide { team: any; players: BoxPlayer[] }
interface Detail {
  game: Game
  why: { kind: 'strength' | 'home' | 'b2b'; side: 'H' | 'A'; points: number }[]
  ratings: { home: { attack: number; defence: number; net: number } | null; away: { attack: number; defence: number; net: number } | null } | null
  stats: { home: Avg | null; away: Avg | null }
  schedule: { home: Sched; away: Sched }
  h2h: { id: number; kickoff: string; home: string; away: string; homeId: number; score: [number, number]; league: string }[]
  box: { home: BoxSide; away: BoxSide } | null
  standings: Standings | null
}
type Tab = 'prediction' | 'stats' | 'rest' | 'h2h' | 'table' | 'box'

export default function BbGame() {
  const { id = '' } = useParams()
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('prediction')

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
  }, [id])
  useEffect(() => {
    if (d) document.title = t('{0} · SportLikely', { 0: `${d.game.home.name} vs ${d.game.away.name}` })
  }, [d?.game.id])

  if (error) return <div className="max-w-5xl mx-auto px-4 py-10"><Link to="/basketball/games" className="text-sm text-muted">{t('← All games')}</Link><div className="mt-4 card p-4 text-loss">{error}</div></div>
  if (!d) return <div className="max-w-5xl mx-auto px-4 py-16 text-center text-muted">{t('Loading game…')}</div>

  const g = d.game
  const p = g.prediction
  const showScore = g.score && g.state !== 'upcoming'
  const tabs: { id: Tab; label: string; short?: string }[] = [
    { id: 'prediction', label: t('Prediction') },
    ...(d.box ? [{ id: 'box' as Tab, label: t('Box score'), short: t('Box') }] : []),
    { id: 'stats', label: t('Statistics'), short: t('Stats') },
    { id: 'rest', label: t('Schedule & rest'), short: t('Rest') },
    { id: 'h2h', label: t('H2H') },
    ...(d.standings ? [{ id: 'table' as Tab, label: t('Standings'), short: t('Table') }] : [])
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28 xl:pb-10">
      <Link to="/basketball/games" className="text-sm text-muted hover:text-ink">{t('← All games')}</Link>

      {/* hero */}
      <div className={`mt-4 card p-4 sm:p-8 ${g.state === 'live' ? 'border-live/40 shadow-glow' : ''}`}>
        <div className="text-center text-xs text-faint mb-4">
          <Link to={`/basketball/league/${g.league.code}`} className="hover:text-ink font-semibold">{g.league.name}</Link>
          {g.round ? ` · ${g.round}` : ''}{g.preseason ? ` · ${t('Pre-season')}` : ''}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
          <HeroTeam team={g.home} label={t('Home')} />
          <div className="text-center">
            {showScore ? (
              <div className="font-display num text-4xl sm:text-5xl font-extrabold text-ink">{g.score!.home}<span className="text-faint mx-1.5">–</span>{g.score!.away}</div>
            ) : (
              <div className="font-display num text-2xl sm:text-3xl font-extrabold text-ink">{timeOf(g.kickoff)}</div>
            )}
            <div className={`mt-1 text-xs font-bold ${g.state === 'live' ? 'text-live' : 'text-faint'}`}>
              {g.state === 'upcoming' ? dayOf(g.kickoff) : BB_STATUS[g.status] || g.status}
            </div>
          </div>
          <HeroTeam team={g.away} label={t('Away')} />
        </div>
        {g.quarters && showScore && g.quarters.home.some(x => x !== null) && (
          <div className="mt-5 overflow-x-auto">
            <table className="mx-auto text-xs num">
              <thead><tr className="text-faint"><th className="px-2 text-left font-semibold"></th>{['Q1', 'Q2', 'Q3', 'Q4', 'OT'].map((q, i) => (g.quarters!.home[i] !== null || i < 4) && <th key={q} className="px-2 font-semibold">{q}</th>)}</tr></thead>
              <tbody>
                {(['home', 'away'] as const).map(s => (
                  <tr key={s}><td className="px-2 text-muted font-semibold">{(s === 'home' ? g.home : g.away).name}</td>{g.quarters![s].map((v, i) => (g.quarters!.home[i] !== null || i < 4) && <td key={i} className="px-2 text-center text-ink">{v ?? '–'}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* tabs */}
      <div className="sticky top-16 sm:top-[72px] z-30 -mx-4 sm:mx-0 mt-6 px-4 sm:px-0 py-2 bg-bg/80 backdrop-blur-xl">
        <nav className="flex gap-1 p-1 rounded-full bg-surface2/60 border border-line/60 overflow-x-auto no-scrollbar">
          {tabs.map(x => (
            <button key={x.id} onClick={() => setTab(x.id)} className={`flex-1 min-w-max px-2.5 sm:px-4 py-2 rounded-full text-[13px] sm:text-sm font-semibold ${tab === x.id ? 'bg-accent text-bg shadow' : 'text-muted hover:text-ink'}`}>
              {x.short ? (<><span className="sm:hidden">{x.short}</span><span className="hidden sm:inline">{x.label}</span></>) : x.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-4 space-y-6">
        {tab === 'prediction' && <PredictionTab d={d} />}
        {tab === 'box' && d.box && <BoxTab d={d} />}
        {tab === 'stats' && <StatsTab d={d} />}
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
            {p && p.pick && <p className="mt-3 text-[11px] text-faint">{t('Meetings in our leagues over the last five seasons.')}</p>}
          </Card>
        )}
        {tab === 'table' && d.standings && (
          <Card title={t('Standings')}>
            <StandingsTable data={d.standings} mark={[g.home.id, g.away.id]} />
          </Card>
        )}
      </div>
    </div>
  )
}

function HeroTeam({ team, label }: { team: Game['home']; label: string }) {
  return (
    <Link to={`/basketball/team/${team.id}`} className="flex flex-col items-center gap-2 text-center min-w-0 group">
      <TeamLogo team={team} size={56} />
      <span className="font-display text-sm sm:text-lg font-bold text-ink group-hover:text-accent break-words">{team.name}</span>
      <span className="text-[10px] uppercase tracking-wide text-faint">{label}</span>
    </Link>
  )
}

function PredictionTab({ d }: { d: Detail }) {
  const g = d.game
  const p = g.prediction
  if (!p) return <Card><p className="text-sm text-faint">{t('No prediction for this game.')}</p></Card>
  const pickTeam = p.pick === 'H' ? g.home : g.away
  const home = p.pHome ?? null
  return (
    <>
      <Card title={g.state === 'upcoming' ? t('Prediction') : t('Our prediction before tip-off')}>
        <div className="flex items-center gap-3">
          <TeamLogo team={pickTeam} size={40} />
          <div>
            <div className="text-xs text-faint">{t('Our pick')}</div>
            <div className={`font-display text-xl sm:text-2xl font-extrabold ${p.pick === 'H' ? 'text-home' : 'text-away'}`}>{t('{0} to win', { 0: pickTeam.name })}</div>
          </div>
          {p.hit !== null && (
            <span className={`ml-auto rounded-full px-3 py-1 text-xs font-bold ${p.hit ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss'}`}>{p.hit ? t('Right') : t('Wrong')}</span>
          )}
        </div>

        {p.locked ? (
          <div className="mt-5"><LockedNote /></div>
        ) : home !== null && (
          <>
            <div className="mt-6">
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <span className="text-home">{g.home.name} <span className="num">{home.toFixed(1)}%</span></span>
                <span className="text-away"><span className="num">{(100 - home).toFixed(1)}%</span> {g.away.name}</span>
              </div>
              <div className="h-3 rounded-full overflow-hidden flex bg-surface2">
                <div className="bg-home" style={{ width: `${home}%` }} />
                <div className="bg-away" style={{ width: `${100 - home}%` }} />
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <Stat label={t('Point spread')} value={spreadText(g) || '–'} />
              <Stat label={t('Total points')} value={p.total !== undefined ? p.total.toFixed(1) : '–'} />
              <Stat label={t('Predicted score')} value={p.score ? `${p.score.home}–${p.score.away}` : '–'} />
            </div>
          </>
        )}
      </Card>

      {d.why.length > 0 && !p.locked && (
        <Card title={t('Why we think so')}>
          <ul className="space-y-2">
            {d.why.map((w, i) => {
              const team = w.side === 'H' ? g.home : g.away
              return (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <span className={`w-2 h-2 rounded-full ${w.side === 'H' ? 'bg-home' : 'bg-away'}`} />
                  <span className="text-ink flex-1">
                    {w.kind === 'strength' ? t('{0} is the stronger team this season', { 0: team.name })
                      : w.kind === 'home' ? t('Home court for {0}', { 0: team.name })
                      : t('{0} is fresher: the other team played last night', { 0: team.name })}
                  </span>
                  {w.points > 0 && <span className="num text-xs font-bold text-muted">+{w.points.toFixed(1)} {t('pts')}</span>}
                </li>
              )
            })}
          </ul>
          {d.ratings?.home && d.ratings?.away && (
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              {(['home', 'away'] as const).map(s => {
                const r = d.ratings![s]!
                return (
                  <div key={s} className="rounded-xl bg-surface2/50 p-3">
                    <div className="font-bold text-ink truncate mb-1">{(s === 'home' ? g.home : g.away).name}</div>
                    <div className="text-muted">{t('Attack')} <b className="num text-ink">{r.attack > 0 ? '+' : ''}{r.attack}</b> · {t('Defence')} <b className="num text-ink">{r.defence > 0 ? '+' : ''}{r.defence}</b></div>
                    <div className="text-faint mt-0.5">{t('points per game compared with an average team')}</div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}
    </>
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
  const side = (team: Game['home'], s: BoxSide) => (
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
            </tr>
          </thead>
          <tbody>
            {s.players.map(pl => (
              <tr key={pl.id} className="border-t border-line/40">
                <td className="py-1 font-sans text-ink whitespace-nowrap">{pl.name}{pl.starter && <span className="ml-1 text-[9px] text-accent font-bold">{t('S')}</span>}</td>
                <td className="text-right px-1 text-muted">{pl.minutes !== null ? Math.round(pl.minutes) : '–'}</td>
                <td className="text-right px-1 text-ink font-bold">{pl.points ?? '–'}</td>
                <td className="text-right px-1 text-muted">{pl.fgm ?? 0}/{pl.fga ?? 0}</td>
                <td className="text-right px-1 text-muted">{pl.tpm ?? 0}/{pl.tpa ?? 0}</td>
                <td className="text-right px-1 text-muted">{pl.ftm ?? 0}/{pl.fta ?? 0}</td>
                <td className="text-right px-1 text-muted">{pl.rebounds ?? '–'}</td>
                <td className="text-right px-1 text-muted">{pl.assists ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {side(g.home, d.box!.home)}
      {side(g.away, d.box!.away)}
    </div>
  )
}
