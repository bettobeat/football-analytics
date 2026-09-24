/**
 * "Can we beat the market?" — three tests on a backtested model, against bookmaker prices.
 *
 * 1. Information test (blend): mix the model into the closing market, p ∝ market^(1−w) · model^w.
 *    If some w > 0 scores better than the market alone, the model carries information the price lacks.
 * 2. Closing-line value (CLV): when the model disagrees with the EARLY price (1–3 days out) by ≥ edge,
 *    take that price and compare it with the fair CLOSING price. Positive average CLV = the line moves
 *    our way = a real, bettable edge, even if the model never beats the closing line overall.
 * 3. Where: the same numbers per division (top and second tiers), per outcome (H/D/A) and per edge size.
 */
import { db } from '../db';

type O = 'H' | 'D' | 'A';
const IDX: Record<O, number> = { H: 0, D: 1, A: 2 };
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r1 = (x: number) => Math.round(x * 10) / 10;

interface Row {
  division: string; date: string; home: string; away: string; outcome: O;
  model: number[]; close: number[] | null; closeOdds: number[] | null; early: number[] | null; earlyOdds: number[] | null;
}

function fair(o: (number | null)[]): number[] | null {
  if (o.some(x => !x || x <= 1)) return null;
  const inv = o.map(x => 1 / (x as number));
  const s = inv.reduce((a, b) => a + b, 0);
  return inv.map(x => x / s);
}
const brier = (p: number[], o: O) => p.reduce((s, x, i) => s + (x - (i === IDX[o] ? 1 : 0)) ** 2, 0);
const ll = (p: number[], o: O) => -Math.log(Math.max(1e-6, p[IDX[o]]));
function blend(m: number[], k: number[], w: number) {
  const raw = m.map((x, i) => Math.pow(Math.max(1e-6, x), 1 - w) * Math.pow(Math.max(1e-6, k[i]), w));
  const s = raw.reduce((a, b) => a + b, 0);
  return raw.map(x => x / s);
}

function load(season: string, model: string): Row[] {
  const rows = db.prepare(`
    SELECT b.* FROM backtest_predictions b JOIN backtest_runs r ON r.id = b.run_id
    WHERE r.season = ? AND r.model = ?
  `).all(season, model) as any[];
  return rows.map(r => {
    const closeOdds = [r.odds_home, r.odds_draw, r.odds_away];
    const earlyOdds = [r.early_h, r.early_d, r.early_a];
    return {
      division: r.division, date: r.date, home: r.home, away: r.away, outcome: r.outcome,
      model: [r.p_home / 100, r.p_draw / 100, r.p_away / 100],
      close: fair(closeOdds), closeOdds: closeOdds.every((x: any) => x > 1) ? closeOdds : null,
      early: fair(earlyOdds), earlyOdds: earlyOdds.every((x: any) => x > 1) ? earlyOdds : null
    };
  });
}

function infoTest(rows: Row[]) {
  const withClose = rows.filter(r => r.close);
  const n = withClose.length;
  if (!n) return null;
  const weights = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 1];
  const curve = weights.map(w => {
    let b = 0, l = 0;
    for (const r of withClose) { const p = blend(r.close!, r.model, w); b += brier(p, r.outcome); l += ll(p, r.outcome); }
    return { w, brier: r3(b / n), logLoss: r3(l / n) };
  });
  const best = curve.reduce((a, c) => (c.logLoss < a.logLoss ? c : a), curve[0]);
  // same against the EARLY market: does the model add to the price available when you'd bet?
  const withEarly = rows.filter(r => r.early);
  const ne = withEarly.length;
  const curveEarly = ne
    ? weights.map(w => {
        let b = 0, l = 0;
        for (const r of withEarly) { const p = blend(r.early!, r.model, w); b += brier(p, r.outcome); l += ll(p, r.outcome); }
        return { w, brier: r3(b / ne), logLoss: r3(l / ne) };
      })
    : [];
  const bestEarly = curveEarly.length ? curveEarly.reduce((a, c) => (c.logLoss < a.logLoss ? c : a), curveEarly[0]) : null;
  return {
    n,
    vsClose: { curve, best, gainLogLoss: r3(curve[0].logLoss - best.logLoss) },
    vsEarly: { n: ne, curve: curveEarly, best: bestEarly, gainLogLoss: bestEarly ? r3(curveEarly[0].logLoss - bestEarly.logLoss) : null },
    verdict:
      best.w === 0
        ? 'no information beyond the closing price'
        : `adds information to the closing price (best mix: ${Math.round(best.w * 100)}% model)`
  };
}

/** Value bets at the early price; CLV = early decimal odds ÷ fair closing odds − 1. */
function clvTest(rows: Row[], edge: number, filter?: (r: Row, o: number) => boolean) {
  let bets = 0, wins = 0, profit = 0, clvSum = 0, clvPos = 0, towardUs = 0;
  for (const r of rows) {
    if (!r.early || !r.earlyOdds || !r.close) continue;
    for (let i = 0; i < 3; i++) {
      if (filter && !filter(r, i)) continue;
      const ev = r.model[i] * r.earlyOdds[i] - 1; // expected value at the early price, by the model
      if (ev < edge) continue;
      bets++;
      const won = IDX[r.outcome] === i;
      if (won) wins++;
      profit += won ? r.earlyOdds[i] - 1 : -1;
      const clv = r.earlyOdds[i] * r.close[i] - 1; // early odds vs fair closing odds (1/close prob)
      clvSum += clv;
      if (clv > 0) clvPos++;
      if (r.close[i] > r.early[i]) towardUs++; // market moved toward the model's side
    }
  }
  return {
    edge, bets, wins,
    roi: bets ? r1((profit / bets) * 100) : null,
    avgClv: bets ? r1((clvSum / bets) * 100) : null, // % — the number pros watch
    clvPositive: bets ? r1((clvPos / bets) * 100) : null,
    lineMovedOurWay: bets ? r1((towardUs / bets) * 100) : null
  };
}

export function marketTest(season: string, model: string) {
  const rows = load(season, model);
  if (!rows.length) return { season, model, n: 0, note: 'no backtest rows — run the backtest first' };
  const edges = [0.02, 0.05, 0.1, 0.15];
  const divisions = [...new Set(rows.map(r => r.division))].sort();
  const mean = (arr: Row[], f: (r: Row) => number | null) => {
    const v = arr.map(f).filter((x): x is number => x !== null);
    return v.length ? r3(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  return {
    season, model, n: rows.length,
    brier: {
      model: mean(rows, r => brier(r.model, r.outcome)),
      marketEarly: mean(rows, r => (r.early ? brier(r.early, r.outcome) : null)),
      marketClose: mean(rows, r => (r.close ? brier(r.close, r.outcome) : null))
    },
    information: infoTest(rows),
    clv: edges.map(e => clvTest(rows, e)),
    clvByOutcome: (['H', 'D', 'A'] as O[]).map(o => ({ outcome: o, ...clvTest(rows, 0.05, (_r, i) => i === IDX[o]) })),
    byDivision: divisions.map(d => {
      const sub = rows.filter(r => r.division === d);
      const info = infoTest(sub);
      return {
        division: d, n: sub.length,
        brierModel: mean(sub, r => brier(r.model, r.outcome)),
        brierClose: mean(sub, r => (r.close ? brier(r.close, r.outcome) : null)),
        blendBestW: info?.vsClose.best.w ?? null,
        blendGainLogLoss: info?.vsClose.gainLogLoss ?? null,
        clv5: clvTest(sub, 0.05)
      };
    })
  };
}
