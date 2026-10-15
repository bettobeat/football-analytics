import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../../lib/socket'
import { t, LOCALE } from '../../lib/i18n'
import { FavStar } from '../../lib/favorites'
import { NFL_STATUS, weekLabel, timeOf, nick, nflTeamFav, type NflGame as Game, type NflSide } from '../../lib/nfl'
import StickyBar from '../../components/StickyBar'
import { Card, Skeleton, TeamLogo } from '../bb/parts'
import { StatBars } from './parts'

type Box = {
  firstDowns: number | null; plays: number | null; yards: number | null; yardsPerPlay: number | null; passYards: number | null; rushYards: number | null; rushAttempts: number | null
  third: [number, number] | null; fourth: [number, number] | null; redZone: [number, number] | null; turnovers: number | null; penalties: any; possession: any
  sacks: number | null; sacked: number | null; interceptions: number | null; fumblesRecovered: number | null
}
type Groups = Record<string, { id: number; name: string; image: string | null; stats: Record<string, string> }[]>
interface FormRow { id: number; kickoff: string; opponent: NflSide; home: boolean; for: number; against: number; result: 'W' | 'L' | 'T' }
interface Injury { id: number; name: string; image: string | null; status: string | null; description: string | null; date: string | null }
interface Data {
  game: Game; form: { home: FormRow[]; away: FormRow[] }; h2h: Game[]; teamStats: { home: Box | null; away: Box | null } | null
  players: { home: Groups; away: Groups } | null; injuries: { home: Injury[]; away: Injury[] } | null; prediction: null
}
type Tab = 'overview' | 'stats' | 'players' | 'injuries' | 'prediction'

/** NFL game page (fix137): hero, then Overview · Team stats · Players · Injuries · Prediction (coming soon). */
export default function NflGame() {
  const { id } = useParams()
  const [d, setD] = useState<Data | null>(null)
  const [missing, setMissing] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')
  useEffect(() => {
    setD(null); setMissing(false)
    const load = () => axios.get(`${API_URL}/nfl/game/${id}`).then(r => setD(r.data.data)).catch(e => { if (e?.response?.status === 404) setMissing(true) })
    load()
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load() }, 30 * 1000)
    return () => clearInterval(iv)
  }, [id])
  // the same title search engines get (seo.ts): "Chiefs vs Bills · NFL Week 7 | SportLikely"
  useEffect(() => { if (d) document.title = `${nick(d.game.home.name)} vs ${nick(d.game.away.name)} · NFL ${d.game.weekKey === 'post' ? 'Playoffs' : `Week ${d.game.weekKey}`} | SportLikely` }, [d?.game.id])

  if (missing) return <div className="max-w-2xl mx-auto px-4 py-16 text-center text-muted">{t('Game not found.')}</div>
  if (!d) return <div className="max-w-5xl mx-auto px-4 py-8"><Skeleton rows={6} h="h-16" /></div>
  const g = d.game
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: t('Overview') },
    ...(d.teamStats ? [{ id: 'stats' as Tab, label: t('Team stats') }] : []),
    ...(d.players ? [{ id: 'players' as Tab, label: t('Players') }] : []),
    ...(d.injuries ? [{ id: 'injuries' as Tab, label: t('Injuries') }] : []),
    { id: 'prediction', label: t('Prediction') }
  ]
  const side = (team: NflSide, s: 'H' | 'A') => (
    <div className="flex flex-col items-center gap-2 text-center min-w-0">
      <Link to={`/american-football/team/${team.id}`} className="flex flex-col items-center gap-2 min-w-0 group">
        <TeamLogo team={team} size={64} />
        <span className="font-display font-bold text-ink text-base sm:text-xl leading-tight group-hover:text-accent">{team.name}</span>
      </Link>
      <span className="flex items-center gap-1 text-[11px] text-faint">{s === 'H' ? t('Home') : t('Away')} <FavStar fav={nflTeamFav(team)} size="sm" /></span>
    </div>
  )
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <Link to="/american-football/games" className="text-sm text-muted hover:text-ink">← {t('All games')}</Link>
      <h1 className="sr-only">{g.home.name} vs {g.away.name} · NFL {weekLabel(g.weekKey)}</h1>
      <div className="card mt-3 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-faint mb-4">
          <span>NFL · {weekLabel(g.weekKey)} · {g.season}</span>
          <span>{new Date(g.kickoff).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {side(g.home, 'H')}
          <div className="text-center">
            {g.score ? (
              <div className={`font-display text-3xl sm:text-5xl font-extrabold num ${g.state === 'live' ? 'text-live' : 'text-ink'}`}>{g.score.home}–{g.score.away}</div>
            ) : (
              <div className="font-display text-2xl sm:text-4xl font-extrabold text-ink num">{timeOf(g.kickoff)}</div>
            )}
            <div className={`mt-1 text-xs font-bold ${g.state === 'live' ? 'text-live' : 'text-faint'}`}>{NFL_STATUS[g.status] || (g.state === 'upcoming' ? t('Kick-off') : g.status)}</div>
          </div>
          {side(g.away, 'A')}
        </div>
        {g.venue && <p className="mt-4 text-center text-xs text-faint">{t('Venue')} <span className="text-muted">{g.venue}</span></p>}
      </div>

      <StickyBar className="top-16 sm:top-[72px] -mx-4 sm:mx-0 mt-6 px-4 sm:px-0 py-2">
        <nav className="flex gap-1 p-1 rounded-full bg-surface2/60 border border-line/60 overflow-x-auto no-scrollbar" aria-label={t('Game sections')}>
          {tabs.map(x => (
            <button key={x.id} type="button" onClick={() => setTab(x.id)} aria-current={tab === x.id ? 'page' : undefined}
              className={`flex-1 min-w-max px-3 sm:px-4 py-2 rounded-full text-[13px] sm:text-sm font-semibold transition-colors ${tab === x.id ? 'bg-accent text-bg shadow' : 'text-muted hover:text-ink'}`}>{x.label}</button>
          ))}
        </nav>
      </StickyBar>

      <div className="mt-4 space-y-5">
        {tab === 'overview' && <Overview d={d} />}
        {tab === 'stats' && d.teamStats && <TeamStats g={g} home={d.teamStats.home} away={d.teamStats.away} />}
        {tab === 'players' && d.players && <Players g={g} data={d.players} />}
        {tab === 'injuries' && d.injuries && <Injuries g={g} data={d.injuries} />}
        {tab === 'prediction' && (
          <Card title={t('Prediction')}>
            <p className="text-sm text-muted">{t('Our NFL predictions are coming soon: win chances, point spread and total points, tested in public like every other sport on SportLikely.')}</p>
          </Card>
        )}
      </div>
    </div>
  )
}

function Overview({ d }: { d: Data }) {
  const g = d.game
  const q = g.quarters
  const ot = q && (q.home[4] != null || q.away[4] != null)
  return (
    <>
      {q && (
        <Card title={t('Score by quarter')}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-[10px] uppercase text-faint"><th className="text-left py-1">{t('Team')}</th>{['1', '2', '3', '4', ...(ot ? ['OT'] : [])].map(h => <th key={h} className="text-right py-1 px-2 num">{h}</th>)}<th className="text-right py-1 px-2">{t('Total')}</th></tr></thead>
              <tbody>
                {(['home', 'away'] as const).map(s => (
                  <tr key={s} className="border-t border-line/50">
                    <td className="py-1.5"><span className="flex items-center gap-2"><TeamLogo team={g[s]} size={16} /><span className="truncate">{g[s].name}</span></span></td>
                    {q[s].slice(0, ot ? 5 : 4).map((v, i) => <td key={i} className="text-right py-1.5 px-2 num text-muted">{v ?? '–'}</td>)}
                    <td className="text-right py-1.5 px-2 num font-bold text-ink">{g.score ? g.score[s] : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        {(['home', 'away'] as const).map(s => (
          <Card key={s} title={t('{0}: last 5 games', { 0: g[s].name })}>
            {d.form[s].length === 0 ? <p className="text-sm text-faint">{t('No games yet.')}</p> : (
              <ul className="space-y-1.5">
                {d.form[s].map(f => (
                  <li key={f.id}>
                    <Link to={`/american-football/game/${f.id}`} className="flex items-center gap-2 text-sm hover:text-accent">
                      <span className={`w-5 h-5 rounded grid place-items-center text-[10px] font-extrabold ${f.result === 'W' ? 'bg-win/15 text-win' : f.result === 'L' ? 'bg-loss/15 text-loss' : 'bg-draw/15 text-draw'}`}>{f.result}</span>
                      <span className="text-faint text-xs w-6">{f.home ? t('vs') : '@'}</span>
                      <TeamLogo team={f.opponent} size={16} />
                      <span className="flex-1 truncate text-ink">{f.opponent.name}</span>
                      <span className="num font-semibold text-ink">{f.for}–{f.against}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
      <Card title={t('Head-to-head: last 10 meetings')}>
        {d.h2h.length === 0 ? <p className="text-sm text-faint">{t('No meetings in our records.')}</p> : (
          <ul className="divide-y divide-line/50">
            {d.h2h.map(m => (
              <li key={m.id}>
                <Link to={`/american-football/game/${m.id}`} className="flex items-center gap-3 py-1.5 text-sm hover:text-accent">
                  <span className="w-20 text-xs text-faint">{new Date(m.kickoff).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  <span className="flex-1 truncate text-ink">{m.home.name} – {m.away.name}</span>
                  <span className="num font-bold text-ink">{m.score ? `${m.score.home}–${m.score.away}` : '–'}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}

function TeamStats({ g, home, away }: { g: Game; home: Box | null; away: Box | null }) {
  const v = (b: Box | null, k: keyof Box) => (b && typeof b[k] === 'number' ? (b[k] as number) : null)
  const pct = (p: [number, number] | null | undefined) => (p && p[1] ? (100 * p[0]) / p[1] : null)
  return (
    <Card title={t('Team stats')}>
      <div className="flex items-center justify-between text-xs font-bold mb-1">
        <span className="flex items-center gap-1.5 text-home"><TeamLogo team={g.home} size={16} />{g.home.name}</span>
        <span className="flex items-center gap-1.5 text-away">{g.away.name}<TeamLogo team={g.away} size={16} /></span>
      </div>
      <div className="divide-y divide-line/40">
        <StatBars label={t('Total yards')} home={v(home, 'yards')} away={v(away, 'yards')} />
        <StatBars label={t('Yards per play')} home={v(home, 'yardsPerPlay')} away={v(away, 'yardsPerPlay')} fmt={x => x.toFixed(1)} />
        <StatBars label={t('Passing yards')} home={v(home, 'passYards')} away={v(away, 'passYards')} />
        <StatBars label={t('Rushing yards')} home={v(home, 'rushYards')} away={v(away, 'rushYards')} />
        <StatBars label={t('First downs')} home={v(home, 'firstDowns')} away={v(away, 'firstDowns')} />
        <StatBars label={t('Third downs converted')} home={pct(home?.third)} away={pct(away?.third)} fmt={x => `${Math.round(x)}%`} />
        <StatBars label={t('Red-zone trips scored')} home={pct(home?.redZone)} away={pct(away?.redZone)} fmt={x => `${Math.round(x)}%`} />
        <StatBars label={t('Turnovers')} home={v(home, 'turnovers')} away={v(away, 'turnovers')} lowerBetter />
        <StatBars label={t('Sacks')} home={v(home, 'sacks')} away={v(away, 'sacks')} />
      </div>
    </Card>
  )
}

const PLAYER_GROUPS: { re: RegExp; label: string }[] = [
  { re: /^passing$/i, label: 'Passing' }, { re: /^rushing$/i, label: 'Rushing' }, { re: /^receiving$/i, label: 'Receiving' }, { re: /defens/i, label: 'Defense' }
]
function Players({ g, data }: { g: Game; data: { home: Groups; away: Groups } }) {
  return (
    <>
      {PLAYER_GROUPS.map(pg => {
        const rows = (['home', 'away'] as const).flatMap(s => {
          const key = Object.keys(data[s] || {}).find(k => pg.re.test(k))
          return key ? data[s][key].map(p => ({ ...p, team: g[s] })) : []
        })
        if (!rows.length) return null
        const cols = [...new Set(rows.flatMap(r => Object.keys(r.stats)))].slice(0, 7)
        return (
          <Card key={pg.label} title={t(pg.label)}>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-[520px]">
                <thead><tr className="text-[10px] uppercase tracking-wide text-faint"><th className="text-left font-semibold py-1 px-1">{t('Player')}</th>{cols.map(c => <th key={c} className="text-right font-semibold py-1 px-1">{c}</th>)}</tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={`${r.team.id}-${r.id}`} className="border-t border-line/50">
                      <td className="py-1.5 px-1"><Link to={`/american-football/player/${r.id}`} className="flex items-center gap-2 hover:text-accent"><TeamLogo team={r.team} size={14} /><span className="truncate">{r.name}</span></Link></td>
                      {cols.map(c => <td key={c} className="py-1.5 px-1 text-right num text-muted">{r.stats[c] ?? '–'}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      })}
    </>
  )
}

function Injuries({ g, data }: { g: Game; data: { home: Injury[]; away: Injury[] } }) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {(['home', 'away'] as const).map(s => (
        <Card key={s} title={g[s].name}>
          {data[s].length === 0 ? <p className="text-sm text-faint">{t('No injuries reported.')}</p> : (
            <ul className="divide-y divide-line/50">
              {data[s].map(i => (
                <li key={i.id} className="py-1.5 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link to={`/american-football/player/${i.id}`} className="text-ink hover:text-accent truncate">{i.name}</Link>
                    <span className={`text-xs font-bold ${/out|ir|reserve/i.test(i.status || '') ? 'text-loss' : 'text-draw'}`}>{i.status || '–'}</span>
                  </div>
                  {i.description && <div className="text-xs text-faint">{i.description}</div>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  )
}
