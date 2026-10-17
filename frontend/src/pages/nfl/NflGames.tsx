import { t } from '../../lib/i18n'
import { useNflLeague, nflBase } from '../../lib/nfl'
import Games from '../../components/sport/Games'
import TodayPage from '../../components/sport/Today'
import { useNflGames } from '../../components/sport/games/nfl'
import { LeagueSwitch } from './parts'

/**
 * NFL + college games (fix152): the Games list (fix152a) and Today (fix152b) are the shared pages — football's layout —
 * with the NFL adapters. The league (NFL | College) comes from the address.
 */
export default function NflGames({ today = false }: { today?: boolean }) {
  return today ? <NflToday /> : <NflGamesShared />
}

function NflGamesShared() {
  return <Games a={useNflGames()} />
}

function NflToday() {
  const { league } = useNflLeague()
  const base = nflBase(league)
  return (
    <TodayPage a={{
      title: league === 2 ? t('College football today') : t('NFL today'),
      params: { sport: 'american-football', league },
      gameHref: id => `/american-football/game/${id}`,
      leagueHref: () => `${base}/league`,
      all: { to: `${base}/games`, label: t('All games →') },
      top: <LeagueSwitch />
    }} />
  )
}
