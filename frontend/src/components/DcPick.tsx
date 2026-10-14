import { doubleChance, dcLabel, DC_STRONG, type DC, type Prediction } from '../lib/predict'
import { t } from '../lib/i18n'

/** Small "X2" tag (fix120: our pick is a double chance). */
export function DcTag({ code, className = '' }: { code: DC; className?: string }) {
  return (
    <span className={`inline-grid place-items-center h-4 px-1 rounded text-[9px] font-extrabold leading-none tracking-wide bg-accent text-bg num ${className}`} title={t("Our pick: double chance")}>
      {code}
    </span>
  )
}

/**
 * The main pick badge, football only: "Our pick: X2 · Barça or draw · 82%", plus a small "Strong pick" label when the
 * double chance is 85%+. Locked predictions show the code and names without the %.
 */
export default function OurPick({ p, home, away, dark = false, compact = false, className = '' }: { p: Prediction | null | undefined; home: string; away: string; dark?: boolean; compact?: boolean; className?: string }) {
  const dc = doubleChance(p)
  if (!dc) return null
  return <OurPickBadge code={dc.code} pct={dc.pct} home={home} away={away} dark={dark} compact={compact} className={className} />
}

/** Same badge from the code and % alone (alerts and other server lists that send { k, p }). */
export function OurPickBadge({ code, pct, home, away, dark = false, compact = false, className = '' }: { code: DC; pct: number | null; home: string; away: string; dark?: boolean; compact?: boolean; className?: string }) {
  const dc = { code, pct: pct === null ? null : Math.round(pct), strong: pct !== null && Math.round(pct) >= DC_STRONG }
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 min-w-0 ${className}`}>
      <span className={`inline-flex items-center gap-1 min-w-0 max-w-full rounded-full font-extrabold ${compact ? 'text-[11px] px-2 py-0.5' : 'text-xs sm:text-[13px] px-2.5 py-1'} ${dark ? 'bg-[#C8FF3D] text-[#07090D]' : 'bg-accent text-bg'}`}>
        <span className="whitespace-nowrap">{t("Our pick")}:</span>
        <span className="num whitespace-nowrap">{dc.code}</span>
        <span aria-hidden>·</span>
        <span className="truncate">{dcLabel(dc.code, home, away)}</span>
        {dc.pct !== null && (
          <>
            <span aria-hidden>·</span>
            <span className="num whitespace-nowrap">{dc.pct}%</span>
          </>
        )}
      </span>
      {dc.strong && (
        <span className={`inline-block rounded-full border font-bold whitespace-nowrap ${compact ? 'text-[10px] px-1.5 py-px' : 'text-[11px] px-2 py-0.5'} ${dark ? 'border-[#C8FF3D]/60 text-[#C8FF3D]' : 'border-accent/50 text-accent'}`}>
          {t("Strong pick")}
        </span>
      )}
    </span>
  )
}
