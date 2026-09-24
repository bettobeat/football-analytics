/**
 * Head-to-head diagnostics between two backtested models on the same matches.
 * Joins backtest_predictions of model A and model B on (division, date, home, away) and breaks the
 * Brier / log-loss gap down by market favourite strength, season phase, league, outcome and
 * disagreement, so we can see WHERE one model loses to the other.
 */
import { db } from '../db';

type O = 'H' | 'D' | 'A';
interface Row {
  division: string; date: string; home: string; away: string; hg: number; ag: number; outcome: O;
  a: [number, number, number]; b: [number, number, number]; m: [number, number, number] | null;
}

const brier = (p: number[], o: O) => {
  const y = [o === 'H' ? 1 : 0, o === 'D' ? 1 : 0, o === 'A' ? 1 : 0];
  return p.reduce((s, x, i) => s + (x - y[i]) ** 2, 0);
};
const ll = (p: number[], o: O) => -Math.log(Math.max(1e-6, p[o === 'H' ? 0 : o === 'D' ? 1 : 2]));
const pickOf = (p: number[]): O => (p[0] >= p[1] && p[0] >= p[2] ? 'H' : p[2] >= p[1] ? 'A' : 'D');
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r1 = (x: number) => Math.round(x * 10) / 10;

function loadPairs(season: string, a: string, b: string): Row[] {
  const rows = db.prepare(`
    SELECT pa.division, pa.date, pa.home, pa.away, pa.hg, pa.ag, pa.outcome,
           pa.p_home AS ah, pa.p_draw AS ad, pa.p_away AS aa,
           pb.p_home AS bh, pb.p_draw AS bd, pb.p_away AS ba,
           pa.odds_home AS oh, pa.odds_draw AS od, pa.odds_away AS oa
    FROM backtest_predictions pa
    JOIN backtest_runs ra ON ra.id = pa.run_id AND ra.season = ? AND ra.model = ?
    JOIN backtest_predictions pb ON pb.division = pa.division AND pb.date = pa.date AND pb.home = pa.home AND pb.away = pa.away
    JOIN backtest_runs rb ON rb.id = pb.run_id AND rb.season = ? AND rb.model = ?
  `).all(season, a, season, b) as any[];
  return rows.map(r => {
    let m: Row['m'] = null;
    if (r.oh && r.od && r.oa) {
      const s = 1 / r.oh + 1 / r.od + 1 / r.oa;
      m = [1 / r.oh / s, 1 / r.od / s, 1 / r.oa / s];
    }
    return {
      division: r.division, date: r.date, home: r.home, away: r.away, hg: r.hg, ag: r.ag, outcome: r.outcome,
      a: [r.ah / 100, r.ad / 100, r.aa / 100], b: [r.bh / 100, r.bd / 100, r.ba / 100], m
    };
  });
}

function summarise(rows: Row[]) {
  const n = rows.length;
  if (!n) return { n: 0 };
  let ba = 0, bb = 0, bm = 0, la = 0, lb = 0, lm = 0, ha = 0, hb = 0, hm = 0, nm = 0, blend = 0;
  for (const r of rows) {
    ba += brier(r.a, r.outcome); bb += brier(r.b, r.outcome);
    la += ll(r.a, r.outcome); lb += ll(r.b, r.outcome);
    if (pickOf(r.a) === r.outcome) ha++;
    if (pickOf(r.b) === r.outcome) hb++;
    blend += brier(r.a.map((x, i) => (x + r.b[i]) / 2), r.outcome);
    if (r.m) { nm++; bm += brier(r.m, r.outcome); lm += ll(r.m, r.outcome); if (pickOf(r.m) === r.outcome) hm++; }
  }
  return {
    n,
    brierA: r3(ba / n), brierB: r3(bb / n), brierMarket: nm ? r3(bm / nm) : null,
    gap: r3((bb - ba) / n), // positive = B worse than A
    gapTotal: r3(bb - ba), // summed over the group: where the gap comes FROM
    logLossA: r3(la / n), logLossB: r3(lb / n), logLossMarket: nm ? r3(lm / nm) : null,
    hitA: r1((ha / n) * 100), hitB: r1((hb / n) * 100), hitMarket: nm ? r1((hm / nm) * 100) : null,
    brierBlendAB: r3(blend / n)
  };
}

function groupBy<K extends string>(rows: Row[], key: (r: Row) => K | null, order?: K[]) {
  const map = new Map<K, Row[]>();
  for (const r of rows) {
    const k = key(r);
    if (k === null) continue;
    (map.get(k) || map.set(k, []).get(k)!).push(r);
  }
  const keys = order ? order.filter(k => map.has(k)) : [...map.keys()];
  return keys.map(k => ({ group: k, ...summarise(map.get(k)!) }));
}

/** Mean predicted probability per outcome vs actual frequency, per model. */
function bias(rows: Row[]) {
  const n = rows.length || 1;
  const mean = (f: (r: Row) => number) => r1((rows.reduce((s, r) => s + f(r), 0) / n) * 100);
  const act = (o: O) => r1((rows.filter(r => r.outcome === o).length / n) * 100);
  const withM = rows.filter(r => r.m);
  const nm = withM.length || 1;
  const meanM = (i: number) => r1((withM.reduce((s, r) => s + r.m![i], 0) / nm) * 100);
  const picks = (sel: (r: Row) => number[]) => {
    const c = { H: 0, D: 0, A: 0 };
    for (const r of rows) c[pickOf(sel(r))]++;
    return c;
  };
  // sharpness: how far from the base rates each model dares to go
  const sharp = (sel: (r: Row) => number[]) => r3(rows.reduce((s, r) => s + Math.abs(sel(r)[0] - sel(r)[2]), 0) / n);
  const toMarket = (sel: (r: Row) => number[]) =>
    r3(withM.reduce((s, r) => s + Math.abs(sel(r)[0] - r.m![0]) + Math.abs(sel(r)[1] - r.m![1]) + Math.abs(sel(r)[2] - r.m![2]), 0) / nm / 2);
  return {
    actual: { H: act('H'), D: act('D'), A: act('A') },
    meanA: { H: mean(r => r.a[0]), D: mean(r => r.a[1]), A: mean(r => r.a[2]) },
    meanB: { H: mean(r => r.b[0]), D: mean(r => r.b[1]), A: mean(r => r.b[2]) },
    meanMarket: { H: meanM(0), D: meanM(1), A: meanM(2) },
    picksA: picks(r => r.a), picksB: picks(r => r.b), picksMarket: picks(r => r.m || [0, 0, 0]),
    sharpness: { A: sharp(r => r.a), B: sharp(r => r.b), market: sharp(r => r.m || [0, 0, 0]) }, // mean |pH - pA|
    distanceToMarket: { A: toMarket(r => r.a), B: toMarket(r => r.b) } // mean total variation distance
  };
}

/** Calibration of one model on draws: predicted draw % bucket vs actual draw rate. */
function drawCalibration(rows: Row[], sel: (r: Row) => number[]) {
  const buckets = [0, 0.2, 0.24, 0.27, 0.3, 0.35, 1];
  const out: any[] = [];
  for (let i = 0; i < buckets.length - 1; i++) {
    const g = rows.filter(r => sel(r)[1] >= buckets[i] && sel(r)[1] < buckets[i + 1]);
    if (!g.length) continue;
    out.push({
      range: `${Math.round(buckets[i] * 100)}–${Math.round(buckets[i + 1] * 100)}%`,
      n: g.length,
      predicted: r1((g.reduce((s, r) => s + sel(r)[1], 0) / g.length) * 100),
      actual: r1((g.filter(r => r.outcome === 'D').length / g.length) * 100)
    });
  }
  return out;
}

export function compareModels(season: string, a: string, b: string) {
  const rows = loadPairs(season, a, b);
  if (!rows.length) return { season, a, b, n: 0, note: 'No overlapping backtest rows — run both backtests for this season first.' };

  const favBucket = (r: Row) => {
    if (!r.m) return null;
    const f = Math.max(r.m[0], r.m[2]);
    return f < 0.4 ? 'fav <40%' : f < 0.5 ? 'fav 40–50%' : f < 0.6 ? 'fav 50–60%' : f < 0.7 ? 'fav 60–70%' : 'fav ≥70%';
  };
  const phase = (r: Row) => {
    const mth = new Date(r.date).getUTCMonth(); // 0 = Jan
    return mth >= 7 && mth <= 8 ? '1 Aug–Sep' : mth >= 9 && mth <= 10 ? '2 Oct–Nov' : mth === 11 || mth === 0 ? '3 Dec–Jan' : mth <= 2 ? '4 Feb–Mar' : '5 Apr–Jun';
  };
  const favSide = (r: Row) => (!r.m ? null : r.m[0] >= r.m[2] ? 'home favourite' : 'away favourite');

  // Disagreement: where A and B differ most on the home-win probability
  const disagreement = groupBy(rows, r => {
    const d = Math.abs(r.a[0] - r.b[0]) + Math.abs(r.a[2] - r.b[2]);
    return d < 0.05 ? 'agree (<5 pts)' : d < 0.1 ? 'differ 5–10' : d < 0.2 ? 'differ 10–20' : 'differ ≥20';
  }, ['agree (<5 pts)', 'differ 5–10', 'differ 10–20', 'differ ≥20']);

  // Who does B over-rate compared to A? Sum per team of (B's win prob − A's win prob) and the Brier cost.
  const teams = new Map<string, { team: string; division: string; n: number; tilt: number; cost: number }>();
  for (const r of rows) {
    const cost = brier(r.b, r.outcome) - brier(r.a, r.outcome);
    for (const [team, idx] of [[r.home, 0], [r.away, 2]] as [string, number][]) {
      const t = teams.get(team) || { team, division: r.division, n: 0, tilt: 0, cost: 0 };
      t.n++; t.tilt += r.b[idx] - r.a[idx]; t.cost += cost;
      teams.set(team, t);
    }
  }
  const teamList = [...teams.values()].map(t => ({ ...t, tilt: r1((t.tilt / t.n) * 100), cost: r3(t.cost) }));
  const worstTeams = teamList.sort((x, y) => y.cost - x.cost).slice(0, 15);

  const worstMatches = rows
    .map(r => ({ r, d: brier(r.b, r.outcome) - brier(r.a, r.outcome) }))
    .sort((x, y) => y.d - x.d)
    .slice(0, 15)
    .map(({ r, d }) => ({
      date: r.date, division: r.division, match: `${r.home} ${r.hg}–${r.ag} ${r.away}`,
      A: r.a.map(x => Math.round(x * 100)), B: r.b.map(x => Math.round(x * 100)), market: r.m ? r.m.map(x => Math.round(x * 100)) : null,
      extraBrier: r3(d)
    }));

  return {
    season, a, b,
    overall: summarise(rows),
    bias: bias(rows),
    drawCalibration: { A: drawCalibration(rows, r => r.a), B: drawCalibration(rows, r => r.b), market: drawCalibration(rows.filter(r => r.m), r => r.m!) },
    byFavourite: groupBy(rows, favBucket, ['fav <40%', 'fav 40–50%', 'fav 50–60%', 'fav 60–70%', 'fav ≥70%']),
    byFavouriteSide: groupBy(rows, favSide),
    byOutcome: groupBy(rows, r => r.outcome, ['H', 'D', 'A']),
    byPhase: groupBy(rows, phase, ['1 Aug–Sep', '2 Oct–Nov', '3 Dec–Jan', '4 Feb–Mar', '5 Apr–Jun']),
    byLeague: groupBy(rows, r => r.division),
    disagreement,
    worstTeams,
    worstMatches
  };
}
