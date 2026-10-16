import { useEffect, useState } from 'react'
import axios from 'axios'
import { API_URL } from './socket'
import { t, LOCALE } from './i18n'
import { useAuth } from './auth'
import { useFavorites, type Favorite } from './favorites'

/** NFL site (fix137): types and helpers shared by the /american-football pages. Predictions: nfl-v1 (fix139). */

export interface NflConfig { public: boolean; open: boolean; season: number | null; seasons: number[] }
export interface NflSide { id: number; name: string; logo: string | null }
export interface NflGame {
  id: number
  season: number
  week: string | null
  /** "1".."18" (regular season) or "post" (playoffs) */
  weekKey: string
  stage: string | null
  kickoff: string
  status: string
  state: 'upcoming' | 'live' | 'done' | 'off'
  home: NflSide
  away: NflSide
  score: { home: number; away: number } | null
  quarters: { home: (number | null)[]; away: (number | null)[] } | null
  venue: string | null
  /** fix139: our saved prediction (null = none yet). Locked = free / signed-out viewer, game not finished. */
  prediction?: NflPred | null
}
export interface NflQb { id: number; name: string; value: number; usualId: number | null; usualName: string | null; usualValue: number | null; adj: number; reason: 'same' | 'changed' | 'injury' | 'new' }
export interface NflWhy {
  eloHome: number; eloAway: number; eloGap: number; homeField: number; neutral: boolean
  rest: [number | null, number | null]; restAdj: [number, number]
  qb: [NflQb | null, NflQb | null]
  eff: { yppHome: number; yppAway: number; toHome: number; toAway: number } | null
  blend: boolean
}
export interface NflPred {
  locked: boolean
  model?: string
  pHome?: number; pAway?: number; pick?: 'H' | 'A'
  /** expected margin, home minus away (points) */
  margin?: number; total?: number; homePts?: number; awayPts?: number
  strong?: boolean; hit?: boolean | null
  why?: NflWhy | null
}
export interface NflWeek { key: string; label: string; first: string; last: string; games: number }
export interface StandRow { team: NflSide; conference: string | null; division: string | null; w: number; l: number; t: number; pct: number; pf: number; pa: number; diff: number; streak: string | null; games: number }
export interface Standings { season: number; conferences: { name: string; divisions: { name: string; rows: StandRow[] }[] }[]; rows: StandRow[] }
export interface LeaderCat { id: string; label: string; rows: { id: number; name: string; image: string | null; teamId: number; value: number; team: NflSide | null }[] }

let configPromise: Promise<NflConfig> | null = null
let configValue: NflConfig | null = null
let configUser: string | null | undefined = undefined
/** Who may see the NFL site (admins before launch, everyone once NFL_PUBLIC=1). Loaded once per visit and sign-in. */
export function useNflConfig(): NflConfig | null {
  const { user, loading } = useAuth()
  const who = loading ? undefined : user ? String(user.id ?? user.email) : null
  const [cfg, setCfg] = useState<NflConfig | null>(configUser === who ? configValue : null)
  useEffect(() => {
    if (who === undefined) return
    if (configUser !== who) { configUser = who; configValue = null; configPromise = null }
    if (configValue) { setCfg(configValue); return }
    configPromise ||= axios.get(`${API_URL}/nfl/config`, { withCredentials: true })
      .then(r => (configValue = r.data.data as NflConfig))
      .catch(() => (configValue = { public: false, open: false, season: null, seasons: [] }))
    let alive = true
    configPromise.then(v => alive && setCfg(v))
    return () => { alive = false }
  }, [who])
  return cfg
}

export const NFL_STATUS: Record<string, string> = {
  Q1: t('Q1'), Q2: t('Q2'), Q3: t('Q3'), Q4: t('Q4'), OT: t('OT'), HT: t('Half-time'),
  FT: t('Final'), AOT: t('Final (OT)'), CANC: t('Cancelled'), PST: t('Postponed')
}
export const weekLabel = (key: string | null) => (!key ? '' : key === 'post' ? t('Playoffs') : t('Week {0}', { 0: key }))
export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })
export const dayOf = (iso: string) => new Date(iso).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })
/** "Kansas City Chiefs" → "Chiefs" for tight rows (the nickname is what people say). */
export const nick = (name: string) => { const w = name.split(/\s+/); return w.length > 1 ? w[w.length - 1] : name }
/** Reveal ids for NFL games (own negative range: never clashes with football ids or basketball's -id). */
export const nflRid = (g: { id: number }) => -(2e9 + g.id)
export const nflRstatus = (g: NflGame) => (g.state === 'done' ? 'FT' : g.status)
export const record = (r: { w: number; l: number; t: number }) => `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`

/* ---------- favorites (NFL teams, in the same account list as football's) ---------- */

export const nflTeamFav = (team: NflSide): Favorite => ({ kind: 'nfl-team', ref: String(team.id), name: team.name, img: team.logo, ids: [team.id] })

export function useNflFavorites() {
  const { list } = useFavorites()
  const teams = list.filter(f => f.kind === 'nfl-team')
  const reasons = (g: NflGame) => teams.filter(f => f.ref === String(g.home.id) || f.ref === String(g.away.id))
  return { teams, reasons }
}
