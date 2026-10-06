import { useEffect, useState } from 'react'
import axios from 'axios'
import { API_URL } from './socket'
import { LOCALE, t } from './i18n'

/**
 * $15 Premium: monthly allowance of match unlocks (see backend services/billing.ts).
 * One shared copy for the whole app; pages call refreshUnlocks() after an unlock or a plan change.
 */
export interface UnlockStatus {
  plan: string
  unlimited: boolean
  allowance: number
  /** 'week' = Free (weekly picks), 'month' = Premium */
  period?: 'week' | 'month'
  used: number
  left: number | null
  resetsAt: string
  testMode: boolean
}

const EVT = 'b2b-unlocks'
let current: UnlockStatus | null = null
let pending: Promise<void> | null = null

export function refreshUnlocks(): Promise<void> {
  if (pending) return pending
  pending = axios
    .get(`${API_URL}/unlocks`)
    .then(r => {
      current = r.data.data
      window.dispatchEvent(new Event(EVT))
    })
    .catch(() => undefined)
    .finally(() => {
      pending = null
    })
  return pending
}

export function useUnlocks(enabled = true): UnlockStatus | null {
  const [, setN] = useState(0)
  useEffect(() => {
    const f = () => setN(n => n + 1)
    window.addEventListener(EVT, f)
    if (enabled && !current) refreshUnlocks()
    return () => window.removeEventListener(EVT, f)
  }, [enabled])
  return enabled ? current : null
}

/** Spend one unlock on a match. Resolves with the new status; rejects with { upgrade: true } when none are left. */
export async function unlockMatch(matchId: number, status: string): Promise<UnlockStatus> {
  try {
    const r = await axios.post(`${API_URL}/unlocks/${matchId}`, { status })
    current = r.data.data
    window.dispatchEvent(new Event(EVT))
    return r.data.data
  } catch (e: any) {
    if (e?.response?.data?.data) {
      current = e.response.data.data
      window.dispatchEvent(new Event(EVT))
    }
    throw { upgrade: !!e?.response?.data?.upgrade, message: e?.response?.data?.error || t("Could not unlock this match. Try again.") }
  }
}

export const resetDay = (iso: string) => new Date(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })
