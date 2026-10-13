import { t } from './i18n';
export const SPORTS = [
    { id: 'football', name: t('Football'), icon: '⚽', path: '/', live: true },
    { id: 'basketball', name: t('Basketball'), icon: '🏀', path: '/basketball', live: false },
    { id: 'tennis', name: t('Tennis'), icon: '🎾', path: '/tennis', live: false },
    { id: 'american-football', name: t('American football'), icon: '🏈', path: '/american-football', live: false }
];
/** The sport a page belongs to (everything outside another sport's section is football). */
export function sportOfPath(pathname) {
    return SPORTS.find(s => s.id !== 'football' && (pathname === s.path || pathname.startsWith(s.path + '/'))) || SPORTS[0];
}
