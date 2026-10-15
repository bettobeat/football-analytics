import { Link } from 'react-router-dom'
import { t, LOCALE } from '../../lib/i18n'
import { NFL_STATUS, timeOf, nick, record, useNflFavorites, type NflGame, type StandRow, type Standings } from '../../lib/nfl'
import { SectionTitle, TeamLogo, dayTitle } from '../bb/parts'

/** Shared pieces of the NFL pages (fix137) — the same look as basketball's and football's. */

/** "Prediction coming soon" in the prediction slot of a row / card (no NFL model yet). */
export function SoonChip({ className = '' }: { className?: string }) {
  return <span className={`inline-flex items-center h-7 px-2.5 rounded-md text-[11px] font-semibold text-faint border border-dashed border-line/80 whitespace-nowrap ${className}`}>{t('Prediction coming soon')}</span>
}

/**
 * One game as a thin row (the fix127 layout): time / status · both teams with logos and the score · prediction slot.
 */
export function NflGameRow({ g, showDay = false }: { g: NflGame; showDay?: boolean }) {
  const isLive = g.state === 'live', done = g.state === 'done'
  const won = (side: 'H' | 'A') => (done && g.score ? (side === 'H' ? g.score.home > g.score.away : g.score.away > g.score.home) : false)
  const favWhy = useNflFavorites().reasons(g)
  return (
    <Link to={`/american-football/game/${g.id}`} className={`group relative flex items-center gap-2.5 px-3 sm:px-4 py-1.5 hover:bg-surface2/50 transition-colors ${isLive ? 'bg-live/[0.06]' : ''}`}>
      {isLive && <span className="absolute left-0 inset-y-0 w-0.5 bg-live" aria-hidden />}
      <div className="relative w-10 flex-shrink-0 text-center leading-tight">
        {favWhy.length > 0 && (
          <span className="absolute -left-2.5 sm:-left-3 top-1/2 -translate-y-1/2 text-accent" title={t('Favorite: {0}', { 0: favWhy.map(f => f.name).join(', ') })}>
            <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor" aria-hidden><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z" /></svg>
          </span>
        )}
        {isLive ? (
          <>
            <span className="block text-[11px] font-bold text-live">{NFL_STATUS[g.status] || t('LIVE')}</span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-live animate-pulseDot" />
          </>
        ) : done ? (
          <span className="block text-[11px] font-bold text-faint">{NFL_STATUS[g.status] || t('Final')}</span>
        ) : g.state === 'off' ? (
          <span className="block text-[10px] font-bold text-loss">{NFL_STATUS[g.status] || g.status}</span>
        ) : (
          <>
            <span className="block num text-[12px] text-ink/90">{timeOf(g.kickoff)}</span>
            {showDay && <span className="block text-[10px] text-faint">{new Date(g.kickoff).toLocaleDateString(LOCALE, { weekday: 'short' })}</span>}
          </>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {(['H', 'A'] as const).map(side => {
          const team = side === 'H' ? g.home : g.away
          const score = g.score ? (side === 'H' ? g.score.home : g.score.away) : null
          return (
            <div key={side} className="flex items-center gap-2 min-w-0 h-5">
              <TeamLogo team={team} size={15} />
              <span className={`text-[13px] truncate ${won(side) ? 'font-bold text-ink' : 'text-ink/85'}`}>
                <span className="sm:hidden">{nick(team.name)}</span><span className="hidden sm:inline">{team.name}</span>
              </span>
              {score !== null && <span className={`ml-auto pl-2 num text-[13px] font-extrabold tabular-nums ${isLive ? 'text-live' : done && !won(side) ? 'text-muted' : 'text-ink'}`}>{score}</span>}
            </div>
          )
        })}
      </div>
      <div className="flex-shrink-0 flex items-center justify-end min-w-[84px] sm:min-w-[150px]">
        {g.state === 'upcoming' ? <SoonChip /> : <span className="text-xs text-faint">{done ? '' : '–'}</span>}
      </div>
    </Link>
  )
}

/** Games grouped by day (sticky day titles), each day in one card. */
export function NflGamesByDay({ games, empty }: { games: NflGame[]; empty: string }) {
  if (!games.length) return <div className="card p-12 text-center text-muted">{empty}</div>
  const days: { key: string; list: NflGame[] }[] = []
  for (const g of games) {
    const k = new Date(g.kickoff).toDateString()
    const last = days[days.length - 1]
    if (last && last.key === k) last.list.push(g)
    else days.push({ key: k, list: [g] })
  }
  return (
    <>
      {days.map(d => (
        <section key={d.key} className="mb-6">
          <SectionTitle label={dayTitle(d.list[0].kickoff)} count={d.list.length} sticky />
          <div className="card overflow-hidden divide-y divide-line/40">{d.list.map(g => <NflGameRow key={g.id} g={g} />)}</div>
        </section>
      ))}
    </>
  )
}

/** Live game card (football-style): LIVE / quarter, both teams, score. Live games are shown only in the live strip. */
export function NflLiveCard({ g }: { g: NflGame }) {
  return (
    <Link to={`/american-football/game/${g.id}`} className="card card-hover snap-start flex-shrink-0 w-[248px] p-3.5 block">
      <div className="flex items-center justify-between text-[10px] text-faint mb-1.5">
        <span>NFL</span>
        <span className="inline-flex items-center gap-1 font-bold text-live tracking-wider"><span className="w-1.5 h-1.5 rounded-full bg-live animate-pulseDot" />{NFL_STATUS[g.status] || t('LIVE')}</span>
      </div>
      {(['H', 'A'] as const).map(s => {
        const team = s === 'H' ? g.home : g.away
        return (
          <div key={s} className="flex items-center justify-between gap-2 py-0.5">
            <span className="flex items-center gap-2 min-w-0"><TeamLogo team={team} size={20} /><span className="text-sm font-semibold text-ink truncate">{team.name}</span></span>
            <span className="num text-base font-extrabold text-ink">{g.score ? (s === 'H' ? g.score.home : g.score.away) : 0}</span>
          </div>
        )
      })}
    </Link>
  )
}

/** Standings of one division (or a conference snapshot): W-L-T, PCT, PF, PA, diff, streak. */
export function StandTable({ title, rows, compact = false, highlight }: { title?: string; rows: StandRow[]; compact?: boolean; highlight?: number }) {
  return (
    <div>
      {title && <div className="label pb-1.5">{title}</div>}
      <div className="overflow-x-auto -mx-1">
        <table className={`w-full text-sm ${compact ? '' : 'min-w-[420px]'}`}>
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-faint">
              <th className="text-left font-semibold py-1.5 px-1">{t('Team')}</th>
              <th className="text-right font-semibold py-1.5 px-1">{t('W-L-T')}</th>
              {!compact && <th className="text-right font-semibold py-1.5 px-1">{t('PCT')}</th>}
              {!compact && <th className="text-right font-semibold py-1.5 px-1">{t('PF')}</th>}
              {!compact && <th className="text-right font-semibold py-1.5 px-1">{t('PA')}</th>}
              <th className="text-right font-semibold py-1.5 px-1">{t('Diff')}</th>
              {!compact && <th className="text-right font-semibold py-1.5 px-1">{t('Streak')}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.team.id} className={`border-t border-line/50 ${highlight === r.team.id ? 'bg-accent/10' : ''}`}>
                <td className="py-1.5 px-1">
                  <Link to={`/american-football/team/${r.team.id}`} className="flex items-center gap-2 min-w-0 hover:text-accent">
                    <TeamLogo team={r.team} size={18} />
                    <span className="truncate text-ink"><span className="sm:hidden">{nick(r.team.name)}</span><span className="hidden sm:inline">{r.team.name}</span></span>
                  </Link>
                </td>
                <td className="py-1.5 px-1 text-right num font-semibold text-ink">{record(r)}</td>
                {!compact && <td className="py-1.5 px-1 text-right num text-muted">{r.pct.toFixed(3).replace(/^0/, '')}</td>}
                {!compact && <td className="py-1.5 px-1 text-right num text-muted">{r.pf}</td>}
                {!compact && <td className="py-1.5 px-1 text-right num text-muted">{r.pa}</td>}
                <td className={`py-1.5 px-1 text-right num font-semibold ${r.diff > 0 ? 'text-win' : r.diff < 0 ? 'text-loss' : 'text-muted'}`}>{r.diff > 0 ? '+' : ''}{r.diff}</td>
                {!compact && <td className="py-1.5 px-1 text-right num text-muted">{r.streak || '–'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Every conference, division by division. */
export function StandingsBlock({ data, compact = false, highlight }: { data: Standings; compact?: boolean; highlight?: number }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {data.conferences.map(c => (
        <section key={c.name} className="space-y-4">
          <h3 className="font-display text-base font-bold text-ink">{c.name}</h3>
          {c.divisions.map(d => <StandTable key={d.name} title={d.name} rows={d.rows} compact={compact} highlight={highlight} />)}
        </section>
      ))}
    </div>
  )
}

/** Two numbers side by side as bars (game page team stats). */
export function StatBars({ label, home, away, fmt = (v: number) => String(v), lowerBetter = false }: { label: string; home: number | null; away: number | null; fmt?: (v: number) => string; lowerBetter?: boolean }) {
  if (home === null && away === null) return null
  const h = home ?? 0, a = away ?? 0, tot = Math.abs(h) + Math.abs(a) || 1
  const hb = lowerBetter ? h < a : h > a, ab = lowerBetter ? a < h : a > h
  return (
    <div className="py-2">
      <div className="flex items-center justify-between text-sm mb-1">
        <span className={`num font-bold ${hb ? 'text-ink' : 'text-muted'}`}>{home === null ? '–' : fmt(home)}</span>
        <span className="text-xs text-muted">{label}</span>
        <span className={`num font-bold ${ab ? 'text-ink' : 'text-muted'}`}>{away === null ? '–' : fmt(away)}</span>
      </div>
      <div className="flex gap-1 h-1.5">
        <div className="flex-1 flex justify-end bg-surface2 rounded-full overflow-hidden"><div className={`h-full rounded-full ${hb ? 'bg-home' : 'bg-home/40'}`} style={{ width: `${(100 * Math.abs(h)) / tot}%` }} /></div>
        <div className="flex-1 bg-surface2 rounded-full overflow-hidden"><div className={`h-full rounded-full ${ab ? 'bg-away' : 'bg-away/40'}`} style={{ width: `${(100 * Math.abs(a)) / tot}%` }} /></div>
      </div>
    </div>
  )
}

/** Week picker: Week 1 … 18 · Playoffs, scrollable on phones. */
export function WeekPicker({ weeks, value, onPick }: { weeks: { key: string; label: string }[]; value: string | null; onPick: (k: string) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
      {weeks.map(w => (
        <button key={w.key} type="button" onClick={() => onPick(w.key)} aria-current={value === w.key ? 'true' : undefined}
          className={`flex-shrink-0 h-9 px-3 rounded-full text-sm font-semibold border transition-colors ${value === w.key ? 'bg-accent text-bg border-accent' : 'border-line/80 text-muted hover:text-ink'}`}>
          {w.key === 'post' ? t('Playoffs') : <span className="num">{w.key === value ? t('Week {0}', { 0: w.key }) : w.key}</span>}
        </button>
      ))}
    </div>
  )
}
