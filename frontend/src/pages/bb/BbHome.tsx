import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../../lib/socket'
import { t, LOCALE } from '../../lib/i18n'
import { useAuth } from '../../lib/auth'
import { isCovered, revealMatch, useRevealState, justRevealed } from '../../lib/reveal'
import CountUp from '../../components/CountUp'
import { RevealChip } from '../../components/Reveal'
import { useBbConfig, useBbFavorites, liveLabel, bbRank, type BbGame } from '../../lib/bb'
import { TeamLogo, LockIcon, GameRow, useLiveChance, rid, rstatus } from './parts'
import { useNews, NewsLead } from '../../components/NewsList'
import RecordLink from '../../components/RecordLink'
import { HomeSection as Section, FirstVisit, HeroFrame, HeroEmpty, HeroLoading, SideHeader, NextList, SideLoading, RecordCard } from '../../components/SportHome'

interface Rec { n: number; hits: number; hitRate: number | null; strongN: number; strongHits: number; strongHitRate: number | null }
interface RecordData { since: string | null; total: Rec }

const hasPct = (g: BbGame) => !!g.prediction && !g.prediction.locked && typeof g.prediction.pHome === 'number'
const top = (g: BbGame) => Math.max(g.prediction!.pHome!, g.prediction!.pAway!)
// EuroLeague clubs that make a game "big" (both sides needed), and NBA teams that make a game more featured
const EL_BIG = [/real madrid/i, /barcelona/i, /olympiacos|olympiakos/i, /panathinaikos/i, /fenerbah/i, /efes/i, /zalgiris/i, /monaco/i, /partizan/i, /zvezda|red star/i, /olimpia milano|^milano|ea7/i, /virtus|bologna/i, /bayern/i, /baskonia/i]
const NBA_FAME = [/lakers/i, /warriors/i, /celtics/i, /knicks/i, /bucks/i, /nuggets/i, /thunder/i, /76ers|sixers/i, /mavericks/i, /suns/i, /heat/i, /cavaliers/i, /spurs/i, /timberwolves/i, /bulls/i]

/** Big featured game (shared frame, components/SportHome.tsx) with basketball's prediction: 1 · total · 2. */
function FeaturedHero({ g, loading = false }: { g: BbGame | null; loading?: boolean }) {
  useRevealState()
  if (!g && loading) return <HeroLoading />
  if (!g) return <HeroEmpty line1={t('Basketball predictions,')} line2={t('tested in public.')} text={t('The next games appear here as soon as they are scheduled.')} />
  const p = g.prediction
  const k = p?.pick || null
  const roll = justRevealed(rid(g))
  const pill = (o: 'H' | 'T' | 'A', label: string, v: ReactNode) => (
    <div className={`glass px-3 py-2.5 sm:px-4 text-center ${k === o ? 'ring-2 ring-[#C8FF3D]/70' : ''} ${roll && k === o ? 'animate-pop' : ''}`}>
      <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9AA3B2] truncate">{label}</div>
      <div className={`font-display font-extrabold text-xl sm:text-2xl ${k === o ? 'text-[#C8FF3D]' : 'text-white'}`}>{v}</div>
    </div>
  )
  return (
    <HeroFrame home={g.home} away={g.away} kickoff={g.kickoff} competition={g.league.name} field="court"
      teamHref={tm => `/basketball/team/${tm.id}`} gameHref={`/basketball/game/${g.id}`}>
      {hasPct(g) && isCovered(rid(g), rstatus(g), true) ? (
        <RevealChip dark onReveal={() => revealMatch(rid(g))} />
      ) : hasPct(g) ? (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {pill('H', g.home.name, <CountUp value={p!.pHome!} suffix="%" animate={roll} />)}
          {pill('T', t('Total points'), <span className="num">{p!.total!.toFixed(1)}</span>)}
          {pill('A', g.away.name, <CountUp value={p!.pAway!} suffix="%" animate={roll} delay={240} />)}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-sm">
          <span className="glass !rounded-full px-4 py-2 font-semibold inline-flex items-center gap-2"><LockIcon /> {t('Prediction locked')}</span>
          <Link to="/premium" className="inline-flex items-center gap-1.5 text-[#C8FF3D] font-semibold">{t('Unlock it →')}</Link>
        </div>
      )}
    </HeroFrame>
  )
}

/** Basketball home — the same layout as the football home. */
export default function BbHome() {
  const cfg = useBbConfig()
  const { access } = useAuth()
  const [games, setGames] = useState<BbGame[]>([])
  const [loaded, setLoaded] = useState(false)
  const [results, setResults] = useState<BbGame[] | null>(null)
  const [record, setRecord] = useState<RecordData | null>(null)
  const news = useNews({ sport: 'basketball', limit: 10 })
  useRevealState()

  useEffect(() => {
    document.title = t('{0} · SportLikely', { 0: t('Basketball') })
    const load = () => {
      axios.get(`${API_URL}/basketball/games`, { params: { days: 7 } }).then(r => setGames(r.data.data || [])).catch(() => undefined).finally(() => setLoaded(true))
      axios.get(`${API_URL}/basketball/games`, { params: { days: 7, results: 1 } }).then(r => setResults((r.data.data || []).filter((g: BbGame) => g.state === 'done'))).catch(() => setResults([]))
    }
    load()
    axios.get(`${API_URL}/basketball/record`).then(r => setRecord(r.data.data)).catch(() => undefined)
    const iv = setInterval(load, 60000)
    return () => clearInterval(iv)
  }, [access])

  const live = games.filter(g => g.state === 'live')
  const notStarted = useMemo(() => games.filter(g => g.state === 'upcoming' && new Date(g.kickoff).getTime() > Date.now()), [games])

  // featured (Yarin, 11 Oct): ONLY the NBA, or a really big EuroLeague game (two big clubs, or play-offs / Final Four).
  // Order: NBA season → big EuroLeague → NBA pre-season → none (the brand card). Within a group: famous teams first,
  // then the closest game, then the soonest.
  const featured = useMemo(() => {
    const withP = notStarted.filter(g => g.prediction)
    const fameOf = (g: BbGame) => (g.league.code === 'NBA' ? NBA_FAME : EL_BIG).filter(re => re.test(g.home.name) || re.test(g.away.name)).length
    const bigEl = (g: BbGame) => g.league.code === 'EL' && ((EL_BIG.some(re => re.test(g.home.name)) && EL_BIG.some(re => re.test(g.away.name))) || /play|final/i.test(g.round || ''))
    const groups = [
      withP.filter(g => g.league.code === 'NBA' && !g.preseason),
      withP.filter(bigEl),
      withP.filter(g => g.league.code === 'NBA' && g.preseason)
    ]
    const list = groups.find(x => x.length)
    if (!list) return null
    return [...list].sort((a, b) => fameOf(b) - fameOf(a) || (hasPct(a) && hasPct(b) ? top(a) - top(b) : 0) || a.kickoff.localeCompare(b.kickoff))[0]
  }, [notStarted])

  const favs = useBbFavorites()
  const favNext = useMemo(() => notStarted.filter(g => favs.reasons(g).length > 0).slice(0, 10), [notStarted, favs.all.length])

  const soonest = useMemo(() => notStarted.filter(g => g.id !== featured?.id).slice(0, 5), [notStarted, featured])
  const next = useMemo(() => {
    const rest = notStarted.filter(g => g.id !== featured?.id && !favNext.includes(g))
    return [...rest].sort((a, b) => bbRank(a.league.code) - bbRank(b.league.code) || a.kickoff.localeCompare(b.kickoff)).slice(0, 12)
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
  }, [notStarted, featured, favNext])

  const nextCard = (g: BbGame) => {
    const p = g.prediction
    const pct = hasPct(g)
    const strong = pct && top(g) >= 70
    return (
      <Link key={g.id} to={`/basketball/game/${g.id}`} className="card card-hover snap-start flex-shrink-0 w-[272px] p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-faint truncate">{g.league.name}</span>
          <span className="text-[11px] font-bold text-ink bg-surface2/80 px-2 py-0.5 rounded-full whitespace-nowrap">
            {new Date(g.kickoff).toLocaleString(LOCALE, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="space-y-2.5">
          <div className="flex items-center gap-3"><TeamLogo team={g.home} size={32} /><span className="font-bold truncate">{g.home.name}</span></div>
          <div className="flex items-center gap-3"><TeamLogo team={g.away} size={32} /><span className="font-bold truncate">{g.away.name}</span></div>
        </div>
        {pct && isCovered(rid(g), rstatus(g), true) ? (
          <RevealChip onReveal={() => revealMatch(rid(g))} />
        ) : pct ? (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-1.5 text-center">
              {(['H', 'T', 'A'] as const).map(o => (
                <span key={o} className={`rounded-xl py-1.5 text-xs font-bold num ${p!.pick === o ? (o === 'H' ? 'bg-home/20 text-home' : 'bg-away/20 text-away') : 'bg-surface2/70 text-muted'}`}>
                  <span className="block text-[10px] font-semibold opacity-80">{o === 'H' ? '1' : o === 'A' ? '2' : t('Total')}</span>
                  {o === 'T' ? p!.total!.toFixed(0) : <CountUp value={o === 'H' ? p!.pHome! : p!.pAway!} suffix="%" animate={justRevealed(rid(g))} delay={o === 'H' ? 0 : 200} />}
                </span>
              ))}
            </div>
            {strong ? <span className="inline-block text-[11px] font-extrabold text-bg bg-accent px-2 py-0.5 rounded-full">{t('Strong pick')}</span> : null}
          </div>
        ) : p ? (
          <div className="flex items-center justify-between text-xs rounded-xl bg-surface2/70 px-3 py-2">
            <span className="text-muted inline-flex items-center gap-1.5"><LockIcon /> {t('Prediction locked')}</span>
            <span className="text-accent font-semibold">{t('Unlock')}</span>
          </div>
        ) : (
          <div className="text-xs text-faint">{t('No prediction yet')}</div>
        )}
      </Link>
    )
  }

  const liveMain = live[0]

  return (
    <div className="max-w-7xl 2xl:max-w-[1440px] mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-28 xl:pb-10">
      <div className="space-y-10 min-w-0">
        {cfg && !cfg.public && (
          <div className="rounded-2xl border border-draw/30 bg-draw/10 px-4 py-2.5 text-sm text-ink">{t('Admin preview · not public yet')}</div>
        )}

        {/* first visit (signed-out visitors only) */}
        {access === 'anon' && (
          <FirstVisit title={t('Basketball predictions')} text={t('Who wins, the point spread, total points and the predicted score for every game of the NBA, the EuroLeague and {0} more leagues in Europe, Asia and the Americas. Every prediction is saved before tip-off and checked in public.', { 0: Math.max(0, (cfg?.leagues.length || 18) - 2) })}>
            <Link to="/signup" className="h-11 px-5 rounded-2xl bg-accent text-bg font-extrabold grid place-items-center">{t('Create a free account')}</Link>
            <RecordLink to="/basketball/accuracy" className="h-11 px-5 rounded-2xl border border-line text-ink font-semibold grid place-items-center hover:border-faint">{t('See our record')}</RecordLink>
          </FirstVisit>
        )}

        {/* hero: featured game + live / next tip-offs */}
        <div className="grid gap-5 lg:grid-cols-[1.75fr_1fr]">
          <FeaturedHero g={featured} loading={!loaded} />

          <div className="card p-5 sm:p-6 flex flex-col gap-4">
            <SideHeader title={live.length ? t('Live now') : t('Next tip-offs')} live={live.length} />
            {liveMain ? (
              <>
                <Link to={`/basketball/game/${liveMain.id}`} className="glass p-4 space-y-3 hover:bg-white/10 transition-colors">
                  <div className="text-xs text-faint text-center truncate">{liveMain.league.name}</div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <div className="flex flex-col items-center gap-2 min-w-0"><TeamLogo team={liveMain.home} size={52} /><span className="text-sm font-bold truncate max-w-full">{liveMain.home.name}</span></div>
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="font-display font-extrabold text-4xl">{liveMain.score?.home ?? 0} – {liveMain.score?.away ?? 0}</span>
                      <span className="text-xs font-extrabold text-bg bg-win px-2.5 py-0.5 rounded-full">{liveLabel(liveMain)}</span>
                    </div>
                    <div className="flex flex-col items-center gap-2 min-w-0"><TeamLogo team={liveMain.away} size={52} /><span className="text-sm font-bold truncate max-w-full">{liveMain.away.name}</span></div>
                  </div>
                  <HeroLiveChance g={liveMain} />
                  <div className="text-center text-xs text-muted">{t('Live score and box score →')}</div>
                </Link>
                <div className="space-y-1">
                  {live.slice(1, 6).map(g => (
                    <Link key={g.id} to={`/basketball/game/${g.id}`} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-surface2/60 text-sm">
                      <span className="text-[11px] font-bold text-win w-14 whitespace-nowrap">{liveLabel(g, true)}</span>
                      <span className="truncate flex-1">{g.home.name} – {g.away.name}</span>
                      <b className="font-display">{g.score?.home ?? 0}–{g.score?.away ?? 0}</b>
                      <LiveLeadPct g={g} />
                    </Link>
                  ))}
                </div>
              </>
            ) : soonest.length ? (
              <NextList
                items={soonest.map(g => ({ id: g.id, href: `/basketball/game/${g.id}`, home: g.home, away: g.away, sub: g.league.name, kickoff: g.kickoff }))}
                footer={<>
                  <Link to="/basketball/games" className="text-sm font-bold text-accent">{t('All games →')}</Link>
                  <Link to="/basketball/predictions/today" className="text-sm font-bold text-accent">{t("Today's predictions →")}</Link>
                </>}
              />
            ) : !loaded ? (
              <SideLoading />
            ) : (
              <div className="flex-1 grid place-items-center text-center text-sm text-muted py-6">
                <span className="space-y-2">
                  <span className="block">{t('No games scheduled yet.')}</span>
                  <Link to="/basketball/predictions/today" className="block font-bold text-accent">{t("Today's predictions →")}</Link>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* your favorites (first) */}
        {favNext.length > 0 && (
          <Section title={t('Your favorites')} action={<Link to="/basketball/favorites" className="text-sm font-bold text-accent">{t('All favorites →')}</Link>}>
            <div className="rail flex gap-3.5 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x">{favNext.map(g => nextCard(g))}</div>
          </Section>
        )}

        {/* next games */}
        {next.length > 0 && (
          <Section title={t('Next games')} action={<Link to="/basketball/games" className="text-sm font-bold text-accent">{t('All games →')}</Link>}>
            <div className="rail flex gap-3.5 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x">{next.map(g => nextCard(g))}</div>
          </Section>
        )}

        {/* basketball news */}
        {news && news.length > 0 && (
          <Section title={t('Basketball news')}>
            <NewsLead items={news} />
          </Section>
        )}

        {/* record · leagues · latest results */}
        <div className="grid gap-5 lg:grid-cols-3">
          <RecordCard aside={record && record.total.n > 0 ? <span className="text-xs text-muted">{t('{0} games', { 0: record.total.n })}</span> : undefined}>
            {record && record.total.hitRate !== null ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between font-bold"><span>{t('All our picks')}</span><span className="font-display text-accent">{record.total.hitRate}%</span></div>
                  <div className="h-2.5 rounded-full bg-surface2"><div className="h-full rounded-full bg-accent" style={{ width: `${record.total.hitRate}%` }} /></div>
                </div>
                {record.total.strongHitRate !== null && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between font-bold text-muted"><span>{t('Strong picks (70%+)')}</span><span className="font-display">{record.total.strongHitRate}%</span></div>
                    <div className="h-2.5 rounded-full bg-surface2"><div className="h-full rounded-full bg-win" style={{ width: `${record.total.strongHitRate}%` }} /></div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted">{record ? t('The record starts with the first games after launch. Check back after the next game day.') : t('Loading the record…')}</div>
            )}
            <p className="text-sm text-muted leading-relaxed">{t('Picks right, every game counted. Each prediction is saved before tip-off and never edited.')}</p>
            <RecordLink to="/basketball/accuracy" className="mt-auto text-sm font-bold text-accent">{t('See the full record →')}</RecordLink>
          </RecordCard>

          <div className="card p-6 flex flex-col gap-4">
            <h2 className="font-display text-lg font-bold">{t('Leagues')}</h2>
            <div className="grid grid-cols-1 gap-2">
              {(cfg?.leagues || []).map(l => (
                <Link key={l.code} to={`/basketball/league/${l.code}`} className="flex items-center gap-3 p-2.5 rounded-2xl bg-surface2/50 hover:bg-surface2 transition-colors">
                  {l.logo ? <img src={l.logo} alt="" className="w-8 h-8 object-contain" /> : <span className="w-8 h-8" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-ink truncate">{l.name}</span>
                    <span className="block text-[11px] text-faint truncate">{t(l.country)}</span>
                  </span>
                  <span className="text-accent text-sm" aria-hidden>→</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="card p-3 flex flex-col">
            <div className="flex items-center justify-between px-2 pt-2 pb-2">
              <h2 className="font-display text-lg font-bold">{t('Latest results')}</h2>
              <RecordLink to="/basketball/accuracy" className="text-xs font-bold text-accent">{t('Record →')}</RecordLink>
            </div>
            {!results ? <div className="px-2 text-sm text-muted">{t('Loading…')}</div> : results.length === 0 ? (
              <p className="px-2 pb-2 text-sm text-faint">{t('No results in the last three days.')}</p>
            ) : (
              <div className="max-h-[340px] overflow-y-auto overscroll-contain divide-y divide-line/50">
                {results.slice(0, 40).map(g => <GameRow key={g.id} g={g} showLeague compact />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Home hero: the live win chance of both teams and the projected final score. */
function HeroLiveChance({ g }: { g: BbGame }) {
  const l = useLiveChance(g)
  if (!l) return null
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-bold num">
        <span className="text-home">{Math.round(l.pHome)}%</span>
        <span className="text-[11px] font-semibold text-muted">{t('Live win chance')}</span>
        <span className="text-away">{Math.round(l.pAway)}%</span>
      </div>
      <div className="flex h-1.5 gap-[3px]" aria-hidden>
        <div className="rounded-full bg-home transition-all duration-700" style={{ width: `calc(${Math.max(1, l.pHome)}% - 2px)` }} />
        <div className="rounded-full bg-away transition-all duration-700" style={{ width: `calc(${Math.max(1, l.pAway)}% - 2px)` }} />
      </div>
      <div className="text-center text-[11px] text-faint num">{t('Projected final score')}: {l.score.home} – {l.score.away}</div>
    </div>
  )
}

/** Short live list on the home hero: the win chance of the team ahead on it. */
function LiveLeadPct({ g }: { g: BbGame }) {
  const l = useLiveChance(g)
  if (!l) return null
  const home = l.pHome >= 50
  return <span className={`num text-[11px] font-bold w-9 text-right ${home ? 'text-home' : 'text-away'}`} title={t('Live win chance')}>{Math.round(home ? l.pHome : l.pAway)}%</span>
}
