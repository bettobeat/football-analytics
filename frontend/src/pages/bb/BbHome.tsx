import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../../lib/socket'
import { t, LOCALE } from '../../lib/i18n'
import { useAuth } from '../../lib/auth'
import { isCovered, revealMatch, useRevealState, justRevealed } from '../../lib/reveal'
import CountUp from '../../components/CountUp'
import { RevealChip } from '../../components/Reveal'
import { useBbConfig, useBbFavorites, BB_STATUS, bbRank, type BbGame } from '../../lib/bb'
import { TeamLogo, LockIcon, GameRow, rid, rstatus } from './parts'
import { useNews, NewsLead } from '../../components/NewsList'

interface Rec { n: number; hits: number; hitRate: number | null; strongN: number; strongHits: number; strongHitRate: number | null }
interface RecordData { since: string | null; total: Rec }

const hasPct = (g: BbGame) => !!g.prediction && !g.prediction.locked && typeof g.prediction.pHome === 'number'
const top = (g: BbGame) => Math.max(g.prediction!.pHome!, g.prediction!.pAway!)

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg sm:text-xl font-bold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Big featured game: the two logos, blown up and blurred, paint the background in the teams' colours; a court below. */
function FeaturedHero({ g }: { g: BbGame | null }) {
  useRevealState()
  if (!g)
    return (
      <div className="relative overflow-hidden rounded-[32px] border border-white/10 min-h-[360px] sm:min-h-[460px] bg-[linear-gradient(160deg,#0F1A2B_0%,#0A0F17_60%,#07090D_100%)] p-10 flex flex-col justify-center gap-3 text-[#EEF1F6]">
        <div className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.05]">{t('Basketball predictions,')}<br />{t('tested in public.')}</div>
        <p className="text-[#C9D0DB] max-w-lg">{t('The next games appear here as soon as they are scheduled.')}</p>
      </div>
    )
  const p = g.prediction
  const k = p?.pick || null
  const roll = justRevealed(rid(g))
  const side = (team: BbGame['home']) => (
    <Link to={`/basketball/team/${team.id}`} className="group flex flex-col items-center gap-3 sm:gap-4 min-w-0">
      <span className="relative grid place-items-center w-24 h-24 sm:w-36 sm:h-36 rounded-full bg-white/[0.06] border border-white/10 backdrop-blur-md shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] transition-transform group-hover:scale-[1.04]">
        <TeamLogo team={team} size={72} />
      </span>
      <span className="font-display font-extrabold text-lg sm:text-3xl tracking-tight text-center leading-tight max-w-full break-words">{team.name}</span>
    </Link>
  )
  const pill = (o: 'H' | 'T' | 'A', label: string, v: ReactNode) => (
    <div className={`glass px-3 py-2.5 sm:px-4 text-center ${k === o ? 'ring-2 ring-[#C8FF3D]/70' : ''} ${roll && k === o ? 'animate-pop' : ''}`}>
      <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9AA3B2] truncate">{label}</div>
      <div className={`font-display font-extrabold text-xl sm:text-2xl ${k === o ? 'text-[#C8FF3D]' : 'text-white'}`}>{v}</div>
    </div>
  )
  return (
    <div className="relative overflow-hidden rounded-[32px] border border-white/10 min-h-[420px] sm:min-h-[480px] bg-[#0A0E15] text-[#EEF1F6] isolate">
      {g.home.logo && <img src={g.home.logo} alt="" aria-hidden className="absolute -z-10 -left-24 top-1/2 -translate-y-1/2 w-[560px] h-[560px] object-contain blur-[80px] opacity-50 saturate-150" />}
      {g.away.logo && <img src={g.away.logo} alt="" aria-hidden className="absolute -z-10 -right-24 top-1/2 -translate-y-1/2 w-[560px] h-[560px] object-contain blur-[80px] opacity-50 saturate-150" />}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(600px_260px_at_50%_-60px,rgba(255,255,255,0.16),transparent_70%),linear-gradient(to_bottom,rgba(7,9,13,0.1),rgba(7,9,13,0.75))]" />
      {/* basketball court in perspective */}
      <svg aria-hidden viewBox="0 0 1000 400" preserveAspectRatio="none" className="absolute -z-10 left-[-10%] w-[120%] bottom-0 h-[55%] opacity-30" style={{ transform: 'perspective(600px) rotateX(55deg)', transformOrigin: 'bottom' }}>
        <g fill="none" stroke="#C8FF3D" strokeWidth="2">
          <rect x="20" y="10" width="960" height="380" />
          <line x1="500" y1="10" x2="500" y2="390" />
          <circle cx="500" cy="200" r="60" />
          <rect x="20" y="140" width="190" height="120" />
          <rect x="790" y="140" width="190" height="120" />
          <circle cx="210" cy="200" r="60" />
          <circle cx="790" cy="200" r="60" />
          <path d="M20 40 H90 A220 220 0 0 1 90 360 H20" />
          <path d="M980 40 H910 A220 220 0 0 0 910 360 H980" />
        </g>
      </svg>

      <div className="relative h-full p-5 sm:p-9 flex flex-col gap-6 sm:gap-8">
        <div className="flex flex-wrap items-center justify-center sm:justify-between gap-2">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#07090D] bg-[#C8FF3D] px-3 py-1.5 rounded-full">{t('Featured game')}</span>
          <span className="glass !rounded-full inline-flex items-center gap-2 px-3 py-1.5 text-xs sm:text-sm text-[#C9D0DB]">{g.league.name}</span>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6 flex-1">
          {side(g.home)}
          <div className="flex flex-col items-center gap-2">
            <span className="font-display font-extrabold text-3xl sm:text-6xl text-white/90 tracking-tight">{t('VS')}</span>
            <span className="text-xs sm:text-sm font-bold text-white">{new Date(g.kickoff).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}</span>
            <span className="text-[11px] sm:text-xs text-[#9AA3B2]">{new Date(g.kickoff).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          </div>
          {side(g.away)}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
          <div className="flex-1 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9AA3B2] text-center sm:text-left">{t('Our prediction')}</div>
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
          </div>
          <Link to={`/basketball/game/${g.id}`} className="h-12 px-7 inline-flex items-center justify-center rounded-2xl bg-[#C8FF3D] text-[#07090D] font-extrabold shadow-[0_10px_30px_-10px_rgba(200,255,61,0.6)] hover:brightness-105">
            {t('Full analysis')}
          </Link>
        </div>
      </div>
    </div>
  )
}

/** Basketball home — the same layout as the football home. */
export default function BbHome() {
  const cfg = useBbConfig()
  const { access } = useAuth()
  const [games, setGames] = useState<BbGame[]>([])
  const [results, setResults] = useState<BbGame[] | null>(null)
  const [record, setRecord] = useState<RecordData | null>(null)
  const news = useNews({ sport: 'basketball', limit: 10 })
  useRevealState()

  useEffect(() => {
    document.title = t('{0} · SportLikely', { 0: t('Basketball') })
    const load = () => {
      axios.get(`${API_URL}/basketball/games`, { params: { days: 7 } }).then(r => setGames(r.data.data || [])).catch(() => undefined)
      axios.get(`${API_URL}/basketball/games`, { params: { days: 7, results: 1 } }).then(r => setResults((r.data.data || []).filter((g: BbGame) => g.state === 'done'))).catch(() => setResults([]))
    }
    load()
    axios.get(`${API_URL}/basketball/record`).then(r => setRecord(r.data.data)).catch(() => undefined)
    const iv = setInterval(load, 60000)
    return () => clearInterval(iv)
  }, [access])

  const live = games.filter(g => g.state === 'live')
  const notStarted = useMemo(() => games.filter(g => g.state === 'upcoming' && new Date(g.kickoff).getTime() > Date.now()), [games])

  // featured: the biggest league playing this week (NBA > EuroLeague > ACB > Serie A), then the closest game, then the soonest
  const featured = useMemo(() => {
    const pool = notStarted.filter(g => g.prediction && !g.preseason)
    const list = pool.length ? pool : notStarted.filter(g => g.prediction)
    if (!list.length) return null
    const best = Math.min(...list.map(g => bbRank(g.league.code)))
    return [...list.filter(g => (bbRank(g.league.code)) === best)].sort((a, b) =>
      (hasPct(a) && hasPct(b) ? top(a) - top(b) : 0) || a.kickoff.localeCompare(b.kickoff)
    )[0]
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
          <section className="rounded-3xl border border-accent/30 bg-[linear-gradient(135deg,rgb(var(--accent)/0.10),rgb(var(--surface)/0.6)_60%)] p-5 sm:p-7 flex flex-col lg:flex-row lg:items-center gap-5">
            <div className="flex-1 min-w-0 space-y-2">
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">{t('Basketball predictions')}</h1>
              <p className="text-sm sm:text-base text-muted max-w-2xl">{t('Who wins, the point spread, total points and the predicted score for every game of the NBA, the EuroLeague and {0} more leagues in Europe, Asia and the Americas. Every prediction is saved before tip-off and checked in public.', { 0: Math.max(0, (cfg?.leagues.length || 18) - 2) })}</p>
            </div>
            <div className="flex flex-col sm:flex-row lg:flex-col gap-2 lg:w-52">
              <Link to="/signup" className="h-11 px-5 rounded-2xl bg-accent text-bg font-extrabold grid place-items-center">{t('Create a free account')}</Link>
              <Link to="/basketball/accuracy" className="h-11 px-5 rounded-2xl border border-line text-ink font-semibold grid place-items-center hover:border-faint">{t('See our record')}</Link>
            </div>
          </section>
        )}

        {/* hero: featured game + live / next tip-offs */}
        <div className="grid gap-5 lg:grid-cols-[1.75fr_1fr]">
          <FeaturedHero g={featured} />

          <div className="card p-5 sm:p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">{live.length ? t('Live now') : t('Next tip-offs')}</h2>
              <span className={`inline-flex items-center gap-2 text-xs font-bold px-3 py-1 rounded-full ${live.length ? 'text-live bg-live/10' : 'text-faint bg-surface2/70'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${live.length ? 'bg-live animate-pulseDot' : 'bg-faint'}`} />
                {live.length ? t('{0} live', { 0: live.length }) : t('No live games')}
              </span>
            </div>
            {liveMain ? (
              <>
                <Link to={`/basketball/game/${liveMain.id}`} className="glass p-4 space-y-3 hover:bg-white/10 transition-colors">
                  <div className="text-xs text-faint text-center truncate">{liveMain.league.name}</div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <div className="flex flex-col items-center gap-2 min-w-0"><TeamLogo team={liveMain.home} size={52} /><span className="text-sm font-bold truncate max-w-full">{liveMain.home.name}</span></div>
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="font-display font-extrabold text-4xl">{liveMain.score?.home ?? 0} – {liveMain.score?.away ?? 0}</span>
                      <span className="text-xs font-extrabold text-bg bg-win px-2.5 py-0.5 rounded-full">{BB_STATUS[liveMain.status] || t('Live')}</span>
                    </div>
                    <div className="flex flex-col items-center gap-2 min-w-0"><TeamLogo team={liveMain.away} size={52} /><span className="text-sm font-bold truncate max-w-full">{liveMain.away.name}</span></div>
                  </div>
                  <div className="text-center text-xs text-muted">{t('Live score and box score →')}</div>
                </Link>
                <div className="space-y-1">
                  {live.slice(1, 6).map(g => (
                    <Link key={g.id} to={`/basketball/game/${g.id}`} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-surface2/60 text-sm">
                      <span className="text-[11px] font-bold text-win w-8">{BB_STATUS[g.status] || t('Live')}</span>
                      <span className="truncate flex-1">{g.home.name} – {g.away.name}</span>
                      <b className="font-display">{g.score?.home ?? 0}–{g.score?.away ?? 0}</b>
                    </Link>
                  ))}
                </div>
              </>
            ) : soonest.length ? (
              <div className="flex flex-col gap-1.5">
                {soonest.map(g => (
                  <Link key={g.id} to={`/basketball/game/${g.id}`} className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-surface2/60 transition-colors">
                    <div className="flex -space-x-2 flex-shrink-0">
                      <span className="rounded-full bg-surface2 p-1 ring-2 ring-surface"><TeamLogo team={g.home} size={24} /></span>
                      <span className="rounded-full bg-surface2 p-1 ring-2 ring-surface"><TeamLogo team={g.away} size={24} /></span>
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold truncate">{g.home.name} – {g.away.name}</span>
                      <span className="block text-[11px] text-faint truncate">{g.league.name}</span>
                    </span>
                    <span className="text-right flex-shrink-0">
                      <span className="block text-xs font-bold text-ink">{new Date(g.kickoff).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="block text-[11px] text-faint">{new Date(g.kickoff).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    </span>
                  </Link>
                ))}
                <Link to="/basketball/games" className="mt-1 px-2 text-sm font-bold text-accent">{t('All games →')}</Link>
              </div>
            ) : (
              <div className="flex-1 grid place-items-center text-center text-sm text-muted py-6">{t('No games scheduled yet.')}</div>
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
          <div className="rounded-3xl p-6 border border-accent/30 bg-[linear-gradient(160deg,rgb(var(--accent)/0.10),rgb(var(--surface)/0.6))] flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold">{t('Our record')}</h2>
              {record && record.total.n > 0 && <span className="text-xs text-muted">{t('{0} games', { 0: record.total.n })}</span>}
            </div>
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
            <Link to="/basketball/accuracy" className="mt-auto text-sm font-bold text-accent">{t('See the full record →')}</Link>
          </div>

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
              <Link to="/basketball/accuracy" className="text-xs font-bold text-accent">{t('Record →')}</Link>
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
