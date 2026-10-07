import { t } from './i18n'

/** The sports of SportLikely. Football is live; the others open later (Oct 2026: "coming soon" pages). */
export type SportId = 'football' | 'basketball' | 'tennis' | 'american-football'

export interface Sport {
  id: SportId
  name: string
  icon: string
  path: string // where the sport's section starts
  live: boolean
}

export const SPORTS: Sport[] = [
  { id: 'football', name: t('Football'), icon: '⚽', path: '/', live: true },
  { id: 'basketball', name: t('Basketball'), icon: '🏀', path: '/basketball', live: false },
  { id: 'tennis', name: t('Tennis'), icon: '🎾', path: '/tennis', live: false },
  { id: 'american-football', name: t('American football'), icon: '🏈', path: '/american-football', live: false }
]

/** The sport a page belongs to (everything that is not a coming sport's section is football). */
export function sportOfPath(pathname: string): Sport {
  return SPORTS.find(s => !s.live && (pathname === s.path || pathname.startsWith(s.path + '/'))) || SPORTS[0]
}
