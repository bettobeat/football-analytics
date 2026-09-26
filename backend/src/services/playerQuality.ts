/**
 * Player quality → squad quality, for v3 row #1p (next to / instead of squad value #1).
 *
 * Player quality for season Y (known before it starts) = how strong the clubs he played for were in season Y-1,
 * weighted by his league minutes there, plus a small adjustment for his average match rating:
 *     q = Σ minutes × strength(club, end of Y-1) / Σ minutes  +  K_RATING × (rating − 6.75)
 * Club strength = its v3 Elo at the end of Y-1 as a z-score against its group's top division (so a regular
 * Championship starter at a top Championship club lands below a Premier League regular, not at zero). Elo already
 * carries clubs across divisions, so promoted and relegated sides are on the same scale.
 *
 * Squad quality for club T in season Y = mean quality of its 14 best-rated known players among those who play for T
 * in Y (membership only; their Y minutes are not used as weights). Fewer than 8 known players → unknown (neutral).
 *
 * Data: af_player_season (services/playerData.ts), af_teams (API-Football id ↔ our history names).
 * Only the leagues we collect are covered: a player who came from elsewhere is unknown.
 */
import { db } from '../db';
import logger from '../utils/logger';
import { GROUPS, loadGroupMatches } from './history';
import { buildState, clearPlayerQualityCache } from './gridModel';
import { AF_LEAGUES } from './apiFootball';

db.exec(`
  CREATE TABLE IF NOT EXISTS team_player_quality (
    season  INTEGER NOT NULL,   -- API-Football season year (2025 = 2025-26)
    grp     TEXT NOT NULL,
    fd_name TEXT NOT NULL,
    team_id INTEGER NOT NULL,
    pq      REAL,               -- squad quality (z units), null = unknown
    known   INTEGER NOT NULL,   -- players with a quality
    squad   INTEGER NOT NULL,   -- players who played for the club this season
    top     TEXT,               -- best players and their quality (for checking)
    PRIMARY KEY (season, grp, fd_name)
  );
`);

const LEAGUE_IDS = new Set(AF_LEAGUES.map(l => l.id));
const TOP_N = 14, MIN_KNOWN = 8, MIN_MINUTES = 300;

/** Club strength at the end of a season: Elo z-score vs the group's top division. key = team_id */
function clubStrength(seasonYear: number): Map<number, number> {
  const out = new Map<number, number>();
  const asOf = `${seasonYear + 1}-07-01`;
  for (const group of Object.keys(GROUPS)) {
    const top = GROUPS[group].divisions[0];
    let all;
    try { all = loadGroupMatches(group); } catch { continue; }
    if (!all.length) continue;
    const st = buildState(group, all, asOf);
    const topElos = [...st.teams.values()].filter(t => t.division === top).map(t => t.elo);
    if (topElos.length < 8) continue;
    const mean = topElos.reduce((a, b) => a + b, 0) / topElos.length;
    const sd = Math.sqrt(topElos.reduce((a, b) => a + (b - mean) ** 2, 0) / (topElos.length - 1)) || 1;
    const byName = new Map([...st.teams.values()].map(t => [t.name, (t.elo - mean) / sd]));
    for (const r of db.prepare(`SELECT team_id, fd_name FROM af_teams WHERE grp = ? AND fd_name IS NOT NULL`).all(group) as any[]) {
      const z = byName.get(r.fd_name);
      if (z !== undefined) out.set(r.team_id, z);
    }
  }
  return out;
}

/** Player qualities for season Y from season Y-1. */
function playerQualities(seasonYear: number, kRating: number): Map<number, { q: number; name: string }> {
  const prev = seasonYear - 1;
  const strength = clubStrength(prev);
  const rows = db.prepare(`SELECT player_id, name, team_id, league_id, minutes, rating FROM af_player_season WHERE season = ? AND minutes > 0`).all(prev) as any[];
  const acc = new Map<number, { m: number; s: number; rm: number; r: number; name: string }>();
  for (const r of rows) {
    if (!LEAGUE_IDS.has(r.league_id)) continue; // league minutes only (cups and European games excluded)
    const z = strength.get(r.team_id);
    if (z === undefined) continue;
    const a = acc.get(r.player_id) || { m: 0, s: 0, rm: 0, r: 0, name: r.name };
    a.m += r.minutes;
    a.s += r.minutes * z;
    if (r.rating) { a.rm += r.minutes; a.r += r.minutes * r.rating; }
    acc.set(r.player_id, a);
  }
  const out = new Map<number, { q: number; name: string }>();
  acc.forEach((a, id) => {
    if (a.m < MIN_MINUTES) return;
    const rating = a.rm ? a.r / a.rm : 6.75;
    out.set(id, { q: a.s / a.m + kRating * (rating - 6.75), name: a.name });
  });
  return out;
}

export function rebuildPlayerQuality(seasons: number[] = [2025, 2026], kRating = 0.5) {
  const t0 = Date.now();
  const report: any[] = [];
  const ins = db.prepare(`INSERT OR REPLACE INTO team_player_quality (season, grp, fd_name, team_id, pq, known, squad, top) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const season of seasons) {
    const q = playerQualities(season, kRating);
    const teams = db.prepare(`SELECT grp, team_id, fd_name FROM af_teams WHERE fd_name IS NOT NULL`).all() as any[];
    let known = 0, total = 0;
    db.exec('BEGIN');
    try {
      db.prepare(`DELETE FROM team_player_quality WHERE season = ?`).run(season);
      for (const t of teams) {
        const players = db.prepare(`SELECT DISTINCT player_id FROM af_player_season WHERE team_id = ? AND season = ? AND minutes > 0`).all(t.team_id, season) as any[];
        if (!players.length) continue;
        total++;
        const qs = players.map(p => q.get(p.player_id)).filter(Boolean) as { q: number; name: string }[];
        qs.sort((a, b) => b.q - a.q);
        const top = qs.slice(0, TOP_N);
        const pq = top.length >= MIN_KNOWN ? top.reduce((s, x) => s + x.q, 0) / top.length : null;
        if (pq !== null) known++;
        ins.run(season, t.grp, t.fd_name, t.team_id, pq, qs.length, players.length, JSON.stringify(top.slice(0, 5).map(x => [x.name, Math.round(x.q * 100) / 100])));
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    report.push({ season, playersRated: q.size, teams: total, teamsWithQuality: known });
  }
  clearPlayerQualityCache();
  logger.info(`Player quality rebuilt in ${Date.now() - t0} ms: ${JSON.stringify(report)}`);
  return { ms: Date.now() - t0, kRating, report };
}

export function playerQualityTable(season: number, grp?: string) {
  return db.prepare(`SELECT grp, fd_name, pq, known, squad, top FROM team_player_quality WHERE season = ? ${grp ? 'AND grp = ?' : ''} ORDER BY pq DESC`)
    .all(...(grp ? [season, grp] : [season]))
    .map((r: any) => ({ ...r, pq: r.pq === null ? null : Math.round(r.pq * 100) / 100, top: r.top ? JSON.parse(r.top) : [] }));
}
