import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../../lib/socket'
import { t } from '../../lib/i18n'
import { weekLabel, type NflGame, type NflWeek, type Standings, type LeaderCat } from '../../lib/nfl'
import { Card, SectionTitle, Skeleton, TeamLogo } from '../bb/parts'
import { NflGamesByDay, NflLiveCard, StandTable } from './parts'

interface HomeData { season: number | null; live: NflGame[]; week: NflWeek | null; games: NflGame[]; standings: Standings | null; leaders: LeaderCat[] }

/** NFL home (fix137): live strip (live games only here), this week's games, AFC / NFC standings, leaders. */
export default function NflHome() {
  const [d, setD] = useState<HomeData | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    document.title = t('{0} · SportLikely', { 0: t('NFL') })
    const load = () => axios.get(`${API_URL}/nfl/home`).then(r => { setD(r.data.data); setErr(false) }).catch(() => setErr(true))
    load()
    const id = setInterval(load, 60 * 1000) // live scores move every minute or so
    return () => clearInterval(id)
  }, [])

  if (err && !d) return <div className="max-w-5xl mx-auto px-4 py-16 text-center text-muted">{t("Couldn't load the NFL games. Try again in a minute.")}</div>
  if (!d) return <div className="max-w-5xl mx-auto px-4 py-8"><Skeleton rows={8} /></div>
  const upcoming = d.games.filter(g => g.state !== 'live')
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">{t('NFL')}</h1>
        <p className="text-sm text-muted">{d.season ? t('{0} season · {1}', { 0: d.season, 1: weekLabel(d.week?.key || null) }) : t('The schedule appears here as soon as it is loaded.')}</p>
        <p className="text-xs text-faint">{t('Games, scores, standings and team analysis. Predictions are coming soon.')}</p>
      </header>

      {d.live.length > 0 && (
        <section>
          <SectionTitle label={t('Live now')} />
          <div className="flex gap-3 overflow-x-auto snap-x no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">{d.live.map(g => <NflLiveCard key={g.id} g={g} />)}</div>
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between gap-2">
          <SectionTitle label={d.week ? t('{0} games', { 0: weekLabel(d.week.key) }) : t('Games')} />
          <Link to="/american-football/games" className="text-sm font-bold text-accent whitespace-nowrap">{t('All weeks →')}</Link>
        </div>
        <NflGamesByDay games={upcoming} empty={t('No games this week.')} />
      </section>

      {d.standings && d.standings.conferences.length > 0 && (
        <Card title={t('Standings')} action={<Link to="/american-football/league" className="text-sm font-bold text-accent">{t('Full standings →')}</Link>}>
          <div className="grid gap-6 lg:grid-cols-2">
            {d.standings.conferences.map(c => (
              <StandTable key={c.name} title={c.name} rows={c.divisions.flatMap(x => x.rows).sort((a, b) => b.pct - a.pct || b.diff - a.diff).slice(0, 7)} compact />
            ))}
          </div>
        </Card>
      )}

      {d.leaders.length > 0 && (
        <Card title={t('League leaders')} action={<Link to="/american-football/league#leaders" className="text-sm font-bold text-accent">{t('More →')}</Link>}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {d.leaders.slice(0, 6).map(c => (
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
      )}
    </div>
  )
}
