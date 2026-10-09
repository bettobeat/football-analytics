/**
 * Live win chance (Oct 2026): home / draw / away while a match is being played.
 *
 * Start from the pre-match prediction (its expected goals and its 1X2) and play the rest of the match:
 *  - goals still to come = pre-match expected goals × the share of goals left at this minute (a bit more of them come
 *    late in matches: `late`), at least `minRem` while the match is not over;
 *  - the team ahead slows down and the team behind pushes (`lead`);
 *  - a red card lowers that team's scoring (`redOwn`) and raises the opponent's (`redOpp`), per red card;
 *  - final score = current score + Poisson goals for the rest → home / draw / away.
 * At kick-off the answer equals the pre-match prediction exactly: the model's own adjustments over a plain Poisson
 * split (mostly its draw chance) are kept in proportion to the time left (to the power `corrPow`).
 *
 * Tested at half-time on the model's backtest seasons (ht_scores × backtest_predictions): /api/backtest/live-ht.
 * Red cards have no timing in those files, so redOwn / redOpp are taken from published studies, not fitted.
 */
import { db } from '../db';

export const LIVE_CONF = { late: 0.25, lead: 0.08, redOwn: 0.67, redOpp: 1.3, minRem: 0.012, corrPow: 1 };
export type LiveConf = typeof LIVE_CONF;

export interface LiveState { minute: number; scoreH: number; scoreA: number; redH?: number; redA?: number }
export interface LiveChance { home: number; draw: number; away: number; minute: number; score: [number, number]; reds: [number, number] }

const MAXG = 12;
function pmf(l: number): number[] {
  const out = new Array(MAXG + 1).fill(0);
  let p = Math.exp(-l);
  for (let k = 0; k <= MAXG; k++) { out[k] = p; p = (p * l) / (k + 1); }
  return out;
}

/** P(home ahead / level / away ahead) after adding Poisson goals to a current goal difference. */
function split(lh: number, la: number, diff: number): [number, number, number] {
  const a = pmf(Math.max(0, lh)), b = pmf(Math.max(0, la));
  let h = 0, d = 0, w = 0;
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) {
    const p = a[i] * b[j], g = diff + i - j;
    if (g > 0) h += p; else if (g < 0) w += p; else d += p;
  }
  const s = h + d + w || 1;
  return [h / s, d / s, w / s];
}

/** Share of a match's goals expected by minute t (0..90). */
export function goalsShareBy(t: number, late = LIVE_CONF.late): number {
  const x = Math.min(1, Math.max(0, t / 90));
  return (x + (late / 2) * x * x) / (1 + late / 2);
}

/** Pre-match probabilities may come as % (grid / elo models) or as fractions. */
function asFractions(pre: { home: number; draw: number; away: number }): [number, number, number] {
  const h = Number(pre.home), d = Number(pre.draw), a = Number(pre.away);
  const s = h + d + a;
  if (!(s > 0)) return [1 / 3, 1 / 3, 1 / 3];
  return [h / s, d / s, a / s];
}

export function liveProbs(
  pre: { home: number; draw: number; away: number },
  xg: { home: number; away: number },
  st: LiveState,
  conf: LiveConf = LIVE_CONF
): [number, number, number] {
  const rem = Math.max(conf.minRem, 1 - goalsShareBy(st.minute, conf.late));
  const diff = st.scoreH - st.scoreA;
  let lh = Math.max(0.05, xg.home) * rem, la = Math.max(0.05, xg.away) * rem;
  if (diff > 0) { lh *= 1 - conf.lead; la *= 1 + conf.lead; }
  else if (diff < 0) { lh *= 1 + conf.lead; la *= 1 - conf.lead; }
  const rh = st.redH || 0, ra = st.redA || 0;
  lh *= Math.pow(conf.redOwn, rh) * Math.pow(conf.redOpp, ra);
  la *= Math.pow(conf.redOwn, ra) * Math.pow(conf.redOpp, rh);
  const now = split(lh, la, diff);
  // keep the model's own adjustment over plain Poisson in proportion to the time left
  const q0 = asFractions(pre);
  const p0 = split(Math.max(0.05, xg.home), Math.max(0.05, xg.away), 0);
  const w = Math.pow(rem, conf.corrPow);
  const raw = now.map((p, i) => p * Math.pow(Math.max(1e-6, q0[i]) / Math.max(1e-6, p0[i]), w));
  const s = raw[0] + raw[1] + raw[2] || 1;
  return [raw[0] / s, raw[1] / s, raw[2] / s];
}

/* ---------------- attaching it to live matches ---------------- */

const LIVE = new Set(['IN_PLAY', 'PAUSED', 'LIVE', '1H', '2H', 'HT']);

/** Minute of play (0..90+); half-time = 45. Falls back to the clock since kick-off when the feed has no minute. */
function minuteOf(m: any): number | null {
  const st = String(m.status || '');
  if (st === 'PAUSED' || st === 'HT') return 45;
  const min = Number(m.minute);
  if (Number.isFinite(min) && min > 0) return min + (Number(m.injuryTime) > 0 ? Number(m.injuryTime) : 0);
  const ko = new Date(m.utcDate).getTime();
  if (!Number.isFinite(ko)) return null;
  const el = (Date.now() - ko) / 60000;
  if (el < 0) return 0;
  return el <= 47 ? el : el <= 62 ? 45 : Math.min(95, el - 15);
}

function redsOf(m: any): [number, number] {
  let h = 0, a = 0, seen = false;
  for (const b of m.bookings || []) {
    if (b?.card !== 'RED' && b?.card !== 'YELLOW_RED') continue;
    seen = true;
    if (b.team?.id === m.homeTeam?.id) h++; else if (b.team?.id === m.awayTeam?.id) a++;
  }
  if (!seen) {
    const sh = Number(m.homeTeam?.statistics?.red_cards), sa = Number(m.awayTeam?.statistics?.red_cards);
    if (Number.isFinite(sh)) h = sh;
    if (Number.isFinite(sa)) a = sa;
  }
  return [Math.min(3, h), Math.min(3, a)];
}

function scoreOf(m: any): [number, number] | null {
  const s = m.score?.fullTime;
  const h = Number(s?.home ?? s?.homeTeam), a = Number(s?.away ?? s?.awayTeam);
  if (Number.isFinite(h) && Number.isFinite(a)) return [h, a];
  return null;
}

/** The live win chance for one match, or null when the match is not being played or has no usable prediction. */
export function liveChanceFor(m: any, p: any): LiveChance | null {
  if (!m || !p || p.locked || !LIVE.has(String(m.status || ''))) return null;
  if (m.score?.duration && m.score.duration !== 'REGULAR') return null; // extra time / penalties: 1X2 is settled
  const xg = p.expectedGoals;
  if (!xg || !(Number(xg.home) > 0) || !(Number(xg.away) > 0)) return null;
  const minute = minuteOf(m);
  const score = scoreOf(m) || [0, 0];
  if (minute === null) return null;
  const reds = redsOf(m);
  const [h, d, a] = liveProbs(p, { home: Number(xg.home), away: Number(xg.away) }, { minute, scoreH: score[0], scoreA: score[1], redH: reds[0], redA: reds[1] });
  const pct = (x: number) => Math.round(x * 1000) / 10;
  return { home: pct(h), draw: pct(d), away: pct(a), minute: Math.round(minute), score, reds };
}

/** Adds `prediction.live` (and the same on the main entry of `predictions`) to a live match object. */
export function withLive<T extends { prediction?: any; predictions?: any[] }>(m: T): T {
  try {
    const live = liveChanceFor(m, m.prediction);
    if (!live) return m;
    const prediction = { ...m.prediction, live };
    const predictions = Array.isArray(m.predictions) ? m.predictions.map(x => (x?.model === prediction.model ? { ...x, live } : x)) : m.predictions;
    return { ...m, prediction, predictions };
  } catch {
    return m;
  }
}

/* ---------------- half-time test ---------------- */

interface HtRow { ph: number; pd: number; pa: number; xh: number; xa: number; hh: number; ha: number; hg: number; ag: number; season: string; grp: string }

function htRows(): HtRow[] {
  const runs = db.prepare(`
    SELECT r.id, r.season, r.grp FROM backtest_runs r
    WHERE r.model = 'grid-v3' AND r.finished_at IS NOT NULL
      AND r.id = (SELECT MAX(id) FROM backtest_runs x WHERE x.model = r.model AND x.season = r.season AND x.grp = r.grp AND x.finished_at IS NOT NULL)
  `).all() as any[];
  const out: HtRow[] = [];
  const q = db.prepare(`
    SELECT b.p_home ph, b.p_draw pd, b.p_away pa, b.xg_home xh, b.xg_away xa, b.hg, b.ag, h.ht_hg hh, h.ht_ag ha
    FROM backtest_predictions b JOIN ht_scores h ON h.division = b.division AND h.date = b.date AND h.home = b.home AND h.away = b.away
    WHERE b.run_id = ? AND b.xg_home IS NOT NULL AND b.xg_away IS NOT NULL
  `);
  for (const r of runs) for (const x of q.all(r.id) as any[]) out.push({ ...x, season: r.season, grp: r.grp });
  return out;
}

function score(rows: HtRow[], conf: LiveConf, mode: 'live' | 'pre' | 'plain') {
  let ll = 0, hit = 0, br = 0;
  const buckets = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
  for (const r of rows) {
    const y = r.hg > r.ag ? 0 : r.hg === r.ag ? 1 : 2;
    let p: [number, number, number];
    if (mode === 'pre') p = asFractions({ home: r.ph, draw: r.pd, away: r.pa });
    else if (mode === 'plain') p = liveProbs({ home: 1, draw: 1, away: 1 }, { home: r.xh, away: r.xa }, { minute: 45, scoreH: r.hh, scoreA: r.ha }, { ...conf, corrPow: 1e9 });
    else p = liveProbs({ home: r.ph, draw: r.pd, away: r.pa }, { home: r.xh, away: r.xa }, { minute: 45, scoreH: r.hh, scoreA: r.ha }, conf);
    ll += -Math.log(Math.max(1e-6, p[y]));
    const pick = p[0] >= p[1] && p[0] >= p[2] ? 0 : p[2] >= p[1] ? 2 : 1;
    if (pick === y) hit++;
    br += p.reduce((s, v, i) => s + (v - (i === y ? 1 : 0)) ** 2, 0);
    for (let i = 0; i < 3; i++) {
      const b = buckets[Math.min(9, Math.floor(p[i] * 10))];
      b.n++; b.p += p[i]; b.y += i === y ? 1 : 0;
    }
  }
  const n = rows.length || 1;
  const r3 = (x: number) => Math.round(x * 10000) / 10000;
  return {
    n: rows.length, logLoss: r3(ll / n), brier: r3(br / n), hitRate: Math.round((1000 * hit) / n) / 10,
    calibration: buckets.filter(b => b.n).map((b, i) => ({ bucket: `${i * 10}-${i * 10 + 10}%`, n: b.n, said: Math.round((1000 * b.p) / b.n) / 10, happened: Math.round((1000 * b.y) / b.n) / 10 }))
  };
}

/**
 * Half-time test: what the live chance said at half-time vs the final result, on every backtest match with a
 * half-time score. `tune` = grid over late / lead / corrPow (fit on the older seasons, scored on the newest one).
 */
export function liveHalfTimeTest(conf: Partial<LiveConf> = {}, tune = false) {
  const rows = htRows();
  const c: LiveConf = { ...LIVE_CONF, ...conf };
  const seasons = [...new Set(rows.map(r => r.season))].sort();
  const result: any = {
    rows: rows.length, seasons, conf: c,
    htScoreShare: rows.length ? Math.round((1000 * rows.reduce((s, r) => s + r.hh + r.ha, 0)) / rows.reduce((s, r) => s + r.hg + r.ag, 0)) / 1000 : null,
    preMatchOnly: score(rows, c, 'pre'),
    plainPoisson: score(rows, c, 'plain'),
    live: score(rows, c, 'live')
  };
  if (tune && seasons.length >= 2) {
    const test = seasons[seasons.length - 1];
    const train = rows.filter(r => r.season !== test), hold = rows.filter(r => r.season === test);
    const grid: { conf: Partial<LiveConf>; train: number; test: number }[] = [];
    for (const late of [0, 0.15, 0.25, 0.4, 0.6]) for (const lead of [0, 0.04, 0.08, 0.12, 0.16]) for (const corrPow of [0.5, 1, 2]) {
      const k = { ...c, late, lead, corrPow };
      grid.push({ conf: { late, lead, corrPow }, train: score(train, k, 'live').logLoss, test: score(hold, k, 'live').logLoss });
    }
    grid.sort((a, b) => a.train - b.train);
    result.tune = { trainSeasons: seasons.slice(0, -1), testSeason: test, current: { train: score(train, c, 'live').logLoss, test: score(hold, c, 'live').logLoss }, best: grid.slice(0, 8) };
  }
  return result;
}
