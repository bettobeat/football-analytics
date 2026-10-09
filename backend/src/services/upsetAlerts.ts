/**
 * Upset alerts (Pro) — research step (Oct 2026).
 *
 * Idea (same as draw alerts): the bookmakers make a team the clear outsider, but our model gives it a much better
 * chance. Bookmaker prices are only used here, behind the scenes, to choose alerts and to measure them; they are
 * never shown on the public site and never feed the model.
 *
 *   our win chance = market chance + K × (v3 chance − market chance)
 *   alert when the team is the outsider (market chance ≤ CUT), v3 ≥ market + MIN_GAP, and
 *   our chance × early price − 1 is between MIN_EDGE and MAX_EDGE
 *
 * backtestUpsets(): walk-forward v3 backtests (latest run per season × group), priced at the early price, with the
 * share of alerts where the price then shortened (moved our way) by the close.
 */
import { db } from '../db';

export interface UpsetRule { K: number; cut: number; minGap: number; minEdge: number; maxEdge: number }
export const UPSET_RULE: UpsetRule = { K: 0.75, cut: 0.33, minGap: 0.04, minEdge: 0.03, maxEdge: 0.3 };

function fair(o: (number | null)[]): number[] | null {
  if (o.some(x => !x || x <= 1)) return null;
  const inv = o.map(x => 1 / (x as number));
  const s = inv.reduce((a, b) => a + b, 0);
  return inv.map(x => x / s);
}

interface Row { season: string; grp: string; division: string; ph: number; pa: number; out: string; eh: number | null; ed: number | null; ea: number | null; ch: number | null; cd: number | null; ca: number | null }

function rows(): Row[] {
  const runs = db.prepare(`
    SELECT r.id, r.season, r.grp FROM backtest_runs r
    WHERE r.model = 'grid-v3' AND r.finished_at IS NOT NULL
      AND r.id = (SELECT MAX(id) FROM backtest_runs x WHERE x.model = r.model AND x.season = r.season AND x.grp = r.grp AND x.finished_at IS NOT NULL)
  `).all() as any[];
  const q = db.prepare(`
    SELECT division, p_home ph, p_away pa, outcome out, early_h eh, early_d ed, early_a ea, odds_home ch, odds_draw cd, odds_away ca
    FROM backtest_predictions WHERE run_id = ?
  `);
  const out: Row[] = [];
  for (const r of runs) for (const x of q.all(r.id) as any[]) out.push({ ...x, season: r.season, grp: r.grp });
  return out;
}

/** The alert for one side of one match, or null. v3 in %, prices decimal. */
export function upsetOf(v3: number, side: 0 | 2, early: (number | null)[], rule: UpsetRule = UPSET_RULE) {
  const f = fair(early);
  if (!f) return null;
  const mkt = f[side], price = early[side] as number;
  const p = v3 / 100;
  if (mkt > rule.cut || p < mkt + rule.minGap) return null;
  const ours = mkt + rule.K * (p - mkt);
  const edge = ours * price - 1;
  if (edge < rule.minEdge || edge > rule.maxEdge) return null;
  return { mkt, ours, price, edge };
}

function evalRule(list: Row[], rule: UpsetRule) {
  let n = 0, wins = 0, profit = 0, moved = 0, movedN = 0, sumMkt = 0, sumOurs = 0;
  const games = new Set<Row>();
  for (const r of list) {
    const early = [r.eh, r.ed, r.ea];
    for (const side of [0, 2] as const) {
      const a = upsetOf(side === 0 ? r.ph : r.pa, side, early, rule);
      if (!a) continue;
      n++; games.add(r);
      const won = r.out === (side === 0 ? 'H' : 'A');
      if (won) wins++;
      profit += won ? a.price - 1 : -1;
      sumMkt += a.mkt; sumOurs += a.ours;
      const close = side === 0 ? r.ch : r.ca;
      if (close && close > 1 && close !== a.price) { movedN++; if (close < a.price) moved++; }
    }
  }
  const p1 = (x: number) => Math.round(x * 10) / 10;
  return {
    alerts: n, games: games.size, winRate: n ? p1((100 * wins) / n) : null,
    expectedByMarket: n ? p1((100 * sumMkt) / n) : null, expectedByUs: n ? p1((100 * sumOurs) / n) : null,
    roi: n ? p1((100 * profit) / n) : null, movedOurWay: movedN ? p1((100 * moved) / movedN) : null
  };
}

/**
 * Backtest: the current rule per season, plus a grid fitted on every season but the newest and scored on the newest.
 */
export function backtestUpsets(rule: Partial<UpsetRule> = {}, grid = false) {
  const all = rows().filter(r => r.eh && r.ed && r.ea);
  const seasons = [...new Set(all.map(r => r.season))].sort();
  const R: UpsetRule = { ...UPSET_RULE, ...rule };
  const out: any = {
    rows: all.length, seasons, rule: R,
    bySeason: Object.fromEntries(seasons.map(s => [s, evalRule(all.filter(r => r.season === s), R)])),
    byGroup: Object.fromEntries([...new Set(all.map(r => r.grp))].sort().map(g => [g, evalRule(all.filter(r => r.grp === g), R)]))
  };
  if (grid && seasons.length >= 2) {
    const test = seasons[seasons.length - 1];
    const train = all.filter(r => r.season !== test), hold = all.filter(r => r.season === test);
    const res: any[] = [];
    for (const K of [0.5, 0.75, 1]) for (const cut of [0.25, 0.33, 0.4]) for (const minGap of [0, 0.04, 0.08])
      for (const minEdge of [0.02, 0.05, 0.1]) for (const maxEdge of [0.2, 0.3, 0.5]) {
        const r: UpsetRule = { K, cut, minGap, minEdge, maxEdge };
        const tr = evalRule(train, r);
        if (tr.alerts < 150) continue; // too few to judge
        res.push({ rule: r, train: tr, test: evalRule(hold, r) });
      }
    res.sort((a, b) => (b.train.roi ?? -99) - (a.train.roi ?? -99));
    out.grid = { trainSeasons: seasons.slice(0, -1), testSeason: test, tried: res.length, best: res.slice(0, 12) };
  }
  return out;
}
