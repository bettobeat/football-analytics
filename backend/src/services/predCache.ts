/**
 * Predictions for list pages (Oct 2026): with ~700 matches in the 14-day window, computing every model for every
 * match on every request kept the server busy for a noticeable time. Results are kept for 2 minutes per match
 * (and dropped whenever the model state is rebuilt), so a page view only formats what is already known.
 */
const TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { at: number; value: any }>();

export function cachedPredictions<T>(match: any, compute: () => T): T {
  const key = `${match?.id}|${match?.status}|${match?.utcDate}|${match?.homeTeam?.id}|${match?.awayTeam?.id}`;
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < TTL_MS) return hit.value as T;
  const value = compute();
  cache.set(key, { at: now, value });
  if (cache.size > 5000) for (const [k, v] of cache) if (now - v.at >= TTL_MS) cache.delete(k);
  return value;
}
export const clearPredictionCache = () => cache.clear();

/** The prediction we show: our own model first (v3 / national-team / European-cup engine), older ones as fallback. */
const ORDER = ['grid-v3', 'elo-intl', 'elo-euro', 'dc-history-v2', 'poisson-dc-v1'];
export function mainPrediction<P extends { model: string }>(preds: P[]): P | null {
  for (const m of ORDER) { const p = preds.find(x => x.model === m); if (p) return p; }
  return preds[0] || null;
}

/** List pages need the numbers and the pick, not the full breakdown (that comes with the match page). */
export function slimForList(m: any) {
  if (!m) return m;
  const main = mainPrediction(m.predictions || (m.prediction ? [m.prediction] : []));
  if (!main) return m;
  const { grid, ...rest } = main as any;
  void grid;
  return { ...m, prediction: rest, predictions: [rest] };
}
