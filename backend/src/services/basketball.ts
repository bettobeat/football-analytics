/**
 * Basketball data (API-Basketball, api-sports.io — same account and key as API-Football, its own daily quota).
 *
 * Step 1 (Oct 2026): collect every game of our 4 leagues for the last 5 seasons and keep the current season up to date.
 *   bb_leagues  league id, name, the seasons the provider has
 *   bb_games    one row per game: date, teams, status, final score, quarter scores
 * The model, game pages and the public basketball site come next, built on this table.
 *
 * Admin: GET /api/bb/status (quota, games per league/season), GET /api/bb/raw?path=/leagues&search=…
 */
import logger from '../utils/logger';
import { db } from '../db';
import { buildAll, recordBbPredictions } from './bbModel';

const BASE = 'https://v1.basketball.api-sports.io';
const KEY = () => process.env.API_BASKETBALL_KEY || process.env.API_FOOTBALL_KEY || '';
const MIN_GAP_MS = 400;
const SEASONS_BACK = 5;

/** Our leagues. `id` is API-Basketball's league id; `search` finds it again if an id is wrong (checked on every sync). */
export const BB_LEAGUES: { code: string; id: number; name: string; country: string; search: string }[] = [
  { code: 'NBA', id: 12, name: 'NBA', country: 'USA', search: 'NBA' },
  { code: 'EL', id: 120, name: 'EuroLeague', country: 'Europe', search: 'Euroleague' },
  { code: 'ACB', id: 117, name: 'Liga ACB', country: 'Spain', search: 'ACB' },
  { code: 'LBA', id: 52, name: 'Lega Basket Serie A', country: 'Italy', search: 'Lega A' }
];

db.exec(`
  CREATE TABLE IF NOT EXISTS bb_leagues (
    code TEXT PRIMARY KEY, league_id INTEGER NOT NULL, name TEXT NOT NULL, country TEXT, logo TEXT,
    seasons TEXT NOT NULL DEFAULT '[]', checked_at TEXT
  );
  CREATE TABLE IF NOT EXISTS bb_games (
    game_id   INTEGER PRIMARY KEY,
    code      TEXT NOT NULL,
    league_id INTEGER NOT NULL,
    season    TEXT NOT NULL,
    stage     TEXT,
    kickoff   TEXT NOT NULL,
    status    TEXT,
    home_id   INTEGER NOT NULL, home_name TEXT NOT NULL, home_logo TEXT,
    away_id   INTEGER NOT NULL, away_name TEXT NOT NULL, away_logo TEXT,
    hs INTEGER, as_ INTEGER,
    quarters  TEXT,               -- JSON {home:[q1..q4,ot], away:[...]}
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_bb_games_code_kickoff ON bb_games(code, kickoff);
  CREATE TABLE IF NOT EXISTS bb_sync (key TEXT PRIMARY KEY, done_at TEXT NOT NULL, info TEXT);
  CREATE TABLE IF NOT EXISTS bb_team_stats (
    game_id INTEGER NOT NULL, team_id INTEGER NOT NULL,
    fgm INTEGER, fga INTEGER, tpm INTEGER, tpa INTEGER, ftm INTEGER, fta INTEGER,
    reb INTEGER, oreb INTEGER, dreb INTEGER, ast INTEGER, stl INTEGER, blk INTEGER, tov INTEGER, pf INTEGER,
    PRIMARY KEY (game_id, team_id)
  );
  CREATE TABLE IF NOT EXISTS bb_player_stats (
    game_id INTEGER NOT NULL, team_id INTEGER NOT NULL, player_id INTEGER NOT NULL, name TEXT,
    starter INTEGER, minutes REAL, pts INTEGER, fgm INTEGER, fga INTEGER, tpm INTEGER, tpa INTEGER, ftm INTEGER, fta INTEGER,
    reb INTEGER, ast INTEGER,
    PRIMARY KEY (game_id, player_id)
  );
  CREATE INDEX IF NOT EXISTS idx_bb_player_stats_player ON bb_player_stats(player_id);
`);
// box scores fetched? 0 = not yet, 1 = stored, 2 = the provider has none
try { db.exec(`ALTER TABLE bb_games ADD COLUMN stats INTEGER NOT NULL DEFAULT 0`); } catch { /* column exists */ }

let lastCall = 0;
let remainingDay: number | null = null;
let limitDay: number | null = null;
let lastError: string | null = null;
let calls = 0;
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function bb(path: string, params: Record<string, string | number> = {}): Promise<any> {
  if (!KEY()) throw new Error('No API-Sports key set');
  if (path !== '/status' && remainingDay !== null && remainingDay <= 50) throw new Error('API-Basketball daily limit nearly used up');
  const wait = lastCall + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { 'x-apisports-key': KEY() }, signal: AbortSignal.timeout(30_000) });
  calls++;
  const rem = res.headers.get('x-ratelimit-requests-remaining');
  const lim = res.headers.get('x-ratelimit-requests-limit');
  if (rem) remainingDay = parseInt(rem, 10);
  if (lim) limitDay = parseInt(lim, 10);
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
  const json: any = await res.json();
  const errs = json.errors;
  if (errs && ((Array.isArray(errs) && errs.length) || (!Array.isArray(errs) && Object.keys(errs).length))) {
    lastError = `${path}: ${JSON.stringify(errs)}`;
    throw new Error(lastError);
  }
  return json;
}
export const bbGet = (path: string, params: Record<string, string | number> = {}) => bb(path, params);

const markSync = (key: string, info: any = null) =>
  db.prepare(`INSERT OR REPLACE INTO bb_sync (key, done_at, info) VALUES (?, ?, ?)`).run(key, new Date().toISOString(), info ? JSON.stringify(info) : null);
const syncedAt = (key: string): number | null => {
  const r: any = db.prepare(`SELECT done_at FROM bb_sync WHERE key = ?`).get(key);
  return r ? new Date(r.done_at).getTime() : null;
};

/** League details and the seasons the provider has (re-checked daily). A wrong id is replaced by a name search. */
async function syncLeague(l: (typeof BB_LEAGUES)[number]) {
  const prev: any = db.prepare(`SELECT * FROM bb_leagues WHERE code = ?`).get(l.code);
  if (prev?.checked_at && Date.now() - new Date(prev.checked_at).getTime() < 24 * 3600 * 1000) return prev;
  let row = (await bb('/leagues', { id: prev?.league_id || l.id })).response?.[0];
  const looksRight = (r: any) => r && (r.country?.name === l.country || (l.country === 'Europe' && /europe|world/i.test(r.country?.name || ''))) &&
    new RegExp(l.search, 'i').test(r.name || '');
  if (!looksRight(row)) {
    const found = (await bb('/leagues', { search: l.search })).response || [];
    row = found.find(looksRight) || null;
    if (!row) throw new Error(`league ${l.code} not found (id ${l.id})`);
    logger.info(`API-Basketball: ${l.code} is league ${row.id} (${row.name}, ${row.country?.name})`);
  }
  const seasons = (row.seasons || []).map((s: any) => String(s.season)).sort();
  db.prepare(`INSERT OR REPLACE INTO bb_leagues (code, league_id, name, country, logo, seasons, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(l.code, row.id, row.name, row.country?.name || null, row.logo || null, JSON.stringify(seasons), new Date().toISOString());
  return db.prepare(`SELECT * FROM bb_leagues WHERE code = ?`).get(l.code);
}

const FINISHED = new Set(['FT', 'AOT']);

/** Store games from API-Basketball (insert or update; the box-score flag of a stored game is kept). */
function upsertGames(code: string, leagueId: number, season: string, list: any[]) {
  const up = db.prepare(`
    INSERT INTO bb_games (game_id, code, league_id, season, stage, kickoff, status, home_id, home_name, home_logo,
      away_id, away_name, away_logo, hs, as_, quarters, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(game_id) DO UPDATE SET code = excluded.code, league_id = excluded.league_id, season = excluded.season, stage = excluded.stage,
      kickoff = excluded.kickoff, status = excluded.status, home_id = excluded.home_id, home_name = excluded.home_name, home_logo = excluded.home_logo,
      away_id = excluded.away_id, away_name = excluded.away_name, away_logo = excluded.away_logo, hs = excluded.hs, as_ = excluded.as_,
      quarters = excluded.quarters, updated_at = excluded.updated_at`);
  const now = new Date().toISOString();
  let n = 0, done = 0;
  db.exec('BEGIN');
  try {
    for (const g of list) {
      if (!g.id || !g.teams?.home?.id || !g.teams?.away?.id) continue;
      const st = g.status?.short || null;
      const q = (x: any) => [x?.quarter_1, x?.quarter_2, x?.quarter_3, x?.quarter_4, x?.over_time].map((v: any) => (v == null ? null : Number(v)));
      up.run(
        g.id, code, leagueId, season, g.stage || g.week || null, new Date(g.date).toISOString(), st,
        g.teams.home.id, g.teams.home.name, g.teams.home.logo || null, g.teams.away.id, g.teams.away.name, g.teams.away.logo || null,
        g.scores?.home?.total ?? null, g.scores?.away?.total ?? null,
        JSON.stringify({ home: q(g.scores?.home), away: q(g.scores?.away) }), now
      );
      n++;
      if (FINISHED.has(st)) done++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { n, done };
}

/** Every game of a league season (one request). */
async function syncSeason(code: string, leagueId: number, season: string) {
  const json = await bb('/games', { league: leagueId, season });
  const { n, done } = upsertGames(code, leagueId, season, json.response || []);
  markSync(`games|${code}|${season}`, { n, done });
  return n;
}

/**
 * Live scores: once a minute while one of our games is on (from 10 minutes before tip-off until it is final),
 * that day's games of that league (one request per league and day).
 */
let liveRunning = false;
async function liveTick() {
  if (liveRunning || !KEY()) return;
  liveRunning = true;
  try {
    const now = Date.now();
    const rows = db.prepare(`SELECT DISTINCT code, league_id, season, substr(kickoff, 1, 10) AS day FROM bb_games
      WHERE kickoff BETWEEN ? AND ? AND (status IS NULL OR status NOT IN ('FT','AOT','CANC','POST','ABD','AWD'))`)
      .all(new Date(now - 4 * 3600 * 1000).toISOString(), new Date(now + 10 * 60 * 1000).toISOString()) as any[];
    for (const r of rows) {
      const json = await bb('/games', { league: r.league_id, season: r.season, date: r.day });
      upsertGames(r.code, r.league_id, r.season, json.response || []);
    }
  } catch (e: any) {
    logger.warn(`API-Basketball live: ${e.message}`);
  } finally {
    liveRunning = false;
  }
}

const num = (x: any) => (x === null || x === undefined || x === '' ? null : Number(x));
const mins = (m: any) => {
  if (m === null || m === undefined || m === '') return null;
  const [a, b] = String(m).split(':');
  const v = Number(a) + (Number(b) || 0) / 60;
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
};

/**
 * Box scores (team and player stats) of finished games, 20 games per request, newest first.
 * `maxBatches` keeps one pass bounded; the next pass continues where this one stopped.
 */
async function syncBoxScores(maxBatches = 400) {
  const todo = db.prepare(`SELECT game_id FROM bb_games WHERE status IN ('FT','AOT') AND stats = 0 ORDER BY kickoff DESC LIMIT ?`).all(maxBatches * 20) as any[];
  const insT = db.prepare(`INSERT OR REPLACE INTO bb_team_stats (game_id, team_id, fgm, fga, tpm, tpa, ftm, fta, reb, oreb, dreb, ast, stl, blk, tov, pf)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insP = db.prepare(`INSERT OR REPLACE INTO bb_player_stats (game_id, team_id, player_id, name, starter, minutes, pts, fgm, fga, tpm, tpa, ftm, fta, reb, ast)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const mark = db.prepare(`UPDATE bb_games SET stats = ? WHERE game_id = ?`);
  let games = 0;
  for (let i = 0; i < todo.length; i += 20) {
    const ids = todo.slice(i, i + 20).map(r => r.game_id);
    const [t, p] = [await bb('/games/statistics/teams', { ids: ids.join('-') }), await bb('/games/statistics/players', { ids: ids.join('-') })];
    const got = new Set<number>();
    db.exec('BEGIN');
    try {
      for (const r of t.response || []) {
        const gid = r.game?.id, tid = r.team?.id;
        if (!gid || !tid) continue;
        got.add(gid);
        insT.run(gid, tid, num(r.field_goals?.total), num(r.field_goals?.attempts), num(r.threepoint_goals?.total), num(r.threepoint_goals?.attempts),
          num(r.freethrows_goals?.total), num(r.freethrows_goals?.attempts), num(r.rebounds?.total), num(r.rebounds?.offence), num(r.rebounds?.defense),
          num(r.assists), num(r.steals), num(r.blocks), num(r.turnovers), num(r.personal_fouls));
      }
      for (const r of p.response || []) {
        const gid = r.game?.id, pid = r.player?.id;
        if (!gid || !pid) continue;
        insP.run(gid, r.team?.id || 0, pid, r.player?.name || null, r.type === 'starters' ? 1 : 0, mins(r.minutes), num(r.points),
          num(r.field_goals?.total), num(r.field_goals?.attempts), num(r.threepoint_goals?.total), num(r.threepoint_goals?.attempts),
          num(r.freethrows_goals?.total), num(r.freethrows_goals?.attempts), num(r.rebounds?.total), num(r.assists));
      }
      for (const id of ids) mark.run(got.has(id) ? 1 : 2, id);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    games += ids.length;
  }
  if (games) logger.info(`API-Basketball: box scores for ${games} games`);
  return games;
}

/** Past seasons once (a finished season never changes), the current season every 30 minutes. */
let ticking = false;
async function bbTick() {
  if (!KEY() || ticking) return;
  ticking = true;
  try { await bbTickInner(); } finally { ticking = false; }
}
async function bbTickInner() {
  for (const l of BB_LEAGUES) {
    try {
      const lg: any = await syncLeague(l);
      const seasons: string[] = JSON.parse(lg.seasons || '[]').slice(-SEASONS_BACK);
      const current = seasons[seasons.length - 1];
      for (const s of seasons) {
        const at = syncedAt(`games|${l.code}|${s}`);
        const fresh = s === current ? at && Date.now() - at < 25 * 60 * 1000 : !!at;
        if (fresh) continue;
        const n = await syncSeason(l.code, lg.league_id, s);
        logger.info(`API-Basketball: ${l.code} ${s} → ${n} games`);
      }
    } catch (e: any) {
      lastError = `${l.code}: ${e.message}`;
      logger.warn(`API-Basketball ${l.code}: ${e.message}`);
    }
  }
  try {
    buildAll(BB_LEAGUES.map(l => l.code));
    recordBbPredictions();
  } catch (e: any) {
    logger.warn(`Basketball model: ${e.message}`);
  }
  try {
    await syncBoxScores();
  } catch (e: any) {
    lastError = `box scores: ${e.message}`;
    logger.warn(`API-Basketball box scores: ${e.message}`);
  }
}

let started = false;
export function startBasketballScheduler() {
  if (started || !KEY()) return;
  started = true;
  // ratings from the stored games right away, so the site has predictions before the first sync finishes
  setTimeout(() => {
    try { buildAll(BB_LEAGUES.map(l => l.code)); recordBbPredictions(); } catch (e: any) { logger.warn(`Basketball model: ${e.message}`); }
  }, 15 * 1000).unref();
  setTimeout(() => void bbTick(), 45 * 1000).unref();
  setInterval(() => void bbTick(), 30 * 60 * 1000).unref();
  setInterval(() => void liveTick(), 60 * 1000).unref();
}

/** Admin: quota and how many games we hold per league and season. */
export async function bbStatus() {
  let account: any = null;
  try {
    const j = await bb('/status');
    const r = j.response?.requests;
    if (r) { limitDay = r.limit_day; remainingDay = Math.max(0, r.limit_day - r.current); }
    account = { plan: j.response?.subscription?.plan || null, active: j.response?.subscription?.active ?? null, end: j.response?.subscription?.end || null, requests: r || null };
  } catch (e: any) {
    account = { error: e.message };
  }
  const leagues = db.prepare(`SELECT code, league_id, name, country, seasons, checked_at FROM bb_leagues`).all() as any[];
  const games = db.prepare(`
    SELECT code, season, COUNT(*) AS games, SUM(CASE WHEN status IN ('FT','AOT') THEN 1 ELSE 0 END) AS finished,
      SUM(CASE WHEN stats = 1 THEN 1 ELSE 0 END) AS boxScores, SUM(CASE WHEN stats = 2 THEN 1 ELSE 0 END) AS noBoxScore, MIN(kickoff) AS first, MAX(kickoff) AS last
    FROM bb_games GROUP BY code, season ORDER BY code, season`).all();
  return { account, limitDay, remainingDay, callsThisBoot: calls, lastError, leagues: leagues.map(l => ({ ...l, seasons: JSON.parse(l.seasons) })), games };
}

/** Admin: start a sync pass now (runs in the background; box scores can take a few minutes). */
export async function bbSyncNow() {
  void bbTick();
  return bbStatus();
}
