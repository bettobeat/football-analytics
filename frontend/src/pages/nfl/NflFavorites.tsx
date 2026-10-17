import { t } from '../../lib/i18n'
import FavoritesPage from '../../components/sport/Favorites'
import { useNflGames } from '../../components/sport/games/nfl'

/** fix152b: NFL + college favorites = the shared Favorites page (football's) with the NFL adapter. */
export default function NflFavorites() {
  return (
    <FavoritesPage a={{
      games: useNflGames(), kinds: ['nfl-team', 'nfl-league'], self: '/american-football/favorites',
      hrefOf: f => (f.kind === 'nfl-league' ? (f.ref === 'NCAA' ? '/american-football/college/league' : '/american-football/league') : `/american-football/team/${f.ref}`),
      browse: { to: '/american-football/games', label: t("Browse games") },
      empty: t("Search above, open a team or league and tap the star. You can also star a league from the list on the Games page. Their games then appear here, are marked with a star everywhere, and come first on the Games page.")
    }} />
  )
}
