import { t } from '../../lib/i18n'
import { useBbConfig } from '../../lib/bb'
import WinnerAccuracy from '../../components/WinnerAccuracy'

/** The public record: every pick saved before tip-off, from launch day on (fix144: the shared winner-sport page). */
export default function BbAccuracy() {
  const cfg = useBbConfig()
  return (
    <WinnerAccuracy
      title={t('Basketball accuracy')}
      intro={t('Every pick is saved before tip-off and checked after the final buzzer. Nothing is removed. Pre-season games are not counted.')}
      url="/basketball/record"
      gameHref={id => `/basketball/game/${id}`}
      leagueName={c => cfg?.leagues.find(l => l.code === c)?.name || c}
      leagueHref={c => `/basketball/league/${c}`}
      strongLabel={t('Strong picks right (70%+)')}
      empty={t('No official games checked yet: the first regular-season games with a saved pick are in the list below and count as soon as they finish.')}
      savedNote={t('picks saved before tip-off')}
      waitingNote={t('Bold = our pick. Each game is checked automatically after the final buzzer.')}
    />
  )
}
