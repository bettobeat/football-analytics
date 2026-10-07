import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../../lib/socket'
import { t, LOCALE } from '../../lib/i18n'
import { useAuth } from '../../lib/auth'
import { useBbConfig, type BbGame } from '../../lib/bb'
import { Card, GameList, Skeleton, LockedNote } from './parts'

const DAY = 86400000
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** All games of one day (the visitor's own day), every league or one. */
export default function BbGames() {
  const cfg = useBbConfig()
  const { access } = useAuth()
  const [params, setParams] = useSearchParams()
  const league = params.get('league') || ''
  const offset = parseInt(params.get('day') || '0', 10) || 0
  const [games, setGames] = useState<BbGame[] | null>(null)

  const day = useMemo(() => new Date(startOfDay(new Date()).getTime() + offset * DAY), [offset])
  useEffect(() => {
    let cancelled = false
    setGames(null)
    const load = () =>
      axios
        .get(`${API_URL}/basketball/games`, { params: { from: day.toISOString(), to: new Date(day.getTime() + DAY).toISOString(), ...(league ? { league } : {}) } })
        .then(r => !cancelled && setGames(r.data.data || []))
        .catch(() => !cancelled && setGames([]))
    load()
    const iv = setInterval(load, 60000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [day, league])

  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(params)
    if (v === null || v === '' || v === '0') p.delete(k)
    else p.set(k, v)
    setParams(p, { replace: true })
  }
  const days = [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6]
  const label = (o: number) => (o === 0 ? t('Today') : o === -1 ? t('Yesterday') : o === 1 ? t('Tomorrow') : new Date(startOfDay(new Date()).getTime() + o * DAY).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric' }))
  const locked = (games || []).some(g => g.prediction?.locked && g.state === 'upcoming')

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4 pb-28 xl:pb-10">
      <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-ink">{t('Games')}</h1>
      <div className="flex gap-1 overflow-x-auto no-scrollbar p-1 rounded-full bg-surface2/60 border border-line/60">
        {days.map(o => (
          <button key={o} onClick={() => set('day', String(o))} className={`flex-1 min-w-max px-3 py-1.5 rounded-full text-[13px] font-semibold ${o === offset ? 'bg-accent text-bg' : 'text-muted hover:text-ink'}`}>
            {label(o)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => set('league', null)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${!league ? 'bg-ink text-bg border-ink' : 'border-line/80 text-muted hover:text-ink'}`}>{t('All leagues')}</button>
        {(cfg?.leagues || []).map(l => (
          <button key={l.code} onClick={() => set('league', l.code)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${league === l.code ? 'bg-ink text-bg border-ink' : 'border-line/80 text-muted hover:text-ink'}`}>
            {l.logo && <img src={l.logo} alt="" className="w-4 h-4 object-contain" />}
            {l.name}
          </button>
        ))}
      </div>
      {locked && access !== 'admin' && <LockedNote />}
      <Card>
        {!games ? <Skeleton rows={8} /> : <GameList games={games} showLeague={!league} empty={t('No games on this day.')} />}
      </Card>
    </div>
  )
}
