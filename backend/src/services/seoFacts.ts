/**
 * Facts for search-engine pages (fix124, Oct 2026): recent results, next games, head-to-head and table positions,
 * from our own tables and the tables already in memory — never a provider call while a page is rendered.
 * Same data visitors see; never the pick or a percentage.
 */
import { db } from '../db';
import footballDataAPI from './footballDataAPI';
import { afStandingsCached } from './afMatches';
import { isPreseason } from './bbModel';

/* ---------- football ---------- */

export interface FbGame { id: number; date: string; comp: string | null; code: string | null; homeId: number | null; home: string; awayId: number | null; away: string; hg: number | null; ag: number | null }
const COLS = `p.match_id AS id, MAX(p.utc_date) AS date, MAX(p.competition_name) AS comp, MAX(p.competition_code) AS code,
  MAX(p.home_team_id) AS homeId, MAX(p.home_team) AS home, MAX(p.away_team_id) AS awayId, MAX(p.away_team) AS away`;

/** A team's last finished games (newest first), with scores. */
export function fbLast(teamId: number, n = 5, before = new Date().toISOString()): FbGame[] {
  return db.prepare(`SELECT ${COLS}, MAX(r.home_goals) AS hg, MAX(r.away_goals) AS ag FROM predictions p JOIN results r ON r.match_id = p.match_id
    WHERE (p.home_team_id = ? OR p.away_team_id = ?) AND p.utc_date < ? AND r.outcome IN ('H','D','A')
    GROUP BY p.match_id ORDER BY date DESC LIMIT ?`).all(teamId, teamId, before, n) as any[];
}
/** A team's next games (soonest first). */
export function fbNext(teamId: number, n = 5): FbGame[] {
  return (db.prepare(`SELECT ${COLS}, NULL AS hg, NULL AS ag FROM predictions p
    WHERE (p.home_team_id = ? OR p.away_team_id = ?) AND p.utc_date >= ? GROUP BY p.match_id ORDER BY date LIMIT ?`)
    .all(teamId, teamId, new Date().toISOString(), n) as any[]);
}
/** Last meetings of two teams (newest first). */
export function fbH2h(a: number, b: number, before: string, n = 5): FbGame[] {
  return db.prepare(`SELECT ${COLS}, MAX(r.home_goals) AS hg, MAX(r.away_goals) AS ag FROM predictions p JOIN results r ON r.match_id = p.match_id
    WHERE ((p.home_team_id = ? AND p.away_team_id = ?) OR (p.home_team_id = ? AND p.away_team_id = ?)) AND p.utc_date < ? AND r.outcome IN ('H','D','A')
    GROUP BY p.match_id ORDER BY date DESC LIMIT ?`).all(a, b, b, a, before, n) as any[];
}
/** W / D / L of a finished game for one team. */
export const fbWdl = (g: FbGame, teamId: number): 'W' | 'D' | 'L' => {
  const mine = g.homeId === teamId ? g.hg! : g.ag!, theirs = g.homeId === teamId ? g.ag! : g.hg!;
  return mine > theirs ? 'W' : mine === theirs ? 'D' : 'L';
};

export interface TableRow { pos: number; teamId: number; team: string; played: number; won: number; draw: number; lost: number; gd: number; pts: number }
/** The league table already in memory (Football-Data.org or API-Football), main table only. */
export function fbTable(code: string | null): TableRow[] {
  if (!code) return [];
  let st: any = null;
  try { st = code.startsWith('AF') ? afStandingsCached(code) : footballDataAPI.standings.get(code); } catch { st = null; }
  const total = (st?.standings || []).find((s: any) => s.type === 'TOTAL') || st?.standings?.[0];
  return (total?.table || []).map((r: any) => ({
    pos: r.position, teamId: r.team?.id, team: r.team?.shortName || r.team?.name, played: r.playedGames, won: r.won, draw: r.draw, lost: r.lost, gd: r.goalDifference, pts: r.points
  })).filter((r: TableRow) => r.team);
}
export const fbPosition = (code: string | null, teamId: number | null) => (teamId ? fbTable(code).find(r => r.teamId === teamId) || null : null);

/** This week's games of a competition (from 3 days ago to 4 days ahead). */
export function fbWeek(code: string): FbGame[] {
  const from = new Date(Date.now() - 3 * 86400000).toISOString(), to = new Date(Date.now() + 4 * 86400000).toISOString();
  return db.prepare(`SELECT ${COLS}, MAX(r.home_goals) AS hg, MAX(r.away_goals) AS ag FROM predictions p LEFT JOIN results r ON r.match_id = p.match_id AND r.outcome IN ('H','D','A')
    WHERE p.competition_code = ? AND p.utc_date >= ? AND p.utc_date <= ? GROUP BY p.match_id ORDER BY date`).all(code, from, to) as any[];
}
/** Games of one UTC day (any status), every competition. */
export function fbDay(dayIso: string): FbGame[] {
  const from = `${dayIso}T00:00:00.000Z`, to = `${dayIso}T23:59:59.999Z`;
  return db.prepare(`SELECT ${COLS}, MAX(r.home_goals) AS hg, MAX(r.away_goals) AS ag FROM predictions p LEFT JOIN results r ON r.match_id = p.match_id AND r.outcome IN ('H','D','A')
    WHERE p.utc_date >= ? AND p.utc_date <= ? GROUP BY p.match_id ORDER BY date`).all(from, to) as any[];
}

/* ---------- basketball ---------- */

export interface BbGameRow { id: number; date: string; code: string; season: string; homeId: number; home: string; awayId: number; away: string; hs: number | null; as_: number | null; status: string | null }
const BB_COLS = `game_id AS id, kickoff AS date, code, season, home_id AS homeId, home_name AS home, away_id AS awayId, away_name AS away, hs, as_, status`;
const BB_DONE = `status IN ('FT','AOT')`;

export function bbGameById(id: number): BbGameRow | null {
  return (db.prepare(`SELECT ${BB_COLS} FROM bb_games WHERE game_id = ?`).get(id) as any) || null;
}
export function bbLast(teamId: number, n = 5, before = new Date().toISOString()): BbGameRow[] {
  return db.prepare(`SELECT ${BB_COLS} FROM bb_games WHERE (home_id = ? OR away_id = ?) AND ${BB_DONE} AND kickoff < ? ORDER BY kickoff DESC LIMIT ?`).all(teamId, teamId, before, n) as any[];
}
export function bbNext(teamId: number, n = 5): BbGameRow[] {
  return db.prepare(`SELECT ${BB_COLS} FROM bb_games WHERE (home_id = ? OR away_id = ?) AND kickoff >= ? AND (status IS NULL OR status NOT IN ('FT','AOT','CANC','POST')) ORDER BY kickoff LIMIT ?`)
    .all(teamId, teamId, new Date().toISOString(), n) as any[];
}
export function bbH2h(a: number, b: number, before: string, n = 5): BbGameRow[] {
  return db.prepare(`SELECT ${BB_COLS} FROM bb_games WHERE ((home_id = ? AND away_id = ?) OR (home_id = ? AND away_id = ?)) AND ${BB_DONE} AND kickoff < ? ORDER BY kickoff DESC LIMIT ?`)
    .all(a, b, b, a, before, n) as any[];
}
export const bbWl = (g: BbGameRow, teamId: number): 'W' | 'L' => ((g.homeId === teamId ? g.hs! > g.as_! : g.as_! > g.hs!) ? 'W' : 'L');
/** Season record in one league (regular games so far; pre-season left out, like the game page). */
export function bbRecord(teamId: number, code: string, season: string, before: string) {
  const rows = (db.prepare(`SELECT home_id, hs, as_, code, kickoff FROM bb_games WHERE code = ? AND season = ? AND (home_id = ? OR away_id = ?) AND ${BB_DONE} AND kickoff < ?`)
    .all(code, season, teamId, teamId, before) as any[]).filter(g => !isPreseason({ code: g.code, kickoff: g.kickoff }));
  const w = rows.filter(g => (g.home_id === teamId ? g.hs > g.as_ : g.as_ > g.hs)).length;
  return { w, l: rows.length - w, n: rows.length };
}
/** League table from our own games: wins, losses (current season, pre-season left out), best win share first. */
export function bbTable(code: string): { teamId: number; team: string; w: number; l: number }[] {
  const s = db.prepare(`SELECT MAX(season) AS s FROM bb_games WHERE code = ? AND ${BB_DONE}`).get(code) as any;
  if (!s?.s) return [];
  const rows = (db.prepare(`SELECT home_id, home_name, away_id, away_name, hs, as_, code, kickoff FROM bb_games WHERE code = ? AND season = ? AND ${BB_DONE}`).all(code, s.s) as any[])
    .filter(g => !isPreseason({ code: g.code, kickoff: g.kickoff }));
  const t = new Map<number, { teamId: number; team: string; w: number; l: number }>();
  const get = (id: number, name: string) => { let x = t.get(id); if (!x) t.set(id, (x = { teamId: id, team: name, w: 0, l: 0 })); return x; };
  for (const r of rows) {
    const h = get(r.home_id, r.home_name), a = get(r.away_id, r.away_name);
    if (r.hs > r.as_) { h.w++; a.l++; } else { a.w++; h.l++; }
  }
  return [...t.values()].sort((a, b) => b.w / Math.max(1, b.w + b.l) - a.w / Math.max(1, a.w + a.l) || b.w - a.w);
}
export function bbWeek(code: string): BbGameRow[] {
  const from = new Date(Date.now() - 3 * 86400000).toISOString(), to = new Date(Date.now() + 4 * 86400000).toISOString();
  return db.prepare(`SELECT ${BB_COLS} FROM bb_games WHERE code = ? AND kickoff >= ? AND kickoff <= ? ORDER BY kickoff`).all(code, from, to) as any[];
}
export function bbDay(dayIso: string): BbGameRow[] {
  return db.prepare(`SELECT ${BB_COLS} FROM bb_games WHERE kickoff >= ? AND kickoff <= ? AND (status IS NULL OR status NOT IN ('CANC','POST')) ORDER BY kickoff`)
    .all(`${dayIso}T00:00:00.000Z`, `${dayIso}T23:59:59.999Z`) as any[];
}
export function bbTeamName(id: number): { name: string; code: string } | null {
  const r = db.prepare(`SELECT CASE WHEN home_id = ? THEN home_name ELSE away_name END AS name, code FROM bb_games WHERE home_id = ? OR away_id = ? ORDER BY kickoff DESC LIMIT 1`).get(id, id, id) as any;
  return r?.name ? { name: r.name, code: r.code } : null;
}
