import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../../lib/socket'
import { t } from '../../lib/i18n'
import { useFavorites } from '../../lib/favorites'
import { useNflFavorites, type NflGame } from '../../lib/nfl'
import { Card, TeamLogo } from '../bb/parts'
import { NflGamesByDay } from './parts'

/** NFL favorites (fix137): starred teams and their games of the coming two weeks. */
export default function NflFavorites() {
  const { teams } = useNflFavorites()
  const { remove } = useFavorites()
  const [games, setGames] = useState<NflGame[] | null>(null)
  useEffect(() => { document.title = t('{0} · SportLikely', { 0: t('NFL favorites') }) }, [])
  useEffect(() => {
    if (!teams.length) { setGames([]); return }
    const from = new Date(Date.now() - 6 * 3600 * 1000), to = new Date(Date.now() + 8 * 86400000)
    axios.get(`${API_URL}/nfl/games`, { params: { from: from.toISOString(), to: to.toISOString() } })
      .then(r => setGames((r.data.data.games as NflGame[]).filter(g => teams.some(f => f.ref === String(g.home.id) || f.ref === String(g.away.id)))))
      .catch(() => setGames([]))
  }, [teams.map(f => f.ref).join(',')])
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">{t('NFL favorites')}</h1>
      <Card title={t('Teams')}>
        {teams.length === 0 ? <p className="text-sm text-faint">{t('Star a team on its page or on a game page.')}</p> : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {teams.map(f => (
              <li key={f.ref} className="flex items-center gap-3 rounded-xl bg-surface2/50 px-3 py-2">
                <Link to={`/american-football/team/${f.ref}`} className="flex items-center gap-3 min-w-0 flex-1 hover:text-accent">
                  <TeamLogo team={{ name: f.name, logo: f.img || null }} size={28} />
                  <span className="truncate text-ink font-semibold">{f.name}</span>
                </Link>
                <button type="button" onClick={() => remove(f.kind, f.ref)} className="text-xs text-muted hover:text-loss">{t('Remove')}</button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {teams.length > 0 && (games ? <NflGamesByDay games={games} empty={t('No games for your teams in the next week.')} /> : null)}
    </div>
  )
}
