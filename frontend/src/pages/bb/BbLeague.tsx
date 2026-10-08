import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../../lib/socket'
import { t } from '../../lib/i18n'
import { useBbConfig, bbLeagueFav, type BbGame } from '../../lib/bb'
import { FavStar } from '../../lib/favorites'
import { Card, GameList, Skeleton, TeamLogo } from './parts'
import { useNews, NewsRows } from '../../components/NewsList'

export interface StandRow { position: number; team: { id: number; name: string; logo: string | null }; played: number; won: number; lost: number; pct: number | null; pointsFor: number | null; pointsAgainst: number | null }
export interface Standings { season: string; groups: { name: string | null; stage: string | null; rows: StandRow[] }[] }

/** Standings table(s); the teams of a game are marked (in the home / away colours when given). */
export function StandingsTable({ data, mark = [], colors }: { data: Standings; mark?: number[]; colors?: Record<number, 'H' | 'A'> }) {
  return (
    <div className="space-y-5">
      {data.groups.map((g, i) => (
        <div key={i}>
          {data.groups.length > 1 && g.name && <div className="label pb-2">{g.name}</div>}
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="text-faint text-[10px] uppercase tracking-wide">
                <th className="text-left font-semibold py-1.5 w-8">#</th>
                <th className="text-left font-semibold py-1.5">{t('Team')}</th>
                <th className="text-right font-semibold py-1.5 w-8">{t('P')}</th>
                <th className="text-right font-semibold py-1.5 w-8">{t('W')}</th>
                <th className="text-right font-semibold py-1.5 w-8">{t('L')}</th>
                <th className="text-right font-semibold py-1.5 w-12 sm:w-28">%</th>
                <th className="text-right font-semibold py-1.5 w-14 hidden sm:table-cell">{t('+/−')}</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map(r => {
                const c = colors?.[r.team.id]
                const on = mark.includes(r.team.id)
                const diff = r.pointsFor !== null && r.pointsAgainst !== null && r.played ? (r.pointsFor - r.pointsAgainst) / r.played : null
                return (
                  <tr key={r.team.id} className={`border-t border-line/40 ${c === 'H' ? 'bg-home/10' : c === 'A' ? 'bg-away/10' : on ? 'bg-accent/10' : 'hover:bg-surface2/40'}`}>
                    <td className="py-1.5 relative">
                      {(c || on) && <span className={`absolute left-0 inset-y-1 w-[3px] rounded-full ${c === 'H' ? 'bg-home' : c === 'A' ? 'bg-away' : 'bg-accent'}`} />}
                      <span className={`ml-1.5 inline-grid place-items-center w-5 h-5 rounded-md num text-[10px] font-bold ${r.position <= 3 ? 'bg-accent/15 text-accent' : 'text-faint'}`}>{r.position}</span>
                    </td>
                    <td className="py-1.5 max-w-0 w-full">
                      <Link to={`/basketball/team/${r.team.id}`} className={`flex items-center gap-2 hover:text-accent ${on ? 'font-bold text-ink' : 'text-ink'}`}>
                        <TeamLogo team={r.team} size={18} /><span className="truncate">{r.team.name}</span>
                      </Link>
                    </td>
                    <td className="py-1.5 text-right num text-muted">{r.played}</td>
                    <td className="py-1.5 text-right num text-ink font-semibold">{r.won}</td>
                    <td className="py-1.5 text-right num text-muted">{r.lost}</td>
                    <td className="py-1.5 text-right num text-muted">
                      <span className="inline-flex items-center justify-end gap-2">
                        {r.pct !== null && <span className="hidden sm:block w-12 h-1.5 rounded-full bg-surface2 overflow-hidden"><span className="block h-full rounded-full bg-win/70" style={{ width: `${r.pct * 100}%` }} /></span>}
                        {r.pct !== null ? r.pct.toFixed(3).replace(/^0/, '') : '–'}
                      </span>
                    </td>
                    <td className={`py-1.5 text-right num hidden sm:table-cell font-semibold ${diff === null ? 'text-muted' : diff > 0 ? 'text-win' : diff < 0 ? 'text-loss' : 'text-muted'}`}>
                      {diff !== null ? (diff > 0 ? '+' : '') + diff.toFixed(1) : '–'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

/** A league: standings, next games, latest results. */
export default function BbLeague() {
  const { code = '' } = useParams()
  const cfg = useBbConfig()
  const league = cfg?.leagues.find(l => l.code === code.toUpperCase())
  const [table, setTable] = useState<Standings | null | undefined>(undefined)
  const [next, setNext] = useState<BbGame[] | null>(null)
  const [results, setResults] = useState<BbGame[] | null>(null)
  const news = useNews({ sport: 'basketball', league: code.toUpperCase(), limit: 10 })
  const [leaders, setLeaders] = useState<Leaders | null>(null)
  useEffect(() => {
    setLeaders(null)
    if (code.toUpperCase() === 'NBA') axios.get(`${API_URL}/basketball/leaders`).then(r => setLeaders(r.data.data || null)).catch(() => undefined)
  }, [code])

  useEffect(() => {
    const c = code.toUpperCase()
    setTable(undefined); setNext(null); setResults(null)
    axios.get(`${API_URL}/basketball/standings/${c}`).then(r => setTable(r.data.data || null)).catch(() => setTable(null))
    axios.get(`${API_URL}/basketball/games`, { params: { league: c, days: 10 } }).then(r => setNext((r.data.data || []).filter((g: BbGame) => g.state !== 'done'))).catch(() => setNext([]))
    axios.get(`${API_URL}/basketball/games`, { params: { league: c, days: 21, results: 1 } }).then(r => setResults((r.data.data || []).filter((g: BbGame) => g.state === 'done'))).catch(() => setResults([]))
  }, [code])
  useEffect(() => { if (league) document.title = t('{0} · SportLikely', { 0: league.name }) }, [league])

  return (
    <div className="max-w-7xl 2xl:max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6 pb-28 xl:pb-10">
      <div className="flex items-center gap-3">
        {league?.logo && <img src={league.logo} alt="" className="w-12 h-12 object-contain" />}
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-ink">{league?.name || code.toUpperCase()}</h1>
            {league && <FavStar label fav={bbLeagueFav(league)} />}
          </div>
          {league && <p className="text-sm text-muted">{t(league.country)}{table?.season ? ` · ${table.season}` : ''}</p>}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-start">
        <Card title={t('Standings')}>
          {table === undefined ? <Skeleton rows={10} h="h-7" /> : table ? <StandingsTable data={table} /> : <p className="text-sm text-faint">{t('No table yet.')}</p>}
        </Card>
        <div className="space-y-6 min-w-0">
          {leaders && leaders.lists.length > 0 && <LeadersCard data={leaders} />}
          <Card title={t('Next games')}>
            {!next ? <Skeleton rows={5} /> : <div className="max-h-[520px] overflow-y-auto overscroll-contain pr-1"><GameList games={next} empty={t('No games in the next 10 days.')} /></div>}
          </Card>
          <Card title={t('Latest results')}>
            {!results ? <Skeleton rows={5} /> : <div className="max-h-[520px] overflow-y-auto overscroll-contain pr-1"><GameList games={results} empty={t('No results in the last three weeks.')} /></div>}
          </Card>
          <Card title={t('{0} news', { 0: league?.name || code.toUpperCase() })}>
            {news === null ? <Skeleton rows={3} h="h-14" /> : news.length ? <div className="-mx-2 max-h-[520px] overflow-y-auto overscroll-contain"><NewsRows items={news} /></div> : <p className="text-sm text-faint">{t('No news about this league in the last two weeks.')}</p>}
          </Card>
        </div>
      </div>
    </div>
  )
}

interface Leaders { season: string; lists: { stat: string; top: { id: number | null; name: string; value: number; games: number; rank: number }[] }[] }
const STAT_LABEL: Record<string, string> = { pts: 'Points', reb: 'Rebounds', ast: 'Assists', stl: 'Steals', blk: 'Blocks' }

/** NBA league leaders per game (balldontlie). */
function LeadersCard({ data }: { data: Leaders }) {
  const [stat, setStat] = useState(data.lists[0].stat)
  const list = data.lists.find(l => l.stat === stat) || data.lists[0]
  return (
    <Card title={t('League leaders')} action={<span className="text-xs text-faint">{data.season}</span>}>
      <div className="seg mb-3 flex-wrap">
        {data.lists.map(l => <button key={l.stat} onClick={() => setStat(l.stat)} className={`seg-btn ${l.stat === stat ? 'seg-btn-active' : ''}`}>{t(STAT_LABEL[l.stat] || l.stat)}</button>)}
      </div>
      <ol className="divide-y divide-line/50">
        {list.top.map(x => (
          <li key={x.name} className="flex items-center gap-3 py-2 text-sm">
            <span className="w-5 num text-faint">{x.rank}</span>
            {x.id ? <Link to={`/basketball/player/${x.id}`} className="text-ink font-semibold hover:text-accent truncate">{x.name}</Link> : <span className="text-ink font-semibold truncate">{x.name}</span>}
            <span className="ml-auto num font-bold text-ink">{x.value}</span>
            <span className="text-[10px] text-faint w-12 text-right">{t('{0} GP', { 0: x.games })}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-faint">{t('Per game, regular season.')}</p>
    </Card>
  )
}
