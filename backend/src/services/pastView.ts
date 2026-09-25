/**
 * "Past predictions" page: what our models would have said on every match of the last seasons
 * (walk-forward backtests — each prediction only used results from before that match), plus an
 * inventory of the data collected so far.
 */
import { db } from '../db';

export const DIVISION_NAMES: Record<string, string> = {
  E0: 'Premier League', E1: 'Championship', SP1: 'La Liga', SP2: 'La Liga 2', I1: 'Serie A', I2: 'Serie B',
  D1: 'Bundesliga', D2: '2. Bundesliga', F1: 'Ligue 1', F2: 'Ligue 2', N1: 'Eredivisie', P1: 'Primeira Liga',
  B1: 'Belgian Pro League', T1: 'Süper Lig', SC0: 'Scottish Premiership', SC1: 'Scottish Championship', G1: 'Greek Super League'
};
export const SEASON_LABEL = (s: string) => `20${s.slice(0, 2)}-${s.slice(2)}`;
const MODELS = ['grid-v3', 'dc-history-v2'];

const PICK = (h: string, d: string, a: string) => `CASE WHEN ${h} >= ${d} AND ${h} >= ${a} THEN 'H' WHEN ${a} >= ${d} THEN 'A' ELSE 'D' END`;
// market favourite = lowest decimal odds
const MPICK = `CASE WHEN odds_home IS NULL THEN NULL WHEN odds_home <= odds_draw AND odds_home <= odds_away THEN 'H' WHEN odds_away <= odds_draw THEN 'A' ELSE 'D' END`;

function latestRuns(season: string, model: string): number[] {
  return (db.prepare(`SELECT MAX(id) AS id FROM backtest_runs WHERE season = ? AND model = ? AND finished_at IS NOT NULL GROUP BY grp`).all(season, model) as any[]).map(r => r.id);
}

export function pastSeasons() {
  const seasons = (db.prepare(`SELECT DISTINCT season FROM backtest_runs WHERE finished_at IS NOT NULL ORDER BY season DESC`).all() as any[]).map(r => r.season);
  return seasons.map(season => {
    const models: Record<string, any> = {};
    for (const model of MODELS) {
      const ids = latestRuns(season, model);
      if (!ids.length) continue;
      const r: any = db.prepare(`
        SELECT COUNT(*) AS n,
               SUM(${PICK('p_home', 'p_draw', 'p_away')} = outcome) AS hits,
               SUM(odds_home IS NOT NULL) AS nm,
               SUM(${MPICK} = outcome) AS mhits,
               SUM(MAX(p_home, p_draw, p_away) >= 60) AS n60,
               SUM(MAX(p_home, p_draw, p_away) >= 60 AND ${PICK('p_home', 'p_draw', 'p_away')} = outcome) AS h60,
               MIN(date) AS first, MAX(date) AS last, COUNT(DISTINCT division) AS leagues
        FROM backtest_predictions WHERE run_id IN (${ids.join(',')})`).get();
      models[model] = {
        n: r.n, hitRate: r.n ? Math.round((r.hits / r.n) * 1000) / 10 : null,
        marketN: r.nm, marketHitRate: r.nm ? Math.round((r.mhits / r.nm) * 1000) / 10 : null,
        strong60: { n: r.n60, hitRate: r.n60 ? Math.round((r.h60 / r.n60) * 1000) / 10 : null },
        first: r.first, last: r.last, leagues: r.leagues
      };
    }
    return { season, label: SEASON_LABEL(season), models };
  }).filter(s => Object.keys(s.models).length);
}

export function pastPredictions(q: { season: string; model: string; division?: string; team?: string; result?: string; page?: number; limit?: number }) {
  const ids = latestRuns(q.season, q.model);
  if (!ids.length) return { total: 0, rows: [], divisions: [] };
  const where: string[] = [`run_id IN (${ids.join(',')})`];
  const args: any[] = [];
  if (q.division) { where.push('division = ?'); args.push(q.division); }
  if (q.team) { where.push('(home LIKE ? OR away LIKE ?)'); args.push(`%${q.team}%`, `%${q.team}%`); }
  if (q.result === 'right') where.push(`${PICK('p_home', 'p_draw', 'p_away')} = outcome`);
  if (q.result === 'wrong') where.push(`${PICK('p_home', 'p_draw', 'p_away')} != outcome`);
  const w = where.join(' AND ');
  const limit = Math.min(200, Math.max(10, q.limit || 50));
  const page = Math.max(1, q.page || 1);
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM backtest_predictions WHERE ${w}`).get(...args) as any).c;
  const rows = (db.prepare(`
    SELECT division, date, home, away, hg, ag, outcome, p_home, p_draw, p_away, odds_home, odds_draw, odds_away
    FROM backtest_predictions WHERE ${w} ORDER BY date DESC, division, home LIMIT ? OFFSET ?`).all(...args, limit, (page - 1) * limit) as any[])
    .map(r => {
      const pick = r.p_home >= r.p_draw && r.p_home >= r.p_away ? 'H' : r.p_away >= r.p_draw ? 'A' : 'D';
      let market: { H: number; D: number; A: number } | null = null;
      if (r.odds_home && r.odds_draw && r.odds_away) {
        const s = 1 / r.odds_home + 1 / r.odds_draw + 1 / r.odds_away;
        market = { H: Math.round(100 / r.odds_home / s), D: Math.round(100 / r.odds_draw / s), A: Math.round(100 / r.odds_away / s) };
      }
      return {
        league: DIVISION_NAMES[r.division] || r.division, division: r.division, date: r.date, home: r.home, away: r.away,
        score: `${r.hg}–${r.ag}`, outcome: r.outcome, pick, hit: pick === r.outcome,
        p: { H: Math.round(r.p_home), D: Math.round(r.p_draw), A: Math.round(r.p_away) }, market
      };
    });
  const divisions = (db.prepare(`SELECT DISTINCT division FROM backtest_predictions WHERE run_id IN (${ids.join(',')}) ORDER BY division`).all() as any[])
    .map(r => ({ code: r.division, name: DIVISION_NAMES[r.division] || r.division }));
  return { total, page, limit, rows, divisions };
}

const count = (sql: string, ...a: any[]) => {
  try {
    return (db.prepare(sql).get(...a) as any)?.c ?? 0;
  } catch {
    return 0;
  }
};

/** What we have collected so far. */
export function dataInventory() {
  let seasons: any[] = [];
  try {
    seasons = db.prepare(`SELECT season, COUNT(*) AS matches, COUNT(DISTINCT division) AS leagues FROM history_matches GROUP BY season ORDER BY season`).all() as any[];
  } catch { /* empty */ }
  const firstNat: any = (() => { try { return db.prepare(`SELECT MIN(date) AS d FROM nat_matches`).get(); } catch { return null; } })();
  return {
    leagueMatches: count(`SELECT COUNT(*) AS c FROM history_matches`),
    leagueTeams: count(`SELECT COUNT(*) AS c FROM (SELECT home FROM history_matches UNION SELECT away FROM history_matches)`),
    leagues: count(`SELECT COUNT(DISTINCT division) AS c FROM history_matches`),
    seasons: seasons.map(s => ({ season: SEASON_LABEL(s.season), matches: s.matches, leagues: s.leagues })),
    withOdds: count(`SELECT COUNT(*) AS c FROM history_matches WHERE close_h IS NOT NULL OR odds_h IS NOT NULL`),
    withShots: count(`SELECT COUNT(*) AS c FROM history_matches WHERE sot_h IS NOT NULL`),
    withXg: count(`SELECT COUNT(*) AS c FROM af_fixtures WHERE xg_h IS NOT NULL`),
    lineups: count(`SELECT COUNT(DISTINCT fixture_id) AS c FROM af_lineups`),
    injuries: count(`SELECT COUNT(*) AS c FROM af_injuries`),
    nationalMatches: count(`SELECT COUNT(*) AS c FROM nat_matches`),
    nationalSince: firstNat?.d ? String(firstNat.d).slice(0, 4) : null,
    cupMatches: count(`SELECT COUNT(*) AS c FROM eur_matches`),
    squadClubs: count(`SELECT COUNT(DISTINCT club) AS c FROM club_value_month`),
    squadMonths: count(`SELECT COUNT(*) AS c FROM club_value_month`),
    players: count(`SELECT COUNT(*) AS c FROM squad_players`),
    backtestPredictions: count(`SELECT COUNT(*) AS c FROM backtest_predictions`),
    livePredictions: count(`SELECT COUNT(*) AS c FROM predictions`),
    liveSettled: count(`SELECT COUNT(DISTINCT match_id) AS c FROM predictions WHERE settled = 1`),
    trackingSince: (() => { try { return (db.prepare(`SELECT MIN(created_at) AS d FROM predictions`).get() as any)?.d?.slice(0, 10) || null; } catch { return null; } })()
  };
}
