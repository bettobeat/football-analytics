// Prediction shape served by the backend (see backend/src/services/predictionModel.ts)
export interface Prediction {
  model: string
  /** Free / signed-out view: the server sends only { model, locked, pick, confidence } */
  locked?: boolean
  pick?: 'H' | 'D' | 'A'
  home: number // %
  draw: number // %
  away: number // %
  expectedGoals: { home: number; away: number }
  over25: number // %
  btts: number // %
  topScores: { home: number; away: number; prob: number }[]
  confidence: 'low' | 'medium' | 'high'
  factors: {
    homeAttack: number
    homeDefence: number
    awayAttack: number
    awayDefence: number
    homeAdvantage: number
    homeForm: number
    awayForm: number
    gamesPlayed: { home: number; away: number }
    leagueAvgGoals: number
  }
  /** Grid model (v3) breakdown — absent on v1/v2 */
  grid?: {
    matchType: 'mismatch' | 'standard' | 'even' | 'big'
    points: { home: number; draw: number; away: number } // out of 1000
    totals: { home: number; away: number }
    rows: { id: string; name: string; rel: number; home: number; away: number; edge: number; note?: string }[]
    drawPot: { base: number; factors: number; volatility: number; closeness?: number; total: number }
    reasons: string[]
    scope?: 'league' | 'national'
  }
}

export const MATCH_TYPE_LABEL: Record<NonNullable<Prediction['grid']>['matchType'], string> = {
  mismatch: 'Mismatch',
  standard: 'Standard',
  even: 'Even match',
  big: 'Big match'
}

/** The model's pick (works for full and locked predictions). */
export function pickOfPrediction(p: Prediction): 'H' | 'D' | 'A' {
  if (p.locked && p.pick) return p.pick
  if (p.home >= p.draw && p.home >= p.away) return 'H'
  if (p.away >= p.draw) return 'A'
  return 'D'
}

/** Fair (no-margin) decimal odds implied by a probability in %. */
export function fairOdds(pct: number) {
  if (!pct || pct <= 0) return '–'
  return (100 / pct).toFixed(2)
}

export const CONFIDENCE_LABEL: Record<Prediction['confidence'], string> = {
  low: 'Low confidence · few games played',
  medium: 'Medium confidence',
  high: 'High confidence'
}

/** Bookmaker market for a match (backend/src/services/odds.ts). Probabilities are margin-free, in %. */
export interface Market {
  msw: { homeWin: number; draw: number; awayWin: number }
  bookmaker: string
  books: number
  best: { homeWin: number | null; draw: number | null; awayWin: number | null }
  probs: { home: number; draw: number; away: number }
  overround: number
  fetchedAt: string
}

export const BOOK_LABEL: Record<string, string> = {
  pinnacle: 'Pinnacle',
  median: 'Market median'
}

export function bookLabel(m: Market) {
  return BOOK_LABEL[m.bookmaker] || m.bookmaker.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/** Short and long labels for each model id. */
export const MODEL_INFO: Record<string, { tag: string; name: string; desc: string }> = {
  'poisson-dc-v1': { tag: 'v1', name: 'Standings model', desc: 'Poisson from the current league table' },
  'dc-history-v2': { tag: 'v2', name: 'History model', desc: 'Dixon-Coles fitted on 3 seasons of results' },
  'grid-v3': { tag: 'v3', name: 'Grid model', desc: 'Scoring grid: value × relevance per parameter, 1000-point split' },
  'elo-intl': { tag: 'v3', name: 'v3 · national teams', desc: 'Our national-team engine: rating from every senior international result since 2014, plus squad value' },
  'elo-euro': { tag: 'v3', name: 'v3 · European cups', desc: 'Our European-cup engine: cross-league club rating from domestic and UEFA cup results, plus squad value' }
}

export function modelInfo(model: string) {
  return MODEL_INFO[model] || { tag: model, name: model, desc: '' }
}

/**
 * Draw alert (backtested 2024-25 + 2025-26): market-anchored draw chance = market draw + 0.75 × (v3 draw − market draw);
 * flag when v3's draw ≥ 30%, anchored chance × best draw price − 1 ≥ 2%, and the league is not La Liga.
 * History: the draw price shortened toward v3 by kick-off 2 times in 3; ROI small positive in both seasons.
 */
// maxEdge: a bigger edge usually means v3 over-rates the draw in a one-sided match (weaker line movement in both seasons)
export const DRAW_ALERT = { k: 0.75, minEdge: 0.02, maxEdge: 0.2, minV3Draw: 30, excluded: ['PD'] }
export function drawAlert(p: Prediction, m: Market | null | undefined, competitionCode?: string) {
  if (!m || p.locked || p.model !== 'grid-v3' || p.draw < DRAW_ALERT.minV3Draw) return null
  if (competitionCode && DRAW_ALERT.excluded.includes(competitionCode)) return null
  const price = m.best?.draw || m.msw.draw
  if (!price) return null
  const mkt = m.probs.draw / 100
  const anchored = mkt + DRAW_ALERT.k * (p.draw / 100 - mkt)
  const edge = anchored * price - 1
  if (edge < DRAW_ALERT.minEdge || edge > DRAW_ALERT.maxEdge) return null
  return { anchored: Math.round(anchored * 1000) / 10, price, edge: Math.round(edge * 1000) / 10, market: m.probs.draw }
}
