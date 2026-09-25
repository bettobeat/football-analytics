/**
 * API-Football (api-sports.io, v3) — injuries, suspensions and confirmed lineups for model v3.
 *
 * What we store (SQLite):
 *   af_fixtures  every fixture of our leagues for the model's seasons (ids, kick-off, teams, result)
 *   af_teams     API-Football team id → football-data.co.uk name (same matcher as the history model)
 *   af_injuries  player listed as missing ("Missing Fixture") or doubtful ("Questionable") for a fixture
 *   af_lineups   starting XI and bench per fixture
 *
 * What the model gets (per match, per team), computed walk-forward from lineups BEFORE the match:
 *   regulars   players weighted by how often they started the team's last 10 matches (0–1)
 *   missing    Σ weight of regulars listed as injured/suspended (doubtful counts half)
 *   absent     once the XI is confirmed: Σ weight of the usual top-11 who are NOT starting
 *
 * Budget: Pro = 7,500 requests/day. Daily upkeep is ~100 requests; the rest drips the lineup
 * history in, most recent first, always leaving a reserve.
 */
import { db } from '../db';
import logger from '../utils/logger';
import { GROUPS, ALIASES, similarity, seasonCodes } from './history';
import { playerValue } from './squadValues';

const BASE = 'https://v3.football.api-sports.io';
const KEY = () => process.env.API_FOOTBALL_KEY || '';
// The lineup/injury backfill never spends the last N daily requests: they are kept for the live side
// (match window, live scores, match pages, CLV, Elo syncs), which needs roughly 2-3k a day.
const RESERVE = parseInt(process.env.API_FOOTBALL_RESERVE || '3000', 10);
const MIN_GAP_MS = 350; // ≤ ~170 requests/minute
const TICK_MS = 10 * 60 * 1000;
const BACKFILL_PER_TICK = parseInt(process.env.API_FOOTBALL_BACKFILL_PER_TICK || '250', 10);
const REGULAR_WINDOW = 10; // last N lineups define a team's regulars

/** API-Football league ids for our model groups (football-data.co.uk division codes). */
export const AF_LEAGUES: { id: number; group: string; division: string; top: boolean }[] = [
  { id: 39, group: 'E', division: 'E0', top: true },
  { id: 40, group: 'E', division: 'E1', top: false },
  { id: 140, group: 'SP', division: 'SP1', top: true },
  { id: 141, group: 'SP', division: 'SP2', top: false },
  { id: 135, group: 'I', division: 'I1', top: true },
  { id: 136, group: 'I', division: 'I2', top: false },
  { id: 78, group: 'D', division: 'D1', top: true },
  { id: 79, group: 'D', division: 'D2', top: false },
  { id: 61, group: 'F', division: 'F1', top: true },
  { id: 62, group: 'F', division: 'F2', top: false },
  { id: 88, group: 'N', division: 'N1', top: true },
  { id: 94, group: 'P', division: 'P1', top: true }
];

/** Extra name hints for API-Football spellings (lowercased fd name → hint). */
const AF_ALIASES: Record<string, string> = {
  'bayern munich': 'bayern munchen',
  "m'gladbach": 'borussia monchengladbach',
  'ein frankfurt': 'eintracht frankfurt',
  'fc koln': '1. fc koln',
  'mainz': 'fsv mainz 05',
  'leverkusen': 'bayer leverkusen',
  'ath madrid': 'atletico madrid',
  'ath bilbao': 'athletic club',
  'espanol': 'espanyol',
  'sociedad': 'real sociedad',
  'betis': 'real betis',
  'vallecano': 'rayo vallecano',
  'celta': 'celta vigo',
  'sp lisbon': 'sporting cp',
  'sp braga': 'sc braga',
  'guimaraes': 'guimaraes',
  'paris sg': 'paris saint germain',
  'st etienne': 'saint etienne',
  'psv eindhoven': 'psv eindhoven',
  'for sittard': 'fortuna sittard',
  'nijmegen': 'nec nijmegen',
  'zwolle': 'pec zwolle',
  'waalwijk': 'waalwijk',
  "nott'm forest": 'nottingham forest',
  'man united': 'manchester united',
  'man city': 'manchester city',
  'wolves': 'wolves',
  'qpr': 'qpr',
  'inter': 'inter',
  'milan': 'ac milan'
};

db.exec(`
  CREATE TABLE IF NOT EXISTS af_fixtures (
    fixture_id INTEGER PRIMARY KEY,
    league_id  INTEGER NOT NULL,
    season     INTEGER NOT NULL,
    grp        TEXT NOT NULL,
    division   TEXT NOT NULL,
    kickoff    TEXT NOT NULL,
    date       TEXT NOT NULL,
    home_id    INTEGER NOT NULL,
    away_id    INTEGER NOT NULL,
    home_name  TEXT NOT NULL,
    away_name  TEXT NOT NULL,
    status     TEXT,
    hg INTEGER, ag INTEGER,
    lineups    INTEGER NOT NULL DEFAULT 0   -- 0 not fetched, 1 stored, 2 fetched but empty
  );
  CREATE INDEX IF NOT EXISTS idx_af_fixtures_grp_date ON af_fixtures(grp, kickoff);
  CREATE TABLE IF NOT EXISTS af_teams (
    grp TEXT NOT NULL, team_id INTEGER NOT NULL, name TEXT NOT NULL, fd_name TEXT, score REAL,
    PRIMARY KEY (grp, team_id)
  );
  CREATE TABLE IF NOT EXISTS af_injuries (
    fixture_id INTEGER NOT NULL, team_id INTEGER NOT NULL, player_id INTEGER NOT NULL,
    player_name TEXT, type TEXT, reason TEXT,
    PRIMARY KEY (fixture_id, player_id)
  );
  CREATE TABLE IF NOT EXISTS af_lineups (
    fixture_id INTEGER NOT NULL, team_id INTEGER NOT NULL, player_id INTEGER NOT NULL,
    player_name TEXT, pos TEXT, starter INTEGER NOT NULL,
    PRIMARY KEY (fixture_id, team_id, player_id)
  );
  CREATE TABLE IF NOT EXISTS af_sync (
    key TEXT PRIMARY KEY, done_at TEXT NOT NULL, info TEXT
  );
`);

/* ------------------------------------------------------------------ */
/* HTTP client                                                          */
/* ------------------------------------------------------------------ */

let lastCall = 0;
let remainingDay: number | null = null;
let limitDay: number | null = null;
let lastError: string | null = null;
let callsThisBoot = 0;
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

let blockedUntil = 0; // daily quota used up → no calls until the next UTC midnight
const nextUtcMidnight = () => {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 1);
};

async function af(path: string, params: Record<string, string | number> = {}, retry = true): Promise<any> {
  if (!KEY()) throw new Error('API_FOOTBALL_KEY is not set');
  if (Date.now() < blockedUntil) throw new Error('API-Football daily request limit reached');
  const wait = lastCall + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { 'x-apisports-key': KEY() }, signal: AbortSignal.timeout(30_000) });
  callsThisBoot++;
  const rem = res.headers.get('x-ratelimit-requests-remaining');
  const lim = res.headers.get('x-ratelimit-requests-limit');
  if (rem !== null && rem !== '') remainingDay = parseInt(rem, 10);
  if (remainingDay !== null && remainingDay <= 0) blockedUntil = nextUtcMidnight();
  if (lim !== null && lim !== '') limitDay = parseInt(lim, 10);
  if (res.status === 429 && retry) {
    await sleep(61_000);
    return af(path, params, false);
  }
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
  const json: any = await res.json();
  const errs = json.errors;
  if (errs && ((Array.isArray(errs) && errs.length) || (!Array.isArray(errs) && Object.keys(errs).length))) {
    const msg = JSON.stringify(errs);
    if (/for the day|daily|plan/i.test(msg) && /limit|reached/i.test(msg)) {
      blockedUntil = nextUtcMidnight();
      lastError = `Daily limit reached: ${msg}`;
      throw new Error(`${path}: ${msg}`);
    }
    if (/rate|limit|too many/i.test(msg) && retry) {
      await sleep(61_000);
      return af(path, params, false);
    }
    throw new Error(`${path}: ${msg}`);
  }
  return json;
}

const budgetLeft = () => (remainingDay === null ? Infinity : remainingDay - RESERVE);
/** Shared client for other services (CLV tracking). */
export const afGet = (path: string, params: Record<string, string | number> = {}) => af(path, params);
export const afBudgetLeft = () => budgetLeft();
/** Raw requests left today (for the live side, which may use the backfill reserve). */
export const afRemaining = () => (Date.now() < blockedUntil ? 0 : remainingDay === null ? Infinity : remainingDay);
export const afConfigured = () => !!KEY();

/* ------------------------------------------------------------------ */
/* Sync                                                                 */
/* ------------------------------------------------------------------ */

const markSync = (key: string, info: any = null) =>
  db.prepare(`INSERT OR REPLACE INTO af_sync (key, done_at, info) VALUES (?, ?, ?)`).run(key, new Date().toISOString(), info ? JSON.stringify(info) : null);
const syncedAt = (key: string): number | null => {
  const r: any = db.prepare(`SELECT done_at FROM af_sync WHERE key = ?`).get(key);
  return r ? new Date(r.done_at).getTime() : null;
};

/** football-data.co.uk season code → API-Football season (start year). */
const afSeason = (code: string) => 2000 + parseInt(code.slice(0, 2), 10);
function currentAfSeason() {
  return afSeason(seasonCodes(1)[0]);
}

async function syncFixtures(league: (typeof AF_LEAGUES)[number], season: number) {
  const json = await af('/fixtures', { league: league.id, season });
  const up = db.prepare(`
    INSERT INTO af_fixtures (fixture_id, league_id, season, grp, division, kickoff, date, home_id, away_id, home_name, away_name, status, hg, ag)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(fixture_id) DO UPDATE SET kickoff = excluded.kickoff, date = excluded.date, status = excluded.status, hg = excluded.hg, ag = excluded.ag
  `);
  const teams = db.prepare(`INSERT OR IGNORE INTO af_teams (grp, team_id, name) VALUES (?, ?, ?)`);
  let n = 0;
  db.exec('BEGIN');
  try {
    for (const f of json.response || []) {
      const kickoff = f.fixture?.date;
      if (!kickoff) continue;
      up.run(
        f.fixture.id, league.id, season, league.group, league.division, kickoff, String(kickoff).slice(0, 10),
        f.teams.home.id, f.teams.away.id, f.teams.home.name, f.teams.away.name, f.fixture.status?.short || null,
        f.goals?.home ?? null, f.goals?.away ?? null
      );
      teams.run(league.group, f.teams.home.id, f.teams.home.name);
      teams.run(league.group, f.teams.away.id, f.teams.away.name);
      n++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  markSync(`fixtures|${league.id}|${season}`, { n });
  return n;
}

async function syncInjuries(league: (typeof AF_LEAGUES)[number], season: number) {
  const ins = db.prepare(`INSERT OR REPLACE INTO af_injuries (fixture_id, team_id, player_id, player_name, type, reason) VALUES (?, ?, ?, ?, ?, ?)`);
  let n = 0, page = 1, pages = 1;
  do {
    const json = await af('/injuries', page > 1 ? { league: league.id, season, page } : { league: league.id, season });
    pages = json.paging?.total || 1;
    db.exec('BEGIN');
    try {
      for (const r of json.response || []) {
        if (!r.fixture?.id || !r.player?.id || !r.team?.id) continue;
        ins.run(r.fixture.id, r.team.id, r.player.id, r.player.name || null, r.player.type || null, r.player.reason || null);
        n++;
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    page++;
  } while (page <= pages && page <= 20);
  markSync(`injuries|${league.id}|${season}`, { n });
  return n;
}

async function syncLineup(fixtureId: number) {
  const json = await af('/fixtures/lineups', { fixture: fixtureId });
  const list = json.response || [];
  const ins = db.prepare(`INSERT OR REPLACE INTO af_lineups (fixture_id, team_id, player_id, player_name, pos, starter) VALUES (?, ?, ?, ?, ?, ?)`);
  let n = 0;
  db.exec('BEGIN');
  try {
    for (const t of list) {
      const teamId = t.team?.id;
      if (!teamId) continue;
      for (const s of t.startXI || []) if (s.player?.id) { ins.run(fixtureId, teamId, s.player.id, s.player.name || null, s.player.pos || null, 1); n++; }
      for (const s of t.substitutes || []) if (s.player?.id) ins.run(fixtureId, teamId, s.player.id, s.player.name || null, s.player.pos || null, 0);
    }
    db.prepare(`UPDATE af_fixtures SET lineups = ? WHERE fixture_id = ?`).run(n >= 20 ? 1 : 2, fixtureId);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return n;
}

/** Map API-Football team ids to football-data.co.uk names, per group. */
function mapTeams(group: string) {
  const divs = GROUPS[group]?.divisions || [];
  if (!divs.length) return { mapped: 0, unmatched: [] as string[] };
  const fdNames: string[] = db
    .prepare(`SELECT DISTINCT home AS n FROM history_matches WHERE division IN (${divs.map(() => '?').join(',')})`)
    .all(...divs)
    .map((r: any) => r.n);
  const teams = db.prepare(`SELECT team_id, name FROM af_teams WHERE grp = ?`).all(group) as any[];
  const pairs: { id: number; name: string; fd: string; score: number }[] = [];
  for (const t of teams)
    for (const fd of fdNames) {
      const key = fd.toLowerCase();
      let score = 0;
      for (const h of [fd, ALIASES[key] || '', AF_ALIASES[key] || ''].filter(Boolean)) score = Math.max(score, similarity(h, t.name));
      if (score >= 0.5) pairs.push({ id: t.team_id, name: t.name, fd, score });
    }
  pairs.sort((a, b) => b.score - a.score);
  const usedT = new Set<number>(), usedF = new Set<string>();
  const upd = db.prepare(`UPDATE af_teams SET fd_name = ?, score = ? WHERE grp = ? AND team_id = ?`);
  db.prepare(`UPDATE af_teams SET fd_name = NULL, score = NULL WHERE grp = ?`).run(group);
  for (const p of pairs) {
    if (usedT.has(p.id) || usedF.has(p.fd)) continue;
    upd.run(p.fd, p.score, group, p.id);
    usedT.add(p.id); usedF.add(p.fd);
  }
  const unmatched = teams.filter(t => !usedT.has(t.team_id)).map(t => t.name);
  return { mapped: usedT.size, unmatched };
}

/* ------------------------------------------------------------------ */
/* Features for the model                                               */
/* ------------------------------------------------------------------ */

export interface TeamAvail {
  missing: number | null; // Σ regular-weight of injured/suspended (doubtful = half)
  absent: number | null; // Σ regular-weight of the usual top-11 not in the confirmed XI (null = XI not known)
  missingNames: string[];
  absentNames: string[];
  lineups: number; // how many past lineups the regulars come from
}
export interface MatchAvail { fixtureId: number; home: TeamAvail; away: TeamAvail }

const features = new Map<string, MatchAvail>(); // `${grp}|${fdHome}|${fdAway}|${date}`
let featuresBuiltAt: string | null = null;
let lastValueMatch: { players: number; withValue: number } | null = null;

/** Rebuild the availability features of one group (walk-forward over its fixtures). */
function buildFeatures(group: string) {
  const fixtures = db.prepare(`
    SELECT f.fixture_id, f.kickoff, f.date, f.home_id, f.away_id, th.fd_name AS fd_home, ta.fd_name AS fd_away, f.lineups
    FROM af_fixtures f
    LEFT JOIN af_teams th ON th.grp = f.grp AND th.team_id = f.home_id
    LEFT JOIN af_teams ta ON ta.grp = f.grp AND ta.team_id = f.away_id
    WHERE f.grp = ? ORDER BY f.kickoff
  `).all(group) as any[];
  if (!fixtures.length) return 0;
  const ids = fixtures.map(f => f.fixture_id);
  const starters = new Map<number, Map<number, { ids: Set<number>; names: Map<number, string> }>>(); // fixture → team → XI
  const inj = new Map<number, Map<number, { id: number; name: string; type: string }[]>>(); // fixture → team → list
  const chunk = 500;
  for (let i = 0; i < ids.length; i += chunk) {
    const part = ids.slice(i, i + chunk);
    const ph = part.map(() => '?').join(',');
    for (const r of db.prepare(`SELECT fixture_id, team_id, player_id, player_name FROM af_lineups WHERE starter = 1 AND fixture_id IN (${ph})`).all(...part) as any[]) {
      const byTeam = starters.get(r.fixture_id) || starters.set(r.fixture_id, new Map()).get(r.fixture_id)!;
      const xi = byTeam.get(r.team_id) || byTeam.set(r.team_id, { ids: new Set(), names: new Map() }).get(r.team_id)!;
      xi.ids.add(r.player_id); xi.names.set(r.player_id, r.player_name);
    }
    for (const r of db.prepare(`SELECT fixture_id, team_id, player_id, player_name, type FROM af_injuries WHERE fixture_id IN (${ph})`).all(...part) as any[]) {
      const byTeam = inj.get(r.fixture_id) || inj.set(r.fixture_id, new Map()).get(r.fixture_id)!;
      (byTeam.get(r.team_id) || byTeam.set(r.team_id, []).get(r.team_id)!).push({ id: r.player_id, name: r.player_name, type: r.type || '' });
    }
  }

  // walk forward: each team's recent XIs (before the fixture)
  const history = new Map<number, { ids: Set<number>; names: Map<number, string> }[]>();
  const prefix = `${group}|`;
  for (const key of [...features.keys()]) if (key.startsWith(prefix)) features.delete(key);

  // player importance = how often he starts × how valuable he is relative to the team's usual XI
  const valueCache = new Map<number, number | null>();
  const valueOf = (id: number, name: string, club: string | null) => {
    if (!valueCache.has(id)) valueCache.set(id, playerValue(name, club));
    return valueCache.get(id)!;
  };

  const teamAvail = (teamId: number, fixtureId: number, club: string | null): TeamAvail => {
    const past = (history.get(teamId) || []).slice(-REGULAR_WINDOW);
    const out: TeamAvail = { missing: null, absent: null, missingNames: [], absentNames: [], lineups: past.length };
    if (past.length < 3) return out;
    const weight = new Map<number, number>();
    const names = new Map<number, string>();
    for (const xi of past) xi.ids.forEach(id => { weight.set(id, (weight.get(id) || 0) + 1 / past.length); names.set(id, xi.names.get(id) || String(id)); });
    const top11 = [...weight.entries()].sort((a, b) => b[1] - a[1]).slice(0, 11);
    const known = top11.map(([id]) => valueOf(id, names.get(id) || '', club)).filter((v): v is number => v !== null);
    const ref = known.length >= 5 ? known.reduce((s, v) => s + v, 0) / known.length : null;
    const quality = (id: number, name: string) => {
      if (ref === null) return 1;
      const v = valueOf(id, name, club);
      return v === null ? 0.7 : Math.max(0.2, Math.min(4, v / ref));
    };
    const imp = (id: number, name: string) => (weight.get(id) || 0) * quality(id, name);

    // injuries / suspensions
    let missing = 0;
    const listed = (inj.get(fixtureId)?.get(teamId) || []).map(p => ({ ...p, w: imp(p.id, p.name) * (/question|doubt/i.test(p.type) ? 0.5 : 1) }));
    for (const p of listed) missing += p.w;
    out.missing = Math.round(missing * 100) / 100;
    out.missingNames = listed.filter(p => p.w >= 0.3).sort((a, b) => b.w - a.w).slice(0, 4).map(p => p.name);
    // confirmed XI
    const xi = starters.get(fixtureId)?.get(teamId);
    if (xi && xi.ids.size >= 10) {
      let absent = 0;
      const absentList: { name: string; w: number }[] = [];
      for (const [id] of top11) if (!xi.ids.has(id)) { const w = imp(id, names.get(id) || ''); absent += w; absentList.push({ name: names.get(id) || String(id), w }); }
      out.absent = Math.round(absent * 100) / 100;
      out.absentNames = absentList.sort((a, b) => b.w - a.w).slice(0, 4).map(p => p.name);
    }
    return out;
  };

  let n = 0;
  const countValues = () => {
    let withValue = 0;
    valueCache.forEach(v => { if (v !== null) withValue++; });
    return { players: valueCache.size, withValue };
  };
  for (const f of fixtures) {
    if (f.fd_home && f.fd_away) {
      features.set(`${group}|${f.fd_home}|${f.fd_away}|${f.date}`, {
        fixtureId: f.fixture_id,
        home: teamAvail(f.home_id, f.fixture_id, f.fd_home),
        away: teamAvail(f.away_id, f.fixture_id, f.fd_away)
      });
      n++;
    }
    const byTeam = starters.get(f.fixture_id);
    if (byTeam) byTeam.forEach((xi, teamId) => {
      if (xi.ids.size < 10) return;
      const h = history.get(teamId) || history.set(teamId, []).get(teamId)!;
      h.push(xi);
      if (h.length > REGULAR_WINDOW * 2) h.shift();
    });
  }
  const vm = countValues();
  lastValueMatch = lastValueMatch && group !== 'E' ? { players: lastValueMatch.players + vm.players, withValue: lastValueMatch.withValue + vm.withValue } : vm;
  return n;
}

export function rebuildAfFeatures() {
  let n = 0;
  for (const g of Object.keys(GROUPS)) n += buildFeatures(g);
  featuresBuiltAt = new Date().toISOString();
  return n;
}

/** Availability for a match by football-data.co.uk names and date (±1 day for time zones). */
export function availabilityFor(group: string, fdHome: string, fdAway: string, date: string): MatchAvail | null {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`).getTime();
  for (const off of [0, -1, 1]) {
    const k = `${group}|${fdHome}|${fdAway}|${new Date(d + off * 86400000).toISOString().slice(0, 10)}`;
    const f = features.get(k);
    if (f) return f;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Scheduler                                                            */
/* ------------------------------------------------------------------ */

let running = false;
let lastTick: { at: string; calls: number; note: string } | null = null;

export async function afTick(force = false) {
  if (!KEY() || running) return lastTick;
  running = true;
  const before = callsThisBoot;
  const notes: string[] = [];
  try {
    const cur = currentAfSeason();
    const seasons = seasonCodes(3).map(afSeason); // e.g. 2026, 2025, 2024
    // 1) fixtures + injuries: past seasons once, current season every 6 h
    for (const lg of AF_LEAGUES)
      for (const s of seasons) {
        if (budgetLeft() < 5) { notes.push('daily budget reserve reached'); break; }
        const stale = (key: string) => {
          const t = syncedAt(key);
          return force && s === cur ? true : t === null || (s === cur && Date.now() - t > 6 * 3600 * 1000);
        };
        try {
          if (stale(`fixtures|${lg.id}|${s}`)) await syncFixtures(lg, s);
          if (stale(`injuries|${lg.id}|${s}`)) await syncInjuries(lg, s);
        } catch (e: any) {
          notes.push(`${lg.id}/${s}: ${e.message}`);
        }
      }
    for (const g of Object.keys(GROUPS)) mapTeams(g);

    // 2) lineups for matches kicking off within the next 90 min (or started in the last 3 h) — top divisions only
    const now = Date.now();
    const soon = db.prepare(`
      SELECT fixture_id FROM af_fixtures
      WHERE lineups != 1 AND kickoff BETWEEN ? AND ? AND league_id IN (${AF_LEAGUES.filter(l => l.top).map(l => l.id).join(',')})
    `).all(new Date(now - 3 * 3600 * 1000).toISOString(), new Date(now + 90 * 60 * 1000).toISOString()) as any[];
    for (const f of soon) {
      if (budgetLeft() < 1) break;
      try { await syncLineup(f.fixture_id); } catch (e: any) { notes.push(`lineup ${f.fixture_id}: ${e.message}`); }
    }

    // 3) history of lineups, most recent first
    const backlog = db.prepare(`
      SELECT fixture_id FROM af_fixtures
      WHERE lineups = 0 AND status IN ('FT','AET','PEN') AND league_id IN (${AF_LEAGUES.filter(l => l.top).map(l => l.id).join(',')})
      ORDER BY kickoff DESC LIMIT ?
    `).all(BACKFILL_PER_TICK) as any[];
    let got = 0;
    for (const f of backlog) {
      if (budgetLeft() < 1) { notes.push('daily budget reserve reached'); break; }
      try { await syncLineup(f.fixture_id); got++; } catch (e: any) { notes.push(`lineup ${f.fixture_id}: ${e.message}`); break; }
    }
    if (got) notes.push(`${got} past lineups`);

    rebuildAfFeatures();
    lastError = null;
  } catch (e: any) {
    lastError = e.message;
    logger.warn(`API-Football tick failed: ${e.message}`);
  } finally {
    running = false;
    lastTick = { at: new Date().toISOString(), calls: callsThisBoot - before, note: notes.slice(0, 8).join(' · ') };
    if (lastTick.calls) logger.info(`API-Football tick: ${lastTick.calls} calls${lastTick.note ? ` (${lastTick.note})` : ''}`);
  }
  return lastTick;
}

export function startApiFootballScheduler(onUpdated?: () => void) {
  if (!KEY()) {
    logger.info('API_FOOTBALL_KEY not set — injuries/lineups feed disabled');
    return;
  }
  try { rebuildAfFeatures(); } catch { /* tables may be empty */ }
  const tick = () => afTick().then(() => onUpdated?.()).catch(() => undefined);
  setTimeout(tick, 2 * 60 * 1000);
  setInterval(tick, TICK_MS);
}

/* ------------------------------------------------------------------ */
/* Status                                                               */
/* ------------------------------------------------------------------ */

export async function afStatus(withAccount = true) {
  let account: any = null;
  if (withAccount && KEY()) {
    try {
      const j = await af('/status'); // does not count against the daily quota
      const r = j.response || {};
      account = { plan: r.subscription?.plan, active: r.subscription?.active, end: r.subscription?.end, requests: r.requests };
    } catch (e: any) {
      account = { error: e.message };
    }
  }
  const perLeague = db.prepare(`
    SELECT league_id, season, COUNT(*) AS fixtures,
           SUM(CASE WHEN lineups = 1 THEN 1 ELSE 0 END) AS lineups,
           SUM(CASE WHEN status IN ('FT','AET','PEN') THEN 1 ELSE 0 END) AS finished
    FROM af_fixtures GROUP BY league_id, season ORDER BY league_id, season
  `).all();
  const injuries: any = db.prepare(`SELECT COUNT(*) AS n FROM af_injuries`).get();
  const unmatched: Record<string, string[]> = {};
  for (const g of Object.keys(GROUPS)) {
    const rows = db.prepare(`SELECT name FROM af_teams WHERE grp = ? AND fd_name IS NULL`).all(g) as any[];
    if (rows.length) unmatched[g] = rows.map(r => r.name);
  }
  // a look at the next matches with known absentees
  const upcoming: any[] = [];
  const next = db.prepare(`
    SELECT f.fixture_id, f.kickoff, f.grp, f.home_name, f.away_name, th.fd_name AS fh, ta.fd_name AS fa, f.date
    FROM af_fixtures f
    LEFT JOIN af_teams th ON th.grp = f.grp AND th.team_id = f.home_id
    LEFT JOIN af_teams ta ON ta.grp = f.grp AND ta.team_id = f.away_id
    WHERE f.kickoff > ? ORDER BY f.kickoff LIMIT 40
  `).all(new Date().toISOString()) as any[];
  for (const f of next) {
    if (!f.fh || !f.fa) continue;
    const a = availabilityFor(f.grp, f.fh, f.fa, f.date);
    if (a && ((a.home.missing || 0) + (a.away.missing || 0) > 0)) upcoming.push({ kickoff: f.kickoff, match: `${f.home_name} – ${f.away_name}`, home: a.home, away: a.away });
    if (upcoming.length >= 8) break;
  }
  return {
    configured: !!KEY(),
    account,
    quota: { remainingDay, limitDay, reserve: RESERVE, callsThisBoot },
    running,
    lastTick,
    lastError,
    featuresBuiltAt,
    features: features.size,
    playerValueMatch: lastValueMatch,
    injuries: injuries?.n || 0,
    perLeague,
    unmatchedTeams: unmatched,
    upcomingWithAbsentees: upcoming
  };
}
