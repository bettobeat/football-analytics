/**
 * Event-loop health (Oct 2026): the server runs on one thread, so a long synchronous job (rebuilding model state,
 * fitting, feature rebuilds) makes every visitor wait. This records stalls and how long the heavy jobs take,
 * for /api/perf (admin).
 */
import logger from '../utils/logger';

const STEP = 500;
const stalls: { at: string; ms: number; job: string | null }[] = [];
const jobs = new Map<string, { runs: number; lastMs: number; maxMs: number; totalMs: number; lastAt: string }>();
let current: string | null = null;
let last = Date.now();
let maxLag = 0;

setInterval(() => {
  const now = Date.now();
  const lag = now - last - STEP;
  last = now;
  if (lag > maxLag) maxLag = lag;
  if (lag > 300) {
    stalls.push({ at: new Date(now).toISOString(), ms: lag, job: current });
    if (stalls.length > 100) stalls.shift();
    if (lag > 2000) logger.warn(`Event loop blocked ${lag} ms${current ? ` (${current})` : ''}`);
  }
}, STEP).unref();

export const yieldLoop = () => new Promise<void>(r => setImmediate(r));

/** Time a job (sync or async); the label shows up next to any stall it causes. */
export async function timed<T>(label: string, fn: () => T | Promise<T>): Promise<T> {
  const prev = current;
  current = label;
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    const ms = Date.now() - t0;
    const j = jobs.get(label) || { runs: 0, lastMs: 0, maxMs: 0, totalMs: 0, lastAt: '' };
    j.runs++; j.lastMs = ms; j.maxMs = Math.max(j.maxMs, ms); j.totalMs += ms; j.lastAt = new Date().toISOString();
    jobs.set(label, j);
    current = prev;
  }
}
export const setJob = (label: string | null) => { current = label; };

export function perfStatus() {
  const since = Date.now() - 3600 * 1000;
  const recent = stalls.filter(s => new Date(s.at).getTime() >= since);
  return {
    maxLagMs: maxLag,
    stallsLastHour: recent.length,
    worstLastHour: recent.reduce((m, s) => Math.max(m, s.ms), 0),
    recentStalls: stalls.slice(-25).reverse(),
    jobs: Object.fromEntries([...jobs.entries()].sort((a, b) => b[1].maxMs - a[1].maxMs)),
    memoryMb: Math.round(process.memoryUsage().rss / 1048576),
    uptimeMin: Math.round(process.uptime() / 60)
  };
}
