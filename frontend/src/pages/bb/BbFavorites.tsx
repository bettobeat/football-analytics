import { t } from '../../lib/i18n'
import FavoritesPage from '../../components/sport/Favorites'
import { basketballGames } from '../../components/sport/games/basketball'

/** fix152b: basketball favorites = the shared Favorites page (football's) with basketball's adapter. */
export default function BbFavorites() {
  return (
    <FavoritesPage a={{
      games: basketballGames, kinds: ['bb-team', 'bb-league'], self: '/basketball/favorites',
      hrefOf: f => (f.kind === 'bb-league' ? `/basketball/league/${f.code || f.ref}` : `/basketball/team/${f.ref}`),
      browse: { to: '/basketball/games', label: t("Browse games") },
      empty: t("Search above, open a team or league and tap the star. You can also star a league from the list on the Games page. Their games then appear here, are marked with a star everywhere, and come first on the Games page.")
    }} />
  )
}
