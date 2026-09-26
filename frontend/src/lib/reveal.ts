import { useEffect, useState } from 'react'

/**
 * "Guess first": premium members see each upcoming game with our prediction covered until they tap Reveal,
 * so they can make their own call first. On by default; can be switched off (Account page, or "Always show").
 * Per browser (localStorage). Finished games are never covered.
 */
const PREF = 'b2b_guess_first'
const KEY = 'b2b_revealed'
const EVT = 'b2b-reveal-change'
const DONE = new Set(['FINISHED', 'AWARDED', 'FT', 'AET', 'PEN'])

function read(k: string): string | null {
  try { return localStorage.getItem(k) } catch { return null }
}
function write(k: string, v: string) {
  try { localStorage.setItem(k, v) } catch { /* private mode: in-memory only */ }
}

let memRevealed: number[] | null = null
function revealedIds(): number[] {
  if (memRevealed) return memRevealed
  try { memRevealed = JSON.parse(read(KEY) || '[]') } catch { memRevealed = [] }
  return memRevealed!
}

export function guessFirstOn(): boolean {
  return read(PREF) !== '0'
}

export function setGuessFirst(on: boolean) {
  write(PREF, on ? '1' : '0')
  window.dispatchEvent(new Event(EVT))
}

function useTick() {
  const [, setN] = useState(0)
  useEffect(() => {
    const f = () => setN(n => n + 1)
    window.addEventListener(EVT, f)
    return () => window.removeEventListener(EVT, f)
  }, [])
}

export function useGuessFirst(): [boolean, (on: boolean) => void] {
  useTick()
  return [guessFirstOn(), setGuessFirst]
}

/** Covered right now? (plain function; pair it with useRevealState() so the page re-renders on changes) */
export function isCovered(matchId: number | undefined, status: string | undefined, enabled: boolean) {
  return enabled && !!matchId && guessFirstOn() && !DONE.has(String(status || '')) && !revealedIds().includes(matchId)
}

const revealedAt = new Map<number, number>()
/** Revealed in the last few seconds (on this page)? Then the numbers roll in instead of just appearing. */
export function justRevealed(matchId: number | undefined) {
  const t = matchId ? revealedAt.get(matchId) : undefined
  return !!t && Date.now() - t < 4000
}

export function revealMatch(matchId: number | undefined) {
  if (!matchId) return
  revealedAt.set(matchId, Date.now())
  const ids = revealedIds().filter(x => x !== matchId)
  ids.push(matchId)
  memRevealed = ids.slice(-500)
  write(KEY, JSON.stringify(memRevealed))
  window.dispatchEvent(new Event(EVT))
}

/** Re-render when reveals or the preference change (for pages that call isCovered in a list). */
export function useRevealState() {
  useTick()
}

/** Is this match's prediction covered for this viewer? `enabled` = the viewer sees full predictions (premium). */
export function useReveal(matchId: number | undefined, status: string | undefined, enabled: boolean) {
  useTick()
  return { hidden: isCovered(matchId, status, enabled), reveal: () => revealMatch(matchId) }
}
