import SportHome from '../../components/SportHome'
import { useBasketballAdapter } from '../../components/SportHome/basketball'

/** Basketball home (fix141): the shared sport home (football's layout) with basketball's adapter. */
export default function BbHome() {
  return <SportHome adapter={useBasketballAdapter()} />
}
