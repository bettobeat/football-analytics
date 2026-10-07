import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../../lib/socket'
import { t } from '../../lib/i18n'
import { useBbConfig, type BbGame } from '../../lib/bb'
import { Card, GameList, Skeleton, TeamLogo } from './parts'

interface TeamData {
  team: { id: number; name: string; logo: string | null; league: string }
  rating: { attack: number; defence: number; net: number; games: number } | null
  averages: { games: number; won: number; lost: number; pointsFor: number; pointsAgainst: number; fgPct: number | null; threePct: number | null; rebounds: number | null; assists: number | null; form: ('W' | 'L')[] } | null
  recent: BbGame[]
  next: BbGame[]
}

/** A team: rating, last-10 averages, next games and results. */
export default function BbTeam() {
  const { id = '' } = useParams()
  const cfg = useBbConfig()
  const [d, setD] = useState<TeamData | null | undefined>(undefined)
  useEffect(() => {
    setD(undefined)
    axios.get(`${API_URL}/basketball/team/${id}`).then(r => setD(r.data.data)).catch(() => setD(null))
  }, [id])
  useEffect(() => { if (d) document.title = t('{0} · SportLikely', { 0: d.team.name }) }, [d?.team.id])

  if (d === undefined) return <div className="max-w-5xl mx-auto px-4 py-10"><Skeleton rows={6} /></div>
  if (!d) return <div className="max-w-5xl mx-auto px-4 py-10 text-muted">{t('Team not found')}</div>
  const league = cfg?.leagues.find(l => l.code === d.team.league)
  const a = d.averages
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-28 xl:pb-10">
      <div className="card p-5 sm:p-7 flex items-center gap-4">
        <TeamLogo team={d.team} size={64} />
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-ink">{d.team.name}</h1>
          {league && <Link to={`/basketball/league/${league.code}`} className="text-sm text-muted hover:text-ink">{league.name}</Link>}
          {a && (
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
              <span>{t('Last {0}: {1}–{2}', { 0: a.games, 1: a.won, 2: a.lost })}</span>
              <span>{t('{0} scored · {1} allowed per game', { 0: a.pointsFor, 1: a.pointsAgainst })}</span>
              {d.rating && <span>{t('Net rating')} <b className="num text-ink">{d.rating.net > 0 ? '+' : ''}{d.rating.net}</b></span>}
            </div>
          )}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <Card title={t('Next games')}><GameList games={d.next} empty={t('No games scheduled.')} /></Card>
        <Card title={t('Latest results')}><GameList games={d.recent.filter(g => g.state === 'done')} empty={t('No results yet.')} /></Card>
      </div>
    </div>
  )
}
