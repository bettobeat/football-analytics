/**
 * Where does v3 lose to the market?
 *
 * Takes the latest backtest of a model for a season (walk-forward, so every prediction only used data
 * from before the match) and the closing market price for the same matches, then:
 *  1. splits the Brier gap (model − market) by league, favourite strength, season phase, promoted teams,
 *     rest days and disagreement size, so we see WHERE the gap comes from;
 *  2. tests candidate information the model does not use (shots, shots on target, finishing luck, rest,
 *     promoted teams…): for each one it fits a small tilt  p' ∝ p · exp(b·f·[+1, 0, −1])  on the first half
 *     of the season and scores it on the second half. A feature that helps out-of-sample and correlates with
 *     (market − model) is information the market has and we don't.
 * Features are built only from matches before the match date (no look-ahead).
 */
import { db } from '../db';

type O = 'H' | 'D' | 'A';
const IDX: Record<O, number> = { H: 0, D: 1, A: 2 };
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r1 = (x: number) => Math.round(x * 10) / 10;
const brier = (p: number[], o: O) => p.reduce((s, x, i) => s + (x - (IDX[o] === i ? 1 : 0)) ** 2, 0);
const ll = (p: number[], o: O) => -Math.log(Math.max(1e-9, p[IDX[o]]));

interface Hist {
  division: string; season: string; date: string; home: string; away: string; hg: number; ag: number;
  sh_h: number | null; sh_a: number | null; sot_h: number | null; sot_a: number | null; cor_h: number | null; cor_a: number | null;
}
interface TeamGame { date: string; gf: number; ga: number; shF: number | null; shA: number | null; sotF: number | null; sotA: number | null; corF: number | null; corA: number | null; division: string; season: string }

interface Row {
  division: string; date: string; home: string; away: string; outcome: O;
  p: number[]; m: number[];
  f: Record<string, number | null>;
  promoted: boolean; restMin: number | null; month: number;
}

const FEATURES: { key: string; label: string }[] = [
  { key: 'sotDiff', label: 'Shots on target difference (last 8, for − against, home − away)' },
  { key: 'shotDiff', label: 'Shots difference (last 8)' },
  { key: 'cornerDiff', label: 'Corners difference (last 8)' },
  { key: 'finishLuck', label: 'Finishing luck: goals − 0.3·shots on target (last 8; + = home over-performing)' },
  { key: 'defLuck', label: 'Keeper luck: goals conceded − 0.3·shots on target faced (last 8)' },
  { key: 'gdDiff', label: 'Goal difference (last 8) — v3 already uses goals, control' },
  { key: 'gdDiff3', label: 'Goal difference (last 3) — very recent form' },
  { key: 'restDiff', label: 'Rest days difference (league games only, capped at 10)' },
  { key: 'promotedDiff', label: 'Promoted team (home 1 / away −1)' },
  { key: 'marketGap', label: 'Market − model on home−away (check: how much the market knows)' }
];

function teamLogs(hist: Hist[]) {
  const logs = new Map<string, TeamGame[]>();
  const push = (t: string, g: TeamGame) => (logs.get(t) || logs.set(t, []).get(t)!).push(g);
  for (const m of hist) {
    push(m.home, { date: m.date, gf: m.hg, ga: m.ag, shF: m.sh_h, shA: m.sh_a, sotF: m.sot_h, sotA: m.sot_a, corF: m.cor_h, corA: m.cor_a, division: m.division, season: m.season });
    push(m.away, { date: m.date, gf: m.ag, ga: m.hg, shF: m.sh_a, shA: m.sh_h, sotF: m.sot_a, sotA: m.sot_h, corF: m.cor_a, corA: m.cor_h, division: m.division, season: m.season });
  }
  return logs;
}

/** Games strictly before `date` (logs are in date order). */
function before(log: TeamGame[] | undefined, date: string, n: number): TeamGame[] {
  if (!log) return [];
  let hi = log.length;
  let lo = 0;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (log[mid].date < date) lo = mid + 1;
    else hi = mid;
  }
  return log.slice(Math.max(0, lo - n), lo);
}

function avg(games: TeamGame[], f: (g: TeamGame) => number | null): number | null {
  let s = 0, n = 0;
  for (const g of games) {
    const v = f(g);
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    s += v;
    n++;
  }
  return n >= 3 ? s / n : null;
}

function tilt(p: number[], x: number): number[] {
  const w = [Math.exp(x), 1, Math.exp(-x)];
  const q = p.map((v, i) => v * w[i]);
  const s = q[0] + q[1] + q[2];
  return q.map(v => v / s);
}

/** Best b for p' = tilt(p, b·f) on the given rows (golden-section search on log loss). */
function fitTilt(rows: Row[], key: string): number {
  const use = rows.filter(r => r.f[key] !== null);
  const loss = (b: number) => use.reduce((s, r) => s + ll(tilt(r.p, b * (r.f[key] as number)), r.outcome), 0);
  let a = -3, c = 3;
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = c - g * (c - a), x2 = a + g * (c - a);
  let f1 = loss(x1), f2 = loss(x2);
  for (let i = 0; i < 60; i++) {
    if (f1 < f2) { c = x2; x2 = x1; f2 = f1; x1 = c - g * (c - a); f1 = loss(x1); }
    else { a = x1; x1 = x2; f1 = f2; x2 = a + g * (c - a); f2 = loss(x2); }
  }
  return (a + c) / 2;
}

function corr(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n < 10) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

function summarise(rows: Row[]) {
  const n = rows.length;
  if (!n) return { n: 0 };
  let bp = 0, bm = 0, lp = 0, lm = 0;
  for (const r of rows) {
    bp += brier(r.p, r.outcome); bm += brier(r.m, r.outcome);
    lp += ll(r.p, r.outcome); lm += ll(r.m, r.outcome);
  }
  return {
    n,
    brierModel: r3(bp / n), brierMarket: r3(bm / n),
    gap: r3((bp - bm) / n), // + = model worse
    gapTotal: r1(bp - bm), // summed: where the gap comes from
    logLossModel: r3(lp / n), logLossMarket: r3(lm / n)
  };
}

function groupBy(rows: Row[], key: (r: Row) => string | null, order?: string[]) {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const k = key(r);
    if (k === null) continue;
    (map.get(k) || map.set(k, []).get(k)!).push(r);
  }
  const keys = order ? order.filter(k => map.has(k)) : [...map.keys()].sort();
  return keys.map(k => ({ group: k, ...summarise(map.get(k)!) }));
}

export function gapReport(season: string, model = 'grid-v3') {
  const preds = db.prepare(`
    SELECT p.division, p.date, p.home, p.away, p.outcome, p.p_home, p.p_draw, p.p_away, p.odds_home, p.odds_draw, p.odds_away
    FROM backtest_predictions p
    WHERE p.run_id IN (SELECT MAX(id) FROM backtest_runs WHERE season = ? AND model = ? AND finished_at IS NOT NULL GROUP BY grp)
  `).all(season, model) as any[];
  if (!preds.length) return { season, model, n: 0, note: 'No finished backtest for this model and season.' };

  const hist = db.prepare(`
    SELECT division, season, date, home, away, hg, ag, sh_h, sh_a, sot_h, sot_a, cor_h, cor_a
    FROM history_matches ORDER BY date`).all() as Hist[];
  const logs = teamLogs(hist);
  const statsCoverage = hist.filter(h => h.season === season && h.sot_h !== null).length / Math.max(1, hist.filter(h => h.season === season).length);

  // previous season's division per team (for "promoted")
  const prevSeason = String(Number(season.slice(0, 2)) - 1).padStart(2, '0') + String(Number(season.slice(2)) - 1).padStart(2, '0');
  const prevDiv = new Map<string, string>();
  for (const h of hist) if (h.season === prevSeason) { prevDiv.set(h.home, h.division); prevDiv.set(h.away, h.division); }

  const rows: Row[] = [];
  for (const r of preds) {
    if (!r.odds_home || !r.odds_draw || !r.odds_away) continue;
    const s = 1 / r.odds_home + 1 / r.odds_draw + 1 / r.odds_away;
    const m = [1 / r.odds_home / s, 1 / r.odds_draw / s, 1 / r.odds_away / s];
    const p = [r.p_home / 100, r.p_draw / 100, r.p_away / 100];
    const H8 = before(logs.get(r.home), r.date, 8), A8 = before(logs.get(r.away), r.date, 8);
    const H3 = H8.slice(-3), A3 = A8.slice(-3);
    const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);
    const sotDiff = diff(avg(H8, g => (g.sotF === null || g.sotA === null ? null : g.sotF - g.sotA)), avg(A8, g => (g.sotF === null || g.sotA === null ? null : g.sotF - g.sotA)));
    const shotDiff = diff(avg(H8, g => (g.shF === null || g.shA === null ? null : g.shF - g.shA)), avg(A8, g => (g.shF === null || g.shA === null ? null : g.shF - g.shA)));
    const cornerDiff = diff(avg(H8, g => (g.corF === null || g.corA === null ? null : g.corF - g.corA)), avg(A8, g => (g.corF === null || g.corA === null ? null : g.corF - g.corA)));
    const finishLuck = diff(avg(H8, g => (g.sotF === null ? null : g.gf - 0.3 * g.sotF)), avg(A8, g => (g.sotF === null ? null : g.gf - 0.3 * g.sotF)));
    const defLuck = diff(avg(H8, g => (g.sotA === null ? null : g.ga - 0.3 * g.sotA)), avg(A8, g => (g.sotA === null ? null : g.ga - 0.3 * g.sotA)));
    const gdDiff = diff(avg(H8, g => g.gf - g.ga), avg(A8, g => g.gf - g.ga));
    const gd3 = (xs: TeamGame[]) => (xs.length === 3 ? xs.reduce((t, g) => t + g.gf - g.ga, 0) / 3 : null);
    const gdDiff3 = diff(gd3(H3), gd3(A3));
    const days = (xs: TeamGame[]) => (xs.length ? Math.min(10, (new Date(r.date).getTime() - new Date(xs[xs.length - 1].date).getTime()) / 86400000) : null);
    const dh = days(H8), da = days(A8);
    const restDiff = dh === null || da === null ? null : dh - da;
    const promH = prevDiv.has(r.home) && prevDiv.get(r.home) !== r.division ? 1 : 0;
    const promA = prevDiv.has(r.away) && prevDiv.get(r.away) !== r.division ? 1 : 0;
    const lg = (x: number) => Math.log(Math.max(1e-6, x));
    const marketGap = (lg(m[0]) - lg(m[2]) - (lg(p[0]) - lg(p[2]))) / 2;
    rows.push({
      division: r.division, date: r.date, home: r.home, away: r.away, outcome: r.outcome as O, p, m,
      f: { sotDiff, shotDiff, cornerDiff, finishLuck, defLuck, gdDiff, gdDiff3, restDiff, promotedDiff: promH - promA, marketGap },
      promoted: !!(promH || promA), restMin: dh === null || da === null ? null : Math.min(dh, da), month: Number(r.date.slice(5, 7))
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const half = Math.floor(rows.length / 2);
  const train = rows.slice(0, half), test = rows.slice(half);

  // 1. where the gap comes from
  const favB = (r: Row) => {
    const f = Math.max(r.m[0], r.m[2]);
    return f < 0.4 ? '<40%' : f < 0.5 ? '40-50%' : f < 0.6 ? '50-60%' : f < 0.7 ? '60-70%' : '70%+';
  };
  const disB = (r: Row) => {
    const d = Math.max(...r.p.map((x, i) => Math.abs(x - r.m[i])));
    return d < 0.03 ? '<3pp' : d < 0.06 ? '3-6pp' : d < 0.1 ? '6-10pp' : '10pp+';
  };
  const phase = (r: Row) => (r.month >= 7 && r.month <= 9 ? 'Aug-Sep' : r.month >= 10 && r.month <= 12 ? 'Oct-Dec' : r.month <= 3 ? 'Jan-Mar' : 'Apr-Jun');
  // who is right when they disagree on the home win (actual home-win rate vs each side's average)
  const disagree = (lo: number, hi: number) => {
    const sel = rows.filter(r => { const d = r.p[0] - r.m[0]; return d >= lo && d < hi; });
    if (sel.length < 20) return null;
    const act = sel.filter(r => r.outcome === 'H').length / sel.length;
    const pm = sel.reduce((s, r) => s + r.p[0], 0) / sel.length, mm = sel.reduce((s, r) => s + r.m[0], 0) / sel.length;
    return { n: sel.length, modelHome: r1(pm * 100), marketHome: r1(mm * 100), actualHome: r1(act * 100) };
  };

  // 2. candidate information
  const features = FEATURES.map(({ key, label }) => {
    const b = fitTilt(train, key);
    const tr = test.filter(r => r.f[key] !== null);
    let base = 0, adj = 0, baseLL = 0, adjLL = 0;
    for (const r of tr) {
      const q = tilt(r.p, b * (r.f[key] as number));
      base += brier(r.p, r.outcome); adj += brier(q, r.outcome);
      baseLL += ll(r.p, r.outcome); adjLL += ll(q, r.outcome);
    }
    const withF = rows.filter(r => r.f[key] !== null);
    const c = corr(withF.map(r => r.f[key] as number), withF.map(r => r.m[0] - r.m[2] - (r.p[0] - r.p[2])));
    return {
      feature: key, label, coverage: r1((withF.length / rows.length) * 100), b: r3(b),
      testN: tr.length,
      brierGainX1000: tr.length ? r3(((base - adj) / tr.length) * 1000) : null, // + = feature helps v3 out of sample
      logLossGainX1000: tr.length ? r3(((baseLL - adjLL) / tr.length) * 1000) : null,
      corrWithMarketGap: c === null ? null : r3(c) // + = the market already prices this and v3 doesn't
    };
  }).sort((x, y) => (y.brierGainX1000 ?? -99) - (x.brierGainX1000 ?? -99));

  // draw side: is the market's draw price better than ours?
  const drawCal = (() => {
    const b = (p: number) => (p < 0.22 ? '<22%' : p < 0.26 ? '22-26%' : p < 0.3 ? '26-30%' : '30%+');
    const map = new Map<string, { n: number; pm: number; mm: number; act: number }>();
    for (const r of rows) {
      const k = b(r.m[1]);
      const e = map.get(k) || { n: 0, pm: 0, mm: 0, act: 0 };
      e.n++; e.pm += r.p[1]; e.mm += r.m[1]; e.act += r.outcome === 'D' ? 1 : 0;
      map.set(k, e);
    }
    return ['<22%', '22-26%', '26-30%', '30%+'].filter(k => map.has(k)).map(k => {
      const e = map.get(k)!;
      return { marketDraw: k, n: e.n, modelDraw: r1((e.pm / e.n) * 100), market: r1((e.mm / e.n) * 100), actual: r1((e.act / e.n) * 100) };
    });
  })();

  return {
    season, model, n: rows.length, statsCoverage: r1(statsCoverage * 100),
    overall: summarise(rows),
    byDivision: groupBy(rows, r => r.division),
    byFavourite: groupBy(rows, favB, ['<40%', '40-50%', '50-60%', '60-70%', '70%+']),
    byPhase: groupBy(rows, phase, ['Aug-Sep', 'Oct-Dec', 'Jan-Mar', 'Apr-Jun']),
    byPromoted: groupBy(rows, r => (r.promoted ? 'promoted team involved' : 'no promoted team')),
    byRest: groupBy(rows, r => (r.restMin === null ? null : r.restMin < 4 ? 'a team on <4 days rest' : 'both 4+ days')),
    byDisagreement: groupBy(rows, disB, ['<3pp', '3-6pp', '6-10pp', '10pp+']),
    whoIsRightOnHome: {
      modelHigherBy10plus: disagree(0.1, 1), modelHigher5to10: disagree(0.05, 0.1), close: disagree(-0.05, 0.05),
      marketHigher5to10: disagree(-0.1, -0.05), marketHigherBy10plus: disagree(-1, -0.1)
    },
    drawCalibration: drawCal,
    features
  };
}
