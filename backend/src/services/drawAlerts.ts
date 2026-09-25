/**
 * Draw alerts page: one place for the draw signal.
 *
 * Rule (same as the match page and the Accuracy page):
 *   our draw chance = bookmakers' draw chance + 0.75 × (v3 draw − bookmakers' draw)
 *   alert when v3's draw ≥ 30%, our draw chance × draw price − 1 ≥ 2%, and the league is not La Liga.
 *
 * Three views:
 *   upcoming – open v3 predictions that meet the rule now (recorded market price)
 *   live     – settled v3 predictions that met the rule (recorded price at lock), made live or backfilled
 *   history  – walk-forward backtests, priced at the best early price, with the line movement to close
 */
import { db } from '../db';
import { DIVISION_NAMES } from './pastView';

const K = 0.75, MIN_EDGE = 0.02, MIN_V3 = 30;
const EXCLUDED = new Set(['PD']); // La Liga: the signal did not hold there
const r1 = (x: number) => Math.round(x * 10) / 10;

function fair(o: (number | null)[]): number[] | null {
  if (o.some(x => !x || x <= 1)) return null;
  const inv = o.map(x => 1 / (x as number));
  const s = inv.reduce((a, b) => a + b, 0);
  return inv.map(x => x / s);
}

function alertOf(pDraw: number, odds: (number | null)[], price: number | null) {
  if (pDraw < MIN_V3 || !price) return null;
  const f = fair(odds);
  if (!f) return null;
  const mkt = f[1];
  const ours = mkt + K * (pDraw / 100 - mkt);
  const edge = ours * price - 1;
  if (edge < MIN_EDGE) return null;
  return { marketDraw: r1(mkt * 100), ourDraw: r1(ours * 100), price, edge: r1(edge * 100) };
}

let hasBackfilled: boolean | null = null;
function backfilledCol() {
  if (hasBackfilled === null) hasBackfilled = (db.prepare(`PRAGMA table_info(predictions)`).all() as any[]).some(c => c.name === 'backfilled');
  return hasBackfilled;
}

function upcoming() {
  const now = new Date().toISOString();
  const rows = db.prepare(`
    SELECT match_id, competition_code, competition_name, utc_date, home_team, away_team, p_home, p_draw, p_away, odds_home, odds_draw, odds_away
    FROM predictions
    WHERE model = 'grid-v3' AND settled = 0 AND locked = 0 AND utc_date > ? AND odds_draw IS NOT NULL
    ORDER BY utc_date
  `).all(now) as any[];
  const out: any[] = [];
  for (const r of rows) {
    if (EXCLUDED.has(r.competition_code)) continue;
    const a = alertOf(r.p_draw, [r.odds_home, r.odds_draw, r.odds_away], r.odds_draw);
    if (!a) continue;
    out.push({ matchId: r.match_id, league: r.competition_name || r.competition_code, date: r.utc_date, home: r.home_team, away: r.away_team, v3: { H: r.p_home, D: r.p_draw, A: r.p_away }, ...a });
  }
  return out;
}

function live() {
  const bf = backfilledCol() ? 'p.backfilled' : '0';
  const rows = db.prepare(`
    SELECT p.match_id, p.competition_code, p.competition_name, p.utc_date, p.home_team, p.away_team,
           p.p_home, p.p_draw, p.p_away, p.odds_home, p.odds_draw, p.odds_away, ${bf} AS backfilled,
           r.home_goals, r.away_goals, r.outcome
    FROM predictions p JOIN results r ON r.match_id = p.match_id
    WHERE p.model = 'grid-v3' AND p.settled = 1 AND r.outcome IN ('H','D','A') AND p.odds_draw IS NOT NULL
    ORDER BY p.utc_date DESC
  `).all() as any[];
  const alerts: any[] = [];
  let all = 0, allDraws = 0;
  const sum = { live: { n: 0, wins: 0, profit: 0 }, backfilled: { n: 0, wins: 0, profit: 0 } };
  for (const r of rows) {
    if (EXCLUDED.has(r.competition_code)) continue;
    all++;
    if (r.outcome === 'D') allDraws++;
    const a = alertOf(r.p_draw, [r.odds_home, r.odds_draw, r.odds_away], r.odds_draw);
    if (!a) continue;
    const won = r.outcome === 'D';
    const s = r.backfilled ? sum.backfilled : sum.live;
    s.n++;
    if (won) s.wins++;
    s.profit += won ? r.odds_draw - 1 : -1;
    alerts.push({
      matchId: r.match_id, league: r.competition_name || r.competition_code, date: r.utc_date, home: r.home_team, away: r.away_team,
      score: r.home_goals !== null ? `${r.home_goals}-${r.away_goals}` : null, won, backfilled: !!r.backfilled, ...a
    });
  }
  const pack = (s: { n: number; wins: number; profit: number }) => ({ n: s.n, wins: s.wins, hitRate: s.n ? r1((s.wins / s.n) * 100) : null, roi: s.n ? r1((s.profit / s.n) * 100) : null });
  const both = { n: sum.live.n + sum.backfilled.n, wins: sum.live.wins + sum.backfilled.wins, profit: sum.live.profit + sum.backfilled.profit };
  return {
    live: pack(sum.live), backfilled: pack(sum.backfilled), total: pack(both),
    baseline: { matches: all, drawRate: all ? r1((allDraws / all) * 100) : null },
    alerts: alerts.slice(0, 300)
  };
}

const SEASON_LABEL: Record<string, string> = { '2324': '2023-24', '2425': '2024-25', '2526': '2025-26', '2627': '2026-27' };

function history() {
  const seasons = (db.prepare(`SELECT DISTINCT season FROM backtest_runs WHERE model = 'grid-v3' ORDER BY season`).all() as any[]).map(r => r.season);
  const out: any[] = [];
  for (const season of seasons) {
    const rows = db.prepare(`
      SELECT b.division, b.outcome, b.p_draw, b.odds_home AS ch, b.odds_draw AS cd, b.odds_away AS ca,
             b.early_h AS eh, b.early_d AS ed, b.early_a AS ea, h.max_d
      FROM backtest_predictions b
      JOIN backtest_runs r ON r.id = b.run_id AND r.season = ? AND r.model = 'grid-v3'
      LEFT JOIN history_matches h ON h.division = b.division AND h.date = b.date AND h.home = b.home AND h.away = b.away
    `).all(season) as any[];
    let matches = 0, draws = 0, n = 0, wins = 0, profit = 0, moved = 0, movedN = 0;
    const byDiv = new Map<string, { n: number; wins: number; profit: number }>();
    for (const r of rows) {
      if (r.division.startsWith('SP')) continue;
      matches++;
      if (r.outcome === 'D') draws++;
      const a = alertOf(r.p_draw, [r.eh, r.ed, r.ea], r.max_d);
      if (!a) continue;
      const won = r.outcome === 'D';
      n++;
      if (won) wins++;
      profit += won ? r.max_d - 1 : -1;
      const d = byDiv.get(r.division) || byDiv.set(r.division, { n: 0, wins: 0, profit: 0 }).get(r.division)!;
      d.n++;
      if (won) d.wins++;
      d.profit += won ? r.max_d - 1 : -1;
      const ef = fair([r.eh, r.ed, r.ea]), cf = fair([r.ch, r.cd, r.ca]);
      if (ef && cf) { movedN++; if (cf[1] > ef[1]) moved++; }
    }
    if (!n) continue;
    out.push({
      season, label: SEASON_LABEL[season] || season, matches, drawRate: matches ? r1((draws / matches) * 100) : null,
      alerts: n, wins, hitRate: r1((wins / n) * 100), roi: r1((profit / n) * 100),
      lineMovedOurWay: movedN ? r1((moved / movedN) * 100) : null,
      byLeague: [...byDiv.entries()].map(([division, d]) => ({ division, league: DIVISION_NAMES[division] || division, n: d.n, hitRate: r1((d.wins / d.n) * 100), roi: r1((d.profit / d.n) * 100) })).sort((a, b) => b.n - a.n)
    });
  }
  return out;
}

export function drawAlertsReport() {
  return { rule: { k: K, minEdge: MIN_EDGE * 100, minV3Draw: MIN_V3, excluded: [...EXCLUDED] }, upcoming: upcoming(), ...live(), history: history() };
}
