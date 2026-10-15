import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../../lib/socket'
import { t } from '../../lib/i18n'
import { useAuth } from '../../lib/auth'
import { weekLabel, type NflGame, type NflWeek } from '../../lib/nfl'
import { Skeleton } from '../bb/parts'
import { NflGamesByDay, WeekPicker } from './parts'

/**
 * NFL games (fix137): by week (1–18 + Playoffs) with a week picker, grouped by day. `today` = the visitor's own
 * calendar day (the Today menu). Past seasons: admins only (season picker).
 */
export default function NflGames({ today = false }: { today?: boolean }) {
  const { access } = useAuth()
  const [params, setParams] = useSearchParams()
  const [weeks, setWeeks] = useState<NflWeek[]>([])
  const [week, setWeek] = useState<string | null>(params.get('week'))
  const [season, setSeason] = useState<number | null>(params.get('season') ? Number(params.get('season')) : null)
  const [seasons, setSeasons] = useState<number[]>([])
  const [games, setGames] = useState<NflGame[] | null>(null)

  useEffect(() => { document.title = t('{0} · SportLikely', { 0: today ? t('NFL today') : t('NFL games') }) }, [today])
  useEffect(() => {
    if (access !== 'admin') return
    axios.get(`${API_URL}/nfl/config`).then(r => setSeasons(r.data.data.seasons || [])).catch(() => undefined)
  }, [access])
  useEffect(() => {
    setGames(null)
    if (today) {
      const from = new Date(); from.setHours(0, 0, 0, 0)
      const to = new Date(from.getTime() + 86400000)
      axios.get(`${API_URL}/nfl/games`, { params: { from: from.toISOString(), to: to.toISOString() } }).then(r => setGames(r.data.data.games || [])).catch(() => setGames([]))
      return
    }
    axios.get(`${API_URL}/nfl/games`, { params: { ...(week ? { week } : {}), ...(season ? { season } : {}) } })
      .then(r => { const d = r.data.data; setWeeks(d.weeks || []); setWeek(d.week); setSeason(d.season); setGames(d.games || []) })
      .catch(() => setGames([]))
  }, [today, week, season])

  const pick = (k: string) => { setWeek(k); const p = new URLSearchParams(params); p.set('week', k); setParams(p, { replace: true }) }
  const pickSeason = (s: number) => { setSeason(s); setWeek(null); const p = new URLSearchParams(); p.set('season', String(s)); setParams(p, { replace: true }) }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">{today ? t('NFL today') : t('NFL games')}</h1>
          {!today && season && <p className="text-sm text-muted">{t('{0} season · {1}', { 0: season, 1: weekLabel(week) })}</p>}
        </div>
        {!today && access === 'admin' && seasons.length > 1 && (
          <label className="text-xs text-faint flex items-center gap-2">{t('Season')} <span className="text-[10px] font-semibold uppercase">admin</span>
            <select value={season ?? ''} onChange={e => pickSeason(Number(e.target.value))} className="h-9 rounded-lg bg-surface2 border border-line px-2 text-sm text-ink">
              {seasons.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
      </header>
      {!today && weeks.length > 0 && <WeekPicker weeks={weeks} value={week} onPick={pick} />}
      {!games ? <Skeleton rows={8} /> : <NflGamesByDay games={games} empty={today ? t('No NFL games today.') : t('No games this week.')} />}
    </div>
  )
}
