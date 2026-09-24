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

/* ------------------------------------------------------------------ */
/* Draw value test: v3's draw picks at different prices                 */
/* ------------------------------------------------------------------ */

/**
 * For every match, a "draw pick" = the model's draw probability × price − 1 ≥ edge.
 * The same picks are priced four ways: Pinnacle early, market average early, BEST price across
 * bookmakers early, and best price at close. The question: does line shopping turn the draw signal
 * (line moves toward v3) into profit?
 */
export function drawTest(season: string, model: string) {
  const rows = db.prepare(`
    SELECT b.division, b.date, b.home, b.away, b.outcome, b.p_home, b.p_draw, b.p_away,
           b.odds_home AS ch, b.odds_draw AS cd, b.odds_away AS ca, b.early_h AS eh, b.early_d AS ed, b.early_a AS ea,
           h.max_d, h.avg_d, h.maxc_d, h.max_h, h.max_a
    FROM backtest_predictions b
    JOIN backtest_runs r ON r.id = b.run_id AND r.season = ? AND r.model = ?
    LEFT JOIN history_matches h ON h.division = b.division AND h.date = b.date AND h.home = b.home AND h.away = b.away
  `).all(season, model) as any[];
  const withBest = rows.filter(r => r.max_d).length;
  type Src = 'pinnacle' | 'average' | 'best' | 'bestClose';
  const price = (r: any, src: Src): number | null =>
    src === 'pinnacle' ? r.ed : src === 'average' ? r.avg_d : src === 'best' ? r.max_d : r.maxc_d;

  const run = (edge: number, src: Src, filter?: (r: any) => boolean) => {
    let bets = 0, wins = 0, profit = 0, oddsSum = 0, clvSum = 0, moved = 0, clvN = 0;
    for (const r of rows) {
      if (filter && !filter(r)) continue;
      const o = price(r, src);
      if (!o || o <= 1) continue;
      const pd = r.p_draw / 100;
      if (pd * o - 1 < edge) continue;
      bets++;
      oddsSum += o;
      const won = r.outcome === 'D';
      if (won) wins++;
      profit += won ? o - 1 : -1;
      const cf = fair([r.ch, r.cd, r.ca]);
      const ef = fair([r.eh, r.ed, r.ea]);
      if (cf) { clvSum += o * cf[1] - 1; clvN++; if (ef && cf[1] > ef[1]) moved++; }
    }
    return {
      edge, price: src, bets, wins,
      hitRate: bets ? r1((wins / bets) * 100) : null,
      avgOdds: bets ? Math.round((oddsSum / bets) * 100) / 100 : null,
      roi: bets ? r1((profit / bets) * 100) : null,
      avgClv: clvN ? r1((clvSum / clvN) * 100) : null,
      lineMovedOurWay: clvN ? r1((moved / clvN) * 100) : null
    };
  };
  const srcs: Src[] = ['pinnacle', 'average', 'best', 'bestClose'];
  const edges = [0, 0.03, 0.05, 0.1];
  // how much better is the best price than Pinnacle's, on draws?
  const gaps = rows.filter(r => r.max_d && r.ed).map(r => r.max_d / r.ed - 1);
  const avgGap = gaps.length ? r1((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 100) : null;
  const byDivision = [...new Set(rows.map(r => r.division))].sort().map(d => ({ division: d, ...run(0.05, 'best', r => r.division === d) }));
  const bands = [
    { name: 'v3 draw < 26%', f: (r: any) => r.p_draw < 26 },
    { name: 'v3 draw 26–30%', f: (r: any) => r.p_draw >= 26 && r.p_draw < 30 },
    { name: 'v3 draw ≥ 30%', f: (r: any) => r.p_draw >= 30 }
  ].map(b => ({ band: b.name, ...run(0.05, 'best', b.f) }));
  return {
    season, model, matches: rows.length, withBestPrice: withBest,
    bestVsPinnacleDraw: avgGap, // % higher odds on average
    grid: edges.map(e => ({ edge: e, byPrice: srcs.map(s => run(e, s)) })),
    byDrawBand: bands,
    byDivision,
    note: withBest ? undefined : 'best/average prices missing — re-sync history seasons to load the Max/Avg columns'
  };
}
