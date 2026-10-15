/**
 * NFL data check (fix136, Oct 2026) — admin only, nothing public, no predictions yet, no odds stored.
 * API-American-Football (api-sports.io, same account): https://v1.american-football.api-sports.io, header
 * x-apisports-key = API_NFL_KEY or API_FOOTBALL_KEY. NFL = league 1 (NCAA = 2, ignored for now).
 *  - games of every season the league lists, stored in nfl_games (backfill once per season), then the current season
 *    every 6 hours;
 *  - /api/admin/nfl-probe: what the plan gives us (quota, seasons + coverage, games per season, sample statistics,
 *    injuries, standings), for deciding whether an NFL model is possible.
 */
import { db } from '../db';
import logger from '../utils/logger';

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
`);

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

const upsert = db.prepare(`INSERT INTO nfl_games (game_id, season, week, stage, kickoff, home_id, home_name, away_id, away_name, status, home_pts, away_pts, venue, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(game_id) DO UPDATE SET season = excluded.season, week = excluded.week, stage = excluded.stage, kickoff = excluded.kickoff,
    home_id = excluded.home_id, home_name = excluded.home_name, away_id = excluded.away_id, away_name = excluded.away_name,
    status = excluded.status, home_pts = excluded.home_pts, away_pts = excluded.away_pts, venue = excluded.venue, updated_at = excluded.updated_at`);

/** Store one season's games (scores only: no odds). Returns how many games came back. */
export async function syncSeason(season: number): Promise<number> {
  const j = await nfl('/games', { league: NFL_LEAGUE, season });
  const list: any[] = Array.isArray(j.response) ? j.response : [];
  const at = new Date().toISOString();
  db.exec('BEGIN');
  try {
    for (const g of list) {
      const id = num(g?.game?.id);
      if (!id) continue;
      const venue = [g?.game?.venue?.name, g?.game?.venue?.city].filter(Boolean).join(', ') || null;
      upsert.run(id, num(g?.league?.season) ?? season, g?.game?.week != null ? String(g.game.week) : null, g?.game?.stage || null, kickoffOf(g),
        num(g?.teams?.home?.id), g?.teams?.home?.name || null, num(g?.teams?.away?.id), g?.teams?.away?.name || null,
        g?.game?.status?.short || null, num(g?.scores?.home?.total), num(g?.scores?.away?.total), venue, at);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  db.prepare(`INSERT OR REPLACE INTO nfl_sync (key, at, detail) VALUES (?, ?, ?)`).run(`season|${season}`, at, String(list.length));
  return list.length;
}

/** The league's seasons with their coverage flags (one call). */
export async function nflSeasons(): Promise<{ season: number; current: boolean; start: string | null; end: string | null; coverage: any }[]> {
  const j = await nfl('/leagues', { id: NFL_LEAGUE });
  const lg = (Array.isArray(j.response) ? j.response : [])[0];
  return (lg?.seasons || []).map((s: any) => ({ season: Number(s.year ?? s.season), current: !!s.current, start: s.start || null, end: s.end || null, coverage: s.coverage || null }))
    .filter((s: any) => Number.isFinite(s.season)).sort((a: any, b: any) => a.season - b.season);
}
const currentOf = (seasons: { season: number; current: boolean }[]) => (seasons.find(s => s.current) || seasons[seasons.length - 1])?.season ?? null;

/** Backfill every listed season not stored yet, then refresh the current one. */
export async function nflSync(): Promise<{ seasons: number; synced: Record<number, number | string> }> {
  const seasons = await nflSeasons();
  const cur = currentOf(seasons);
  const synced: Record<number, number | string> = {};
  for (const s of seasons) {
    const done = db.prepare(`SELECT 1 FROM nfl_sync WHERE key = ?`).get(`season|${s.season}`);
    if (done && s.season !== cur) continue;
    try { synced[s.season] = await syncSeason(s.season); }
    catch (e: any) { synced[s.season] = e.message; logger.warn(`NFL ${s.season}: ${e.message}`); }
  }
  db.prepare(`INSERT OR REPLACE INTO nfl_sync (key, at, detail) VALUES ('last', ?, ?)`).run(new Date().toISOString(), JSON.stringify(synced));
  return { seasons: seasons.length, synced };
}

let started = false;
export function startNflScheduler() {
  if (started || !KEY()) return;
  started = true;
  const tick = () => nflSync()
    .then(r => logger.info(`NFL sync: ${Object.entries(r.synced).map(([s, n]) => `${s}=${n}`).join(' ') || 'nothing new'}`))
    .catch(e => logger.warn(`NFL sync: ${e.message}`));
  setTimeout(() => void tick(), 10 * 60 * 1000).unref(); // after the football and basketball start-up work
  setInterval(() => void tick(), 6 * 3600 * 1000).unref();
}

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
