import { t as tt } from '../lib/i18n'
import TodayPage, { type TodayAdapter } from '../components/sport/Today'

/** fix152b: the Today page is the shared one (components/sport/Today); football and basketball adapters. */
const ADAPTERS: Record<'football' | 'basketball', TodayAdapter> = {
  football: {
    title: tt("Football predictions today"), params: { sport: 'football' },
    gameHref: id => `/match/${id}`, leagueHref: code => (code ? `/league/${code}` : null), all: { to: '/matches', label: tt("All matches →") }
  },
  basketball: {
    title: tt("Basketball predictions today"), params: { sport: 'basketball' },
    gameHref: id => `/basketball/game/${id}`, leagueHref: code => (code ? `/basketball/league/${code}` : null), all: { to: '/basketball/games', label: tt('All games →') }
  }
}

export default function Today({ sport }: { sport: 'football' | 'basketball' }) {
  return <TodayPage a={ADAPTERS[sport]} />
}
