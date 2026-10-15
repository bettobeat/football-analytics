import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { t, LOCALE } from '../lib/i18n'
import { TeamLogo } from '../pages/bb/parts'

/**
 * Shared pieces of the sport home pages (fix138): basketball and NFL homes use the same sections, hero, side list and
 * record card. The sport-specific parts (prediction pills, live chance) are passed in as children.
 */

type Side = { id: number; name: string; logo: string | null }
/** the hero's name on phones when the full one is too long to fit (NFL: the nickname) */
type HeroSide = Side & { short?: string }

export function HomeSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
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

/** First visit (signed-out visitors only): what this section is, and the buttons. */
export function FirstVisit({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-accent/30 bg-[linear-gradient(135deg,rgb(var(--accent)/0.10),rgb(var(--surface)/0.6)_60%)] p-5 sm:p-7 flex flex-col lg:flex-row lg:items-center gap-5">
      <div className="flex-1 min-w-0 space-y-2">
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">{title}</h1>
        <p className="text-sm sm:text-base text-muted max-w-2xl">{text}</p>
      </div>
      <div className="flex flex-col sm:flex-row lg:flex-col gap-2 lg:w-52">{children}</div>
    </section>
  )
}

/** The playing surface under the hero, drawn in perspective: a basketball court or an American-football field. */
function Field({ kind }: { kind: 'court' | 'gridiron' }) {
  return (
    <svg aria-hidden viewBox="0 0 1000 400" preserveAspectRatio="none" className="absolute -z-10 left-[-10%] w-[120%] bottom-0 h-[55%] opacity-30" style={{ transform: 'perspective(600px) rotateX(55deg)', transformOrigin: 'bottom' }}>
      {kind === 'court' ? (
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
      ) : (
        <g fill="none" stroke="#C8FF3D" strokeWidth="2">
          {/* field with both end zones, a yard line every 10 yards (50 the thickest), hash marks, goal posts */}
          <rect x="20" y="10" width="960" height="380" />
          <rect x="20" y="10" width="80" height="380" fill="#C8FF3D" fillOpacity="0.08" />
          <rect x="900" y="10" width="80" height="380" fill="#C8FF3D" fillOpacity="0.08" />
          {Array.from({ length: 9 }, (_, i) => 180 + i * 80).map((x, i) => <line key={x} x1={x} y1="10" x2={x} y2="390" strokeWidth={i === 4 ? 3 : 1.5} />)}
          <line x1="100" y1="10" x2="100" y2="390" strokeWidth="3" />
          <line x1="900" y1="10" x2="900" y2="390" strokeWidth="3" />
          {Array.from({ length: 39 }, (_, i) => 120 + i * 20).map(x => (
            <g key={x} strokeWidth="1"><line x1={x} y1="150" x2={x} y2="160" /><line x1={x} y1="240" x2={x} y2="250" /></g>
          ))}
          <path d="M20 170 H6 M20 230 H6 M6 170 V230" strokeWidth="3" />
          <path d="M980 170 H994 M980 230 H994 M994 170 V230" strokeWidth="3" />
        </g>
      )}
    </svg>
  )
}

/** Brand card when there is no game to feature. */
export function HeroEmpty({ line1, line2, text }: { line1: string; line2: string; text: string }) {
  return (
    <div className="relative overflow-hidden rounded-[32px] border border-white/10 min-h-[360px] sm:min-h-[460px] bg-[linear-gradient(160deg,#0F1A2B_0%,#0A0F17_60%,#07090D_100%)] p-10 flex flex-col justify-center gap-3 text-[#EEF1F6]">
      <div className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.05]">{line1}<br />{line2}</div>
      <p className="text-[#C9D0DB] max-w-lg">{text}</p>
    </div>
  )
}
export const HeroLoading = () => <div className="rounded-[32px] border border-white/10 min-h-[360px] sm:min-h-[460px] bg-surface2/40 animate-pulse" />

/**
 * Big featured game: the two logos, blown up and blurred, paint the background in the teams' colours; the field below.
 * `children` = the prediction area (the sport's own pills / lock / "coming soon"); the button opens the game page.
 */
export function HeroFrame({ home, away, kickoff, teamHref, gameHref, competition, field, label, children }: {
  home: HeroSide; away: HeroSide; kickoff: string; teamHref: (s: Side) => string; gameHref: string; competition: string; field: 'court' | 'gridiron'; label?: string; children: ReactNode
}) {
  const side = (team: HeroSide) => (
    <Link to={teamHref(team)} className="group flex flex-col items-center gap-3 sm:gap-4 min-w-0">
      <span className="relative grid place-items-center w-24 h-24 sm:w-36 sm:h-36 rounded-full bg-white/[0.06] border border-white/10 backdrop-blur-md shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] transition-transform group-hover:scale-[1.04]">
        <TeamLogo team={team} size={72} />
      </span>
      <span className="font-display font-extrabold text-lg sm:text-3xl tracking-tight text-center leading-tight max-w-full break-words">
        {team.short ? <><span className="sm:hidden">{team.short}</span><span className="hidden sm:inline">{team.name}</span></> : team.name}
      </span>
    </Link>
  )
  return (
    <div className="relative overflow-hidden rounded-[32px] border border-white/10 min-h-[420px] sm:min-h-[480px] bg-[#0A0E15] text-[#EEF1F6] isolate">
      {home.logo && <img src={home.logo} alt="" aria-hidden className="absolute -z-10 -left-24 top-1/2 -translate-y-1/2 w-[560px] h-[560px] object-contain blur-[80px] opacity-50 saturate-150" />}
      {away.logo && <img src={away.logo} alt="" aria-hidden className="absolute -z-10 -right-24 top-1/2 -translate-y-1/2 w-[560px] h-[560px] object-contain blur-[80px] opacity-50 saturate-150" />}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(600px_260px_at_50%_-60px,rgba(255,255,255,0.16),transparent_70%),linear-gradient(to_bottom,rgba(7,9,13,0.1),rgba(7,9,13,0.75))]" />
      <Field kind={field} />

      <div className="relative h-full p-5 sm:p-9 flex flex-col gap-6 sm:gap-8">
        <div className="flex flex-wrap items-center justify-center sm:justify-between gap-2">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#07090D] bg-[#C8FF3D] px-3 py-1.5 rounded-full">{label || t('Featured game')}</span>
          <span className="glass !rounded-full inline-flex items-center gap-2 px-3 py-1.5 text-xs sm:text-sm text-[#C9D0DB]">{competition}</span>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6 flex-1">
          {side(home)}
          <div className="flex flex-col items-center gap-2">
            <span className="font-display font-extrabold text-3xl sm:text-6xl text-white/90 tracking-tight">{t('VS')}</span>
            <span className="text-xs sm:text-sm font-bold text-white">{new Date(kickoff).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}</span>
            <span className="text-[11px] sm:text-xs text-[#9AA3B2]">{new Date(kickoff).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          </div>
          {side(away)}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
          <div className="flex-1 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9AA3B2] text-center sm:text-left">{t('Our prediction')}</div>
            {children}
          </div>
          <Link to={gameHref} className="h-12 px-7 inline-flex items-center justify-center rounded-2xl bg-[#C8FF3D] text-[#07090D] font-extrabold shadow-[0_10px_30px_-10px_rgba(200,255,61,0.6)] hover:brightness-105">
            {t('Full analysis')}
          </Link>
        </div>
      </div>
    </div>
  )
}

/** Header of the card beside the hero: "Live now" / "Next tip-offs" with the live count badge. */
export function SideHeader({ title, live }: { title: string; live: number }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <span className={`inline-flex items-center gap-2 text-xs font-bold px-3 py-1 rounded-full ${live ? 'text-live bg-live/10' : 'text-faint bg-surface2/70'}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-live animate-pulseDot' : 'bg-faint'}`} />
        {live ? t('{0} live', { 0: live }) : t('No live games')}
      </span>
    </div>
  )
}

/** The next games beside the hero: both logos, the match-up, the competition, the time. */
export function NextList({ items, footer }: { items: { id: number; href: string; home: Side; away: Side; sub: string; kickoff: string }[]; footer?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map(g => (
        <Link key={g.id} to={g.href} className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-surface2/60 transition-colors">
          <div className="flex -space-x-2 flex-shrink-0">
            <span className="rounded-full bg-surface2 p-1 ring-2 ring-surface"><TeamLogo team={g.home} size={24} /></span>
            <span className="rounded-full bg-surface2 p-1 ring-2 ring-surface"><TeamLogo team={g.away} size={24} /></span>
          </div>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold truncate">{g.home.name} – {g.away.name}</span>
            <span className="block text-[11px] text-faint truncate">{g.sub}</span>
          </span>
          <span className="text-right flex-shrink-0">
            <span className="block text-xs font-bold text-ink">{new Date(g.kickoff).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}</span>
            <span className="block text-[11px] text-faint">{new Date(g.kickoff).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          </span>
        </Link>
      ))}
      {footer && <span className="mt-1 px-2 flex flex-wrap gap-x-4 gap-y-1">{footer}</span>}
    </div>
  )
}
export const SideLoading = () => <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 rounded-xl bg-surface2/50 animate-pulse" />)}</div>

/** The lime "Our record" card of the bottom row. */
export function RecordCard({ aside, children }: { aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-3xl p-6 border border-accent/30 bg-[linear-gradient(160deg,rgb(var(--accent)/0.10),rgb(var(--surface)/0.6))] flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">{t('Our record')}</h2>
        {aside}
      </div>
      {children}
    </div>
  )
}
