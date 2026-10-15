/** Weekly league prediction hubs (fix125): /predictions/<slug>. Same list as backend/src/services/hubs.ts. */
export const HUBS: { slug: string; sport: 'football' | 'basketball'; code: string; name: string }[] = [
  { slug: 'PL', sport: 'football', code: 'PL', name: 'Premier League' },
  { slug: 'PD', sport: 'football', code: 'PD', name: 'La Liga' },
  { slug: 'SA', sport: 'football', code: 'SA', name: 'Serie A' },
  { slug: 'BL1', sport: 'football', code: 'BL1', name: 'Bundesliga' },
  { slug: 'FL1', sport: 'football', code: 'FL1', name: 'Ligue 1' },
  { slug: 'CL', sport: 'football', code: 'CL', name: 'Champions League' },
  { slug: 'NBA', sport: 'basketball', code: 'NBA', name: 'NBA' },
  { slug: 'EUROLEAGUE', sport: 'basketball', code: 'EL', name: 'EuroLeague' }
]
export const hubFor = (sport: 'football' | 'basketball', code: string) => HUBS.find(h => h.sport === sport && h.code === code.toUpperCase()) || null
