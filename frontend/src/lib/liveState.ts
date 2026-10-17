/**
 * fix165: a live game page never goes backwards. Every new reading (a details reload, a socket push) is compared with
 * the one on screen and the live part (status, minute / clock, score) of the further-on reading is kept; a reading at
 * the same point in the game is taken as it is (a corrected score still shows). Between readings the football minute
 * ticks up once a minute while the ball is in play.
 */

/* ---------- football ---------- */

interface FbLive { status?: string; minute?: number | null; injuryTime?: number | null; score?: any }
const FB_DONE = new Set(['FINISHED', 'AWARDED'])
const FB_LIVE = new Set(['IN_PLAY', 'PAUSED', 'LIVE'])
/** How far into the game a reading is: finished > in play (by minute; half-time sits just after its half) > not started. */
function fbProgress(m: FbLive): number {
  const st = String(m.status || '')
  if (FB_DONE.has(st)) return 1e6
  if (!FB_LIVE.has(st)) return 0
  const min = m.minute ?? 0
  if (st === 'PAUSED') return 1000 + (min <= 45 ? 45.99 : min + 0.99) * 100
  return 1000 + min * 100 + Math.min(30, m.injuryTime ?? 0)
}
/** `next` with the live part of `cur` when `cur` is further into the game. */
export function newerFootballLive<T extends FbLive>(cur: T | null | undefined, next: T): T {
  if (!cur || fbProgress(cur) <= fbProgress(next)) return next
  return { ...next, status: cur.status, minute: cur.minute, injuryTime: cur.injuryTime, score: cur.score }
}
/**
 * The minute to show: the last reading's minute plus the whole minutes since it arrived, while in play. It stops at
 * the end of each period (45, 90, 105, 120) — added time is the provider's to tell; half-time does not tick.
 */
export function tickedMinute<T extends FbLive>(m: T, readingAt: number): T {
  if (m.status !== 'IN_PLAY' || m.minute == null || m.injuryTime || [45, 90, 105, 120].includes(m.minute)) return m // added time: the provider's to tell
  const add = Math.floor((Date.now() - readingAt) / 60000)
  if (add <= 0) return m
  const cap = m.minute < 45 ? 45 : m.minute < 90 ? 90 : m.minute < 105 ? 105 : 120
  if (m.minute >= cap) return m
  return { ...m, minute: Math.min(cap, m.minute + add) }
}

/* ---------- basketball, NFL, college (periods + clock) ---------- */

interface WinnerLive { state?: string; status?: string; score?: any; quarters?: any; clock?: { played: number; left: number } | null }
const PERIOD: Record<string, number> = { Q1: 1, Q2: 2, HT: 2.5, BT: 2.5, Q3: 3, Q4: 4, OT: 5, AOT: 9, FT: 9 }
function winnerProgress(g: WinnerLive): number {
  if (g.state === 'done') return 1e6
  if (g.state !== 'live') return 0
  return 1000 + (PERIOD[String(g.status)] ?? 1) * 100 + (g.clock?.played ?? 0)
}
/** `next` with the live part of `cur` when `cur` is further into the game (basketball, NFL, college). */
export function newerWinnerLive<T extends WinnerLive>(cur: T | null | undefined, next: T): T {
  if (!cur || winnerProgress(cur) <= winnerProgress(next)) return next
  return { ...next, state: cur.state, status: cur.status, score: cur.score, quarters: cur.quarters, clock: cur.clock }
}
