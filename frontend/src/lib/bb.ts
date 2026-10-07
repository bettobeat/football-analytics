import { useEffect, useState } from 'react'
import axios from 'axios'
import { API_URL } from './socket'
import { t, LOCALE } from './i18n'
import { useAuth } from './auth'
import { useFavorites, type Favorite } from './favorites'

/** Basketball site (Oct 2026): types and helpers shared by the /basketball pages. */

export interface BbLeague { code: string; name: string; country: string; logo: string | null }
export interface BbConfig { public: boolean; open: boolean; leagues: BbLeague[] }
export interface BbSide { id: number; name: string; logo: string | null }
export interface BbPrediction {
  model: string
  pick: 'H' | 'A' | null
  locked: boolean
  pHome?: number
  pAway?: number
  spread?: number
  total?: number
  score?: { home: number; away: number }
  restHome?: number | null
  restAway?: number | null
  b2bHome?: boolean
  b2bAway?: boolean
  injHome?: number
  injAway?: number
  hit: boolean | null
}
export interface BbGame {
  id: number
  league: { code: string; name: string }
  season: string
  round: string | null
  preseason: boolean
  kickoff: string
  status: string
  state: 'upcoming' | 'live' | 'done' | 'off'
  home: BbSide
  away: BbSide
  score: { home: number; away: number } | null
  quarters: { home: (number | null)[]; away: (number | null)[] } | null
  prediction: BbPrediction | null
}

let configPromise: Promise<BbConfig> | null = null
let configValue: BbConfig | null = null
let configUser: string | null | undefined = undefined
/** Who may see the basketball site (admins before launch, everyone after). Loaded once per visit and per sign-in. */
export function useBbConfig(): BbConfig | null {
  const { user, loading } = useAuth()
  const who = loading ? undefined : user ? String(user.id ?? user.email) : null
  const [cfg, setCfg] = useState<BbConfig | null>(configUser === who ? configValue : null)
  useEffect(() => {
    if (who === undefined) return
    if (configUser !== who) { configUser = who; configValue = null; configPromise = null }
    if (configValue) { setCfg(configValue); return }
    configPromise ||= axios.get(`${API_URL}/basketball/config`, { withCredentials: true })
      .then(r => (configValue = r.data.data as BbConfig))
      .catch(() => (configValue = { public: false, open: false, leagues: [] }))
    let alive = true
    configPromise.then(v => alive && setCfg(v))
    return () => { alive = false }
  }, [who])
  return cfg
}

export const BB_STATUS: Record<string, string> = {
  Q1: t('Q1'), Q2: t('Q2'), Q3: t('Q3'), Q4: t('Q4'), OT: t('OT'), BT: t('Break'), HT: t('Half-time'),
  FT: t('Final'), AOT: t('Final (OT)'), POST: t('Postponed'), CANC: t('Cancelled'), SUSP: t('Suspended'), AWD: t('Awarded'), ABD: t('Abandoned')
}

export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })
export const dayOf = (iso: string) => new Date(iso).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })

/** The team we pick, its chance, and colours. */
export function pickOf(g: BbGame) {
  const p = g.prediction
  if (!p || !p.pick) return null
  const team = p.pick === 'H' ? g.home : g.away
  const pct = p.pick === 'H' ? p.pHome : p.pAway
  return { side: p.pick, team, pct: pct ?? null, color: p.pick === 'H' ? 'text-home' : 'text-away' }
}

/** Spread as people read it: "Lakers −4.5". */
export function spreadText(g: BbGame) {
  const s = g.prediction?.spread
  if (s === undefined || s === null) return null
  const fav = s >= 0 ? g.home : g.away
  return `${fav.name} −${Math.abs(s).toFixed(1)}`
}

/* ---------- favorites (basketball teams and leagues, in the same account list as football's) ---------- */

export const bbTeamFav = (team: BbSide, league?: string): Favorite => ({ kind: 'bb-team', ref: String(team.id), name: team.name, img: team.logo, code: league || null, ids: [team.id] })
export const bbLeagueFav = (l: { code: string; name: string; logo: string | null }): Favorite => ({ kind: 'bb-league', ref: l.code, name: l.name, img: l.logo, code: l.code })

/** Basketball favorites and why a game is one of them. */
export function useBbFavorites() {
  const { list } = useFavorites()
  const teams = list.filter(f => f.kind === 'bb-team')
  const leagues = list.filter(f => f.kind === 'bb-league')
  const reasons = (g: BbGame) => [
    ...leagues.filter(f => f.ref === g.league.code),
    ...teams.filter(f => f.ref === String(g.home.id) || f.ref === String(g.away.id))
  ]
  return { teams, leagues, all: [...teams, ...leagues], reasons }
}
