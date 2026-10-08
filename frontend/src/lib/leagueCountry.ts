/** Country of a football competition, for the Countries menu (flag codes as API-Sports uses them). */
const FD: Record<string, string> = {
  PL: 'gb-eng', ELC: 'gb-eng', BL1: 'de', SA: 'it', PD: 'es', FL1: 'fr', DED: 'nl', PPL: 'pt', BSA: 'br',
  CL: 'eu', EC: 'eu', WC: 'world'
}
const BY_NAME: Record<string, string> = {
  england: 'gb-eng', scotland: 'gb-sct', wales: 'gb-wls', 'northern ireland': 'gb-nir', germany: 'de', italy: 'it', spain: 'es', france: 'fr',
  netherlands: 'nl', portugal: 'pt', brazil: 'br', japan: 'jp', 'saudi-arabia': 'sa', 'saudi arabia': 'sa', turkey: 'tr', denmark: 'dk',
  norway: 'no', sweden: 'se', argentina: 'ar', poland: 'pl', belgium: 'be', mexico: 'mx', austria: 'at', israel: 'il', switzerland: 'ch',
  greece: 'gr', usa: 'us', croatia: 'hr', 'czech-republic': 'cz', 'czech republic': 'cz', ukraine: 'ua', russia: 'ru', china: 'cn',
  'south-korea': 'kr', 'south korea': 'kr', australia: 'au', colombia: 'co', chile: 'cl', uruguay: 'uy', egypt: 'eg', romania: 'ro', serbia: 'rs'
}
export function footballCountry(c: { code: string; name: string; type?: string; rank?: number }) {
  if (FD[c.code]) return FD[c.code]
  if (c.rank === 3) return 'world' // national teams
  if (c.rank === 1 || /^uefa/i.test(c.name)) return 'eu'
  const m = c.name.match(/\(([^)]+)\)\s*$/)
  if (m) return BY_NAME[m[1].toLowerCase()] || 'world'
  return 'world'
}
/** "Serie A (Brazil)" → "Serie A" (the country is shown by the menu). */
export const leagueShortName = (name: string) => name.replace(/\s*\([^)]+\)\s*$/, '')
