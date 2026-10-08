import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../../lib/socket'
import { t } from '../../lib/i18n'
import { useAuth } from '../../lib/auth'
import { useRevealState } from '../../lib/reveal'
import { useBbConfig, useBbFavorites, bbLeagueFav, BB_COUNTRY, type BbGame } from '../../lib/bb'
import LeagueSidebar from '../../components/LeagueSidebar'
import { GamesByDay, LiveRow, GameRow, LockedNote, SectionTitle } from './parts'

const DAY_OPTIONS = [1, 3, 7, 14]

/** All games — the same layout as football's Matches page: live and leagues on the left, games by day and league. */
export default function BbGames() {
  const cfg = useBbConfig()
  const { access } = useAuth()
  const [params, setParams] = useSearchParams()
  const league = params.get('league') || 'ALL'
  const view: 'next' | 'results' = params.get('view') === 'results' ? 'results' : 'next'
  const [days, setDays] = useState(7)
  const [games, setGames] = useState<BbGame[] | null>(null)
  const [results, setResults] = useState<BbGame[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useRevealState()

  useEffect(() => {
    document.title = t('{0} · SportLikely', { 0: t('Games') })
    let cancelled = false
    const load = () => {
      axios.get(`${API_URL}/basketball/games`, { params: { days: 14 } })
        .then(r => { if (!cancelled) { setGames(r.data.data || []); setError(null) } })
        .catch(e => !cancelled && setError(e?.message || 'error'))
      axios.get(`${API_URL}/basketball/games`, { params: { days: 14, results: 1 } })
        .then(r => !cancelled && setResults((r.data.data || []).filter((g: BbGame) => g.state === 'done')))
        .catch(() => !cancelled && setResults([]))
    }
    load()
    const iv = setInterval(load, 60000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [access])

  const setView = (v: 'next' | 'results') => {
    const p = new URLSearchParams(params)
    if (v === 'next') p.delete('view')
    else p.set('view', v)
    setParams(p, { replace: true })
  }
  const setLeague = (c: string) => {
    const p = new URLSearchParams(params)
    if (c === 'ALL') p.delete('league')
    else p.set('league', c)
    setParams(p, { replace: true })
  }

  const all = games || []
  const live = all.filter(g => g.state === 'live')
  const horizon = Date.now() + days * 86400000
  const favs = useBbFavorites()
  const favMode = league === 'FAV'
  const upcoming = useMemo(
    () => all.filter(g => (league === 'ALL' || g.league.code === league || (favMode && favs.reasons(g).length > 0)) && g.state !== 'done' && new Date(g.kickoff).getTime() <= horizon),
    [all, league, days, favs.all.length]
  )
  // results: finished games of the last N days, newest first
  const past = useMemo(
    () => (results || []).filter(g => (league === 'ALL' || g.league.code === league || (favMode && favs.reasons(g).length > 0)) && new Date(g.kickoff).getTime() >= Date.now() - days * 86400000),
    [results, league, days, favs.all.length]
  )
  // your favorites' next games, pinned on top of the full list
  const favUpcoming = useMemo(
    () => (league === 'ALL' ? all.filter(g => g.state === 'upcoming' && favs.reasons(g).length > 0).slice(0, 8) : []),
    [all, league, favs.all.length]
  )
  const logos = Object.fromEntries((cfg?.leagues || []).map(l => [l.code, l.logo]))
  const leagueName = cfg?.leagues.find(l => l.code === league)?.name
  const locked = upcoming.some(g => g.prediction?.locked)

  return (
    <div className={`max-w-[1400px] mx-auto px-4 sm:px-6 py-6 lg:py-8 pb-28 xl:pb-10 ${league === 'ALL' ? '2xl:max-w-[1760px]' : ''}`}>
      <div className={`grid grid-cols-1 gap-6 lg:gap-8 items-start lg:grid-cols-[250px_1fr] ${league === 'ALL' ? '2xl:grid-cols-[250px_1fr_340px]' : ''}`}>
        {/* sidebar */}
        <aside className="lg:sticky lg:top-20 flex flex-col gap-6 lg:max-h-[calc(100vh-6.5rem)]">
          <section className="card p-4 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-bold text-ink flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${live.length ? 'bg-live animate-pulseDot' : 'bg-faint'}`} />
                {t('Live')}
              </h2>
              <span className="num text-xs text-faint">{live.length}</span>
            </div>
            {live.length === 0 ? (
              <p className="text-xs text-faint">{t('No games in play right now.')}</p>
            ) : (
              <ul className="space-y-1 max-h-60 overflow-y-auto">{live.map(g => <li key={g.id}><LiveRow g={g} /></li>)}</ul>
            )}
          </section>

          <LeagueSidebar
            leagues={(cfg?.leagues || []).map(l => ({
              code: l.code, name: l.name, logo: l.logo, country: BB_COUNTRY[l.code] || 'world',
              count: all.filter(g => g.league.code === l.code && g.state !== 'done').length, fav: bbLeagueFav(l)
            }))}
            selected={league}
            onSelect={setLeague}
            pinned={favs.leagues.length ? favs.leagues.map(f => f.ref) : (cfg?.leagues || []).map(l => l.code)}
            teams={favs.teams.map(f => ({ key: f.ref, name: f.name, logo: f.img || null, to: `/basketball/team/${f.ref}` }))}
            total={all.filter(g => g.state !== 'done').length}
            favCount={favs.all.length ? all.filter(g => g.state !== 'done' && favs.reasons(g).length > 0).length : null}
            addTeamTo="/basketball/favorites"
          />

          {league === 'ALL' && results && results.length > 0 && (
            <section className="card p-3 hidden lg:block 2xl:hidden shrink-0">
              <div className="px-2 pb-1 label">{t('Latest results')}</div>
              <div className="divide-y divide-line/50 -mx-3">{results.slice(0, 6).map(g => <GameRow key={g.id} g={g} compact />)}</div>
            </section>
          )}
        </aside>

        {/* main */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
            <div>
              <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">{league === 'ALL' ? t('Games') : favMode ? t('My favorites') : leagueName || t('Games')}</h1>
              <p className="mt-1 text-sm text-muted">
                {view === 'results' ? t('{0} results in the last {1} days', { 0: past.length, 1: days }) : t('{0} games in the next {1} days', { 0: upcoming.length, 1: days })}
                {league !== 'ALL' && !favMode && <Link to={`/basketball/league/${league}`} className="ml-3 font-bold text-accent">{t('League page →')}</Link>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
            <div className="seg">
              <button onClick={() => setView('next')} className={`seg-btn ${view === 'next' ? 'seg-btn-active' : ''}`}>{t('Next games')}</button>
              <button onClick={() => setView('results')} className={`seg-btn ${view === 'results' ? 'seg-btn-active' : ''}`}>{t('Results')}</button>
            </div>
            <div className="seg">
              {DAY_OPTIONS.map(d => (
                <button key={d} onClick={() => setDays(d)} className={`seg-btn ${days === d ? 'seg-btn-active' : ''}`}>{d}d</button>
              ))}
            </div>
            </div>
          </div>

          {locked && access !== 'admin' && <div className="mb-6"><LockedNote /></div>}
          {!games && !error && (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="card h-36 animate-pulse bg-surface2/60" />)}</div>
          )}
          {error && <div className="card p-5 border-loss/40 text-loss">{t('Failed to load games:')} {error}</div>}
          {view === 'next' && favUpcoming.length > 0 && (
            <section className="mb-8">
              <SectionTitle label={t('Your favorites')} sub={t('their next games')} />
              <div className="card overflow-hidden border-accent/25 divide-y divide-line/50">
                {favUpcoming.map(g => <GameRow key={g.id} g={g} showLeague showDay />)}
              </div>
              <button type="button" onClick={() => setLeague('FAV')} className="mt-2 text-xs font-bold text-accent">{t('Show only my favorites →')}</button>
            </section>
          )}
          {favMode && !favs.all.length ? (
            <div className="card p-10 text-center space-y-3">
              <p className="text-ink font-semibold">{t('You have no favorites yet.')}</p>
              <p className="text-sm text-muted max-w-md mx-auto">{t('Tap the star next to a league here, or on any team or game page. Their games then show up in this list.')}</p>
            </div>
          ) : view === 'results' ? (
            results && <GamesByDay games={past} logos={logos} empty={t('No results for this selection.')} />
          ) : games && <GamesByDay games={upcoming} logos={logos} empty={favMode ? t('None of your favorites play in this period.') : t('No games for this selection.')} />}
        </div>

        {/* latest results (wide screens) */}
        {league === 'ALL' && (
          <aside className="hidden 2xl:block 2xl:sticky 2xl:top-20">
            <section className="card p-3">
              <div className="px-2 pt-1 pb-2 font-display text-lg font-bold">{t('Latest results')}</div>
              {!results ? <p className="px-2 text-sm text-muted">{t('Loading…')}</p> : results.length === 0 ? (
                <p className="px-2 text-sm text-faint">{t('No results in the last two weeks.')}</p>
              ) : (
                <div className="max-h-[calc(100vh-12rem)] overflow-y-auto overscroll-contain divide-y divide-line/50 -mx-3">{results.map(g => <GameRow key={g.id} g={g} showLeague compact />)}</div>
              )}
            </section>
          </aside>
        )}
      </div>
    </div>
  )
}
