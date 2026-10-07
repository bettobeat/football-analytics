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

/** Standings table(s); the teams of a game are marked. */
export function StandingsTable({ data, mark = [] }: { data: Standings; mark?: number[] }) {
  return (
    <div className="space-y-5">
      {data.groups.map((g, i) => (
        <div key={i}>
          {data.groups.length > 1 && g.name && <div className="label pb-2">{g.name}</div>}
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="text-faint text-[11px]">
                <th className="text-left font-semibold py-1 w-7">#</th>
                <th className="text-left font-semibold py-1">{t('Team')}</th>
                <th className="text-right font-semibold py-1 w-9">{t('P')}</th>
                <th className="text-right font-semibold py-1 w-9">{t('W')}</th>
                <th className="text-right font-semibold py-1 w-9">{t('L')}</th>
                <th className="text-right font-semibold py-1 w-12">%</th>
                <th className="text-right font-semibold py-1 w-14 hidden sm:table-cell">{t('+/−')}</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map(r => (
                <tr key={r.team.id} className={`border-t border-line/50 ${mark.includes(r.team.id) ? 'bg-accent/10' : ''}`}>
                  <td className="py-1.5 num text-faint">{r.position}</td>
                  <td className="py-1.5">
                    <Link to={`/basketball/team/${r.team.id}`} className="flex items-center gap-2 text-ink hover:text-accent">
                      <TeamLogo team={r.team} size={18} /><span className="truncate">{r.team.name}</span>
                    </Link>
                  </td>
                  <td className="py-1.5 text-right num text-muted">{r.played}</td>
                  <td className="py-1.5 text-right num text-ink font-semibold">{r.won}</td>
                  <td className="py-1.5 text-right num text-muted">{r.lost}</td>
                  <td className="py-1.5 text-right num text-muted">{r.pct !== null ? r.pct.toFixed(3).replace(/^0/, '') : '–'}</td>
                  <td className="py-1.5 text-right num text-muted hidden sm:table-cell">
                    {r.pointsFor !== null && r.pointsAgainst !== null && r.played ? (((r.pointsFor - r.pointsAgainst) / r.played) > 0 ? '+' : '') + ((r.pointsFor - r.pointsAgainst) / r.played).toFixed(1) : '–'}
                  </td>
                </tr>
              ))}
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
