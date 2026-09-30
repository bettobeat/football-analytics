/**
 * When did each data feed last update successfully? Every background job marks itself here; the data-health check
 * compares the age with what the job promises (e.g. live scores every minute, fixtures every 5 minutes).
 * In memory: a restart starts empty and the jobs fill it again within minutes.
 */
export interface FeedState { at: number | null; ok: boolean; note: string | null; failures: number; lastError: string | null; lastErrorAt: number | null }
const feeds = new Map<string, FeedState>();
const started = Date.now();

function get(feed: string): FeedState {
  let f = feeds.get(feed);
  if (!f) { f = { at: null, ok: false, note: null, failures: 0, lastError: null, lastErrorAt: null }; feeds.set(feed, f); }
  return f;
}

export function markFresh(feed: string, note?: string) {
  const f = get(feed);
  f.at = Date.now(); f.ok = true; f.failures = 0; f.note = note ?? null;
}

export function markFailed(feed: string, error: unknown) {
  const f = get(feed);
  f.ok = false; f.failures++; f.lastError = error instanceof Error ? error.message : String(error); f.lastErrorAt = Date.now();
}

export function feedState(feed: string): FeedState | null {
  return feeds.get(feed) || null;
}

export const bootedAt = () => started;
