/**
 * Extra competitions from API-Football (national teams, Europa/Conference League, Israel, Saudi Arabia,
 * more European leagues), served in the SAME shape as Football-Data.org matches so every page works
 * unchanged. Ids are offset so they never collide with Football-Data.org ids:
 *   match id = AF_OFFSET + fixture id,  team id = AF_OFFSET + team id,  competition code = "AF<league id>".
 *
 * Budget (Pro 7,500/day): fixture window every 30 min (~15 leagues), live scores every 60 s only while one of
 * these matches is in play, match details / tables / scorers / odds on demand with caching.
 */
import logger from '../utils/logger';
import { db } from '../db';
import { afGet, afConfigured, afRemaining } from './apiFootball';
import { predictFromStandings, Prediction } from './predictionModel';
import { groupForCompetition, buildTeamMap, fdNameFor } from './history';
import { predictV2 } from './historyModel';
import { predictV3 } from './gridModel';
import { predictNational } from './nationalElo';
import { predictClubEuro } from './clubElo';

export const AF_OFFSET = 1_000_000_000;
export const isAfMatchId = (id: number) => id >= AF_OFFSET;
export const isAfCode = (code: string) => /^AF\d+$/i.test(code);

type Kind = 'national' | 'cup' | 'league';
export const EXTRA_COMPETITIONS: { id: number; kind: Kind; name?: string }[] = [
  // National teams
  { id: 5, kind: 'national' }, // UEFA Nations League
  { id: 10, kind: 'national' }, // International friendlies
  { id: 32, kind: 'national' }, // World Cup qualification — Europe
  { id: 34, kind: 'national' }, // World Cup qualification — South America
  { id: 29, kind: 'national' }, // World Cup qualification — Africa
  { id: 30, kind: 'national' }, // World Cup qualification — Asia
  { id: 31, kind: 'national' }, // World Cup qualification — CONCACAF
  { id: 960, kind: 'national' }, // Euro qualification
  // European cups
  { id: 3, kind: 'cup' }, // UEFA Europa League
  { id: 848, kind: 'cup' }, // UEFA Conference League
  // Israel + Middle East
  { id: 383, kind: 'league' }, // Israel — Ligat Ha'Al
  { id: 307, kind: 'league' }, // Saudi Pro League
  // More European leagues
  { id: 144, kind: 'league' }, // Belgium — Jupiler Pro League
  { id: 203, kind: 'league' }, // Turkey — Süper Lig
  { id: 179, kind: 'league' }, // Scotland — Premiership
  { id: 197, kind: 'league' }, // Greece — Super League 1
  { id: 218, kind: 'league' }, // Austria — Bundesliga
  { id: 207, kind: 'league' } // Switzerland — Super League
];
const KIND_RANK: Record<Kind, number> = { cup: 1, league: 2, national: 3 };
/** Senior men's teams only: API-Football's "Friendlies" also carries U17–U23 and women's sides. */
const YOUTH = /\bU-?(1[5-9]|2[0-3])\b|\bUnder[- ]?\d{2}\b|\b(W|Women)$/i;
const senior = (f: any) => !YOUTH.test(f.teams?.home?.name || '') && !YOUTH.test(f.teams?.away?.name || '');
const WINDOW_DAYS = 30;

/* ------------------------------------------------------------------ */
/* Small cache                                                          */
/* ------------------------------------------------------------------ */

const cache = new Map<string, { data: any; expires: number }>();
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data as T;
  const data = await load();
  cache.set(key, { data, expires: Date.now() + ttlMs });
  return data;
}
// drop expired entries so the cache can't grow without limit
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cache) if (v.expires < now) cache.delete(k);
}, 10 * 60 * 1000).unref();

/* ------------------------------------------------------------------ */
/* Conversion to Football-Data.org shape                                */
/* ------------------------------------------------------------------ */

const STATUS: Record<string, string> = {
  TBD: 'SCHEDULED', NS: 'TIMED', '1H': 'IN_PLAY', HT: 'PAUSED', '2H': 'IN_PLAY', ET: 'IN_PLAY', BT: 'PAUSED', P: 'IN_PLAY',
  SUSP: 'SUSPENDED', INT: 'SUSPENDED', FT: 'FINISHED', AET: 'FINISHED', PEN: 'FINISHED', PST: 'POSTPONED',
  CANC: 'CANCELLED', ABD: 'CANCELLED', AWD: 'AWARDED', WO: 'AWARDED', LIVE: 'IN_PLAY'
};

const leagueMeta = new Map<number, { name: string; logo: string; country: string; flag: string | null; season: number; kind: Kind }>();

export function afTeam(t: any) {
  if (!t) return null;
  return { id: AF_OFFSET + t.id, name: t.name, shortName: t.name, tla: String(t.name || '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase(), crest: t.logo };
}

/*
 * Every national-team competition, not only the fixed list: API-Football files them under country "World".
 * Club, youth, women's, futsal and similar "World" competitions are left out by name.
 */
const NOT_NATIONAL = /club|champions (league|cup)|challenge league|central american cup|caribbean cup|shield|libertadores|sudamericana|recopa|leagues cup|confederation cup|afc cup|super cup|intercontinental|youth|\bu-?\d{2}\b|under[- ]?\d{2}|women|olympic|futsal|beach|e-?soccer|premier league international|challenge cup|charity|reserve|amateur|universit|military|toulon|revello|emirates cup|audi cup|trophy/i;
export function isNationalLeague(league: any): boolean {
  if (EXTRA_COMPETITIONS.some(c => c.id === league?.id && c.kind === 'national')) return true;
  return league?.country === 'World' && !NOT_NATIONAL.test(String(league?.name || ''));
}

function competitionOf(league: any) {
  const kind: Kind = EXTRA_COMPETITIONS.find(c => c.id === league.id)?.kind || (isNationalLeague(league) ? 'national' : 'league');
  const country = league.country && !['World', 'Europe'].includes(league.country) ? league.country : null;
  return {
    id: AF_OFFSET + league.id,
    code: `AF${league.id}`,
    name: country && kind === 'league' ? `${league.name} (${country})` : league.name,
    emblem: league.logo,
    type: kind === 'national' ? 'NATIONAL' : kind === 'cup' ? 'CUP' : 'LEAGUE',
    rank: KIND_RANK[kind],
    source: 'api-football'
  };
}

export function toFdMatch(f: any) {
  const st = f.fixture?.status || {};
  const round: string = f.league?.round || '';
  const md = round.match(/(\d+)\s*$/);
  const hg = f.goals?.home ?? null, ag = f.goals?.away ?? null;
  const status = STATUS[st.short] || 'SCHEDULED';
  return {
    id: AF_OFFSET + f.fixture.id,
    utcDate: new Date(f.fixture.date).toISOString(),
    status,
    minute: st.elapsed ?? null,
    injuryTime: st.extra ?? null,
    matchday: /regular season|group|league stage/i.test(round) && md ? parseInt(md[1], 10) : null,
    stage: /regular season/i.test(round) ? 'REGULAR_SEASON' : round.toUpperCase().replace(/\s+/g, '_') || null,
    group: null,
    venue: f.fixture?.venue?.name || null,
    competition: competitionOf(f.league),
    area: { name: f.league?.country, flag: f.league?.flag },
    season: { startDate: `${f.league?.season}-07-01`, endDate: `${(f.league?.season || 0) + 1}-06-30` },
    homeTeam: afTeam(f.teams?.home),
    awayTeam: afTeam(f.teams?.away),
    score: {
      winner: hg === null || ag === null || status !== 'FINISHED' ? null : hg > ag ? 'HOME_TEAM' : hg < ag ? 'AWAY_TEAM' : 'DRAW',
      fullTime: { home: hg, away: ag },
      halfTime: { home: f.score?.halftime?.home ?? null, away: f.score?.halftime?.away ?? null }
    },
    referees: f.fixture?.referee ? [{ id: 0, name: String(f.fixture.referee).split(',')[0], type: 'REFEREE' }] : [],
    source: 'api-football'
  };
}

const POS: Record<string, string> = { G: 'Goalkeeper', D: 'Defence', M: 'Midfield', F: 'Offence' };
const STAT_KEYS: Record<string, string> = {
  'Ball Possession': 'ball_possession', 'Total Shots': 'shots', 'Shots on Goal': 'shots_on_goal', 'Shots off Goal': 'shots_off_goal',
  'Blocked Shots': 'blocked_shots', 'Shots insidebox': 'shots_inside_box', 'Shots outsidebox': 'shots_outside_box',
  'Corner Kicks': 'corner_kicks', Fouls: 'fouls', Offsides: 'offsides', 'Goalkeeper Saves': 'saves',
  'Yellow Cards': 'yellow_cards', 'Red Cards': 'red_cards', 'Total passes': 'passes', 'Passes accurate': 'passes_accurate',
  'Passes %': 'pass_accuracy', expected_goals: 'expected_goals', goals_prevented: 'goals_prevented'
};

/** Full match (events, lineups, statistics) from /fixtures?id=. */
function toFdMatchFull(f: any) {
  const m: any = toFdMatch(f);
  const team = (t: any) => ({ id: AF_OFFSET + t.id, name: t.name });
  for (const side of ['homeTeam', 'awayTeam'] as const) {
    const afId = side === 'homeTeam' ? f.teams.home.id : f.teams.away.id;
    const lu = (f.lineups || []).find((l: any) => l.team?.id === afId);
    if (lu) {
      // Small nations often have players without an API-Football id: keep them (synthetic negative id), never drop them.
      // grid = "row:col" from API-Football (row 1 = goalkeeper), used to draw the pitch exactly.
      const pl = (x: any, i: number, bench = false) => ({
        id: x.player.id ? AF_OFFSET + x.player.id : -((side === 'homeTeam' ? 1000 : 2000) + (bench ? 100 : 0) + i),
        name: x.player.name || '?', position: POS[x.player.pos] || null, shirtNumber: x.player.number ?? null, grid: x.player.grid || null
      });
      m[side].formation = lu.formation || null;
      m[side].lineup = (lu.startXI || []).filter((x: any) => x.player?.name).map((x: any, i: number) => pl(x, i));
      m[side].bench = (lu.substitutes || []).filter((x: any) => x.player?.name).map((x: any, i: number) => pl(x, i, true));
      m[side].coach = lu.coach?.name ? { id: lu.coach.id, name: lu.coach.name } : null;
    }
    const st = (f.statistics || []).find((s: any) => s.team?.id === afId);
    if (st) {
      const out: Record<string, number> = {};
      for (const s of st.statistics || []) {
        const k = STAT_KEYS[s.type];
        if (!k || s.value === null || s.value === undefined) continue;
        const v = typeof s.value === 'string' ? parseFloat(s.value) : s.value;
        if (Number.isFinite(v)) out[k] = v;
      }
      m[side].statistics = out;
    }
  }
  const goals: any[] = [], bookings: any[] = [], subs: any[] = [];
  for (const e of f.events || []) {
    const minute = e.time?.elapsed ?? 0;
    const extra = e.time?.extra ?? null;
    if (e.type === 'Goal' && !/missed/i.test(e.detail || '')) {
      goals.push({
        minute, injuryTime: extra,
        type: /own/i.test(e.detail) ? 'OWN' : /penalty/i.test(e.detail) ? 'PENALTY' : 'REGULAR',
        team: team(e.team), scorer: { id: AF_OFFSET + (e.player?.id || 0), name: e.player?.name || '?' },
        assist: e.assist?.name ? { id: AF_OFFSET + (e.assist.id || 0), name: e.assist.name } : null
      });
    } else if (e.type === 'Card') {
      bookings.push({
        minute, team: team(e.team), player: { id: AF_OFFSET + (e.player?.id || 0), name: e.player?.name || '?' },
        card: /second yellow/i.test(e.detail) ? 'YELLOW_RED' : /red/i.test(e.detail) ? 'RED' : 'YELLOW'
      });
    } else if (e.type === 'subst') {
      // API-Football: "player" = player coming ON, "assist" = player going OFF
      subs.push({
        minute, team: team(e.team),
        playerIn: { id: AF_OFFSET + (e.player?.id || 0), name: e.player?.name || '?' },
        playerOut: { id: AF_OFFSET + (e.assist?.id || 0), name: e.assist?.name || '?' }
      });
    }
  }
  m.goals = goals;
  m.bookings = bookings;
  m.substitutions = subs;
  return m;
}

/** API-Football standings → Football-Data.org standings (TOTAL / HOME / AWAY tables, one per group). */
function toFdStandings(resp: any) {
  const league = resp?.[0]?.league;
  if (!league) return null;
  const groups: any[][] = league.standings || [];
  const tables: any[] = [];
  const row = (r: any, key: 'all' | 'home' | 'away') => ({
    position: r.rank,
    team: { id: AF_OFFSET + r.team.id, name: r.team.name, shortName: r.team.name, tla: '', crest: r.team.logo },
    playedGames: r[key]?.played ?? 0,
    form: key === 'all' && r.form ? r.form.split('').join(',') : null,
    won: r[key]?.win ?? 0, draw: r[key]?.draw ?? 0, lost: r[key]?.lose ?? 0,
    points: key === 'all' ? r.points : (r[key]?.win ?? 0) * 3 + (r[key]?.draw ?? 0),
    goalsFor: r[key]?.goals?.for ?? 0, goalsAgainst: r[key]?.goals?.against ?? 0,
    goalDifference: key === 'all' ? r.goalsDiff : (r[key]?.goals?.for ?? 0) - (r[key]?.goals?.against ?? 0)
  });
  for (const g of groups) {
    const groupName = groups.length > 1 ? g[0]?.group || null : null;
    for (const [type, key] of [['TOTAL', 'all'], ['HOME', 'home'], ['AWAY', 'away']] as const)
      tables.push({ stage: 'REGULAR_SEASON', type, group: groupName, table: g.map(r => row(r, key)) });
  }
  return {
    competition: { id: AF_OFFSET + league.id, name: league.name, code: `AF${league.id}`, emblem: league.logo },
    season: { startDate: `${league.season}-07-01` },
    standings: tables
  };
}

/* ------------------------------------------------------------------ */
/* Window + live                                                        */
/* ------------------------------------------------------------------ */

let windowMatches: any[] = [];
let windowAt: number | null = null;
let liveById = new Map<number, any>();
const standingsByCode = new Map<string, any>();

async function currentSeason(leagueId: number): Promise<number | null> {
  return cached(`season:${leagueId}`, 24 * 3600 * 1000, async () => {
    const j = await afGet('/leagues', { id: leagueId, current: 'true' });
    const l = j.response?.[0];
    if (!l) return null;
    const season = l.seasons?.find((s: any) => s.current)?.year ?? l.seasons?.[l.seasons.length - 1]?.year ?? null;
    const kind = EXTRA_COMPETITIONS.find(c => c.id === leagueId)?.kind || 'league';
    if (season) leagueMeta.set(leagueId, { name: l.league?.name, logo: l.league?.logo, country: l.country?.name, flag: l.country?.flag, season, kind });
    return season;
  });
}

let windowListener: ((matches: any[]) => void) | null = null;
/** Called after every window refresh (used to record predictions for tracking). */
export function onAfWindow(fn: (matches: any[]) => void) {
  windowListener = fn;
}

/** Only fixtures we know about get a details page (stops random ids from spending API-Football requests). */
export function isKnownAfFixture(matchId: number): boolean {
  if (windowMatches.some(m => m.id === matchId) || liveById.has(matchId)) return true;
  const fid = matchId - AF_OFFSET;
  for (const t of ['af_fixtures', 'eur_matches', 'nat_matches']) {
    try {
      if (db.prepare(`SELECT 1 FROM ${t} WHERE fixture_id = ?`).get(fid)) return true;
    } catch {
      /* table not created yet */
    }
  }
  return db.prepare(`SELECT 1 FROM predictions WHERE match_id = ? LIMIT 1`).get(matchId) ? true : false;
}

const natDays = new Map<string, { at: number; matches: any[] }>();
async function nationalByDate(from: string, to: string): Promise<any[]> {
  const out: any[] = [];
  const start = new Date(from + 'T00:00:00Z').getTime(), end = new Date(to + 'T00:00:00Z').getTime();
  const now = Date.now();
  for (let t = start; t <= end; t += 86400000) {
    const day = new Date(t).toISOString().slice(0, 10);
    const near = t <= now + 2 * 86400000;
    const have = natDays.get(day);
    if (!have || now - have.at > (near ? 25 * 60 * 1000 : 6 * 3600 * 1000)) {
      try {
        const j = await afGet('/fixtures', { date: day });
        const ms: any[] = [];
        for (const f of j.response || []) {
          if (!isNationalLeague(f.league) || !senior(f)) continue;
          if (!leagueMeta.has(f.league.id))
            leagueMeta.set(f.league.id, { name: f.league.name, logo: f.league.logo, country: f.league.country, flag: f.league.flag || null, season: f.league.season, kind: 'national' });
          ms.push(toFdMatch(f));
        }
        natDays.set(day, { at: now, matches: ms });
      } catch (e: any) {
        logger.warn(`AF national ${day}: ${e.message}`);
      }
    }
    out.push(...(natDays.get(day)?.matches || []));
  }
  for (const k of natDays.keys()) if (k < from) natDays.delete(k);
  return out;
}

export async function refreshAfWindow() {
  if (!afConfigured()) return 0;
  const from = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + WINDOW_DAYS * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const all: any[] = [];
  let failed = 0;
  for (const c of EXTRA_COMPETITIONS) {
    try {
      const season = await currentSeason(c.id);
      if (!season) continue;
      const j = await afGet('/fixtures', { league: c.id, season, from, to });
      for (const f of j.response || []) if (senior(f)) all.push(toFdMatch(f));
    } catch (e: any) {
      failed++;
      logger.warn(`AF window ${c.id}: ${e.message}`);
    }
  }
  // All other national-team competitions (CONCACAF Nations League, Asian/African qualifiers, regional cups…),
  // found day by day: one request per date, near dates every run, the rest every 6 hours
  const national = await nationalByDate(from, to);
  const seen = new Set(all.map(m => m.id));
  for (const m of national) if (!seen.has(m.id)) all.push(m);
  if (failed && windowMatches.length && all.length < windowMatches.length * 0.5) return windowMatches.length; // keep a healthy window
  windowMatches = all.sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  windowAt = Date.now();
  try {
    windowListener?.(windowMatches);
  } catch (e: any) {
    logger.warn(`AF window listener: ${e.message}`);
  }
  // Standings for leagues/cups with tables (not friendlies), for the v1 model and the league panel
  const fixedCodes = new Set(EXTRA_COMPETITIONS.filter(c => c.id !== 10).map(c => `AF${c.id}`));
  const codes = [...new Set(windowMatches.map(m => m.competition.code))].filter(c => fixedCodes.has(c));
  for (const code of codes) await getAfStandings(code).catch(() => null);
  return windowMatches.length;
}

/** Live scores for our extra competitions — one request, only while one of them can be in play. */
export async function pollAfLive() {
  if (!afConfigured()) return [];
  const now = Date.now();
  const maybeLive = windowMatches.some(m => {
    const t = new Date(m.utcDate).getTime();
    return t <= now + 5 * 60 * 1000 && t >= now - 3 * 3600 * 1000 && !['FINISHED', 'CANCELLED', 'POSTPONED', 'AWARDED'].includes(m.status);
  });
  if (!maybeLive) { liveById = new Map(); return []; }
  try {
    // all live fixtures in one request, kept when they belong to our window (fixed list + every national competition)
    const inWindow = new Set(windowMatches.map(m => m.id));
    const fixed = new Set(EXTRA_COMPETITIONS.map(c => c.id));
    const j = await afGet('/fixtures', { live: 'all' });
    const live = (j.response || [])
      .filter((f: any) => senior(f) && (inWindow.has(AF_OFFSET + f.fixture.id) || fixed.has(f.league?.id) || isNationalLeague(f.league)))
      .map(toFdMatch);
    liveById = new Map(live.map((m: any) => [m.id, m]));
    // fold live status/score into the window; matches that just finished get their final state
    const liveIds = new Set(liveById.keys());
    windowMatches = windowMatches.map(m => {
      const l = liveById.get(m.id);
      if (l) return { ...m, status: l.status, minute: l.minute, injuryTime: l.injuryTime, score: l.score };
      if (['IN_PLAY', 'PAUSED'].includes(m.status) && !liveIds.has(m.id)) return { ...m, status: 'FINISHED' };
      return m;
    });
    return live;
  } catch (e: any) {
    logger.warn(`AF live poll: ${e.message}`);
    return [...liveById.values()];
  }
}

export function startAfMatchesScheduler() {
  if (!afConfigured()) return;
  const refresh = () => refreshAfWindow().then(n => logger.info(`AF extra competitions: ${n} matches in window`)).catch(() => undefined);
  setTimeout(refresh, 30 * 1000);
  setInterval(refresh, 30 * 60 * 1000);
}

/* ------------------------------------------------------------------ */
/* Public API used by the routes                                        */
/* ------------------------------------------------------------------ */

export function afUpcoming(days = WINDOW_DAYS) {
  const cutoff = Date.now() + days * 24 * 3600 * 1000;
  return windowMatches.filter(m => new Date(m.utcDate).getTime() <= cutoff && new Date(m.utcDate).getTime() >= Date.now() - 3 * 3600 * 1000);
}
export const afLive = () => [...liveById.values()];
export const afWindowStatus = () => ({ matches: windowMatches.length, at: windowAt ? new Date(windowAt).toISOString() : null, competitions: [...new Set(windowMatches.map(m => m.competition.name))] });

export function afCompetitions() {
  return [...leagueMeta.entries()].map(([id, l]) => ({
    id: AF_OFFSET + id, code: `AF${id}`, name: l.name, emblem: l.logo, area: { name: l.country, flag: l.flag },
    type: l.kind === 'national' ? 'NATIONAL' : l.kind === 'cup' ? 'CUP' : 'LEAGUE', currentSeason: { startDate: `${l.season}-07-01` }
  }));
}

export async function getAfStandings(code: string) {
  const id = parseInt(code.replace(/^AF/i, ''), 10);
  return cached(`standings:${id}`, 30 * 60 * 1000, async () => {
    const season = await currentSeason(id);
    if (!season) return null;
    const j = await afGet('/standings', { league: id, season });
    const s = toFdStandings(j.response);
    if (s) {
      standingsByCode.set(`AF${id}`, s);
      // leagues with football-data.co.uk history (Belgium, Turkey, Scotland, Greece): map team names for v2/v3
      const group = groupForCompetition(`AF${id}`);
      if (group) {
        const teams = new Map<number, any>();
        for (const t of s.standings) for (const r of t.table) teams.set(r.team.id, { id: r.team.id, name: r.team.name, shortName: r.team.shortName });
        try { buildTeamMap(group, [...teams.values()]); } catch (e: any) { logger.warn(`AF team map ${group}: ${e.message}`); }
      }
    }
    return s;
  });
}

export async function getAfScorers(code: string, limit = 40) {
  const id = parseInt(code.replace(/^AF/i, ''), 10);
  return cached(`scorers:${id}`, 60 * 60 * 1000, async () => {
    const season = await currentSeason(id);
    if (!season) return { scorers: [] };
    const j = await afGet('/players/topscorers', { league: id, season });
    return {
      scorers: (j.response || []).slice(0, limit).map((r: any) => {
        const s = r.statistics?.[0] || {};
        return {
          player: { id: AF_OFFSET + r.player.id, name: r.player.name, nationality: r.player.nationality },
          team: afTeam(s.team),
          playedMatches: s.games?.appearences ?? null,
          goals: s.goals?.total ?? 0,
          assists: s.goals?.assists ?? 0,
          penalties: s.penalty?.scored ?? null
        };
      })
    };
  });
}

/** v1 (standings) prediction when the competition has a table; none for friendlies / knockout ties. */
export function afPrediction(m: any): Prediction | null {
  const st = standingsByCode.get(m.competition?.code);
  if (!st) return null;
  const inTable = (id: number) => st.standings.some((t: any) => t.type === 'TOTAL' && t.table.some((r: any) => r.team.id === id));
  if (!inTable(m.homeTeam?.id) || !inTable(m.awayTeam?.id)) return null;
  try { return predictFromStandings(st, m.homeTeam.id, m.awayTeam.id); } catch { return null; }
}

/** Every model that covers the match: v1 (table), plus v2/v3 where the league has history (Belgium, Turkey, Scotland, Greece). */
export function afPredictions(m: any): Prediction[] {
  const out: Prediction[] = [];
  // national teams: international Elo first (the main prediction), table model as a second opinion
  if (m.competition?.type === 'NATIONAL') {
    try { const e = predictNational(m, (m.competition.id || 0) - AF_OFFSET); if (e) out.push(e); } catch { /* not rated */ }
  }
  // European cups: European club Elo first
  if (m.competition?.type === 'CUP') {
    try { const e = predictClubEuro(m); if (e) out.push(e); } catch { /* not rated */ }
  }
  const v1 = afPrediction(m);
  if (v1) out.push(v1);
  for (const f of [predictV2, predictV3]) {
    try { const p = f(m); if (p) out.push(p); } catch { /* not covered */ }
  }
  return out;
}

export function afWithPredictions(matches: any[]) {
  return matches.map(m => {
    const predictions = afPredictions(m);
    return { ...m, prediction: predictions.find(p => p.model.startsWith('dc-history')) || predictions[0] || null, predictions };
  });
}

/**
 * Bookmaker odds for window matches kicking off within the next 3 hours (so tracked predictions of national-team /
 * cup / extra-league matches carry the market too and can be compared with the bookmakers). Cached 30 min per fixture.
 */
export async function withAfOdds(matches: any[]): Promise<any[]> {
  const now = Date.now();
  const soon = matches.filter(m => {
    const t = new Date(m.utcDate).getTime();
    return t > now && t - now <= 3 * 3600_000 && !['POSTPONED', 'CANCELLED', 'SUSPENDED'].includes(m.status);
  }).slice(0, 60);
  const out: any[] = [];
  for (const m of soon) {
    if (afRemaining() < 800) break;
    try {
      const odds = await afMarket(m.id - AF_OFFSET);
      if (odds) out.push({ ...m, odds });
    } catch { /* no odds for this fixture */ }
  }
  return out;
}

/**
 * Fill in bookmaker odds for tracked API-Football matches that were saved without them (national teams, cups, extra
 * leagues) — kicked off in the last 7 days, or starting within 3 hours. API-Football keeps pre-match odds for a
 * few days after the game, so the Bookmakers view of the Accuracy page can cover every tracked game.
 * Odds are market data, not our prediction, so a locked row may still receive them.
 */
export async function backfillAfOdds(max = 40): Promise<{ checked: number; filled: number }> {
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const until = new Date(Date.now() + 3 * 3600_000).toISOString();
  const rows = db.prepare(`
    SELECT DISTINCT match_id, utc_date FROM predictions
    WHERE match_id >= ? AND odds_home IS NULL AND utc_date BETWEEN ? AND ?
    ORDER BY utc_date DESC LIMIT ?
  `).all(AF_OFFSET, since, until, max) as any[];
  const upd = db.prepare(`UPDATE predictions SET odds_home = ?, odds_draw = ?, odds_away = ?, updated_at = ? WHERE match_id = ? AND odds_home IS NULL`);
  let checked = 0, filled = 0;
  for (const r of rows) {
    if (afRemaining() < 800) break;
    checked++;
    try {
      const odds = await afMarket(r.match_id - AF_OFFSET);
      if (!odds) continue;
      upd.run(odds.msw.homeWin, odds.msw.draw, odds.msw.awayWin, new Date().toISOString(), r.match_id);
      filled++;
    } catch { /* no odds for this fixture */ }
  }
  if (filled) logger.info(`AF odds backfill: ${filled} of ${checked} tracked matches got bookmaker odds`);
  return { checked, filled };
}

async function afMarket(fixtureId: number) {
  return cached(`odds:${fixtureId}`, 30 * 60 * 1000, async () => {
    const j = await afGet('/odds', { fixture: fixtureId, bet: 1 });
    const books: any[] = j.response?.[0]?.bookmakers || [];
    const lines: { name: string; h: number; d: number; a: number }[] = [];
    for (const b of books) {
      const bet = (b.bets || []).find((t: any) => t.id === 1);
      if (!bet) continue;
      const odd = (v: string) => parseFloat((bet.values || []).find((x: any) => x.value === v)?.odd);
      const h = odd('Home'), d = odd('Draw'), a = odd('Away');
      if ([h, d, a].every(x => Number.isFinite(x) && x > 1)) lines.push({ name: b.name, h, d, a });
    }
    if (!lines.length) return null;
    const main = lines.find(l => l.name === 'Pinnacle') || lines.find(l => l.name === 'Bet365') || lines[0];
    const inv = 1 / main.h + 1 / main.d + 1 / main.a;
    return {
      msw: { homeWin: main.h, draw: main.d, awayWin: main.a },
      bookmaker: main.name.toLowerCase().replace(/\s+/g, '_'),
      books: lines.length,
      best: { homeWin: Math.max(...lines.map(l => l.h)), draw: Math.max(...lines.map(l => l.d)), awayWin: Math.max(...lines.map(l => l.a)) },
      probs: { home: Math.round((1 / main.h / inv) * 1000) / 10, draw: Math.round((1 / main.d / inv) * 1000) / 10, away: Math.round((1 / main.a / inv) * 1000) / 10 },
      overround: Math.round((inv - 1) * 1000) / 10,
      fetchedAt: new Date().toISOString()
    };
  });
}

async function afTeamForm(afTeamId: number) {
  return cached(`form:${afTeamId}`, 30 * 60 * 1000, async () => {
    const j = await afGet('/fixtures', { team: afTeamId, last: 5 });
    return (j.response || []).map(toFdMatch);
  });
}

async function afH2H(homeAf: number, awayAf: number, homeId: number, awayId: number) {
  return cached(`h2h:${homeAf}-${awayAf}`, 6 * 3600 * 1000, async () => {
    const j = await afGet('/fixtures/headtohead', { h2h: `${homeAf}-${awayAf}`, last: 10 });
    const matches = (j.response || []).map(toFdMatch).filter((m: any) => m.status === 'FINISHED');
    const agg = { numberOfMatches: matches.length, totalGoals: 0, homeTeam: { id: homeId, wins: 0, draws: 0, losses: 0 }, awayTeam: { id: awayId, wins: 0, draws: 0, losses: 0 } };
    for (const m of matches) {
      const hg = m.score.fullTime.home ?? 0, ag = m.score.fullTime.away ?? 0;
      agg.totalGoals += hg + ag;
      const homeGoals = m.homeTeam.id === homeId ? hg : ag, awayGoals = m.homeTeam.id === homeId ? ag : hg;
      if (homeGoals > awayGoals) { agg.homeTeam.wins++; agg.awayTeam.losses++; }
      else if (homeGoals < awayGoals) { agg.homeTeam.losses++; agg.awayTeam.wins++; }
      else { agg.homeTeam.draws++; agg.awayTeam.draws++; }
    }
    return { aggregates: agg, matches };
  });
}

function standingRow(st: any, teamId: number) {
  if (!st) return null;
  const table = st.standings.find((t: any) => t.type === 'TOTAL' && t.table.some((r: any) => r.team.id === teamId));
  if (!table) return null;
  const r = table.table.find((x: any) => x.team.id === teamId);
  return r ? { ...r, group: table.group || null, teamsInTable: table.table.length } : null;
}

/** Same payload as footballDataAPI.getMatchDetails, for an API-Football match. */
/**
 * /fixtures?id= sometimes comes back without statistics or lineups while the dedicated endpoints have them
 * (they are filled at different times). Ask those endpoints directly when the fixture lacks them.
 */
async function withStatsAndLineups(raw: any) {
  if (!raw) return raw;
  const fid = raw.fixture?.id;
  const st = raw.fixture?.status?.short;
  const ko = new Date(raw.fixture?.date).getTime();
  const started = !['TBD', 'NS', 'PST', 'CANC'].includes(st);
  const live = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE'].includes(st);
  const out = { ...raw };
  if (started && !(raw.statistics && raw.statistics.length)) {
    try {
      const j = await cached(`stats:${fid}`, live ? 45 * 1000 : 30 * 60 * 1000, () => afGet('/fixtures/statistics', { fixture: fid }));
      if (j?.response?.length) out.statistics = j.response;
    } catch (e: any) {
      logger.warn(`AF statistics ${fid}: ${e.message}`);
    }
  }
  if (!(raw.lineups && raw.lineups.length) && Date.now() > ko - 75 * 60 * 1000) {
    try {
      const j = await cached(`lineups:${fid}`, 5 * 60 * 1000, () => afGet('/fixtures/lineups', { fixture: fid }));
      if (j?.response?.length) out.lineups = j.response;
    } catch (e: any) {
      logger.warn(`AF lineups ${fid}: ${e.message}`);
    }
  }
  return out;
}

export async function getAfMatchDetails(matchId: number) {
  const fixtureId = matchId - AF_OFFSET;
  const raw0 = await cached(`fixture:${fixtureId}`, 60 * 1000, async () => {
    const j = await afGet('/fixtures', { id: fixtureId });
    return j.response?.[0] || null;
  });
  if (!raw0) throw Object.assign(new Error('Match not found'), { response: { status: 404 } });
  const raw = await withStatsAndLineups(raw0);
  const match = toFdMatchFull(raw);
  const code = match.competition.code;
  const [standings, homeForm, awayForm, h2h, market] = await Promise.all([
    code !== 'AF10' ? getAfStandings(code).catch(() => null) : Promise.resolve(null),
    afTeamForm(raw.teams.home.id).catch(() => []),
    afTeamForm(raw.teams.away.id).catch(() => []),
    afH2H(raw.teams.home.id, raw.teams.away.id, match.homeTeam.id, match.awayTeam.id).catch(() => null),
    match.status === 'FINISHED' ? Promise.resolve(null) : afMarket(fixtureId).catch(() => null)
  ]);
  const predictions = afPredictions(match);
  return {
    match,
    prediction: predictions.find(p => p.model.startsWith('dc-history')) || predictions[0] || null,
    predictions,
    head2head: h2h,
    standings: { home: standingRow(standings, match.homeTeam.id), away: standingRow(standings, match.awayTeam.id) },
    form: { home: homeForm, away: awayForm },
    probableLineups: null,
    market
  };
}


/* ------------------------------------------------------------------ */
/* Live stats + lineups for Football-Data.org matches                   */
/* (Football-Data.org's plan has no statistics / lineups; API-Football does) */
/* ------------------------------------------------------------------ */

const FD_TO_AF_LEAGUE: Record<string, number> = { CL: 2 };
const fdToAf = new Map<number, number | null>(); // FD match id → AF fixture id (null = not found)

function nameKey(s: string) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ')
    .split(' ').filter(w => w && !['fc', 'cf', 'afc', 'sc', 'ac', 'as', 'ssc', 'sv', 'club', 'de', 'cp'].includes(w)).join(' ');
}
function sameTeam(a: string, b: string) {
  const x = nameKey(a), y = nameKey(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

/** API-Football fixture id for a Football-Data.org match, or null. */
async function afFixtureForFd(match: any): Promise<number | null> {
  if (fdToAf.has(match.id)) return fdToAf.get(match.id)!;
  const day = String(match.utcDate || '').slice(0, 10);
  if (!day) return null;
  const d = new Date(day + 'T00:00:00Z').getTime();
  const lo = new Date(d - 86400000).toISOString().slice(0, 10), hi = new Date(d + 86400000).toISOString().slice(0, 10);
  let found: number | null = null;
  // domestic leagues: our own fixture table, matched through the team-name mapping used by the models
  const group = match.competition?.code ? groupForCompetition(match.competition.code) : null;
  if (group) {
    const home = fdNameFor(group, match.homeTeam?.id), away = fdNameFor(group, match.awayTeam?.id);
    if (home && away) {
      const r: any = db.prepare(`
        SELECT f.fixture_id FROM af_fixtures f
        JOIN af_teams th ON th.grp = f.grp AND th.team_id = f.home_id
        JOIN af_teams ta ON ta.grp = f.grp AND ta.team_id = f.away_id
        WHERE f.grp = ? AND th.fd_name = ? AND ta.fd_name = ? AND f.date BETWEEN ? AND ?`).get(group, home, away, lo, hi);
      if (r) found = r.fixture_id;
    }
  }
  // cups (Champions League): that day's fixtures of the competition, matched by team names
  const leagueId = FD_TO_AF_LEAGUE[match.competition?.code];
  if (!found && leagueId) {
    try {
      const dt = new Date(day + 'T00:00:00Z');
      const season = dt.getUTCMonth() >= 6 ? dt.getUTCFullYear() : dt.getUTCFullYear() - 1; // European season = start year
      const j = await cached(`day:${leagueId}:${day}`, 6 * 3600 * 1000, () => afGet('/fixtures', { league: leagueId, season, date: day }));
      const f = (j.response || []).find((x: any) =>
        sameTeam(x.teams?.home?.name, match.homeTeam?.name) || sameTeam(x.teams?.home?.name, match.homeTeam?.shortName || '')
          ? sameTeam(x.teams?.away?.name, match.awayTeam?.name) || sameTeam(x.teams?.away?.name, match.awayTeam?.shortName || '')
          : false
      );
      if (f) found = f.fixture.id;
    } catch (e: any) {
      logger.warn(`AF lookup for FD ${match.id}: ${e.message}`);
      return null; // don't remember a failure caused by the API
    }
  }
  fdToAf.set(match.id, found);
  return found;
}

/**
 * Live statistics (possession, shots, xG, corners…), lineups and minute for a Football-Data.org match,
 * from the matching API-Football fixture. Only around the match (1 h before kick-off onwards).
 */
export async function afExtrasForFd(match: any): Promise<{ home: any; away: any; minute: number | null } | null> {
  if (!afConfigured()) return null;
  const ko = new Date(match.utcDate).getTime();
  if (!Number.isFinite(ko) || Date.now() < ko - 75 * 60 * 1000) return null;
  const fid = await afFixtureForFd(match);
  if (!fid) return null;
  const live = ['IN_PLAY', 'PAUSED'].includes(match.status);
  const done = ['FINISHED', 'AWARDED'].includes(match.status);
  const ttl = live ? 45 * 1000 : done ? 6 * 3600 * 1000 : 5 * 60 * 1000;
  const raw = await cached(`fixture:${fid}`, ttl, async () => {
    const j = await afGet('/fixtures', { id: fid });
    return j.response?.[0] || null;
  });
  if (!raw) return null;
  const m = toFdMatchFull(await withStatsAndLineups(raw));
  const pick = (t: any) => ({ statistics: t.statistics || null, formation: t.formation || null, lineup: t.lineup || [], bench: t.bench || [], coach: t.coach || null });
  return { home: pick(m.homeTeam), away: pick(m.awayTeam), minute: m.minute ?? null };
}
