import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../lib/socket'
import { t, LOCALE } from '../lib/i18n'
import { Card, Skeleton, TeamLogo } from '../pages/bb/parts'

/**
 * Accuracy page of the sports where the pick is the winner (fix144: basketball and NFL share it; it was BbAccuracy):
 * every pick saved before the start and checked after the game — total, strong picks, by league, by confidence band,
 * the latest checked picks, the ones waiting and (basketball) pre-season games apart.
 */
interface Rec { n: number; hits: number; hitRate: number | null; strongN: number; strongHits: number; strongHitRate: number | null }
interface Row { gameId: number; code: string; kickoff: string; home: string; away: string; homeLogo: string | null; awayLogo: string | null; score: [number, number]; pick: 'H' | 'A'; pHome: number; hit: boolean }
interface Pending { gameId: number; code: string; kickoff: string; home: string; away: string; homeLogo: string | null; awayLogo: string | null; status: string | null; live: boolean; score: [number, number] | null; pick: 'H' | 'A'; preseason: boolean }
export interface WinnerRecord {
  preseason?: { n: number; hits: number; hitRate: number | null; recent: Row[] }
  pending?: Pending[]
  since: string | null
  total: Rec
  bands?: { min: number; n: number; hits: number; pct: number | null }[]
  leagues: (Rec & { code: string; trial?: boolean })[]
  recent: Row[]
}
export interface WinnerAccuracyProps {
  title: string
  intro: string
  /** API path under API_URL */
  url: string
  gameHref: (id: number) => string
  leagueName: (code: string) => string
  leagueHref?: (code: string) => string | null
  strongLabel: string
  empty: string
  /** "picks saved before tip-off" / "… kick-off" */
  savedNote: string
  /** footnote under the waiting list */
  waitingNote: string
}

export default function WinnerAccuracy(p: WinnerAccuracyProps) {
  const [d, setD] = useState<WinnerRecord | null>(null)
  useEffect(() => {
    document.title = t('{0} · SportLikely', { 0: p.title })
    axios.get(`${API_URL}${p.url}`).then(r => setD(r.data.data)).catch(() => undefined)
  }, [p.url])
  const line = (r: Row | Pending, mid: string, end: JSX.Element) => (
    <li key={r.gameId}>
      <Link to={p.gameHref(r.gameId)} className="flex items-center gap-2 py-2 text-sm hover:bg-surface2/50 rounded-lg px-1 min-w-0">
        {mid === '' ? null : <span className="w-16 shrink-0 text-xs text-faint">{mid}</span>}
        <TeamLogo team={{ name: r.home, logo: r.homeLogo }} size={16} />
        <span className={`truncate ${r.pick === 'H' ? 'font-bold text-ink' : 'text-muted'}`}>{r.home}</span>
        <span className="num font-bold text-ink px-1 shrink-0">{r.score ? `${r.score[0]}–${r.score[1]}` : '–'}</span>
        <span className={`truncate ${r.pick === 'A' ? 'font-bold text-ink' : 'text-muted'}`}>{r.away}</span>
        <TeamLogo team={{ name: r.away, logo: r.awayLogo }} size={16} />
        {end}
      </Link>
    </li>
  )
  const hitChip = (hit: boolean) => <span className={`ml-auto shrink-0 rounded-full px-2 text-[10px] font-bold ${hit ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss'}`}>{hit ? t('Hit') : t('Miss')}</span>
  const day = (iso: string) => new Date(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-28 xl:pb-10">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-ink">{p.title}</h1>
        <p className="mt-1 text-sm text-muted max-w-2xl">{p.intro}</p>
      </div>
      {!d ? <Skeleton rows={4} h="h-20" /> : d.total.n === 0 ? (
        <Card><p className="text-sm text-muted">{p.empty}</p></Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Big label={t('Picks right')} value={`${d.total.hitRate}%`} sub={t('{0} of {1} games', { 0: d.total.hits, 1: d.total.n })} />
            <Big label={p.strongLabel} value={d.total.strongHitRate !== null ? `${d.total.strongHitRate}%` : '–'} sub={t('{0} of {1} games', { 0: d.total.strongHits, 1: d.total.strongN })} />
            <Big label={t('Since')} value={d.since ? new Date(d.since).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }) : '–'} sub={t('first game in the record')} />
          </div>
          {d.bands && d.bands.some(b => b.n > 0) && (
            <Card title={t('By confidence')}>
              <ul className="space-y-2.5">
                {d.bands.map(b => (
                  <li key={b.min} className="flex items-center gap-3 text-sm">
                    <span className="w-36 sm:w-44 text-muted shrink-0">{b.min === 0 ? t('Winner · all picks') : t('Winner · {0}%+ sure', { 0: b.min })}</span>
                    <span className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden"><span className="block h-full rounded-full bg-accent" style={{ width: `${b.pct ?? 0}%` }} /></span>
                    <span className="w-24 text-right num text-xs text-ink whitespace-nowrap">{b.pct !== null ? `${b.pct}%` : '–'} <span className="text-faint">· {b.n}</span></span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title={t('By league')}>
            <table className="w-full text-sm">
              <thead><tr className="text-faint text-xs"><th className="text-left font-semibold py-1">{t('League')}</th><th className="text-right font-semibold">{t('Games')}</th><th className="text-right font-semibold">{t('Right')}</th><th className="text-right font-semibold">{t('Strong picks')}</th></tr></thead>
              <tbody>
                {d.leagues.map(l => {
                  const href = p.leagueHref?.(l.code) || null
                  return (
                    <tr key={l.code} className="border-t border-line/50">
                      <td className="py-2">{href ? <Link to={href} className="text-ink hover:text-accent">{p.leagueName(l.code)}</Link> : <span className="text-ink">{p.leagueName(l.code)}</span>}{l.trial && <span className="ml-2 text-[10px] font-bold uppercase text-accent" title={t("We added this league recently. Its predictions are being tested and don’t count in our public record yet.")}>{t('in testing')}</span>}</td>
                      <td className="text-right num text-muted">{l.n}</td>
                      <td className="text-right num text-ink font-bold">{l.hitRate}%</td>
                      <td className="text-right num text-muted">{l.strongHitRate !== null ? `${l.strongHitRate}% (${l.strongN})` : '–'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
          <Card title={t('Latest checked picks')}>
            <ul className="divide-y divide-line/50">{d.recent.map(r => line(r, day(r.kickoff), hitChip(r.hit)))}</ul>
          </Card>
        </>
      )}

      {d && d.pending && d.pending.length > 0 && (
        <Card title={t('Waiting for the result')} action={<span className="text-xs text-faint">{p.savedNote}</span>}>
          <ul className="divide-y divide-line/50">
            {d.pending.map(r => line(r, '', (
              <span className="ml-auto shrink-0 text-[10px] text-faint">
                {r.live ? <span className="inline-flex items-center gap-1 font-bold text-live"><span className="w-1.5 h-1.5 rounded-full bg-live animate-pulseDot" />{t('Live')}</span>
                  : r.preseason ? t('Pre-season') : `${new Date(r.kickoff).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })} · ${p.leagueName(r.code)}`}
              </span>
            )))}
          </ul>
          <p className="mt-2 text-[11px] text-faint">{p.waitingNote}</p>
        </Card>
      )}

      {d && d.preseason && d.preseason.n > 0 && (
        <Card title={t('Pre-season (not counted)')} action={<span className="text-xs text-muted">{t('{0} of {1} right', { 0: d.preseason.hits, 1: d.preseason.n })}{d.preseason.hitRate !== null ? ` · ${d.preseason.hitRate}%` : ''}</span>}>
          <p className="text-xs text-faint mb-3">{t('In pre-season teams rest their stars and try young players, so these games are shown but kept out of the official record.')}</p>
          <ul className="divide-y divide-line/50">{d.preseason.recent.map(r => line(r, day(r.kickoff), hitChip(r.hit)))}</ul>
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
