import Games from '../../components/sport/Games'
import { basketballGames } from '../../components/sport/games/basketball'

/** fix152a: the basketball Games page is the shared one (football's Matches layout) with basketball's adapter. */
export default function BbGames() {
  return <Games a={basketballGames} />
}
