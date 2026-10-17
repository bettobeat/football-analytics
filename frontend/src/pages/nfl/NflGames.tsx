import { useEffect, useState } from 'react'
import axios from 'axios'
import { API_URL } from '../../lib/socket'
import { t } from '../../lib/i18n'
import { useNflLeague, type NflGame } from '../../lib/nfl'
import { Skeleton, SectionTitle } from '../bb/parts'
import Games from '../../components/sport/Games'
import { useNflGames } from '../../components/sport/games/nfl'
import { NflGamesByDay, LeagueSwitch, NflLiveCard } from './parts'

/**
 * NFL + college games. fix152a: the Games list is the shared page (football's Matches layout) with the NFL adapter —
 * no week bar, no season picker. `today` = the visitor's calendar day (the Today menu; becomes shared in stage b).
 */
export default function NflGames({ today = false }: { today?: boolean }) {
  return today ? <NflToday /> : <NflGamesShared />
}

function NflGamesShared() {
  return <Games a={useNflGames()} />
}

function NflToday() {
  const { league } = useNflLeague()
  const college = league === 2
  const [games, setGames] = useState<NflGame[] | null>(null)
  const title = college ? t('College football today') : t('NFL today')
  useEffect(() => { document.title = t('{0} · SportLikely', { 0: title }) }, [title])
  useEffect(() => {
    setGames(null)
    const from = new Date(); from.setHours(0, 0, 0, 0)
    const to = new Date(from.getTime() + 86400000)
    axios.get(`${API_URL}/nfl/games`, { params: { from: from.toISOString(), to: to.toISOString(), league } }).then(r => setGames(r.data.data.games || [])).catch(() => setGames([]))
  }, [league])
  const live = (games || []).filter(g => g.state === 'live')
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
      <LeagueSwitch />
      <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">{title}</h1>
      {/* CLAUDE.md: live games appear once — in the Live strip — never again in the day lists */}
      {live.length > 0 && (
        <section>
          <SectionTitle label={t('Live')} count={live.length} />
          <div className="flex gap-3 overflow-x-auto snap-x pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">{live.map(g => <NflLiveCard key={g.id} g={g} />)}</div>
        </section>
      )}
      {!games ? <Skeleton rows={8} /> : games.length > 0 && games.every(g => g.state === 'live') ? null : (
        <NflGamesByDay games={games.filter(g => g.state !== 'live')} empty={college ? t('No college football games today.') : t('No NFL games today.')} />
      )}
    </div>
  )
}
