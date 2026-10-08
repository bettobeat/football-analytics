import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../../lib/socket'
import { t, LOCALE } from '../../lib/i18n'
import { useBbConfig } from '../../lib/bb'
import { Card, Skeleton, TeamLogo } from './parts'

interface Rec { n: number; hits: number; hitRate: number | null; strongN: number; strongHits: number; strongHitRate: number | null }
interface Row { gameId: number; code: string; kickoff: string; home: string; away: string; homeLogo: string | null; awayLogo: string | null; score: [number, number]; pick: 'H' | 'A'; pHome: number; hit: boolean }
interface Pending { gameId: number; code: string; kickoff: string; home: string; away: string; homeLogo: string | null; awayLogo: string | null; status: string | null; live: boolean; score: [number, number] | null; pick: 'H' | 'A'; preseason: boolean }
interface RecordData {
  preseason?: { n: number; hits: number; hitRate: number | null; recent: Row[] }
  pending?: Pending[]
  since: string | null
  total: Rec
  leagues: (Rec & { code: string })[]
  recent: { gameId: number; code: string; kickoff: string; home: string; away: string; homeLogo: string | null; awayLogo: string | null; score: [number, number]; pick: 'H' | 'A'; pHome: number; hit: boolean }[]
}

/** The public record: every pick saved before tip-off, from launch day on. */
export default function BbAccuracy() {
  const cfg = useBbConfig()
  const [d, setD] = useState<RecordData | null>(null)
  useEffect(() => {
    document.title = t('{0} · SportLikely', { 0: t('Basketball accuracy') })
    axios.get(`${API_URL}/basketball/record`).then(r => setD(r.data.data)).catch(() => undefined)
  }, [])
  const name = (c: string) => cfg?.leagues.find(l => l.code === c)?.name || c

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-28 xl:pb-10">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-ink">{t('Basketball accuracy')}</h1>
        <p className="mt-1 text-sm text-muted max-w-2xl">{t('Every pick is saved before tip-off and checked after the final buzzer. Nothing is removed. Pre-season games are not counted.')}</p>
      </div>
      {!d ? <Skeleton rows={4} h="h-20" /> : d.total.n === 0 ? (
        <Card><p className="text-sm text-muted">{t('No official games checked yet: the first regular-season games with a saved pick are in the list below and count as soon as they finish.')}</p></Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Big label={t('Picks right')} value={`${d.total.hitRate}%`} sub={t('{0} of {1} games', { 0: d.total.hits, 1: d.total.n })} />
            <Big label={t('Strong picks right (70%+)')} value={d.total.strongHitRate !== null ? `${d.total.strongHitRate}%` : '–'} sub={t('{0} of {1} games', { 0: d.total.strongHits, 1: d.total.strongN })} />
            <Big label={t('Since')} value={d.since ? new Date(d.since).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }) : '–'} sub={t('first game in the record')} />
          </div>
          <Card title={t('By league')}>
            <table className="w-full text-sm">
              <thead><tr className="text-faint text-xs"><th className="text-left font-semibold py-1">{t('League')}</th><th className="text-right font-semibold">{t('Games')}</th><th className="text-right font-semibold">{t('Right')}</th><th className="text-right font-semibold">{t('Strong picks')}</th></tr></thead>
              <tbody>
                {d.leagues.map(l => (
                  <tr key={l.code} className="border-t border-line/50">
                    <td className="py-2"><Link to={`/basketball/league/${l.code}`} className="text-ink hover:text-accent">{name(l.code)}</Link></td>
                    <td className="text-right num text-muted">{l.n}</td>
                    <td className="text-right num text-ink font-bold">{l.hitRate}%</td>
                    <td className="text-right num text-muted">{l.strongHitRate !== null ? `${l.strongHitRate}% (${l.strongN})` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card title={t('Latest checked picks')}>
            <ul className="divide-y divide-line/50">
              {d.recent.map(r => (
                <li key={r.gameId}>
                  <Link to={`/basketball/game/${r.gameId}`} className="flex items-center gap-2 py-2 text-sm hover:bg-surface2/50 rounded-lg px-1">
                    <span className="w-16 text-xs text-faint">{new Date(r.kickoff).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}</span>
                    <TeamLogo team={{ name: r.home, logo: r.homeLogo }} size={16} />
                    <span className={`truncate ${r.pick === 'H' ? 'font-bold text-ink' : 'text-muted'}`}>{r.home}</span>
                    <span className="num font-bold text-ink px-1">{r.score[0]}–{r.score[1]}</span>
                    <span className={`truncate ${r.pick === 'A' ? 'font-bold text-ink' : 'text-muted'}`}>{r.away}</span>
                    <TeamLogo team={{ name: r.away, logo: r.awayLogo }} size={16} />
                    <span className={`ml-auto rounded-full px-2 text-[10px] font-bold ${r.hit ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss'}`}>{r.hit ? t('Hit') : t('Miss')}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {d && d.pending && d.pending.length > 0 && (
        <Card title={t('Waiting for the result')} action={<span className="text-xs text-faint">{t('picks saved before tip-off')}</span>}>
          <ul className="divide-y divide-line/50">
            {d.pending.map(r => (
              <li key={r.gameId}>
                <Link to={`/basketball/game/${r.gameId}`} className="flex items-center gap-2 py-2 text-sm hover:bg-surface2/50 rounded-lg px-1">
                  <span className="w-16 text-xs text-faint">
                    {r.live ? <span className="inline-flex items-center gap-1 font-bold text-live"><span className="w-1.5 h-1.5 rounded-full bg-live animate-pulseDot" />{t('Live')}</span>
                      : new Date(r.kickoff).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <TeamLogo team={{ name: r.home, logo: r.homeLogo }} size={16} />
                  <span className={`truncate ${r.pick === 'H' ? 'font-bold text-ink' : 'text-muted'}`}>{r.home}</span>
                  <span className="num font-bold text-ink px-1">{r.score ? `${r.score[0]}–${r.score[1]}` : '–'}</span>
                  <span className={`truncate ${r.pick === 'A' ? 'font-bold text-ink' : 'text-muted'}`}>{r.away}</span>
                  <TeamLogo team={{ name: r.away, logo: r.awayLogo }} size={16} />
                  <span className="ml-auto text-[10px] text-faint">{r.preseason ? t('Pre-season') : name(r.code)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-faint">{t('Bold = our pick. Each game is checked automatically after the final buzzer.')}</p>
        </Card>
      )}

      {d && d.preseason && d.preseason.n > 0 && (
        <Card title={t('Pre-season (not counted)')} action={<span className="text-xs text-muted">{t('{0} of {1} right', { 0: d.preseason.hits, 1: d.preseason.n })}{d.preseason.hitRate !== null ? ` · ${d.preseason.hitRate}%` : ''}</span>}>
          <p className="text-xs text-faint mb-3">{t('In pre-season teams rest their stars and try young players, so these games are shown but kept out of the official record.')}</p>
          <ul className="divide-y divide-line/50">
            {d.preseason.recent.map(r => (
              <li key={r.gameId}>
                <Link to={`/basketball/game/${r.gameId}`} className="flex items-center gap-2 py-2 text-sm hover:bg-surface2/50 rounded-lg px-1">
                  <span className="w-16 text-xs text-faint">{new Date(r.kickoff).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}</span>
                  <TeamLogo team={{ name: r.home, logo: r.homeLogo }} size={16} />
                  <span className={`truncate ${r.pick === 'H' ? 'font-bold text-ink' : 'text-muted'}`}>{r.home}</span>
                  <span className="num font-bold text-ink px-1">{r.score[0]}–{r.score[1]}</span>
                  <span className={`truncate ${r.pick === 'A' ? 'font-bold text-ink' : 'text-muted'}`}>{r.away}</span>
                  <TeamLogo team={{ name: r.away, logo: r.awayLogo }} size={16} />
                  <span className={`ml-auto rounded-full px-2 text-[10px] font-bold ${r.hit ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss'}`}>{r.hit ? t('Hit') : t('Miss')}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function Big({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs text-faint">{label}</div>
      <div className="font-display num text-3xl font-extrabold text-ink mt-1">{value}</div>
      <div className="text-xs text-muted mt-1">{sub}</div>
    </div>
  )
}
