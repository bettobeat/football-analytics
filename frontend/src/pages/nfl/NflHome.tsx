import SportHome from '../../components/SportHome'
import { useNflAdapter } from '../../components/SportHome/nfl'

/** NFL home (fix141): the shared sport home (football's layout) with the NFL adapter. */
export default function NflHome() {
  return <SportHome adapter={useNflAdapter()} />
}
