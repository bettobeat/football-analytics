/**
 * NFL data (fix136 data check, fix137 site) — no predictions yet, no odds stored. The pages (/american-football) are
 * admin-only until NFL_PUBLIC=1 (services/nflSite.ts).
 * API-American-Football (api-sports.io, same account): https://v1.american-football.api-sports.io, header
 * x-apisports-key = API_NFL_KEY or API_FOOTBALL_KEY. NFL = league 1 (NCAA = 2, ignored for now).
 * Sync (every job checks the day's quota first and keeps a reserve):
 *  - games: every season the league lists once, then the current season every 30 min; live games every 30 s while
 *    a game is on (one /games?live=all call);
 *  - box scores (team + player statistics) after full time, and a backfill for the current and last season;
 *  - teams + standings every 6 h, injuries every 2 h, rosters daily.
 *  - /api/admin/nfl-probe: what the plan gives us (quota, seasons + coverage, games per season, sample statistics).
 */
import { db } from '../db';
import logger from '../utils/logger';
import { timed, yieldLoop } from './perf';

const BASE = 'https://v1.american-football.api-sports.io';
const KEY = () => process.env.API_NFL_KEY || process.env.API_FOOTBALL_KEY || '';
export const NFL_LEAGUE = 1;
const MIN_GAP_MS = 400;

db.exec(`
  CREATE TABLE IF NOT EXISTS nfl_games (
    game_id    INTEGER PRIMARY KEY,
    season     INTEGER NOT NULL,
    week       TEXT,
    stage      TEXT,
    kickoff    TEXT,
    home_id    INTEGER,
    home_name  TEXT,
    away_id    INTEGER,
    away_name  TEXT,
    status     TEXT,
    home_pts   INTEGER,
    away_pts   INTEGER,
    venue      TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_nfl_games_season ON nfl_games(season, kickoff);
  CREATE TABLE IF NOT EXISTS nfl_sync (key TEXT PRIMARY KEY, at TEXT NOT NULL, detail TEXT);
  CREATE TABLE IF NOT EXISTS nfl_teams (
    team_id INTEGER PRIMARY KEY, name TEXT NOT NULL, code TEXT, city TEXT, logo TEXT, conference TEXT, division TEXT,
    coach TEXT, stadium TEXT, updated_at TEXT NOT NULL
  );
  -- box scores: one row per game and team, the provider's statistics as JSON
  CREATE TABLE IF NOT EXISTS nfl_team_stats (game_id INTEGER NOT NULL, team_id INTEGER NOT NULL, json TEXT NOT NULL, PRIMARY KEY (game_id, team_id));
  CREATE TABLE IF NOT EXISTS nfl_player_stats (game_id INTEGER NOT NULL, team_id INTEGER NOT NULL, json TEXT NOT NULL, PRIMARY KEY (game_id, team_id));
  CREATE TABLE IF NOT EXISTS nfl_players (
    player_id INTEGER PRIMARY KEY, team_id INTEGER, name TEXT NOT NULL, position TEXT, grp TEXT, number INTEGER, age INTEGER,
    height TEXT, weight TEXT, college TEXT, experience INTEGER, image TEXT, season INTEGER, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_nfl_players_team ON nfl_players(team_id);
  CREATE TABLE IF NOT EXISTS nfl_injuries (
    player_id INTEGER NOT NULL, team_id INTEGER NOT NULL, player_name TEXT, image TEXT, status TEXT, description TEXT, date TEXT,
    updated_at TEXT NOT NULL, PRIMARY KEY (player_id, team_id)
  );
  CREATE TABLE IF NOT EXISTS nfl_standings (season INTEGER NOT NULL, team_id INTEGER NOT NULL, json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (season, team_id));
`);
for (const col of ['home_logo TEXT', 'away_logo TEXT', 'quarters TEXT', 'stats INTEGER DEFAULT 0']) {
  try { db.exec(`ALTER TABLE nfl_games ADD COLUMN ${col}`); } catch { /* already there */ }
}

/* ---------- HTTP client (like apiFootball.ts: spacing, timeout, one retry, call count) ---------- */

let lastCall = 0;
let callsThisBoot = 0;
let remainingDay: number | null = null;
let limitDay: number | null = null;
let lastError: string | null = null;
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function nfl(path: string, params: Record<string, string | number> = {}, retry = true): Promise<any> {
  if (!KEY()) throw new Error('API_NFL_KEY / API_FOOTBALL_KEY is not set');
  const wait = lastCall + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'x-apisports-key': KEY() }, signal: AbortSignal.timeout(20_000) });
  } catch (e: any) {
    if (retry) { await sleep(2000); return nfl(path, params, false); }
    lastError = `${path}: ${e.message}`;
    throw e;
  }
  callsThisBoot++;
  const rem = res.headers.get('x-ratelimit-requests-remaining'), lim = res.headers.get('x-ratelimit-requests-limit');
  if (rem) remainingDay = parseInt(rem, 10);
  if (lim) limitDay = parseInt(lim, 10);
  if ((res.status === 429 || res.status >= 500) && retry) { await sleep(res.status === 429 ? 61_000 : 2000); return nfl(path, params, false); }
  if (!res.ok) { lastError = `${path} HTTP ${res.status}`; throw new Error(lastError); }
  const json: any = await res.json();
  const errs = json.errors;
  if (errs && ((Array.isArray(errs) && errs.length) || (!Array.isArray(errs) && Object.keys(errs).length))) {
    lastError = `${path}: ${JSON.stringify(errs)}`;
    throw new Error(lastError);
  }
  return json;
}

/* ---------- games ---------- */

const num = (x: any) => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));
function kickoffOf(g: any): string | null {
  const ts = num(g?.game?.date?.timestamp);
  if (ts) return new Date(ts * 1000).toISOString();
  const d = g?.game?.date?.date, t = g?.game?.date?.time;
  return d ? new Date(`${d}T${t || '00:00'}:00Z`).toISOString() : null;
}

const LIVE_STATUS = ['Q1', 'Q2', 'Q3', 'Q4', 'OT', 'HT'];
export const NFL_LIVE = LIVE_STATUS;
export const NFL_DONE = ['FT', 'AOT'];

/** Requests we may still spend today, keeping a reserve for the live games and the probe. */
const RESERVE = 25;
const budget = () => (remainingDay === null ? Infinity : remainingDay - RESERVE);

const upsert = db.prepare(`INSERT INTO nfl_games (game_id, season, week, stage, kickoff, home_id, home_name, home_logo, away_id, away_name, away_logo, status, home_pts, away_pts, quarters, venue, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(game_id) DO UPDATE SET season = excluded.season, week = excluded.week, stage = excluded.stage, kickoff = excluded.kickoff,
    home_id = excluded.home_id, home_name = excluded.home_name, home_logo = COALESCE(excluded.home_logo, home_logo),
    away_id = excluded.away_id, away_name = excluded.away_name, away_logo = COALESCE(excluded.away_logo, away_logo),
    status = excluded.status, home_pts = excluded.home_pts, away_pts = excluded.away_pts,
    quarters = COALESCE(excluded.quarters, quarters), venue = COALESCE(excluded.venue, venue), updated_at = excluded.updated_at`);

/** Quarter scores [[q1..q4, ot], [q1..q4, ot]] (null where the provider has none). */
function quartersOf(g: any): string | null {
  const side = (s: any) => ['quarter_1', 'quarter_2', 'quarter_3', 'quarter_4', 'overtime'].map(k => num(s?.[k]));
  const h = side(g?.scores?.home), a = side(g?.scores?.away);
  return h.some(x => x !== null) || a.some(x => x !== null) ? JSON.stringify([h, a]) : null;
}

function storeGames(list: any[], season?: number) {
  const at = new Date().toISOString();
  db.exec('BEGIN');
  try {
    for (const g of list) {
      const id = num(g?.game?.id);
      if (!id || num(g?.league?.id) !== null && num(g?.league?.id) !== NFL_LEAGUE) continue;
      const venue = [g?.game?.venue?.name, g?.game?.venue?.city].filter(Boolean).join(', ') || null;
      upsert.run(id, num(g?.league?.season) ?? season ?? 0, g?.game?.week != null ? String(g.game.week) : null, g?.game?.stage || null, kickoffOf(g),
        num(g?.teams?.home?.id), g?.teams?.home?.name || null, g?.teams?.home?.logo || null,
        num(g?.teams?.away?.id), g?.teams?.away?.name || null, g?.teams?.away?.logo || null,
        g?.game?.status?.short || null, num(g?.scores?.home?.total), num(g?.scores?.away?.total), quartersOf(g), venue, at);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

/** Store one season's games (scores only: no odds). Returns how many games came back. */
export async function syncSeason(season: number): Promise<number> {
  const j = await nfl('/games', { league: NFL_LEAGUE, season });
  const list: any[] = Array.isArray(j.response) ? j.response : [];
  storeGames(list, season);
  db.prepare(`INSERT OR REPLACE INTO nfl_sync (key, at, detail) VALUES (?, ?, ?)`).run(`season|${season}`, new Date().toISOString(), String(list.length));
  return list.length;
}

/** The league's seasons with their coverage flags (one call). */
export async function nflSeasons(): Promise<{ season: number; current: boolean; start: string | null; end: string | null; coverage: any }[]> {
  const j = await nfl('/leagues', { id: NFL_LEAGUE });
  const lg = (Array.isArray(j.response) ? j.response : [])[0];
  const list = (lg?.seasons || []).map((s: any) => ({ season: Number(s.year ?? s.season), current: !!s.current, start: s.start || null, end: s.end || null, coverage: s.coverage || null }))
    .filter((s: any) => Number.isFinite(s.season)).sort((a: any, b: any) => a.season - b.season);
  const cur = currentOf(list);
  if (cur) db.prepare(`INSERT OR REPLACE INTO nfl_sync (key, at, detail) VALUES ('current', ?, ?)`).run(new Date().toISOString(), String(cur));
  return list;
}
const currentOf = (seasons: { season: number; current: boolean }[]) => (seasons.find(s => s.current) || seasons[seasons.length - 1])?.season ?? null;

/** The current season (stored at the last /leagues call; else the latest season we hold games for). */
export function nflCurrentSeason(): number | null {
  const r = db.prepare(`SELECT detail FROM nfl_sync WHERE key = 'current'`).get() as any;
  if (r?.detail && Number.isFinite(Number(r.detail))) return Number(r.detail);
  return (db.prepare(`SELECT MAX(season) AS s FROM nfl_games`).get() as any)?.s ?? null;
}

/** Backfill every listed season not stored yet, then refresh the current one. */
export async function nflSync(): Promise<{ seasons: number; synced: Record<number, number | string> }> {
  const seasons = await nflSeasons();
  const cur = currentOf(seasons);
  const synced: Record<number, number | string> = {};
  for (const s of seasons) {
    const done = db.prepare(`SELECT 1 FROM nfl_sync WHERE key = ?`).get(`season|${s.season}`);
    if (done && s.season !== cur) continue;
    if (budget() < 1) { synced[s.season] = 'no requests left today'; break; }
    try { synced[s.season] = await syncSeason(s.season); }
    catch (e: any) { synced[s.season] = e.message; logger.warn(`NFL ${s.season}: ${e.message}`); }
    await yieldLoop();
  }
  db.prepare(`INSERT OR REPLACE INTO nfl_sync (key, at, detail) VALUES ('last', ?, ?)`).run(new Date().toISOString(), JSON.stringify(synced));
  return { seasons: seasons.length, synced };
}

/* ---------- live ---------- */

/** A game is on (or about to start / just ended): poll the live scores every 30 s. */
function liveWindow(): boolean {
  const now = Date.now();
  const r = db.prepare(`SELECT COUNT(*) AS n FROM nfl_games WHERE kickoff >= ? AND kickoff <= ? AND (status IS NULL OR status NOT IN ('FT','AOT','CANC','PST'))`)
    .get(new Date(now - 5 * 3600 * 1000).toISOString(), new Date(now + 10 * 60 * 1000).toISOString()) as any;
  return (r?.n || 0) > 0;
}
let liveBusy = false;
export async function nflLiveTick(): Promise<number> {
  if (liveBusy || !liveWindow() || budget() < 1) return 0;
  liveBusy = true;
  try {
    const before = new Map((db.prepare(`SELECT game_id, status FROM nfl_games WHERE status IN ('Q1','Q2','Q3','Q4','OT','HT')`).all() as any[]).map(r => [r.game_id, r.status]));
    const j = await nfl('/games', { live: 'all' });
    const list: any[] = (Array.isArray(j.response) ? j.response : []).filter((g: any) => num(g?.league?.id) === NFL_LEAGUE);
    storeGames(list);
    // games that were live and dropped off the live list: fetch them once to get the final score
    const live = new Set(list.map(g => num(g?.game?.id)));
    for (const id of before.keys()) if (!live.has(id) && budget() >= 1) {
      try { storeGames((await nfl('/games', { id })).response || []); } catch (e: any) { logger.warn(`NFL game ${id}: ${e.message}`); }
    }
    return list.length;
  } finally { liveBusy = false; }
}

/* ---------- box scores ---------- */

/** Team + player statistics of one finished game (2 calls). */
export async function syncBoxScore(gameId: number): Promise<boolean> {
  const teams = (await nfl('/games/statistics/teams', { id: gameId })).response || [];
  const players = (await nfl('/games/statistics/players', { id: gameId })).response || [];
  db.exec('BEGIN');
  try {
    for (const t of teams) { const tid = num(t?.team?.id); if (tid) db.prepare(`INSERT OR REPLACE INTO nfl_team_stats (game_id, team_id, json) VALUES (?, ?, ?)`).run(gameId, tid, JSON.stringify(t.statistics || {})); }
    for (const t of players) { const tid = num(t?.team?.id); if (tid) db.prepare(`INSERT OR REPLACE INTO nfl_player_stats (game_id, team_id, json) VALUES (?, ?, ?)`).run(gameId, tid, JSON.stringify(t.groups || [])); }
    // 1 = stored, 2 = the provider has none for this game (don't ask again)
    db.prepare(`UPDATE nfl_games SET stats = ? WHERE game_id = ?`).run(teams.length || players.length ? 1 : 2, gameId);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return teams.length > 0;
}

/** Finished games of the current and last season without a box score yet, newest first (up to `max` per run). */
export async function nflBoxScores(max = 40): Promise<number> {
  const cur = nflCurrentSeason();
  if (!cur) return 0;
  const todo = db.prepare(`SELECT game_id FROM nfl_games WHERE season IN (?, ?) AND status IN ('FT','AOT') AND COALESCE(stats, 0) = 0 ORDER BY kickoff DESC LIMIT ?`).all(cur, cur - 1, max) as any[];
  let n = 0;
  for (const g of todo) {
    if (budget() < 2) break;
    try { await syncBoxScore(g.game_id); n++; } catch (e: any) { logger.warn(`NFL box score ${g.game_id}: ${e.message}`); }
    if (n % 5 === 0) await yieldLoop();
  }
  return n;
}

/* ---------- teams, standings, injuries, rosters ---------- */

/** Teams (logo, coach, stadium) and standings (conference, division, record) of the current season: 2 calls. */
export async function nflTeamsAndStandings(): Promise<number> {
  const season = nflCurrentSeason();
  if (!season || budget() < 2) return 0;
  const at = new Date().toISOString();
  const teams: any[] = (await nfl('/teams', { league: NFL_LEAGUE, season })).response || [];
  const rows: any[] = (await nfl('/standings', { league: NFL_LEAGUE, season })).response || [];
  const confShort = (c: any) => (/american/i.test(String(c)) ? 'AFC' : /national/i.test(String(c)) ? 'NFC' : c ? String(c) : null);
  db.exec('BEGIN');
  try {
    for (const t of teams) {
      const id = num(t?.id);
      if (!id || !t?.name) continue;
      db.prepare(`INSERT INTO nfl_teams (team_id, name, code, city, logo, coach, stadium, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(team_id) DO UPDATE SET name = excluded.name, code = excluded.code, city = excluded.city, logo = COALESCE(excluded.logo, logo),
        coach = excluded.coach, stadium = excluded.stadium, updated_at = excluded.updated_at`)
        .run(id, t.name, t.code || null, t.city || null, t.logo || null, t.coach || null, t.stadium || null, at);
    }
    for (const r of rows) {
      const id = num(r?.team?.id);
      if (!id) continue;
      db.prepare(`INSERT OR REPLACE INTO nfl_standings (season, team_id, json, updated_at) VALUES (?, ?, ?, ?)`).run(season, id, JSON.stringify(r), at);
      db.prepare(`INSERT INTO nfl_teams (team_id, name, logo, conference, division, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(team_id) DO UPDATE SET conference = excluded.conference, division = excluded.division, logo = COALESCE(logo, excluded.logo)`)
        .run(id, r.team?.name || String(id), r.team?.logo || null, confShort(r.conference), r.division || null, at);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return rows.length;
}

const teamIds = () => (db.prepare(`SELECT team_id FROM nfl_teams ORDER BY team_id`).all() as any[]).map(r => r.team_id as number);

/** Injury list of every team (one call per team). */
export async function nflInjuries(): Promise<number> {
  let n = 0;
  const at = new Date().toISOString();
  for (const id of teamIds()) {
    if (budget() < 1) break;
    try {
      const list: any[] = (await nfl('/injuries', { team: id })).response || [];
      db.exec('BEGIN');
      try {
        db.prepare(`DELETE FROM nfl_injuries WHERE team_id = ?`).run(id);
        for (const x of list) {
          const pid = num(x?.player?.id);
          if (!pid) continue;
          db.prepare(`INSERT OR REPLACE INTO nfl_injuries (player_id, team_id, player_name, image, status, description, date, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(pid, id, x.player?.name || null, x.player?.image || null, x.status || null, x.description || null, x.date || null, at);
          n++;
        }
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    } catch (e: any) { logger.warn(`NFL injuries ${id}: ${e.message}`); }
    await yieldLoop();
  }
  return n;
}

/** Rosters (bio, position, number, picture) of every team for the current season (one call per team). */
export async function nflRosters(): Promise<number> {
  const season = nflCurrentSeason();
  if (!season) return 0;
  let n = 0;
  const at = new Date().toISOString();
  for (const id of teamIds()) {
    if (budget() < 1) break;
    try {
      const list: any[] = (await nfl('/players', { team: id, season })).response || [];
      db.exec('BEGIN');
      try {
        for (const p of list) {
          const pid = num(p?.id);
          if (!pid || !p?.name) continue;
          db.prepare(`INSERT OR REPLACE INTO nfl_players (player_id, team_id, name, position, grp, number, age, height, weight, college, experience, image, season, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(pid, id, p.name, p.position || null, p.group || null, num(p.number), num(p.age), p.height || null, p.weight || null, p.college || null, num(p.experience), p.image || null, season, at);
          n++;
        }
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    } catch (e: any) { logger.warn(`NFL roster ${id}: ${e.message}`); }
    await yieldLoop();
  }
  return n;
}

/* ---------- scheduler ---------- */

const ranAt = (key: string) => { const r = db.prepare(`SELECT at FROM nfl_sync WHERE key = ?`).get(key) as any; return r ? Date.parse(r.at) : 0; };
const mark = (key: string, detail: unknown) => db.prepare(`INSERT OR REPLACE INTO nfl_sync (key, at, detail) VALUES (?, ?, ?)`).run(key, new Date().toISOString(), String(detail));

let started = false;
let tickBusy = false;
export function startNflScheduler() {
  if (started || !KEY()) return;
  started = true;
  // every 30 min: games of the current season (+ backfill), box scores, then whatever is due (each job keeps its own clock)
  const tick = async () => {
    if (tickBusy) return;
    tickBusy = true;
    try {
      const r = await timed('nfl games', () => nflSync());
      const synced = Object.entries(r.synced).map(([s, n]) => `${s}=${n}`).join(' ');
      if (synced) logger.info(`NFL games: ${synced}`);
      const box = await timed('nfl box scores', () => nflBoxScores());
      if (box) logger.info(`NFL box scores: ${box}`);
      if (Date.now() - ranAt('job|standings') > 6 * 3600 * 1000) mark('job|standings', await timed('nfl standings', () => nflTeamsAndStandings()));
      if (Date.now() - ranAt('job|injuries') > 2 * 3600 * 1000) mark('job|injuries', await timed('nfl injuries', () => nflInjuries()));
      if (Date.now() - ranAt('job|rosters') > 24 * 3600 * 1000) mark('job|rosters', await timed('nfl rosters', () => nflRosters()));
    } catch (e: any) {
      logger.warn(`NFL sync: ${e.message}`);
    } finally { tickBusy = false; }
  };
  setTimeout(() => void tick(), 10 * 60 * 1000).unref(); // after the football and basketball start-up work
  setInterval(() => void tick(), 30 * 60 * 1000).unref();
  // live scores every 30 s while a game is on; box score right after full time
  setInterval(() => void timed('nfl live', async () => {
    const before = new Set((db.prepare(`SELECT game_id FROM nfl_games WHERE status IN ('FT','AOT') AND COALESCE(stats, 0) = 0`).all() as any[]).map(r => r.game_id));
    await nflLiveTick();
    const ended = (db.prepare(`SELECT game_id FROM nfl_games WHERE status IN ('FT','AOT') AND COALESCE(stats, 0) = 0 AND kickoff > ?`).all(new Date(Date.now() - 8 * 3600 * 1000).toISOString()) as any[])
      .filter(r => !before.has(r.game_id));
    for (const g of ended) if (budget() >= 2) { try { await syncBoxScore(g.game_id); } catch (e: any) { logger.warn(`NFL box score ${g.game_id}: ${e.message}`); } }
  }).catch(e => logger.warn(`NFL live: ${e.message}`)), 30 * 1000).unref();
}

export const nflClientStatus = () => ({ callsThisBoot, remainingDay, limitDay, lastError });

/* ---------- admin probe ---------- */

const FINISHED_SQL = `status IN ('FT','AOT') AND home_pts IS NOT NULL AND away_pts IS NOT NULL`;

/** Field names of an API object, 2 levels deep ("game.date.timestamp" → "game.date"), for "what fields exist". */
function fieldsOf(x: any, depth = 2, prefix = ''): string[] {
  if (!x || typeof x !== 'object' || Array.isArray(x) || depth === 0) return prefix ? [prefix] : [];
  return Object.keys(x).flatMap(k => fieldsOf(x[k], depth - 1, prefix ? `${prefix}.${k}` : k));
}
/** Statistic names inside a statistics response (team rows or player groups). */
function statNames(resp: any[]): string[] {
  const names = new Set<string>();
  const walk = (v: any, d: number) => {
    if (!v || d > 10) return; // players: team → groups → group → players → player → statistics → stat
    if (Array.isArray(v)) { for (const y of v.slice(0, 40)) walk(y, d + 1); return; }
    if (typeof v !== 'object') return;
    if (typeof v.name === 'string' && ('value' in v || 'total' in v)) names.add(v.name);
    for (const [k, y] of Object.entries(v)) {
      if (k === 'statistics' && y && typeof y === 'object' && !Array.isArray(y)) {
        for (const [sk, sv] of Object.entries(y as any)) if (sv && typeof sv === 'object' && !Array.isArray(sv)) for (const k2 of Object.keys(sv as any)) names.add(`${sk}.${k2}`); else names.add(sk);
      } else walk(y, d + 1);
    }
  };
  walk(resp, 0);
  return [...names].slice(0, 120);
}

let probeCache: { at: number; data: any } | null = null;

/** What the NFL data looks like on our plan (about 10 API calls; cached 10 minutes unless refresh). */
export async function nflProbe(refresh = false) {
  if (probeCache && !refresh && Date.now() - probeCache.at < 10 * 60 * 1000) return { ...probeCache.data, cached: true };
  const errors: Record<string, string> = {};
  const safe = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => { try { return await fn(); } catch (e: any) { errors[label] = e.message; return null; } };

  const status = await safe('status', async () => {
    const r = (await nfl('/status')).response || {};
    return { plan: r.subscription?.plan ?? null, active: r.subscription?.active ?? null, end: r.subscription?.end ?? null, requestsToday: r.requests?.current ?? null, limitDay: r.requests?.limit_day ?? null };
  });
  const seasons = (await safe('leagues', () => nflSeasons())) || [];
  const cur = currentOf(seasons);

  // what we hold, per season (from our table: no calls)
  const stored = db.prepare(`SELECT season, COUNT(*) AS games,
      SUM(CASE WHEN ${FINISHED_SQL} THEN 1 ELSE 0 END) AS finished,
      SUM(CASE WHEN stage LIKE 'Regular%' THEN 1 ELSE 0 END) AS regular,
      SUM(CASE WHEN stage LIKE 'Post%' THEN 1 ELSE 0 END) AS playoffs,
      SUM(CASE WHEN stage LIKE 'Pre%' THEN 1 ELSE 0 END) AS preseason,
      MIN(kickoff) AS first, MAX(kickoff) AS last
    FROM nfl_games GROUP BY season ORDER BY season`).all() as any[];
  const bySeason = new Map(stored.map(r => [r.season, r]));

  // samples: 3 finished games of the latest season we hold finished games for
  const latest = (db.prepare(`SELECT MAX(season) AS s FROM nfl_games WHERE ${FINISHED_SQL}`).get() as any)?.s ?? null;
  const sample = latest ? db.prepare(`SELECT game_id, kickoff, home_id, home_name, away_id, away_name, home_pts, away_pts FROM nfl_games WHERE season = ? AND ${FINISHED_SQL} ORDER BY kickoff DESC LIMIT 3`).all(latest) as any[] : [];
  const samples = [];
  for (const g of sample) {
    const teams = await safe(`teams ${g.game_id}`, async () => (await nfl('/games/statistics/teams', { id: g.game_id })).response || []);
    const players = await safe(`players ${g.game_id}`, async () => (await nfl('/games/statistics/players', { id: g.game_id })).response || []);
    samples.push({
      game: `${g.home_name} ${g.home_pts}–${g.away_pts} ${g.away_name}`, id: g.game_id, date: g.kickoff,
      teamStats: teams ? { rows: teams.length, fields: fieldsOf(teams[0]), stats: statNames(teams) } : null,
      playerStats: players ? { rows: players.length, groups: [...new Set(players.flatMap((t: any) => (t.groups || []).map((x: any) => x.name)).filter(Boolean))], fields: fieldsOf(players[0]), stats: statNames(players) } : null
    });
  }

  // injuries for 2 teams (the first sample game's sides)
  const injuries = [];
  for (const t of sample[0] ? [[sample[0].home_id, sample[0].home_name], [sample[0].away_id, sample[0].away_name]] : []) {
    const r = await safe(`injuries ${t[1]}`, async () => (await nfl('/injuries', { team: t[0] })).response || []);
    injuries.push({ team: t[1], count: r ? r.length : null, fields: r && r[0] ? fieldsOf(r[0]) : [] });
  }

  const standings = cur ? await safe('standings', async () => {
    const r = (await nfl('/standings', { league: NFL_LEAGUE, season: cur })).response || [];
    return { season: cur, rows: r.length, fields: r[0] ? fieldsOf(r[0]) : [] };
  }) : null;

  const data = {
    checkedAt: new Date().toISOString(),
    keyFrom: process.env.API_NFL_KEY ? 'API_NFL_KEY' : process.env.API_FOOTBALL_KEY ? 'API_FOOTBALL_KEY' : null,
    status, currentSeason: cur,
    seasons: seasons.map(s => ({ ...s, stored: bySeason.get(s.season) || null })),
    stored: { games: stored.reduce((n, r) => n + r.games, 0), finished: stored.reduce((n, r) => n + r.finished, 0), seasons: stored.length },
    lastSync: db.prepare(`SELECT at, detail FROM nfl_sync WHERE key = 'last'`).get() || null,
    samples, injuries, standings,
    client: { callsThisBoot, remainingDay, limitDay, lastError },
    errors
  };
  probeCache = { at: Date.now(), data };
  return data;
}
