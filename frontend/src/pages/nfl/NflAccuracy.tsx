import { t } from '../../lib/i18n'
import WinnerAccuracy from '../../components/WinnerAccuracy'

/** NFL + college football accuracy (fix144, admins for now like basketball's): the shared winner-sport page. */
export default function NflAccuracy() {
  return (
    <WinnerAccuracy
      title={t('American football accuracy')}
      intro={t('Every pick is saved before kick-off and checked after the final whistle. Nothing is removed. Strong picks: 70%+ in the NFL, 75%+ in college football.')}
      url="/nfl/accuracy"
      gameHref={id => `/american-football/game/${id}`}
      leagueName={c => (c === 'NCAA' ? t('College football') : 'NFL')}
      leagueHref={c => (c === 'NCAA' ? '/american-football/college' : '/american-football')}
      strongLabel={t('Strong picks right')}
      empty={t('No games checked yet: every pick saved before kick-off counts as soon as the game is over.')}
      savedNote={t('picks saved before kick-off')}
      waitingNote={t('Bold = our pick. Each game is checked automatically after the final whistle.')}
    />
  )
}
