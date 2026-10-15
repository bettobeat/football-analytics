import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../../lib/socket'
import { t } from '../../lib/i18n'
import { useAuth } from '../../lib/auth'
import { useNflConfig, useNflFavorites, NFL_STATUS, weekLabel, record, nick, type NflGame, type NflWeek, type Standings, type LeaderCat } from '../../lib/nfl'
import { useNews, NewsLead } from '../../components/NewsList'
import { HomeSection, FirstVisit, HeroFrame, HeroEmpty, HeroLoading, SideHeader, NextList, SideLoading, RecordCard } from '../../components/SportHome'
import { TeamLogo } from '../bb/parts'
import { NflGameRow } from './parts'

interface HomeData {
  season: number | null; live: NflGame[]; week: NflWeek | null; games: NflGame[]; upcoming: NflGame[]; results: NflGame[]
  standings: Standings | null; leaders: LeaderCat[]
}

/** Primetime: Thursday / Sunday / Monday night games start 00:00–03:59 UTC (8:15 pm Eastern). */
const primetime = (g: NflGame) => new Date(g.kickoff).getUTCHours() < 4

/**
 * NFL home (fix138) — the same sections, order and pieces as the basketball home: first-visit intro, featured game on a
 * gridiron with live / next kick-offs beside it, your favorites, next games, NFL news, then our record (predictions start
 * soon), standings and latest results.
 */
export default function NflHome() {
  const cfg = useNflConfig()
  const { access } = useAuth()
  const [d, setD] = useState<HomeData | null>(null)
  const [loaded, setLoaded] = useState(false)
  const news = useNews({ sport: 'american-football', limit: 10 })

  useEffect(() => {
    document.title = t('{0} · SportLikely', { 0: t('NFL') })
    const load = () => axios.get(`${API_URL}/nfl/home`).then(r => setD(r.data.data)).catch(() => undefined).finally(() => setLoaded(true))
    load()
    const iv = setInterval(load, 60 * 1000) // live scores
    return () => clearInterval(iv)
  }, [access])

  const live = d?.live || []
  const notStarted = useMemo(() => (d?.upcoming || []).filter(g => new Date(g.kickoff).getTime() > Date.now()), [d])
  const weekGames = useMemo(() => (d?.games || []).filter(g => g.state === 'upcoming' && new Date(g.kickoff).getTime() > Date.now()), [d])

  // featured: the biggest game of the week — both teams' win % added up, a primetime game a bit higher, then the sooner
  const featured = useMemo(() => {
    if (!weekGames.length) return null
    const pct = new Map((d?.standings?.rows || []).map(r => [r.team.id, r.games ? r.pct : 0.5]))
    const score = (g: NflGame) => (pct.get(g.home.id) ?? 0.5) + (pct.get(g.away.id) ?? 0.5) + (primetime(g) ? 0.25 : 0)
    return [...weekGames].sort((a, b) => score(b) - score(a) || a.kickoff.localeCompare(b.kickoff))[0]
  }, [weekGames, d?.standings])

  const favs = useNflFavorites()
  const favNext = useMemo(() => notStarted.filter(g => favs.reasons(g).length > 0).slice(0, 10), [notStarted, favs.teams.length])
  const soonest = useMemo(() => notStarted.filter(g => g.id !== featured?.id).slice(0, 5), [notStarted, featured])
  const next = useMemo(() => weekGames.filter(g => g.id !== featured?.id && !favNext.includes(g)), [weekGames, featured, favNext])
  const liveMain = live[0]
  // standings card: the leader of each division
  const leaders = (d?.standings?.conferences || []).flatMap(c => c.divisions.map(x => ({ division: x.name, row: x.rows[0] }))).filter(x => x.row)

  return (
    <div className="max-w-7xl 2xl:max-w-[1440px] mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-28 xl:pb-10">
      <div className="space-y-10 min-w-0">
        {cfg && !cfg.public && (
          <div className="rounded-2xl border border-draw/30 bg-draw/10 px-4 py-2.5 text-sm text-ink">{t('Admin preview · not public yet')}</div>
        )}

        {/* first visit (signed-out visitors only) */}
        {access === 'anon' && (
          <FirstVisit title={t('American football predictions')} text={t('Every NFL game with kick-off times, live scores, standings, team analysis and the latest news. Our NFL predictions are coming soon, tested in public like every other sport on SportLikely.')}>
            <Link to="/signup" className="h-11 px-5 rounded-2xl bg-accent text-bg font-extrabold grid place-items-center">{t('Create a free account')}</Link>
            <Link to="/american-football/games" className="h-11 px-5 rounded-2xl border border-line text-ink font-semibold grid place-items-center hover:border-faint">{t('See the games')}</Link>
          </FirstVisit>
        )}

        {/* hero: featured game + live / next kick-offs */}
        <div className="grid gap-5 lg:grid-cols-[1.75fr_1fr]">
          {!featured && !loaded ? <HeroLoading /> : !featured ? (
            <HeroEmpty line1={t('American football,')} line2={t('tested in public.')} text={t('The next games appear here as soon as they are scheduled.')} />
          ) : (
            <HeroFrame home={{ ...featured.home, short: nick(featured.home.name) }} away={{ ...featured.away, short: nick(featured.away.name) }} kickoff={featured.kickoff} field="gridiron"
              competition={`NFL · ${weekLabel(featured.weekKey)}${primetime(featured) ? ` · ${t('Primetime')}` : ''}`}
              teamHref={tm => `/american-football/team/${tm.id}`} gameHref={`/american-football/game/${featured.id}`}>
              <div className="flex justify-center sm:justify-start">
                <span className="glass !rounded-full px-4 py-2 text-sm font-semibold text-[#C9D0DB]">{t('Prediction coming soon')}</span>
              </div>
            </HeroFrame>
          )}

          <div className="card p-5 sm:p-6 flex flex-col gap-4">
            <SideHeader title={live.length ? t('Live now') : t('Next kick-offs')} live={live.length} />
            {liveMain ? (
              <>
                <Link to={`/american-football/game/${liveMain.id}`} className="glass p-4 space-y-3 hover:bg-white/10 transition-colors">
                  <div className="text-xs text-faint text-center truncate">NFL · {weekLabel(liveMain.weekKey)}</div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <div className="flex flex-col items-center gap-2 min-w-0"><TeamLogo team={liveMain.home} size={52} /><span className="text-sm font-bold truncate max-w-full">{nick(liveMain.home.name)}</span></div>
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="font-display font-extrabold text-4xl">{liveMain.score?.home ?? 0} – {liveMain.score?.away ?? 0}</span>
                      <span className="text-xs font-extrabold text-bg bg-win px-2.5 py-0.5 rounded-full">{NFL_STATUS[liveMain.status] || t('LIVE')}</span>
                    </div>
                    <div className="flex flex-col items-center gap-2 min-w-0"><TeamLogo team={liveMain.away} size={52} /><span className="text-sm font-bold truncate max-w-full">{nick(liveMain.away.name)}</span></div>
                  </div>
                  <div className="text-center text-xs text-muted">{t('Live score and box score →')}</div>
                </Link>
                <div className="space-y-1">
                  {live.slice(1, 6).map(g => (
                    <Link key={g.id} to={`/american-football/game/${g.id}`} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-surface2/60 text-sm">
                      <span className="text-[11px] font-bold text-win w-14 whitespace-nowrap">{NFL_STATUS[g.status] || t('LIVE')}</span>
                      <span className="truncate flex-1">{g.home.name} – {g.away.name}</span>
                      <b className="font-display">{g.score?.home ?? 0}–{g.score?.away ?? 0}</b>
                    </Link>
                  ))}
                </div>
              </>
            ) : soonest.length ? (
              <NextList
                items={soonest.map(g => ({ id: g.id, href: `/american-football/game/${g.id}`, home: g.home, away: g.away, sub: `NFL · ${weekLabel(g.weekKey)}`, kickoff: g.kickoff }))}
                footer={<>
                  <Link to="/american-football/games" className="text-sm font-bold text-accent">{t('All games →')}</Link>
                  <Link to="/american-football/today" className="text-sm font-bold text-accent">{t('Today →')}</Link>
                </>}
              />
            ) : !loaded ? (
              <SideLoading />
            ) : (
              <div className="flex-1 grid place-items-center text-center text-sm text-muted py-6">{t('No games scheduled yet.')}</div>
            )}
          </div>
        </div>

        {/* your favorites (first) */}
        {favNext.length > 0 && (
          <HomeSection title={t('Your favorites')} action={<Link to="/american-football/favorites" className="text-sm font-bold text-accent">{t('All favorites →')}</Link>}>
            <div className="card overflow-hidden divide-y divide-line/40">{favNext.map(g => <NflGameRow key={g.id} g={g} showDay />)}</div>
          </HomeSection>
        )}

        {/* next games (this week) */}
        {next.length > 0 && (
          <HomeSection title={d?.week ? t('Next games · {0}', { 0: weekLabel(d.week.key) }) : t('Next games')} action={<Link to="/american-football/games" className="text-sm font-bold text-accent">{t('All games →')}</Link>}>
            <div className="card overflow-hidden divide-y divide-line/40">{next.map(g => <NflGameRow key={g.id} g={g} showDay />)}</div>
          </HomeSection>
        )}

        {/* NFL news */}
        {news && news.length > 0 && (
          <HomeSection title={t('NFL news')}>
            <NewsLead items={news} max={10} />
          </HomeSection>
        )}

        {/* record · standings · latest results */}
        <div className="grid gap-5 lg:grid-cols-3">
          <RecordCard>
            <div className="space-y-1.5">
              <div className="font-display text-xl font-bold text-ink">{t('Predictions start soon')}</div>
              <p className="text-sm text-muted leading-relaxed">{t('Once our NFL model is live, every prediction is saved before kick-off and checked after the game, here and in public.')}</p>
            </div>
          </RecordCard>

          <div className="card p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold">{t('Standings')}</h2>
              {d?.season && <span className="text-xs text-muted">{d.season}</span>}
            </div>
            {leaders.length === 0 ? <p className="text-sm text-faint">{t('Standings appear once the season has started.')}</p> : (
              <ul className="space-y-1">
                {leaders.map(x => (
                  <li key={x.division}>
                    <Link to={`/american-football/team/${x.row.team.id}`} className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface2/60 transition-colors">
                      <TeamLogo team={x.row.team} size={24} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-ink truncate">{x.row.team.name}</span>
                        <span className="block text-[11px] text-faint truncate">{x.division}</span>
                      </span>
                      <span className="num text-sm font-bold text-ink">{record(x.row)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/american-football/league" className="mt-auto text-sm font-bold text-accent">{t('Full standings →')}</Link>
          </div>

          <div className="card p-3 flex flex-col">
            <div className="flex items-center justify-between px-2 pt-2 pb-2">
              <h2 className="font-display text-lg font-bold">{t('Latest results')}</h2>
            </div>
            {!d ? <div className="px-2 text-sm text-muted">{t('Loading…')}</div> : d.results.length === 0 ? (
              <p className="px-2 pb-2 text-sm text-faint">{t('No games played yet this season.')}</p>
            ) : (
              <div className="divide-y divide-line/50">{d.results.map(g => <NflGameRow key={g.id} g={g} />)}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
