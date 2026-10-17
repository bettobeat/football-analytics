import { t } from '../lib/i18n'
import type { Favorite } from '../lib/favorites'
import FavoritesPage from '../components/sport/Favorites'
import { footballGames } from '../components/sport/games/football'

/** fix152b: football's Favorites page is the shared one (components/sport/Favorites) with football's adapter. */
function hrefOf(f: Favorite) {
  if (f.kind === 'league') return `/league/${f.code || f.ref}`
  if (f.kind === 'player') return `/player/${f.ref}`
  const id = f.ids?.[0]
  return id ? `/team/${id}?${new URLSearchParams({ n: f.name }).toString()}` : `/matches`
}

export default function Favorites() {
  return (
    <FavoritesPage a={{
      games: footballGames, kinds: ['team', 'player', 'league'], hrefOf, self: '/favorites',
      browse: { to: '/matches', label: t("Browse matches") },
      empty: t("Search above, open a team, league or player and tap the star. You can also star a league from the list on the Matches page. Their games then appear here, are marked with a star everywhere, and come first on the Matches page.")
    }} />
  )
}
