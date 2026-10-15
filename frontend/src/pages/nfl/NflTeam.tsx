import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../../lib/socket'
import { t } from '../../lib/i18n'
import { FavStar } from '../../lib/favorites'
import { record, nflTeamFav, type NflGame, type StandRow } from '../../lib/nfl'
import { Card, Skeleton, TeamLogo } from '../bb/parts'
import { NflGameRow } from './parts'

interface Measure { id: string; label: string; better: 'high' | 'low'; value: number | null; text: string | null; rank: number | null; of: number | null; score: number | null }
interface Analysis { season: number; measures: Measure[]; strengths: Measure[]; weaknesses: Measure[]; rankByWeek: { week: number; rank: number; of: number }[] }
interface Player { id: number; name: string; position: string | null; grp: string | null; number: number | null; age: number | null; image: string | null }
interface Data {
  team: { id: number; name: string; code: string | null; city: string | null; logo: string | null; conference: string | null; division: string | null; coach: string | null; stadium: string | null }
  season: number; standing: StandRow | null; schedule: NflGame[]; results: NflGame[]
  roster: { group: string; players: Player[] }[]; injuries: { id: number; name: string; status: string | null; description: string | null }[]; analysis: Analysis | null
}

/** Strength / weakness sentences (fixed rules, fix137): what the measure says, the value and the league rank. */
const SENTENCE: Record<string, { good: string; bad: string }> = {
  pf: { good: 'Scores a lot: {0} points a game (#{1} of {2}).', bad: 'Struggles to score: {0} points a game (#{1} of {2}).' },
  pa: { good: 'Hard to score against: {0} points allowed a game (#{1} of {2}).', bad: 'Gives up a lot of points: {0} a game (#{1} of {2}).' },
  ypp: { good: 'Moves the ball well: {0} yards per play (#{1} of {2}).', bad: 'Little gain per play: {0} yards (#{1} of {2}).' },
  to: { good: 'Wins the turnover battle: {0} a game (#{1} of {2}).', bad: 'Loses the turnover battle: {0} a game (#{1} of {2}).' },
  third: { good: 'Strong on third down: {0} converted (#{1} of {2}).', bad: 'Weak on third down: {0} converted (#{1} of {2}).' },
  rz: { good: 'Finishes drives: {0} of red-zone trips scored (#{1} of {2}).', bad: 'Stalls near the end zone: {0} of red-zone trips scored (#{1} of {2}).' },
  sacks: { good: 'Pressures the quarterback: {0} sacks a game (#{1} of {2}).', bad: 'Little pass rush: {0} sacks a game (#{1} of {2}).' }
}

/** NFL team page (fix137): record, team analysis (rule-based), roster by position, schedule, results, injuries. */
export default function NflTeam() {
  const { id } = useParams()
  const [d, setD] = useState<Data | null>(null)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    setD(null); setMissing(false)
    axios.get(`${API_URL}/nfl/team/${id}`).then(r => { setD(r.data.data); document.title = `${r.data.data.team.name} · NFL | SportLikely` }).catch(() => setMissing(true))
  }, [id])
  if (missing) return <div className="max-w-2xl mx-auto px-4 py-16 text-center text-muted">{t('Team not found.')}</div>
  if (!d) return <div className="max-w-5xl mx-auto px-4 py-8"><Skeleton rows={8} /></div>
  const tm = d.team
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <header className="flex items-center gap-4">
        <TeamLogo team={tm} size={72} />
        <div className="min-w-0 space-y-1">
          <div className="text-xs text-faint">{[tm.conference, tm.division].filter(Boolean).join(' · ') || 'NFL'}</div>
          <h1 className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-ink leading-tight">{tm.name}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            {d.standing && <span className="num font-bold text-ink">{record(d.standing)}</span>}
            {d.standing && <span className="num">{t('PF {0} · PA {1}', { 0: d.standing.pf, 1: d.standing.pa })}</span>}
            {tm.coach && <span>{t('Coach: {0}', { 0: tm.coach })}</span>}
            <FavStar fav={nflTeamFav({ id: tm.id, name: tm.name, logo: tm.logo })} label />
          </div>
        </div>
      </header>

      {d.analysis && <TeamAnalysis a={d.analysis} />}

      {d.schedule.length > 0 && (
        <Card title={t('Next games')}><div className="-mx-5 sm:-mx-6 divide-y divide-line/50">{d.schedule.slice(0, 8).map(g => <NflGameRow key={g.id} g={g} showDay />)}</div></Card>
      )}
      <Card title={t('Results')}>
        {d.results.length === 0 ? <p className="text-sm text-faint">{t('No games played yet this season.')}</p> : (
          <div className="-mx-5 sm:-mx-6 divide-y divide-line/50">{d.results.map(g => <NflGameRow key={g.id} g={g} showDay />)}</div>
        )}
      </Card>

      {d.injuries.length > 0 && (
        <Card title={t('Injuries')}>
          <ul className="divide-y divide-line/50">
            {d.injuries.map(i => (
              <li key={i.id} className="py-1.5 text-sm flex items-baseline justify-between gap-2">
                <Link to={`/american-football/player/${i.id}`} className="text-ink hover:text-accent truncate">{i.name}</Link>
                <span className="text-xs text-faint truncate">{[i.status, i.description].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {d.roster.length > 0 && (
        <Card title={t('Roster')}>
          <div className="space-y-5">
            {d.roster.map(gr => (
              <div key={gr.group}>
                <div className="label pb-1.5">{t(gr.group)}</div>
                <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                  {gr.players.map(p => (
                    <li key={p.id}>
                      <Link to={`/american-football/player/${p.id}`} className="flex items-center gap-2 text-sm hover:text-accent">
                        <span className="w-7 text-right num text-faint">{p.number ?? ''}</span>
                        <span className="w-9 text-[11px] font-bold text-muted">{p.position || ''}</span>
                        <span className="truncate text-ink">{p.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

/** Team analysis (rule-based, fix137): 1–10 league scores, strengths and weaknesses, rank over the season; the model
 *  tiles wait for our NFL predictions, and the record of our picks stays hidden until there are any. */
function TeamAnalysis({ a }: { a: Analysis }) {
  const line = (m: Measure, good: boolean) => t((good ? SENTENCE[m.id]?.good : SENTENCE[m.id]?.bad) || '{0}', { 0: m.text ?? '–', 1: m.rank ?? '–', 2: m.of ?? '–' })
  const ranks = a.rankByWeek
  const of = ranks[0]?.of || 32
  return (
    <Card title={t('Team analysis')} action={<span className="text-xs text-faint">{t('{0} season · 1 = league worst, 10 = league best', { 0: a.season })}</span>}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2.5">
          {a.measures.map(m => (
            <div key={m.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-2 text-sm"><span className="text-muted truncate">{t(m.label)}</span><span className="num text-ink font-semibold">{m.text ?? '–'}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-surface2 overflow-hidden"><div className={`h-full rounded-full ${m.score === null ? '' : m.score >= 8 ? 'bg-win' : m.score <= 3 ? 'bg-loss' : 'bg-accent'}`} style={{ width: `${(m.score ?? 0) * 10}%` }} /></div>
              </div>
              <span className="w-8 text-right num font-display font-extrabold text-ink">{m.score ?? '–'}</span>
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <div>
            <div className="label pb-1 text-win">{t('Strengths')}</div>
            {a.strengths.length ? <ul className="space-y-1 text-sm text-ink">{a.strengths.map(m => <li key={m.id} className="flex gap-2"><span className="text-win">+</span>{line(m, true)}</li>)}</ul> : <p className="text-sm text-faint">{t('Nothing stands out yet.')}</p>}
          </div>
          <div>
            <div className="label pb-1 text-loss">{t('Weaknesses')}</div>
            {a.weaknesses.length ? <ul className="space-y-1 text-sm text-ink">{a.weaknesses.map(m => <li key={m.id} className="flex gap-2"><span className="text-loss">−</span>{line(m, false)}</li>)}</ul> : <p className="text-sm text-faint">{t('Nothing stands out yet.')}</p>}
          </div>
          {ranks.length > 1 && (
            <div>
              <div className="label pb-1">{t('League rank by week (point difference per game)')}</div>
              <svg viewBox={`0 0 ${Math.max(1, ranks.length - 1) * 20 + 20} 80`} className="w-full h-24" role="img" aria-label={t('Rank by week')}>
                <polyline fill="none" stroke="rgb(var(--accent))" strokeWidth="2" points={ranks.map((r, i) => `${10 + i * 20},${8 + ((r.rank - 1) / Math.max(1, of - 1)) * 64}`).join(' ')} />
                {ranks.map((r, i) => <circle key={r.week} cx={10 + i * 20} cy={8 + ((r.rank - 1) / Math.max(1, of - 1)) * 64} r="2.5" fill="rgb(var(--accent))"><title>{t('Week {0}: #{1}', { 0: r.week, 1: r.rank })}</title></circle>)}
              </svg>
              <div className="flex justify-between text-[10px] text-faint num"><span>{t('Week {0}', { 0: ranks[0].week })}</span><span>#{ranks[ranks.length - 1].rank} {t('now')}</span></div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[t('Win chance next game'), t('Expected points'), t('Our record on this team')].map(x => (
          <div key={x} className="rounded-xl border border-dashed border-line/80 px-4 py-3">
            <div className="text-xs text-muted">{x}</div>
            <div className="text-sm font-semibold text-faint mt-1">{t('Coming soon')}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}
