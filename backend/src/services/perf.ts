/**
 * Event-loop health (Oct 2026): the server runs on one thread, so a long synchronous job (rebuilding model state,
 * fitting, feature rebuilds) makes every visitor wait. This records stalls and how long the heavy jobs take,
 * for /api/perf (admin).
 *
 * fix155: every running job is tracked (several can be in flight at once), a stall names all of them, each job keeps
 * the worst stall seen while it ran, and the live jobs (30 s / 60 s ticks) get an hourly "live ticks: max X ms" line.
 */
import logger from '../utils/logger';

const STEP = 500;
const stalls: { at: string; ms: number; job: string | null }[] = [];
const jobs = new Map<string, { runs: number; lastMs: number; maxMs: number; totalMs: number; lastAt: string; maxStallMs: number }>();
/** jobs in flight (a label can run more than once at a time) */
const active = new Map<string, number>();
let manual: string | null = null;
let last = Date.now();
let maxLag = 0;

/** the 30 s / 60 s live jobs: a stall over 500 ms while one runs is logged, and they get the hourly line */
export const LIVE_JOBS = new Set(['nfl live', 'nfl live predictions', 'bb live', 'football live', 'AF live', 'live push']);
const liveHour = new Map<string, number>();

const runningLabel = () => {
  const names = [...active.keys()];
  if (manual) names.push(manual);
  return names.length ? names.join(' + ') : null;
};

setInterval(() => {
  const now = Date.now();
  const lag = now - last - STEP;
  last = now;
  if (lag > maxLag) maxLag = lag;
  if (lag > 50) for (const label of active.keys()) {
    const j = jobs.get(label);
    if (j && lag > j.maxStallMs) j.maxStallMs = lag;
    if (LIVE_JOBS.has(label)) liveHour.set(label, Math.max(liveHour.get(label) || 0, lag));
  }
  if (lag > 300) {
    const job = runningLabel();
    stalls.push({ at: new Date(now).toISOString(), ms: lag, job });
    if (stalls.length > 100) stalls.shift();
    const live = [...active.keys()].some(l => LIVE_JOBS.has(l));
    if (lag > 2000 || (lag > 500 && live)) logger.warn(`Event loop blocked ${lag} ms${job ? ` (${job})` : ''}`);
  }
}, STEP).unref();

// once an hour: the worst event-loop stall while each live job was running (the goal: under 500 ms)
setInterval(() => {
  for (const l of LIVE_JOBS) if (jobs.get(l)?.lastAt && Date.now() - Date.parse(jobs.get(l)!.lastAt) < 3600 * 1000 && !liveHour.has(l)) liveHour.set(l, 0);
  if (!liveHour.size) return;
  const max = Math.max(...liveHour.values());
  logger.info(`live ticks: max ${max} ms (${[...liveHour.entries()].sort((a, b) => b[1] - a[1]).map(([l, ms]) => `${l} ${ms}`).join(', ')})`);
  liveHour.clear();
}, 3600 * 1000).unref();

export const yieldLoop = () => new Promise<void>(r => setImmediate(r));

/** Time a job (sync or async); the label shows up next to any stall it causes. */
export async function timed<T>(label: string, fn: () => T | Promise<T>): Promise<T> {
  active.set(label, (active.get(label) || 0) + 1);
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    const ms = Date.now() - t0;
    const j = jobs.get(label) || { runs: 0, lastMs: 0, maxMs: 0, totalMs: 0, lastAt: '', maxStallMs: 0 };
    j.runs++; j.lastMs = ms; j.maxMs = Math.max(j.maxMs, ms); j.totalMs += ms; j.lastAt = new Date().toISOString();
    jobs.set(label, j);
    const n = (active.get(label) || 1) - 1;
    if (n > 0) active.set(label, n); else active.delete(label);
  }
}
export const setJob = (label: string | null) => { manual = label; };

export function perfStatus() {
  const since = Date.now() - 3600 * 1000;
  const recent = stalls.filter(s => new Date(s.at).getTime() >= since);
  return {
    maxLagMs: maxLag,
    stallsLastHour: recent.length,
    worstLastHour: recent.reduce((m, s) => Math.max(m, s.ms), 0),
    running: runningLabel(),
    liveThisHour: Object.fromEntries(liveHour),
    recentStalls: stalls.slice(-25).reverse(),
    // maxMs = longest run (waits for the data providers included); maxStallMs = worst event-loop freeze while it ran
    jobs: Object.fromEntries([...jobs.entries()].sort((a, b) => b[1].maxStallMs - a[1].maxStallMs || b[1].maxMs - a[1].maxMs)),
    memoryMb: Math.round(process.memoryUsage().rss / 1048576),
    uptimeMin: Math.round(process.uptime() / 60)
  };
}
