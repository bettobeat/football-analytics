import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../../lib/socket'
import { t } from '../../lib/i18n'
import type { Standings, LeaderCat } from '../../lib/nfl'
import { Card, Skeleton, TeamLogo } from '../bb/parts'
import { StandingsBlock } from './parts'

/** NFL league page (fix137): standings by conference and division, then the league leaders. */
export default function NflLeague() {
  const [d, setD] = useState<(Standings & { leaders: LeaderCat[] }) | null | undefined>(undefined)
  useEffect(() => {
    document.title = t('{0} · SportLikely', { 0: t('NFL standings') })
    axios.get(`${API_URL}/nfl/standings`).then(r => setD(r.data.data)).catch(() => setD(null))
  }, [])
  if (d === undefined) return <div className="max-w-5xl mx-auto px-4 py-8"><Skeleton rows={10} /></div>
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <header>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">{t('NFL standings')}</h1>
        {d && <p className="text-sm text-muted">{t('{0} season · regular season', { 0: d.season })}</p>}
      </header>
      {!d || !d.conferences.length ? <div className="card p-12 text-center text-muted">{t('Standings appear once the season has started.')}</div> : (
        <Card><StandingsBlock data={d} /></Card>
      )}
      {d && d.leaders.length > 0 && (
        <section id="leaders">
          <Card title={t('League leaders')}>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {d.leaders.map(c => (
                <div key={c.id}>
                  <div className="label pb-1">{t(c.label)}</div>
                  <ol className="space-y-1">
                    {c.rows.map((r, i) => (
                      <li key={r.id} className="flex items-center gap-2 text-sm">
                        <span className="w-4 text-faint num">{i + 1}</span>
                        {r.team && <TeamLogo team={r.team} size={16} />}
                        <Link to={`/american-football/player/${r.id}`} className="flex-1 truncate text-ink hover:text-accent">{r.name}</Link>
                        <span className="num font-bold text-ink">{r.value}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </Card>
        </section>
      )}
    </div>
  )
}
