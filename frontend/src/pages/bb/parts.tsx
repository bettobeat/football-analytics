import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { t } from '../../lib/i18n'
import { BB_STATUS, pickOf, timeOf, type BbGame, type BbSide } from '../../lib/bb'

/** Shared pieces of the basketball pages. */

export function Card({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 mb-3">
          {title && <h2 className="font-display text-base sm:text-lg font-bold text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function TeamLogo({ team, size = 22 }: { team: BbSide | { name: string; logo: string | null }; size?: number }) {
  return team.logo ? (
    <img src={team.logo} alt="" width={size} height={size} loading="lazy" className="object-contain flex-shrink-0" style={{ width: size, height: size }} />
  ) : (
    <span className="rounded-full bg-surface2 grid place-items-center text-[10px] font-bold text-muted flex-shrink-0" style={{ width: size, height: size }}>
      {team.name.slice(0, 2).toUpperCase()}
    </span>
  )
}

export function StatusPill({ g }: { g: BbGame }) {
  if (g.state === 'live')
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-live">
        <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulseDot" />
        {BB_STATUS[g.status] || t('Live')}
      </span>
    )
  if (g.state === 'done') return <span className="text-[11px] font-bold text-faint">{BB_STATUS[g.status] || t('Final')}</span>
  if (g.state === 'off') return <span className="text-[11px] font-bold text-loss">{BB_STATUS[g.status] || g.status}</span>
  return <span className="num text-xs font-bold text-ink">{timeOf(g.kickoff)}</span>
}

/** One game in a list: time / status, both teams (score when on or over), our pick on the right. */
export function GameRow({ g, showLeague = false }: { g: BbGame; showLeague?: boolean }) {
  const pk = pickOf(g)
  const scored = g.score && g.state !== 'upcoming'
  const won = (side: 'H' | 'A') => g.state === 'done' && g.score ? (side === 'H' ? g.score.home > g.score.away : g.score.away > g.score.home) : false
  return (
    <Link to={`/basketball/game/${g.id}`} className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-surface2/60 transition-colors">
      <span className="w-14 flex-shrink-0 text-center">
        <StatusPill g={g} />
        {showLeague && <span className="block text-[10px] text-faint truncate mt-0.5">{g.league.name}</span>}
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        {(['H', 'A'] as const).map(side => {
          const team = side === 'H' ? g.home : g.away
          return (
            <span key={side} className="flex items-center gap-2 text-sm">
              <TeamLogo team={team} size={18} />
              <span className={`truncate ${won(side) ? 'text-ink font-bold' : 'text-ink'}`}>{team.name}</span>
              {scored && <span className={`ml-auto num font-bold ${won(side) ? 'text-ink' : 'text-muted'}`}>{side === 'H' ? g.score!.home : g.score!.away}</span>}
            </span>
          )
        })}
      </span>
      <span className="flex-shrink-0 w-28 text-right">
        {pk ? (
          <>
            <span className="block text-[10px] text-faint">{g.state === 'done' ? t('Our pick') : t('Pick')}</span>
            <span className={`block text-xs font-bold truncate ${pk.color}`}>
              {pk.team.name}
              {pk.pct !== null && <span className="num"> {Math.round(pk.pct)}%</span>}
            </span>
            {g.prediction?.hit !== null && g.prediction?.hit !== undefined && (
              <span className={`inline-block mt-0.5 rounded-full px-1.5 text-[10px] font-bold ${g.prediction.hit ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss'}`}>
                {g.prediction.hit ? t('Hit') : t('Miss')}
              </span>
            )}
          </>
        ) : (
          <span className="text-[11px] text-faint">–</span>
        )}
      </span>
    </Link>
  )
}

/** Games grouped under day headings. */
export function GameList({ games, showLeague = false, empty }: { games: BbGame[]; showLeague?: boolean; empty: string }) {
  if (!games.length) return <p className="text-sm text-faint py-4">{empty}</p>
  const days: { day: string; list: BbGame[] }[] = []
  for (const g of games) {
    const d = new Date(g.kickoff).toDateString()
    const last = days[days.length - 1]
    if (last && last.day === d) last.list.push(g)
    else days.push({ day: d, list: [g] })
  }
  return (
    <div className="space-y-4">
      {days.map(d => (
        <div key={d.day}>
          <div className="label pb-1.5 px-2">{new Date(d.list[0].kickoff).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <ul className="space-y-0.5">{d.list.map(g => <li key={g.id}><GameRow g={g} showLeague={showLeague} /></li>)}</ul>
        </div>
      ))}
    </div>
  )
}

export function Skeleton({ rows = 4, h = 'h-12' }: { rows?: number; h?: string }) {
  return <div className="space-y-2">{Array.from({ length: rows }).map((_, i) => <div key={i} className={`${h} rounded-xl bg-surface2/60 animate-pulse`} />)}</div>
}

/** Pro nudge where numbers are hidden. */
export function LockedNote() {
  return (
    <div className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-ink flex flex-wrap items-center justify-between gap-2">
      <span>{t('Win chances, point spread, total points and the predicted score are for Premium members.')}</span>
      <Link to="/premium" className="px-3 py-1.5 rounded-lg bg-accent text-bg text-xs font-extrabold">{t('Go Premium')}</Link>
    </div>
  )
}
