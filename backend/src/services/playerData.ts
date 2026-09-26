/**
 * Player data for the future "player quality" row (replaces / sits next to squad value).
 *
 * Why: Transfermarkt-datasets only values players while their club plays in a covered league, so promoted
 * clubs look almost worthless (Hull 2026: €24m). API-Football has every player's season in every league we
 * follow — minutes, rating, goals, assists — including second divisions (Championship, Segunda, Serie B…).
 *
 * What we store: one row per player × team × league × season (af_player_season).
 * How it is filled: /players?team=&season= (20 players per page, usually 2–3 pages per team), for every team
 * that played in our API-Football leagues in the last 3 seasons, drip-fed from the API-Football tick inside the
 * daily budget (never touching the live reserve). Past seasons once; the current season refreshed weekly.
 *
 * Next step (after the data is in): player quality = minutes-weighted strength (cross-division Elo) of the
 * club each player played for last season, adjusted by his rating; squad / XI quality = the average of the
 * players who play now. Backtested before it goes into v3.
 */
import { db } from '../db';
import logger from '../utils/logger';
import { afGet, afBudgetLeft } from './apiFootball';
import { seasonCodes } from './history';

db.exec(`
  CREATE TABLE IF NOT EXISTS af_player_season (
    player_id INTEGER NOT NULL,
    season    INTEGER NOT NULL,
    team_id   INTEGER NOT NULL,
    league_id INTEGER NOT NULL,
    name      TEXT,
    age       INTEGER,
    position  TEXT,
    apps      INTEGER,
    starts    INTEGER,
    minutes   INTEGER,
    rating    REAL,
    goals     INTEGER,
    assists   INTEGER,
    PRIMARY KEY (player_id, season, team_id, league_id)
  );
  CREATE INDEX IF NOT EXISTS idx_aps_team ON af_player_season(team_id, season);
  CREATE TABLE IF NOT EXISTS af_player_sync (
    team_id INTEGER NOT NULL, season INTEGER NOT NULL, done_at TEXT NOT NULL, pages INTEGER, players INTEGER,
    PRIMARY KEY (team_id, season)
  );
`);

const PAGES_PER_TICK = parseInt(process.env.API_FOOTBALL_PLAYERS_PER_TICK || '120', 10);
const CURRENT_REFRESH_MS = 7 * 86400000;
const afSeason = (code: string) => 2000 + parseInt(code.slice(0, 2), 10);

/** (team, season) pairs still to fetch: every team in af_fixtures for the last 3 seasons; most recent season first. */
function queue(): { team_id: number; season: number }[] {
  const seasons = seasonCodes(3).map(afSeason);
  const cur = seasons[0];
  const rows = db.prepare(`
    SELECT DISTINCT t.team_id, t.season FROM (
      SELECT home_id AS team_id, season FROM af_fixtures WHERE season IN (${seasons.join(',')})
      UNION SELECT away_id AS team_id, season FROM af_fixtures WHERE season IN (${seasons.join(',')})
    ) t
    LEFT JOIN af_player_sync s ON s.team_id = t.team_id AND s.season = t.season
    WHERE s.team_id IS NULL OR (t.season = ? AND s.done_at < ?)
    ORDER BY t.season DESC, t.team_id
  `).all(cur, new Date(Date.now() - CURRENT_REFRESH_MS).toISOString()) as any[];
  return rows;
}

const num = (x: any) => (x === null || x === undefined || x === '' ? null : Number(x));

async function syncTeamSeason(teamId: number, season: number, budget: { left: number }) {
  const ins = db.prepare(`
    INSERT OR REPLACE INTO af_player_season (player_id, season, team_id, league_id, name, age, position, apps, starts, minutes, rating, goals, assists)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let page = 1, total = 1, players = 0, pages = 0;
  while (page <= total) {
    if (budget.left < 1 || afBudgetLeft() < 1) return false; // resume next tick
    const j: any = await afGet('/players', { team: teamId, season, page });
    budget.left--;
    pages++;
    total = j.paging?.total || 1;
    db.exec('BEGIN');
    try {
      for (const p of j.response || []) {
        players++;
        for (const s of p.statistics || []) {
          if (!s.league?.id || s.team?.id !== teamId) continue;
          if (/friendl/i.test(s.league?.name || '')) continue;
          const g = s.games || {};
          ins.run(p.player.id, season, teamId, s.league.id, p.player.name, num(p.player.age), g.position || null,
            num(g.appearences), num(g.lineups), num(g.minutes), num(g.rating), num(s.goals?.total), num(s.goals?.assists));
        }
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    page++;
  }
  db.prepare(`INSERT OR REPLACE INTO af_player_sync (team_id, season, done_at, pages, players) VALUES (?, ?, ?, ?, ?)`)
    .run(teamId, season, new Date().toISOString(), pages, players);
  return true;
}

/** One drip step, called from the API-Football tick. Returns a short note. */
export async function syncPlayerData(maxPages = PAGES_PER_TICK): Promise<string | null> {
  const q = queue();
  if (!q.length) return null;
  const budget = { left: maxPages };
  let teams = 0;
  for (const t of q) {
    if (budget.left < 1 || afBudgetLeft() < 1) break;
    try {
      if (await syncTeamSeason(t.team_id, t.season, budget)) teams++;
    } catch (e: any) {
      logger.warn(`player data ${t.team_id}/${t.season}: ${e.message}`);
      break;
    }
  }
  return teams ? `${teams} team-seasons of player data (${q.length - teams} left)` : null;
}

export function playerDataStatus() {
  const seasons = seasonCodes(3).map(afSeason);
  const bySeason = seasons.map(s => {
    const done: any = db.prepare(`SELECT COUNT(*) n, SUM(pages) pages FROM af_player_sync WHERE season = ?`).get(s);
    const rows: any = db.prepare(`SELECT COUNT(*) n, COUNT(DISTINCT player_id) players FROM af_player_season WHERE season = ?`).get(s);
    return { season: s, teamsDone: done.n, pages: done.pages || 0, rows: rows.n, players: rows.players };
  });
  const left = queue();
  return { perTick: PAGES_PER_TICK, teamSeasonsLeft: left.length, estCallsLeft: Math.round(left.length * 2.6), bySeason };
}

/** A team's players in one season (all competitions except friendlies). */
export function teamPlayers(teamId: number, season: number) {
  return db.prepare(`
    SELECT player_id, name, age, position, SUM(apps) apps, SUM(starts) starts, SUM(minutes) minutes,
           ROUND(SUM(rating * minutes) / NULLIF(SUM(CASE WHEN rating IS NOT NULL THEN minutes END), 0), 2) rating,
           SUM(goals) goals, SUM(assists) assists
    FROM af_player_season WHERE team_id = ? AND season = ?
    GROUP BY player_id ORDER BY minutes DESC`).all(teamId, season);
}
