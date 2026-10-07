import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../../lib/socket'
import { t, LOCALE } from '../../lib/i18n'
import { useBbConfig, bbTeamFav, type BbGame } from '../../lib/bb'
import { FavStar } from '../../lib/favorites'
import { useNews, NewsRows } from '../../components/NewsList'
import { Card, GameList, Skeleton, TeamLogo } from './parts'

interface Profile { games: number; fgPct: number | null; threePct: number | null; threeAttempts: number | null; ftPct: number | null; rebounds: number | null; assists: number | null; turnovers: number | null; steals: number | null; blocks: number | null }
interface Analysis {
  season: string; previousSeason: boolean
  splits: { won: number; lost: number; homeWon: number; homeLost: number; awayWon: number; awayLost: number; b2bWon: number; b2bLost: number; marginHome: number | null; marginAway: number | null; closeWon: number; closeLost: number; games: number }
  streak: { kind: 'W' | 'L'; n: number } | null
  ranks: { attack: number; defence: number; overall: number; of: number } | null
  profile: { team: Profile | null; league: Profile | null }
  last20: { id: number; kickoff: string; home: boolean; opponent: string; for: number; against: number; margin: number }[]
}
interface TeamData {
  team: { id: number; name: string; logo: string | null; league: string }
  rating: { attack: number; defence: number; net: number; games: number } | null
  averages: { games: number; won: number; lost: number; pointsFor: number; pointsAgainst: number; form: ('W' | 'L')[] } | null
  analysis: Analysis | null
  recent: BbGame[]
  next: BbGame[]
}

/** A team: strengths and weaknesses, form chart, splits, news, next games and results. */
export default function BbTeam() {
  const { id = '' } = useParams()
  const cfg = useBbConfig()
  const [d, setD] = useState<TeamData | null | undefined>(undefined)
  const news = useNews({ sport: 'basketball', teamId: id, limit: 8 })
  useEffect(() => {
    setD(undefined)
    axios.get(`${API_URL}/basketball/team/${id}`).then(r => setD(r.data.data)).catch(() => setD(null))
  }, [id])
  useEffect(() => { if (d) document.title = t('{0} · SportLikely', { 0: d.team.name }) }, [d?.team.id])

  if (d === undefined) return <div className="max-w-6xl mx-auto px-4 py-10"><Skeleton rows={6} /></div>
  if (!d) return <div className="max-w-6xl mx-auto px-4 py-10 text-muted">{t('Team not found')}</div>
  const league = cfg?.leagues.find(l => l.code === d.team.league)
  const an = d.analysis
  const s = an?.splits

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-28 xl:pb-10">
      {/* header */}
      <div className="card relative overflow-hidden p-5 sm:p-8">
        {d.team.logo && <img src={d.team.logo} alt="" aria-hidden className="pointer-events-none absolute -right-16 top-1/2 -translate-y-1/2 w-72 h-72 object-contain blur-3xl opacity-25" />}
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
          <TeamLogo team={d.team} size={88} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">{d.team.name}</h1>
              <FavStar label fav={bbTeamFav(d.team, d.team.league)} />
            </div>
            {league && <Link to={`/basketball/league/${league.code}`} className="text-sm text-muted hover:text-ink">{league.name}{an ? ` · ${an.season}` : ''}</Link>}
          </div>
          {s && s.games > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:w-[340px]">
              <Big label={an!.previousSeason ? t('Last season') : t('Record')} value={`${s.won}–${s.lost}`} />
              <Big label={t('Home')} value={`${s.homeWon}–${s.homeLost}`} />
              <Big label={t('Away')} value={`${s.awayWon}–${s.awayLost}`} />
            </div>
          )}
        </div>
      </div>

      {an && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start">
          <div className="space-y-6 min-w-0">
            {/* strengths and weaknesses */}
            <Card title={t('Strengths and weaknesses')} action={an.ranks ? <span className="text-xs text-faint">{t('rank out of {0} teams', { 0: an.ranks.of })}</span> : undefined}>
              {an.ranks && (
                <div className="grid grid-cols-3 gap-2 mb-5">
                  <RankTile label={t('Overall')} rank={an.ranks.overall} of={an.ranks.of} />
                  <RankTile label={t('Attack')} rank={an.ranks.attack} of={an.ranks.of} />
                  <RankTile label={t('Defence')} rank={an.ranks.defence} of={an.ranks.of} />
                </div>
              )}
              {an.profile.team && an.profile.league ? (
                <ul className="space-y-3">
                  {PROFILE_ROWS.map(r => {
                    const v = an.profile.team![r.k], lg = an.profile.league![r.k]
                    if (v === null || lg === null || v === undefined || lg === undefined) return null
                    const diff = (v as number) - (lg as number)
                    const good = r.lowerBetter ? diff < 0 : diff > 0
                    const rel = Math.max(-1, Math.min(1, diff / (r.scale || 1)))
                    return (
                      <li key={r.k}>
                        <div className="flex items-baseline justify-between text-sm">
                          <span className="text-muted">{r.label}</span>
                          <span><b className="num text-ink">{v}{r.pct ? '%' : ''}</b> <span className="text-[11px] text-faint">{t('league {0}', { 0: `${lg}${r.pct ? '%' : ''}` })}</span></span>
                        </div>
                        <div className="relative h-2 mt-1 rounded-full bg-surface2">
                          <span className="absolute left-1/2 top-0 bottom-0 w-px bg-line" />
                          <span className={`absolute top-0 bottom-0 rounded-full ${Math.abs(diff) < (r.scale || 1) * 0.15 ? 'bg-faint' : good ? 'bg-win' : 'bg-loss'}`}
                            style={rel >= 0 ? { left: '50%', width: `${rel * 50}%` } : { right: '50%', width: `${-rel * 50}%` }} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-sm text-faint">{t('Shooting and other stats appear once box scores are in for this season.')}</p>
              )}
            </Card>

            {/* form chart */}
            {an.last20.length > 0 && (
              <Card title={t('Last {0} games', { 0: an.last20.length })} action={an.streak && an.streak.n >= 2 ? <span className={`text-xs font-bold ${an.streak.kind === 'W' ? 'text-win' : 'text-loss'}`}>{an.streak.kind === 'W' ? t('{0} wins in a row', { 0: an.streak.n }) : t('{0} losses in a row', { 0: an.streak.n })}</span> : undefined}>
                <MarginChart games={an.last20} />
                <p className="mt-2 text-[11px] text-faint">{t('Bars: points won or lost by. Green = win, red = loss. Tap a bar for the game.')}</p>
              </Card>
            )}
          </div>

          <div className="space-y-6 min-w-0">
            {/* splits */}
            {s && s.games > 0 && (
              <Card title={an.previousSeason ? t('Last season in numbers') : t('Season in numbers')}>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted">{t('Home record')}</dt><dd className="text-right num text-ink">{s.homeWon}–{s.homeLost}{s.marginHome !== null ? ` (${s.marginHome > 0 ? '+' : ''}${s.marginHome})` : ''}</dd>
                  <dt className="text-muted">{t('Away record')}</dt><dd className="text-right num text-ink">{s.awayWon}–{s.awayLost}{s.marginAway !== null ? ` (${s.marginAway > 0 ? '+' : ''}${s.marginAway})` : ''}</dd>
                  <dt className="text-muted">{t('Back-to-backs (2nd night)')}</dt><dd className="text-right num text-ink">{s.b2bWon}–{s.b2bLost}</dd>
                  <dt className="text-muted">{t('Close games (5 points or less)')}</dt><dd className="text-right num text-ink">{s.closeWon}–{s.closeLost}</dd>
                  {d.averages && <><dt className="text-muted">{t('Points scored / allowed (last 10)')}</dt><dd className="text-right num text-ink">{d.averages.pointsFor} / {d.averages.pointsAgainst}</dd></>}
                </dl>
                <p className="mt-3 text-[11px] text-faint">{t('In brackets: average points won or lost by.')}</p>
              </Card>
            )}

            {/* news */}
            <Card title={t('{0} news', { 0: d.team.name })}>
              {news === null ? <Skeleton rows={3} h="h-14" /> : news.length ? <div className="-mx-2"><NewsRows items={news} /></div> : <p className="text-sm text-faint">{t('No news about this team in the last month.')}</p>}
            </Card>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <Card title={t('Next games')}><GameList games={d.next} empty={t('No games scheduled.')} /></Card>
        <Card title={t('Latest results')}><GameList games={d.recent.filter(g => g.state === 'done')} empty={t('No results yet.')} /></Card>
      </div>
    </div>
  )
}

const PROFILE_ROWS: { k: keyof Profile; label: string; pct?: boolean; lowerBetter?: boolean; scale?: number }[] = [
  { k: 'fgPct', label: t('Field goal %'), pct: true, scale: 4 },
  { k: 'threePct', label: t('3-point %'), pct: true, scale: 4 },
  { k: 'threeAttempts', label: t('3-point attempts'), scale: 8 },
  { k: 'ftPct', label: t('Free throw %'), pct: true, scale: 6 },
  { k: 'rebounds', label: t('Rebounds'), scale: 5 },
  { k: 'assists', label: t('Assists'), scale: 5 },
  { k: 'turnovers', label: t('Turnovers'), lowerBetter: true, scale: 3 },
  { k: 'steals', label: t('Steals'), scale: 2 },
  { k: 'blocks', label: t('Blocks'), scale: 2 }
]

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface2/60 border border-line/50 p-2.5 text-center">
      <div className="num text-lg font-extrabold text-ink">{value}</div>
      <div className="text-[10px] text-faint">{label}</div>
    </div>
  )
}

function RankTile({ label, rank, of }: { label: string; rank: number; of: number }) {
  const top = rank <= Math.ceil(of / 3), bottom = rank > of - Math.ceil(of / 3)
  return (
    <div className={`rounded-xl border p-3 text-center ${top ? 'border-win/40 bg-win/10' : bottom ? 'border-loss/40 bg-loss/10' : 'border-line/60 bg-surface2/40'}`}>
      <div className={`num text-2xl font-extrabold ${top ? 'text-win' : bottom ? 'text-loss' : 'text-ink'}`}>#{rank}</div>
      <div className="text-[11px] text-faint">{label}</div>
    </div>
  )
}

/** Win/loss margin per game as bars (oldest left). */
function MarginChart({ games }: { games: Analysis['last20'] }) {
  const max = Math.max(10, ...games.map(g => Math.abs(g.margin)))
  const w = 100 / games.length
  return (
    <div className="relative h-40">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden>
        <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" className="text-line" strokeWidth="0.4" />
      </svg>
      <div className="absolute inset-0 flex">
        {games.map(g => {
          const h = (Math.abs(g.margin) / max) * 50
          return (
            <Link key={g.id} to={`/basketball/game/${g.id}`} className="relative h-full group" style={{ width: `${w}%` }}
              title={`${new Date(g.kickoff).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })} · ${g.home ? t('H') : t('A')} ${g.opponent} · ${g.for}–${g.against}`}>
              <span className={`absolute left-[15%] right-[15%] rounded-sm ${g.margin > 0 ? 'bg-win' : 'bg-loss'} group-hover:opacity-80`}
                style={g.margin > 0 ? { bottom: '50%', height: `${h}%` } : { top: '50%', height: `${h}%` }} />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
