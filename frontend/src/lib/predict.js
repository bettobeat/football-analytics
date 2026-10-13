import { t } from './i18n';
export const MATCH_TYPE_LABEL = {
    mismatch: t('Mismatch'),
    standard: t('Standard'),
    even: t('Even match'),
    big: t('Big match')
};
/** The model's pick (works for full and locked predictions). */
export function pickOfPrediction(p) {
    if (p.locked && p.pick)
        return p.pick;
    if (p.home >= p.draw && p.home >= p.away)
        return 'H';
    if (p.away >= p.draw)
        return 'A';
    return 'D';
}
/** Fair (no-margin) decimal odds implied by a probability in %. */
export function fairOdds(pct) {
    if (!pct || pct <= 0)
        return '–';
    return (100 / pct).toFixed(2);
}
export const CONFIDENCE_LABEL = {
    low: t('Low confidence · few games played'),
    medium: t('Medium confidence'),
    high: t('High confidence')
};
export const BOOK_LABEL = {
    pinnacle: 'Pinnacle',
    median: 'Market median'
};
export function bookLabel(m) {
    return BOOK_LABEL[m.bookmaker] || m.bookmaker.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
/** Short and long labels for each model id. */
export const MODEL_INFO = {
    'poisson-dc-v1': { tag: 'v1', name: t('Standings model'), desc: t('Poisson from the current league table') },
    'dc-history-v2': { tag: 'v2', name: t('History model'), desc: t('Dixon-Coles fitted on 3 seasons of results') },
    'grid-v3': { tag: 'v3', name: t('Grid model'), desc: t('Scoring grid: value × relevance per parameter, 1000-point split') },
    'elo-intl': { tag: 'v3', name: t('v3 · national teams'), desc: t('Our national-team engine: rating from every senior international result since 2014, plus squad value') },
    'elo-euro': { tag: 'v3', name: t('v3 · European cups'), desc: t('Our European-cup engine: cross-league club rating from domestic and UEFA cup results, plus squad value') }
};
export function modelInfo(model) {
    return MODEL_INFO[model] || { tag: model, name: model, desc: '' };
}
/**
 * Draw alert (backtested 2024-25 + 2025-26): market-anchored draw chance = market draw + 0.75 × (v3 draw − market draw);
 * flag when v3's draw ≥ 30%, anchored chance × best draw price − 1 ≥ 2%, and the league is not La Liga.
 * History: the draw price shortened toward v3 by kick-off 2 times in 3; ROI small positive in both seasons.
 */
// maxEdge: a bigger edge usually means v3 over-rates the draw in a one-sided match (weaker line movement in both seasons)
// maxStreak: skip games where both teams drew 32%+ of their last 20 (bookmakers already over-price those draws)
export const DRAW_ALERT = { k: 0.75, minEdge: 0.02, maxEdge: 0.2, minV3Draw: 30, maxStreak: 0.32, excluded: ['PD'] };
export function drawAlert(p, m, competitionCode) {
    if (!m || p.locked || p.model !== 'grid-v3' || p.draw < DRAW_ALERT.minV3Draw)
        return null;
    if (competitionCode && DRAW_ALERT.excluded.includes(competitionCode))
        return null;
    if (p.drawStreak && Math.min(p.drawStreak.home, p.drawStreak.away) >= DRAW_ALERT.maxStreak)
        return null;
    const price = m.best?.draw || m.msw.draw;
    if (!price)
        return null;
    const mkt = m.probs.draw / 100;
    const anchored = mkt + DRAW_ALERT.k * (p.draw / 100 - mkt);
    const edge = anchored * price - 1;
    if (edge < DRAW_ALERT.minEdge || edge > DRAW_ALERT.maxEdge)
        return null;
    return { anchored: Math.round(anchored * 1000) / 10, price, edge: Math.round(edge * 1000) / 10, market: m.probs.draw };
}
