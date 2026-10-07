import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { t, LOCALE } from '../../lib/i18n'
import { useReveal, justRevealed } from '../../lib/reveal'
import CountUp from '../../components/CountUp'
import { BB_STATUS, timeOf, type BbGame, type BbSide } from '../../lib/bb'

/** Shared pieces of the basketball pages — the same look as the football pages. */

/** Reveal ids for basketball games (negative, so they never clash with football match ids). */
export const rid = (g: { id: number }) => -g.id
/** Status the reveal helper understands: finished games are never covered. */
export const rstatus = (g: BbGame) => (g.state === 'done' ? 'FT' : g.status)

const PICK_COLOR = { H: 'text-home', A: 'text-away' } as const
const PICK_BG = { H: 'bg-home', A: 'bg-away' } as const

export function Card({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          {title && <h2 className="font-display text-base sm:text-lg font-bold text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/** Football-style section title over rails and lists. */
export function SectionTitle({ label, sub, count, sticky }: { label: string; sub?: string; count?: number; sticky?: boolean }) {
  return (
    <div className={`flex items-baseline gap-3 mb-3 ${sticky ? 'sticky top-[113px] sm:top-16 z-30 py-2 -my-2 bg-bg/90 backdrop-blur' : ''}`}>
      <h2 className="font-display text-lg font-bold tracking-tight text-ink">{label}</h2>
      {count !== undefined && <span className="num text-xs text-faint">{t('{0} games', { 0: count })}</span>}
      {sub && <span className="text-xs text-faint">{sub}</span>}
    </div>
  )
}

export function TeamLogo({ team, size = 22 }: { team: BbSide | { name: string; logo: string | null }; size?: number }) {
  return team.logo ? (
    <img src={team.logo} alt="" width={size} height={size} loading="lazy" className="object-contain flex-shrink-0 drop-shadow-sm" style={{ width: size, height: size }} />
  ) : (
    <span className="rounded-full bg-surface2 grid place-items-center text-[10px] font-display font-bold text-muted flex-shrink-0" style={{ width: size, height: size }}>
      {team.name.slice(0, 3).toUpperCase()}
    </span>
  )
}

export function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

/**
 * One game as a thin row, like football's: time · both teams · our pick (1 / 2 with the pick highlighted, then the
 * spread and total points on wide screens). Covered picks show a Reveal button; locked picks a lock. Finished games
 * show the score and whether we were right.
 */
export function GameRow({ g, showLeague = false, showDay = false, compact = false }: { g: BbGame; showLeague?: boolean; showDay?: boolean; compact?: boolean }) {
  const p = g.prediction
  const { hidden: covered, reveal } = useReveal(rid(g), rstatus(g), !!p && !p.locked)
  const isLive = g.state === 'live'
  const done = g.state === 'done'
  const pick = p && !covered ? p.pick : null
  const pct = p && pick && !p.locked && typeof p.pHome === 'number' ? Math.round(pick === 'H' ? p.pHome : p.pAway!) : null
  const pickName = pick === 'H' ? g.home.name : pick === 'A' ? g.away.name : null
  const roll = justRevealed(rid(g))
  const won = (side: 'H' | 'A') => done && g.score ? (side === 'H' ? g.score.home > g.score.away : g.score.away > g.score.home) : false

  return (
    <Link to={`/basketball/game/${g.id}`} className={`group flex items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-surface2/50 transition-colors ${isLive ? 'bg-live/5' : ''}`}>
      {/* time / status */}
      <div className="w-11 flex-shrink-0 text-center">
        {isLive ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-live">
            <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulseDot" />
            {BB_STATUS[g.status] || t('LIVE')}
          </span>
        ) : done ? (
          <span className="block text-[11px] font-bold text-faint">{BB_STATUS[g.status] || t('Final')}</span>
        ) : g.state === 'off' ? (
          <span className="block text-[10px] font-bold text-loss">{BB_STATUS[g.status] || g.status}</span>
        ) : (
          <>
            <span className="block num text-xs text-ink">{timeOf(g.kickoff)}</span>
            {showDay && <span className="block text-[10px] text-faint">{new Date(g.kickoff).toLocaleDateString(LOCALE, { weekday: 'short' })}</span>}
          </>
        )}
      </div>

      {/* teams */}
      <div className="flex-1 min-w-0">
        {showLeague && <div className="text-[10px] text-faint mb-0.5 truncate">{g.league.name}</div>}
        {(['H', 'A'] as const).map(side => {
          const team = side === 'H' ? g.home : g.away
          const score = g.score && g.state !== 'upcoming' ? (side === 'H' ? g.score.home : g.score.away) : null
          return (
            <div key={side} className="flex items-center gap-2 min-w-0 leading-6">
              <TeamLogo team={team} size={18} />
              <span className={`text-sm truncate ${pick === side || won(side) ? 'font-bold text-ink' : 'text-ink/85'}`}>{team.name}</span>
              {score !== null && <span className={`ml-auto num text-sm font-bold ${done && !won(side) ? 'text-muted' : 'text-ink'}`}>{score}</span>}
            </div>
          )
        })}
      </div>

      {/* prediction */}
      {compact ? (
        <div className="flex-shrink-0 flex flex-col items-end gap-0.5 max-w-[96px]">
          {pickName && <span className={`text-[11px] font-semibold truncate max-w-full ${PICK_COLOR[pick!]}`}>{pickName}</span>}
          {done && p?.hit !== null && p?.hit !== undefined && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.hit ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss'}`}>{p.hit ? t('Hit') : t('Miss')}</span>
          )}
        </div>
      ) : (
      <div className="flex-shrink-0 flex items-center justify-end min-w-[92px] sm:min-w-[176px] gap-2">
        {covered ? (
          <button
            type="button"
            onClick={e => { e.preventDefault(); e.stopPropagation(); reveal() }}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold bg-accent/10 text-accent border border-accent/30 hover:bg-accent/15"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            {t('Reveal')}
          </button>
        ) : p && p.locked ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-faint">
            <LockIcon /> {pickName ? <span className={`font-semibold truncate max-w-[110px] ${PICK_COLOR[pick!]}`}>{pickName}</span> : t('Locked')}
          </span>
        ) : p && pick && pct !== null ? (
          <>
            {/* phones: the pick and its % */}
            <span className={`sm:hidden text-right leading-tight ${roll ? 'pop-in' : ''}`}>
              <span className={`block text-xs font-bold truncate max-w-[92px] ${PICK_COLOR[pick]}`}>{pickName}</span>
              <CountUp value={pct} suffix="%" animate={roll} className="block num text-[11px] text-muted" />
            </span>
            {/* wider screens: 1 · 2 with the pick highlighted, then spread and total */}
            <span className="hidden sm:flex items-center gap-1">
              {(['H', 'A'] as const).map((k, i) => {
                const v = Math.round(k === 'H' ? p.pHome! : p.pAway!)
                const on = k === pick
                return (
                  <span key={k} className={`w-[54px] h-9 rounded-lg grid place-items-center leading-none transition-colors duration-500 ${on ? `${PICK_BG[k]} text-bg` : 'bg-surface2/70 text-muted'} ${roll ? 'pop-in' : ''}`} style={roll ? { animationDelay: `${i * 90}ms` } : undefined}>
                    <span className="text-[9px] font-bold opacity-80">{k === 'H' ? '1' : '2'}</span>
                    <CountUp value={v} suffix="%" animate={roll} delay={i * 90} className="num text-xs font-bold" />
                  </span>
                )
              })}
              {typeof p.spread === 'number' && typeof p.total === 'number' && (
                <>
                  <span className="hidden md:block w-px h-6 bg-line mx-1.5" aria-hidden />
                  <span className={`hidden md:grid w-[68px] h-9 rounded-lg place-items-center leading-none border border-line/70 text-muted ${roll ? 'pop-in' : ''}`} title={t('Point spread')}>
                    <span className="text-[9px] font-bold opacity-80">{t('Spread')}</span>
                    <span className="num text-xs font-bold text-ink">{p.spread >= 0 ? '1' : '2'} −{Math.abs(p.spread).toFixed(1)}</span>
                  </span>
                  <span className={`hidden md:grid w-[68px] h-9 rounded-lg place-items-center leading-none border border-line/70 text-muted ${roll ? 'pop-in' : ''}`} title={t('Total points')}>
                    <span className="text-[9px] font-bold opacity-80">{t('Total')}</span>
                    <span className="num text-xs font-bold text-ink">{p.total.toFixed(1)}</span>
                  </span>
                </>
              )}
            </span>
          </>
        ) : (
          <span className="text-xs text-faint">–</span>
        )}
        {done && p?.hit !== null && p?.hit !== undefined && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.hit ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss'}`}>{p.hit ? t('Hit') : t('Miss')}</span>
        )}
      </div>
      )}
    </Link>
  )
}

const LEAGUE_ORDER = ['NBA', 'EL', 'ACB', 'LBA']
/** A day's games grouped by league (NBA first), each league in its own card with a header — like football. */
export function LeagueCards({ games, logos }: { games: BbGame[]; logos?: Record<string, string | null> }) {
  const by = new Map<string, BbGame[]>()
  for (const g of games) by.set(g.league.code, [...(by.get(g.league.code) || []), g])
  const order = [...by.keys()].sort((a, b) => LEAGUE_ORDER.indexOf(a) - LEAGUE_ORDER.indexOf(b))
  return (
    <div className="space-y-3">
      {order.map(code => {
        const list = by.get(code)!
        return (
          <div key={code} className="card overflow-hidden">
            <Link to={`/basketball/league/${code}`} className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-surface2/50 border-b border-line/60 text-xs font-semibold text-muted hover:text-ink">
              {logos?.[code] ? <img src={logos[code]!} alt="" className="w-4 h-4 object-contain" /> : <span className="w-4 h-4 rounded bg-surface2" />}
              <span className="truncate">{list[0].league.name}</span>
              <span className="ml-auto text-[11px] font-normal text-faint num">{list.length}</span>
            </Link>
            <div className="divide-y divide-line/50">{list.map(g => <GameRow key={g.id} g={g} />)}</div>
          </div>
        )
      })}
    </div>
  )
}

/** Games by day (sticky day titles), then by league. */
export function GamesByDay({ games, logos, empty }: { games: BbGame[]; logos?: Record<string, string | null>; empty: string }) {
  if (!games.length) return <div className="card p-12 text-center text-muted">{empty}</div>
  const days: { key: string; list: BbGame[] }[] = []
  for (const g of games) {
    const k = new Date(g.kickoff).toDateString()
    const last = days[days.length - 1]
    if (last && last.key === k) last.list.push(g)
    else days.push({ key: k, list: [g] })
  }
  return (
    <>
      {days.map(d => (
        <section key={d.key} className="mb-8">
          <SectionTitle label={dayTitle(d.list[0].kickoff)} count={d.list.length} sticky />
          <LeagueCards games={d.list} logos={logos} />
        </section>
      ))}
    </>
  )
}

export function dayTitle(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000)
  if (diff === 0) return t('Today')
  if (diff === 1) return t('Tomorrow')
  if (diff === -1) return t('Yesterday')
  return d.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })
}

/** Live game in a sidebar box (football's LiveRow). */
export function LiveRow({ g }: { g: BbGame }) {
  return (
    <Link to={`/basketball/game/${g.id}`} className="block rounded-xl px-2 py-2 hover:bg-surface2 transition-colors">
      <div className="flex items-center justify-between text-[10px] text-faint mb-1">
        <span className="truncate">{g.league.name}</span>
        <span className="font-bold text-live tracking-wider">{BB_STATUS[g.status] || t('LIVE')}</span>
      </div>
      {(['H', 'A'] as const).map(s => {
        const team = s === 'H' ? g.home : g.away
        return (
          <div key={s} className="flex items-center justify-between gap-2 py-0.5">
            <span className="flex items-center gap-2 min-w-0"><TeamLogo team={team} size={18} /><span className="text-sm font-medium text-ink truncate">{team.name}</span></span>
            <span className="num text-sm font-bold text-ink">{g.score ? (s === 'H' ? g.score.home : g.score.away) : 0}</span>
          </div>
        )
      })}
    </Link>
  )
}

export function Skeleton({ rows = 4, h = 'h-12' }: { rows?: number; h?: string }) {
  return <div className="space-y-2">{Array.from({ length: rows }).map((_, i) => <div key={i} className={`${h} rounded-xl bg-surface2/60 animate-pulse`} />)}</div>
}

/** Premium nudge where numbers are hidden. */
export function LockedNote() {
  return (
    <div className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-ink flex flex-wrap items-center justify-between gap-2">
      <span className="inline-flex items-center gap-2"><LockIcon /> {t('Win chances, point spread, total points and the predicted score are for Premium members.')}</span>
      <Link to="/premium" className="px-3 py-1.5 rounded-lg bg-accent text-bg text-xs font-extrabold">{t('Go Premium')}</Link>
    </div>
  )
}

/** Plain list (team / league pages): rows under day headings. */
export function GameList({ games, showLeague = false, empty }: { games: BbGame[]; showLeague?: boolean; empty: string }) {
  if (!games.length) return <p className="text-sm text-faint py-4">{empty}</p>
  const days: { key: string; list: BbGame[] }[] = []
  for (const g of games) {
    const k = new Date(g.kickoff).toDateString()
    const last = days[days.length - 1]
    if (last && last.key === k) last.list.push(g)
    else days.push({ key: k, list: [g] })
  }
  return (
    <div className="space-y-4 -mx-5 sm:-mx-6">
      {days.map(d => (
        <div key={d.key}>
          <div className="label pb-1 px-5 sm:px-6">{dayTitle(d.list[0].kickoff)}</div>
          <div className="divide-y divide-line/50">{d.list.map(g => <GameRow key={g.id} g={g} showLeague={showLeague} />)}</div>
        </div>
      ))}
    </div>
  )
}
