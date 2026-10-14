import { t as tt } from '../lib/i18n'
import { doubleChanceOf } from '../lib/predict'

/**
 * Double chance next to the 1X2 numbers (fix118): always labelled "Double chance" so it is never read as the 1X2 pick.
 * Football only (basketball has no draws).
 */
export default function DoubleChanceChip({ p, home, away, dark = false }: { p: { home: number; draw: number; away: number }; home: string; away: string; dark?: boolean }) {
  const dc = doubleChanceOf(p)
  const draw = tt('draw')
  const what = dc.k === '1X' ? `${home} ${tt('or')} ${draw}` : dc.k === 'X2' ? `${away} ${tt('or')} ${draw}` : `${home} ${tt('or')} ${away}`
  return (
    <div className={`inline-flex flex-wrap items-center gap-2 text-sm ${dark ? 'justify-center sm:justify-start' : ''}`}>
      <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${dark ? 'bg-white/10 text-white border-white/20' : 'bg-win/10 text-win border-win/30'}`}>
        {tt('Double chance')} · <span className="num">{dc.k} · {dc.pct}%</span>
      </span>
      <span className={`text-xs ${dark ? 'text-[#C9D0DB]' : 'text-muted'}`}>{what}</span>
    </div>
  )
}
