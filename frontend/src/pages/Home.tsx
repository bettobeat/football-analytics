import SportHome from '../components/SportHome'
import { footballAdapter } from '../components/SportHome/football'

/** Football home (fix141): the shared sport home with football's adapter — the template every sport follows. */
export default function Home() {
  return <SportHome adapter={footballAdapter} />
}
