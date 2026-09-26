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

/**
 * Club strength at the end of a season, on one scale for top and second divisions. key = team_id.
 * Elo is only comparable within a division (a club that dominates the Championship gains Elo from Championship
 * opponents), so: strength = division base + scale × z-score within the division. Top division: base 0, scale 1.
 * Second division: base −1.8, scale 0.5 → the best Championship side ≈ a bottom-half Premier League side, which is
 * about where promoted clubs end up.
 */
const SECOND_BASE = -1.8, SECOND_SCALE = 0.5;
function clubStrength(seasonYear: number): Map<number, number> {
  const out = new Map<number, number>();
  const asOf = `${seasonYear + 1}-07-01`;
  for (const group of Object.keys(GROUPS)) {
    const divs = GROUPS[group].divisions;
    let all;
    try { all = loadGroupMatches(group); } catch { continue; }
    if (!all.length) continue;
    const st = buildState(group, all, asOf);
    const byName = new Map<string, number>();
    divs.forEach((div, i) => {
      const list = [...st.teams.values()].filter(t => t.division === div);
      if (list.length < 8) return;
      const mean = list.reduce((a, t) => a + t.elo, 0) / list.length;
      const sd = Math.sqrt(list.reduce((a, t) => a + (t.elo - mean) ** 2, 0) / (list.length - 1)) || 1;
      const base = i === 0 ? 0 : SECOND_BASE, scale = i === 0 ? 1 : SECOND_SCALE;
      for (const t of list) byName.set(t.name, base + scale * ((t.elo - mean) / sd));
    });
    for (const r of db.prepare(`SELECT team_id, fd_name FROM af_teams WHERE grp = ? AND fd_name IS NOT NULL`).all(group) as any[]) {
      const z = byName.get(r.fd_name);
      if (z !== undefined) out.set(r.team_id, z);
    }
  }
  return out;
}

/**
 * Player qualities for season Y from season Y-1. The rating adjustment compares a player with his own team-mates
 * (ratings run higher at dominant clubs and in some leagues, so the raw number would double-count club strength).
 */
function playerQualities(seasonYear: number, kRating: number): Map<number, { q: number; name: string }> {
  const prev = seasonYear - 1;
  const strength = clubStrength(prev);
  const rows = (db.prepare(`SELECT player_id, name, team_id, league_id, minutes, rating FROM af_player_season WHERE season = ? AND minutes > 0`).all(prev) as any[])
    .filter(r => LEAGUE_IDS.has(r.league_id) && strength.has(r.team_id)); // league minutes at clubs we rate
  // team average rating (minutes-weighted)
  const teamAvg = new Map<number, { m: number; r: number }>();
  for (const r of rows) if (r.rating) { const t = teamAvg.get(r.team_id) || { m: 0, r: 0 }; t.m += r.minutes; t.r += r.minutes * r.rating; teamAvg.set(r.team_id, t); }
  const acc = new Map<number, { m: number; s: number; rm: number; rd: number; name: string }>();
  for (const r of rows) {
    const z = strength.get(r.team_id)!;
    const a = acc.get(r.player_id) || { m: 0, s: 0, rm: 0, rd: 0, name: r.name };
    a.m += r.minutes;
    a.s += r.minutes * z;
    const ta = teamAvg.get(r.team_id);
    if (r.rating && ta?.m) { a.rm += r.minutes; a.rd += r.minutes * (r.rating - ta.r / ta.m); }
    acc.set(r.player_id, a);
  }
  const out = new Map<number, { q: number; name: string }>();
  acc.forEach((a, id) => {
    if (a.m < MIN_MINUTES) return;
    out.set(id, { q: a.s / a.m + kRating * (a.rm ? a.rd / a.rm : 0), name: a.name });
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
