import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../../lib/socket'
import { t } from '../../lib/i18n'
import { useAuth } from '../../lib/auth'
import { useBbConfig, type BbGame } from '../../lib/bb'
import { Card, GameList, Skeleton, LockedNote } from './parts'

interface Record_ { total: { n: number; hits: number; hitRate: number | null; strongN: number; strongHitRate: number | null }; since: string | null }

/** Basketball home: the next games with our picks, the latest results, the record, the leagues. */
export default function BbHome() {
  const cfg = useBbConfig()
  const { access } = useAuth()
  const [next, setNext] = useState<BbGame[] | null>(null)
  const [results, setResults] = useState<BbGame[] | null>(null)
  const [record, setRecord] = useState<Record_ | null>(null)

  useEffect(() => {
    document.title = t('{0} · SportLikely', { 0: t('Basketball') })
    const load = () => {
      axios.get(`${API_URL}/basketball/games`, { params: { days: 2 } }).then(r => setNext(r.data.data || [])).catch(() => setNext([]))
      axios.get(`${API_URL}/basketball/games`, { params: { days: 3, results: 1 } }).then(r => setResults((r.data.data || []).filter((g: BbGame) => g.state === 'done'))).catch(() => setResults([]))
    }
    load()
    axios.get(`${API_URL}/basketball/record`).then(r => setRecord(r.data.data)).catch(() => undefined)
    const iv = setInterval(load, 60000)
    return () => clearInterval(iv)
  }, [])

  const live = (next || []).filter(g => g.state === 'live')
  const upcoming = (next || []).filter(g => g.state === 'upcoming')
  const locked = upcoming.some(g => g.prediction?.locked)

  return (
    <div className="max-w-7xl 2xl:max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6 pb-28 xl:pb-10">
      <section className="card relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-14 text-[170px] leading-none opacity-[0.07] select-none" aria-hidden>🏀</div>
        {cfg && !cfg.public && (
          <span className="inline-block mb-3 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-draw/15 text-draw">{t('Admin preview · not public yet')}</span>
        )}
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">{t('Basketball predictions')}</h1>
        <p className="mt-2 text-muted max-w-2xl">
          {t('Who wins, the point spread, total points and the predicted score for every game of the NBA, EuroLeague, Liga ACB and Lega Basket Serie A. Every prediction is saved before tip-off and checked in public.')}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link to="/basketball/games" className="h-11 px-5 rounded-2xl bg-accent text-bg font-extrabold grid place-items-center">{t('All games →')}</Link>
          <Link to="/basketball/accuracy" className="h-11 px-5 rounded-2xl border border-line/80 bg-surface text-ink font-bold grid place-items-center">{t('Our record')}</Link>
        </div>
        {record && record.total.n > 0 && (
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span><b className="num text-ink text-lg">{record.total.hitRate}%</b> <span className="text-muted">{t('of picks right ({0} games)', { 0: record.total.n })}</span></span>
            {record.total.strongN > 0 && <span><b className="num text-ink text-lg">{record.total.strongHitRate}%</b> <span className="text-muted">{t('strong picks right ({0})', { 0: record.total.strongN })}</span></span>}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start">
        <div className="space-y-6 min-w-0">
          {live.length > 0 && (
            <Card title={t('Live now')}>
              <GameList games={live} showLeague empty="" />
            </Card>
          )}
          <Card title={t('Next games')} action={<Link to="/basketball/games" className="text-xs font-bold text-accent">{t('All →')}</Link>}>
            {locked && access !== 'admin' && <div className="mb-3"><LockedNote /></div>}
            {!next ? <Skeleton rows={6} /> : <GameList games={upcoming.slice(0, 30)} showLeague empty={t('No games in the next two days.')} />}
          </Card>
        </div>

        <div className="space-y-6 min-w-0">
          <Card title={t('Leagues')}>
            <div className="grid grid-cols-2 gap-2">
              {(cfg?.leagues || []).map(l => (
                <Link key={l.code} to={`/basketball/league/${l.code}`} className="flex items-center gap-2 p-2.5 rounded-xl bg-surface2/50 hover:bg-surface2 transition-colors">
                  {l.logo ? <img src={l.logo} alt="" className="w-7 h-7 object-contain" /> : <span className="w-7 h-7" />}
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-ink truncate">{l.name}</span>
                    <span className="block text-[11px] text-faint truncate">{t(l.country)}</span>
                  </span>
                </Link>
              ))}
            </div>
          </Card>
          <Card title={t('Latest results')} action={<Link to="/basketball/accuracy" className="text-xs font-bold text-accent">{t('Record →')}</Link>}>
            {!results ? <Skeleton rows={5} /> : (
              <div className="max-h-[560px] overflow-y-auto overscroll-contain pr-1">
                <GameList games={results.slice(0, 40)} showLeague empty={t('No results in the last three days.')} />
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
