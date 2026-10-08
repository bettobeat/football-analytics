import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { t, LOCALE } from '../lib/i18n'
import { FavStar, type Favorite } from '../lib/favorites'

/**
 * League menu in the Flashscore style (Oct 2026), shared by football and basketball:
 *   All / My favorites · Pinned leagues (your starred leagues, or the big ones until you star some) ·
 *   My teams · International (cups, national teams) · Countries A–Z, each opening to its leagues.
 */

export interface SideLeague {
  code: string
  name: string
  /** name under its country ("Serie A" instead of "Serie A (Brazil)") */
  short?: string
  logo: string | null
  /** ISO 3166 code for the flag ("de", "gb-eng"); "eu" / "world" = international */
  country: string
  count: number
  fav: Favorite
  /** shown after the name (e.g. "testing") */
  note?: string
}
export interface SideTeam { key: string; name: string; logo: string | null; to: string }

const INTL = new Set(['eu', 'world', 'int'])
const SPECIAL: Record<string, string> = { 'gb-eng': 'England', 'gb-sct': 'Scotland', 'gb-wls': 'Wales', 'gb-nir': 'Northern Ireland', eu: 'Europe', world: 'World', int: 'International' }
let regionNames: Intl.DisplayNames | null = null
/** Country name in the visitor's language. */
export function countryName(code: string) {
  if (SPECIAL[code]) return t(SPECIAL[code])
  try {
    regionNames ||= new Intl.DisplayNames([LOCALE], { type: 'region' })
    return regionNames.of(code.toUpperCase()) || code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

export function Flag({ code, size = 18 }: { code: string; size?: number }) {
  if (INTL.has(code)) {
    return (
      <span className="grid place-items-center rounded-[3px] bg-accent/15 text-accent shrink-0" style={{ width: size, height: Math.round(size * 0.72) }} aria-hidden>
        <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>
      </span>
    )
  }
  return <img src={`https://media.api-sports.io/flags/${code}.svg`} alt="" loading="lazy" className="object-cover rounded-[3px] shrink-0 shadow-sm" style={{ width: size, height: Math.round(size * 0.72) }} />
}

const STORE = 'sl-side-countries'
function readOpen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(STORE) || '[]') as string[]) } catch { return new Set() }
}

export default function LeagueSidebar({
  leagues, selected, onSelect, pinned, teams, total, favCount, addTeamTo, sportLabel
}: {
  leagues: SideLeague[]
  selected: string
  onSelect: (code: string) => void
  /** league codes to pin: the user's starred leagues, or the page's default list when none are starred */
  pinned: string[]
  teams: SideTeam[]
  total: number
  favCount: number | null
  addTeamTo: string
  sportLabel?: ReactNode
}) {
  const [open, setOpen] = useState<Set<string>>(readOpen)
  const toggle = (c: string) => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(c)) next.delete(c); else next.add(c)
    try { localStorage.setItem(STORE, JSON.stringify([...next])) } catch { /* storage unavailable */ }
    return next
  })
  const byCode = new Map(leagues.map(l => [l.code, l]))
  const pins = pinned.map(c => byCode.get(c)).filter(Boolean) as SideLeague[]
  const intl = leagues.filter(l => INTL.has(l.country))
  const countries = new Map<string, SideLeague[]>()
  for (const l of leagues) if (!INTL.has(l.country)) { if (!countries.has(l.country)) countries.set(l.country, []); countries.get(l.country)!.push(l) }
  const countryList = [...countries.entries()].sort((a, b) => countryName(a[0]).localeCompare(countryName(b[0]), LOCALE))

  const Row = ({ l, indent }: { l: SideLeague; indent?: boolean }) => (
    <li className="relative">
      <button onClick={() => onSelect(l.code)} className={`side-item pr-9 ${indent ? 'pl-7' : ''} ${selected === l.code ? 'side-item-active' : ''}`}>
        {l.logo ? <img src={l.logo} alt="" className="w-5 h-5 object-contain shrink-0" /> : <Flag code={l.country} />}
        <span className="truncate">{indent ? l.short || l.name : l.name}</span>
        {l.note && <span className="shrink-0 text-[9px] font-bold uppercase text-faint">{l.note}</span>}
        <span className="ml-auto num text-xs text-faint">{l.count || ''}</span>
      </button>
      <span className="absolute right-1.5 top-1/2 -translate-y-1/2"><FavStar size="sm" fav={l.fav} /></span>
    </li>
  )
  const Head = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
    <div className="flex items-center gap-2 px-2.5 pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-faint">{icon}{children}</div>
  )

  return (
    <section className="card p-2 lg:flex-1 lg:min-h-[180px] lg:overflow-y-auto overscroll-contain">
      {sportLabel}
      <ul className="space-y-0.5">
        <li>
          <button onClick={() => onSelect('ALL')} className={`side-item ${selected === 'ALL' ? 'side-item-active' : ''}`}>
            <span className="w-5 h-5 rounded-md bg-surface2 grid place-items-center text-[10px] font-bold text-muted">∞</span>
            {t('All leagues')}<span className="ml-auto num text-xs text-faint">{total}</span>
          </button>
        </li>
        <li>
          <button onClick={() => onSelect('FAV')} className={`side-item ${selected === 'FAV' ? 'side-item-active' : ''}`}>
            <span className="w-5 h-5 rounded-md bg-accent/15 grid place-items-center text-accent">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z" /></svg>
            </span>
            {t('My favorites')}<span className="ml-auto num text-xs text-faint">{favCount ?? ''}</span>
          </button>
        </li>
      </ul>

      {/* pinned leagues */}
      <Head icon={<svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor" aria-hidden><path d="M15 3l6 6-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z" /></svg>}>{t('Pinned leagues')}</Head>
      <ul className="space-y-0.5">{pins.map(l => <Row key={`p${l.code}`} l={l} />)}</ul>

      {/* my teams */}
      <Head icon={<svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor" aria-hidden><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z" /></svg>}>{t('My teams')}</Head>
      <ul className="space-y-0.5">
        {teams.map(tm => (
          <li key={tm.key}>
            <Link to={tm.to} className="side-item">
              {tm.logo ? <img src={tm.logo} alt="" className="w-5 h-5 object-contain shrink-0" /> : <span className="w-5 h-5 rounded-full bg-surface2 shrink-0" />}
              <span className="truncate">{tm.name}</span>
            </Link>
          </li>
        ))}
        <li>
          <Link to={addTeamTo} className="side-item text-accent font-bold hover:text-accent">
            <span className="w-5 h-5 grid place-items-center text-lg leading-none">+</span>{t('Add a team')}
          </Link>
        </li>
      </ul>

      {/* international */}
      {intl.length > 0 && <>
        <Head icon={null}>{t('International')}</Head>
        <ul className="space-y-0.5">{intl.map(l => <Row key={`i${l.code}`} l={l} />)}</ul>
      </>}

      {/* countries */}
      <Head icon={null}>{t('Countries')}</Head>
      <ul className="space-y-0.5 pb-1">
        {countryList.map(([c, list]) => {
          const isOpen = open.has(c) || list.some(l => l.code === selected)
          const n = list.reduce((s, l) => s + l.count, 0)
          return (
            <li key={c}>
              <button onClick={() => toggle(c)} className="side-item" aria-expanded={isOpen}>
                <Flag code={c} />
                <span className="truncate">{countryName(c)}</span>
                <span className="ml-auto num text-xs text-faint">{n || ''}</span>
                <span className={`text-faint transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
              </button>
              {isOpen && <ul className="space-y-0.5">{list.map(l => <Row key={l.code} l={l} indent />)}</ul>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
