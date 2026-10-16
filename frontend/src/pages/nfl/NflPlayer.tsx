import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../../lib/socket'
import { t, LOCALE } from '../../lib/i18n'
import { setNflLeague, type NflGame } from '../../lib/nfl'
import { LeagueSwitch } from './parts'
import { Card, Skeleton, TeamLogo } from '../bb/parts'

interface Data {
  player: { id: number; name: string; position: string | null; group: string | null; number: number | null; age: number | null; height: string | null; weight: string | null; college: string | null; experience: number | null; image: string | null }
  team: { id: number; name: string; logo: string | null } | null
  season: number; games: number
  totals: Record<string, Record<string, string>>
  log: { game: NflGame; teamId: number; groups: Record<string, Record<string, string>> }[]
}

/** NFL player page (fix137): bio, season totals by group, game log. Pictures from API-Sports only. */
export default function NflPlayer() {
  const { id } = useParams()
  const [d, setD] = useState<Data | null>(null)
  const [missing, setMissing] = useState(false)
  const [imgBroken, setImgBroken] = useState(false)
  useEffect(() => {
    setD(null); setMissing(false); setImgBroken(false)
    axios.get(`${API_URL}/nfl/player/${id}`).then(r => {
      const lg = r.data.data.team?.league === 2 ? 2 : 1
      setD(r.data.data); setNflLeague(lg)
      document.title = `${r.data.data.player.name} · ${lg === 2 ? 'College football' : 'NFL'} | SportLikely`
    }).catch(() => setMissing(true))
  }, [id])
  if (missing) return <div className="max-w-2xl mx-auto px-4 py-16 text-center text-muted">{t('Player not found.')}</div>
  if (!d) return <div className="max-w-5xl mx-auto px-4 py-8"><Skeleton rows={6} /></div>
  const p = d.player
  const bio = [
    p.position && [t('Position'), p.position], p.number != null && [t('Number'), String(p.number)], p.age != null && [t('Age'), String(p.age)],
    p.height && [t('Height'), p.height], p.weight && [t('Weight'), p.weight], p.college && [t('College'), p.college], p.experience != null && [t('Seasons in the NFL'), String(p.experience)]
  ].filter(Boolean) as [string, string][]
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <LeagueSwitch />
      <header className="flex items-center gap-4">
        {p.image && !imgBroken ? <img src={p.image} alt="" width={80} height={80} onError={() => setImgBroken(true)} className="w-20 h-20 rounded-full object-cover bg-surface2" /> : <span className="w-20 h-20 rounded-full bg-surface2" />}
        <div className="min-w-0 space-y-1">
          <h1 className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-ink leading-tight">{p.name}</h1>
          {d.team && <Link to={`/american-football/team/${d.team.id}`} className="inline-flex items-center gap-2 text-sm text-muted hover:text-accent"><TeamLogo team={d.team} size={18} />{d.team.name}</Link>}
        </div>
      </header>
      {bio.length > 0 && (
        <Card>
          <dl className="grid gap-x-6 gap-y-2 grid-cols-2 sm:grid-cols-4 text-sm">
            {bio.map(([k, v]) => <div key={k}><dt className="text-xs text-faint">{k}</dt><dd className="text-ink font-semibold">{v}</dd></div>)}
          </dl>
        </Card>
      )}
      <Card title={t('{0} season · {1} games', { 0: d.season, 1: d.games })}>
        {Object.keys(d.totals).length === 0 ? <p className="text-sm text-faint">{t('No game statistics yet this season.')}</p> : (
          <div className="space-y-4">
            {Object.entries(d.totals).map(([g, st]) => (
              <div key={g}>
                <div className="label pb-1">{t(g)}</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(st).map(([k, v]) => <span key={k} className="rounded-lg bg-surface2/70 px-2.5 py-1.5 text-xs"><span className="text-faint">{k}</span> <b className="num text-ink">{v}</b></span>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      {d.log.length > 0 && (
        <Card title={t('Game log')}>
          <ul className="divide-y divide-line/50">
            {d.log.map(l => {
              const g = l.game, home = g.home.id === l.teamId, opp = home ? g.away : g.home
              return (
                <li key={g.id} className="py-2 text-sm">
                  <Link to={`/american-football/game/${g.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 hover:text-accent">
                    <span className="w-16 text-xs text-faint">{new Date(g.kickoff).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}</span>
                    <span className="flex items-center gap-1.5 min-w-0"><span className="text-xs text-faint">{home ? t('vs') : '@'}</span><TeamLogo team={opp} size={16} /><span className="truncate text-ink">{opp.name}</span></span>
                    {g.score && <span className="num text-muted">{home ? `${g.score.home}–${g.score.away}` : `${g.score.away}–${g.score.home}`}</span>}
                    <span className="basis-full sm:basis-auto sm:ml-auto text-xs text-muted truncate">
                      {Object.entries(l.groups).map(([gn, st]) => `${gn}: ${Object.entries(st).slice(0, 4).map(([k, v]) => `${k} ${v}`).join(', ')}`).join(' · ')}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
