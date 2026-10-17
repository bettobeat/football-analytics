import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * The player page header (football's, shared by every sport since fix152d): photo (or the shirt number) with the
 * club badge, position / number / status chips, the name and favorite star, the team link and the facts on the
 * right (age, nationality, height …). The sport's own stats follow under it.
 */
export interface PlayerHeaderProps {
  name: string
  photo: string | null
  /** shown instead of a photo (basketball: the jersey number) */
  noPhoto?: ReactNode
  teamBadge?: ReactNode
  chips: ReactNode[]
  star?: ReactNode
  team?: { name: string; logo: ReactNode; href: string } | null
  facts: [string, ReactNode][]
  /** under the team line (basketball: the injury report) */
  note?: ReactNode
  /** right side instead of / next to the facts (basketball: per-game tiles) */
  aside?: ReactNode
}

export default function PlayerHeader(p: PlayerHeaderProps) {
  return (
    <section className="card relative overflow-hidden p-5 sm:p-7">
      <div className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ background: 'radial-gradient(600px 240px at 12% 0%, rgb(var(--accent)), transparent 70%)' }} />
      <div className="relative flex flex-wrap items-center gap-5 sm:gap-7">
        <div className="relative flex-shrink-0">
          <div className={`${p.photo ? 'photo-duo ' : ''}w-24 h-24 sm:w-28 sm:h-28 rounded-3xl overflow-hidden ring-2 ring-line bg-surface2 grid place-items-center`}>
            {p.photo ? <img src={p.photo} alt={p.name} className="w-full h-full object-cover" /> : p.noPhoto}
          </div>
          {p.teamBadge && (
            <span className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-white grid place-items-center ring-2 ring-surface shadow-card overflow-hidden">{p.teamBadge}</span>
          )}
        </div>
        <div className="min-w-[160px] flex-1 space-y-2">
          {p.chips.length > 0 && <div className="flex flex-wrap items-center gap-2 text-xs text-faint">{p.chips.map((c, i) => <span key={i} className="contents">{c}</span>)}</div>}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink break-words">{p.name}</h1>
            {p.star}
          </div>
          {p.team && (
            <Link to={p.team.href} className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink">
              {p.team.logo}
              {p.team.name}
            </Link>
          )}
          {p.note}
        </div>
        {p.facts.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {p.facts.map(([k, v]) => (<span key={k} className="contents"><dt className="text-faint">{k}</dt><dd className="text-ink font-semibold">{v}</dd></span>))}
          </dl>
        )}
        {p.aside}
      </div>
    </section>
  )
}

/** A grey chip (position) and a status chip, as on football's player page. */
export const Chip = ({ children, tone = 'grey' }: { children: ReactNode; tone?: 'grey' | 'out' | 'ok' }) => (
  <span className={`px-2 py-0.5 rounded-full font-semibold ${tone === 'out' ? 'bg-loss/15 text-loss font-bold' : tone === 'ok' ? 'bg-win/15 text-win font-bold' : 'bg-surface2/80 text-muted'}`}>{children}</span>
)
