/**
 * Goals calibration: are our expected goals (xG) too high or too low for the goal markets?
 *
 * For each data set it re-scores over/under 1.5 and 2.5 and both-teams-to-score with every expected-goals value
 * multiplied by k (0.75 … 1.15) and reports, per k: predicted vs actual goals, predicted vs actual rates, hit rates
 * (pick = the side we give 50%+) and log loss. The best k = the lowest total log loss.
 *
 * Data sets:
 *  - leagues: the latest v3 backtest runs (seasons 2025-26 and 2026-27, every group), expected goals per match as
 *    the model had them before kick-off (backtest_predictions)
 *  - national: the last two years of national-team matches (nationalElo's test set), split by friendlies /
 *    competitive / finals too
 *  - live: every settled prediction we saved before kick-off (predictions + results), by model
 *
 * Nothing here changes the model: CONV.goalScale (leagues) and NAT_GOAL_SCALE (national teams) do, once chosen.
 */
import { db } from '../db';
import { nationalGoalsTestSet } from './nationalElo';

interface Row { lh: number; la: number; hg: number; ag: number }

const KS = [0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15];

function evaluate(rows: Row[]) {
  const n = rows.length;
  if (!n) return { n: 0, actual: null, byK: [], bestK: null };
  const act = {
    goals: rows.reduce((a, r) => a + r.hg + r.ag, 0) / n,
    over25: rows.filter(r => r.hg + r.ag > 2.5).length / n,
    over15: rows.filter(r => r.hg + r.ag > 1.5).length / n,
    btts: rows.filter(r => r.hg > 0 && r.ag > 0).length / n
  };
  const r2 = (x: number) => Math.round(x * 1000) / 1000;
  const p1 = (x: number) => Math.round(x * 1000) / 10;
  const ll = (p: number, y: boolean) => -Math.log(Math.max(1e-6, y ? p : 1 - p));
  const byK = KS.map(k => {
    let g = 0, o25 = 0, o15 = 0, bt = 0, h25 = 0, h15 = 0, hbt = 0, l25 = 0, l15 = 0, lbt = 0;
    for (const r of rows) {
      const lh = r.lh * k, la = r.la * k, lam = lh + la;
      const e = Math.exp(-lam);
      const pO25 = 1 - e * (1 + lam + (lam * lam) / 2);
      const pO15 = 1 - e * (1 + lam);
      const pBt = (1 - Math.exp(-lh)) * (1 - Math.exp(-la));
      const y25 = r.hg + r.ag > 2.5, y15 = r.hg + r.ag > 1.5, ybt = r.hg > 0 && r.ag > 0;
      g += lam; o25 += pO25; o15 += pO15; bt += pBt;
      if ((pO25 >= 0.5) === y25) h25++;
      if ((pO15 >= 0.5) === y15) h15++;
      if ((pBt >= 0.5) === ybt) hbt++;
      l25 += ll(pO25, y25); l15 += ll(pO15, y15); lbt += ll(pBt, ybt);
    }
    return {
      k,
      predicted: { goals: r2(g / n), over25: p1(o25 / n), over15: p1(o15 / n), btts: p1(bt / n) },
      hitRate: { over25: p1(h25 / n), over15: p1(h15 / n), btts: p1(hbt / n) },
      logLoss: { over25: r2(l25 / n), over15: r2(l15 / n), btts: r2(lbt / n), total: r2((l25 + l15 + lbt) / n) }
    };
  });
  const best = [...byK].sort((a, b) => a.logLoss.total - b.logLoss.total)[0];
  return {
    n,
    actual: { goals: r2(act.goals), over25: p1(act.over25), over15: p1(act.over15), btts: p1(act.btts) },
    atOne: byK.find(x => x.k === 1),
    bestK: best.k,
    best,
    byK
  };
}

function leagueRows(seasons: string[]): { all: Row[]; byGroup: Map<string, Row[]> } {
  // the latest v3 run per season × group (runs are replaced when re-run)
  const runs = db
    .prepare(`SELECT id, grp, params FROM backtest_runs WHERE model = 'grid-v3' AND season IN (${seasons.map(() => '?').join(',')}) AND finished_at IS NOT NULL`)
    .all(...seasons) as any[];
  const all: Row[] = [];
  const byGroup = new Map<string, Row[]>();
  for (const run of runs) {
    let k0 = 1;
    try { k0 = Number(JSON.parse(run.params || '{}').goalScale) || 1; } catch { /* old runs: 1 */ }
    const rows = db.prepare(`SELECT xg_home, xg_away, hg, ag FROM backtest_predictions WHERE run_id = ? AND xg_home IS NOT NULL AND xg_away IS NOT NULL`).all(run.id) as any[];
    const list = rows.map(r => ({ lh: r.xg_home / k0, la: r.xg_away / k0, hg: r.hg, ag: r.ag }));
    all.push(...list);
    byGroup.set(run.grp, [...(byGroup.get(run.grp) || []), ...list]);
  }
  return { all, byGroup };
}

function liveRows() {
  const rows = db.prepare(`
    SELECT p.model, p.xg_home, p.xg_away, r.home_goals hg, r.away_goals ag
    FROM predictions p JOIN results r ON r.match_id = p.match_id
    WHERE p.settled = 1 AND r.outcome IN ('H','D','A') AND p.xg_home IS NOT NULL AND p.xg_away IS NOT NULL
      AND p.model IN ('grid-v3', 'elo-intl', 'elo-euro')`).all() as any[];
  const byModel = new Map<string, Row[]>();
  for (const r of rows) byModel.set(r.model, [...(byModel.get(r.model) || []), { lh: r.xg_home, la: r.xg_away, hg: r.hg, ag: r.ag }]);
  return byModel;
}

export function goalsCalibration(seasons = ['2526', '2627'], withGroups = false) {
  const t0 = Date.now();
  const lg = leagueRows(seasons);
  let nat: (Row & { kind: string })[] = [];
  try { nat = nationalGoalsTestSet(); } catch { /* national model not built yet */ }
  const live = liveRows();
  const summary = (e: ReturnType<typeof evaluate>) =>
    e.n ? { n: e.n, actual: e.actual, atOne: e.atOne, bestK: e.bestK, best: e.best } : { n: 0 };
  return {
    ms: Date.now() - t0,
    seasons,
    leagues: evaluate(lg.all),
    leagueGroups: withGroups ? Object.fromEntries([...lg.byGroup.entries()].map(([g, rows]) => [g, summary(evaluate(rows))])) : undefined,
    national: evaluate(nat),
    nationalByKind: Object.fromEntries(['friendly', 'competitive', 'finals'].map(k => [k, summary(evaluate(nat.filter(r => r.kind === k)))])),
    live: Object.fromEntries([...live.entries()].map(([m, rows]) => [m, summary(evaluate(rows))]))
  };
}
