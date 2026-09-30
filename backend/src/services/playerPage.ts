/**
 * Player pages: /api/player-page/<API-Football player id> (1e9 + id is accepted too, as the site uses for scorers).
 *
 * Built from API-Football when someone opens the page (4 calls: this season, last season, injury history,
 * transfers), then kept for 12 hours in memory and in the database (served after restarts and when the daily
 * budget is out, marked stale). Free users get the profile, appearances and goals; premium users get everything.
 *
 * /api/player-page/find?name=&team=&c=&n= turns a Football-Data.org scorer (its own ids) into an API-Football id:
 * the team is resolved like team pages, then the player is matched by surname + first initial in the squad data we
 * already store (af_player_season), else by one API-Football search.
 */
import { db } from '../db';
import logger from '../utils/logger';
import { afGet, afRemaining, afConfigured } from './apiFootball';
import { resolveAfTeamId } from './teamPage';

const AF_OFFSET = 1_000_000_000;
const PAGE_TTL = 12 * 3600 * 1000;
const PAGE_VERSION = 5; // bump when the page shape changes: older stored copies are rebuilt
const cache = new Map<number, { at: number; data: any }>();

db.exec(`CREATE TABLE IF NOT EXISTS player_page_store (player_id INTEGER PRIMARY KEY, json TEXT NOT NULL, built_at TEXT NOT NULL)`);

/** API-Football season number now (2026 = 2026-27, and calendar-year leagues' 2026). */
function seasonNow() {
  const d = new Date();
  return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

const n = (x: any) => (x === null || x === undefined || x === '' ? null : Number(x));
const siteTeam = (t: any) => (t?.id ? { id: AF_OFFSET + t.id, name: t.name, logo: t.logo || `https://media.api-sports.io/football/teams/${t.id}.png` } : null);

function statRow(s: any) {
  const minutes = n(s.games?.minutes) || 0;
  return {
    league: { id: s.league?.id, code: s.league?.id ? `AF${s.league.id}` : null, name: s.league?.name, logo: s.league?.logo, country: s.league?.country, flag: s.league?.flag },
    team: siteTeam(s.team),
    position: s.games?.position || null,
    number: n(s.games?.number),
    // the provider sometimes records minutes (and even goals) with 0 appearances: a player who played did appear
    apps: Math.max(n(s.games?.appearences) || 0, minutes > 0 ? 1 : 0),
    starts: n(s.games?.lineups) || 0,
    minutes,
    // a rating from a few minutes on the pitch says little (a 17-minute cameo can read 3.4): shown from 30 minutes
    rating: s.games?.rating && minutes >= 30 ? Math.round(Number(s.games.rating) * 100) / 100 : null,
    goals: n(s.goals?.total) || 0,
    assists: n(s.goals?.assists) || 0,
    conceded: n(s.goals?.conceded),
    saves: n(s.goals?.saves),
    shots: n(s.shots?.total),
    shotsOn: n(s.shots?.on),
    keyPasses: n(s.passes?.key),
    passAcc: n(s.passes?.accuracy),
    tackles: n(s.tackles?.total),
    interceptions: n(s.tackles?.interceptions),
    dribbles: n(s.dribbles?.success),
    duelsWon: n(s.duels?.won),
    duels: n(s.duels?.total),
    yellow: n(s.cards?.yellow) || 0,
    red: (n(s.cards?.red) || 0) + (n(s.cards?.yellowred) || 0),
    penScored: n(s.penalty?.scored),
    penMissed: n(s.penalty?.missed)
  };
}

function totalsOf(rows: ReturnType<typeof statRow>[]) {
  const sum = (k: keyof ReturnType<typeof statRow>) => rows.reduce((a, r) => a + ((r[k] as number) || 0), 0);
  const rated = rows.filter(r => r.rating && r.minutes);
  const mins = rated.reduce((a, r) => a + r.minutes, 0);
  return {
    apps: sum('apps'), starts: sum('starts'), minutes: sum('minutes'), goals: sum('goals'), assists: sum('assists'),
    yellow: sum('yellow'), red: sum('red'), shots: sum('shots'), keyPasses: sum('keyPasses'),
    rating: mins ? Math.round((rated.reduce((a, r) => a + r.rating! * r.minutes, 0) / mins) * 100) / 100 : null
  };
}

/*
 * A player's season as the provider has it, stored for good: past seasons never change, so each is fetched once
 * (the current seasons are fetched again whenever the page is rebuilt). null = the provider has nothing that season.
 */
db.exec(`CREATE TABLE IF NOT EXISTS player_season_raw (player_id INTEGER NOT NULL, season INTEGER NOT NULL, json TEXT, fetched_at TEXT NOT NULL, PRIMARY KEY (player_id, season))`);
db.exec(`CREATE TABLE IF NOT EXISTS player_seasons_list (player_id INTEGER PRIMARY KEY, years TEXT NOT NULL, fetched_at TEXT NOT NULL)`);

async function rawSeason(pid: number, season: number, refresh: boolean): Promise<{ player: any; statistics: any[] } | null> {
  const row: any = db.prepare(`SELECT json FROM player_season_raw WHERE player_id = ? AND season = ?`).get(pid, season);
  if (row && !refresh) return row.json ? JSON.parse(row.json) : null;
  try {
    const j: any = await afGet('/players', { id: pid, season });
    const it = j.response?.[0];
    const data = it ? { player: it.player, statistics: it.statistics || [] } : null;
    db.prepare(`INSERT OR REPLACE INTO player_season_raw (player_id, season, json, fetched_at) VALUES (?, ?, ?, ?)`)
      .run(pid, season, data ? JSON.stringify(data) : null, new Date().toISOString());
    return data;
  } catch (e) {
    if (row) return row.json ? JSON.parse(row.json) : null; // provider down: the stored copy
    throw e;
  }
}

/** Every season the provider has for this player (his whole career), refreshed monthly. */
async function careerYears(pid: number): Promise<number[]> {
  const row: any = db.prepare(`SELECT years, fetched_at FROM player_seasons_list WHERE player_id = ?`).get(pid);
  if (row && Date.now() - new Date(row.fetched_at).getTime() < 30 * 86400000) return JSON.parse(row.years);
  try {
    const j: any = await afGet('/players/seasons', { player: pid });
    const years = ((j.response || []) as any[]).map(Number).filter(y => y > 1990).sort((a, b) => a - b);
    db.prepare(`INSERT OR REPLACE INTO player_seasons_list (player_id, years, fetched_at) VALUES (?, ?, ?)`).run(pid, JSON.stringify(years), new Date().toISOString());
    return years;
  } catch {
    return row ? JSON.parse(row.years) : [];
  }
}

/** Run jobs a few at a time (the provider limits requests per minute). */
async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

/*
 * When each competition-season was played. The provider's season numbers do not match club seasons for
 * tournaments (World Cup 2026 = "2026", its qualifiers March–November 2025 = also "2026"; Club World Cup of
 * June 2025 = "2025"), so rows are placed by the competition's real dates. Stored for good (dates don't change
 * once a season is over; the current one is refreshed after a week).
 */
db.exec(`CREATE TABLE IF NOT EXISTS af_league_dates (league_id INTEGER NOT NULL, season INTEGER NOT NULL, start TEXT, end TEXT, fetched_at TEXT NOT NULL, PRIMARY KEY (league_id, season))`);
async function leagueDates(leagueId: number, season: number): Promise<{ start: string; end: string } | null> {
  const row: any = db.prepare(`SELECT start, end, fetched_at FROM af_league_dates WHERE league_id = ? AND season = ?`).get(leagueId, season);
  const fresh = row && (row.end && row.end < new Date().toISOString().slice(0, 10) ? true : Date.now() - new Date(row.fetched_at).getTime() < 7 * 86400000);
  if (row && fresh) return row.start && row.end ? { start: row.start, end: row.end } : null;
  try {
    const j: any = await afGet('/leagues', { id: leagueId, season });
    const se = (j.response?.[0]?.seasons || []).find((x: any) => x.year === season) || null;
    db.prepare(`INSERT OR REPLACE INTO af_league_dates (league_id, season, start, end, fetched_at) VALUES (?, ?, ?, ?, ?)`)
      .run(leagueId, season, se?.start || null, se?.end || null, new Date().toISOString());
    return se?.start && se?.end ? { start: se.start, end: se.end } : null;
  } catch {
    return row?.start && row?.end ? { start: row.start, end: row.end } : null;
  }
}

/*
 * When THIS team played THIS competition-season (its own games' dates), for competitions whose season dates are
 * missing or misleading (one-match super cups filed under the calendar year, tournaments spread over two years).
 * Stored for good once the games are in the past.
 */
db.exec(`CREATE TABLE IF NOT EXISTS af_team_comp_dates (league_id INTEGER NOT NULL, season INTEGER NOT NULL, team_id INTEGER NOT NULL, first TEXT, last TEXT, mid TEXT, fetched_at TEXT NOT NULL, PRIMARY KEY (league_id, season, team_id))`);
async function teamCompDates(leagueId: number, season: number, teamId: number): Promise<{ start: string; end: string; mid: string } | null> {
  const row: any = db.prepare(`SELECT first, last, mid, fetched_at FROM af_team_comp_dates WHERE league_id = ? AND season = ? AND team_id = ?`).get(leagueId, season, teamId);
  const done = row?.last && row.last < new Date(Date.now() - 7 * 86400000).toISOString();
  if (row && (done || Date.now() - new Date(row.fetched_at).getTime() < 86400000)) return row.mid ? { start: row.first, end: row.last, mid: row.mid } : null;
  try {
    const j: any = await afGet('/fixtures', { league: leagueId, season, team: teamId });
    const dates = ((j.response || []) as any[]).filter(f => ['FT', 'AET', 'PEN'].includes(f.fixture?.status?.short)).map(f => String(f.fixture.date)).sort();
    const res = dates.length ? { start: dates[0], end: dates[dates.length - 1], mid: dates[Math.floor(dates.length / 2)] } : null;
    db.prepare(`INSERT OR REPLACE INTO af_team_comp_dates (league_id, season, team_id, first, last, mid, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(leagueId, season, teamId, res?.start || null, res?.end || null, res?.mid || null, new Date().toISOString());
    return res;
  } catch {
    return row?.mid ? { start: row.first, end: row.last, mid: row.mid } : null;
  }
}

/** Club season (2025 = 2025-26, July to June) that a date falls in. */
const clubSeasonOf = (iso: string) => {
  const d = new Date(iso);
  return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
};

// competitions only national teams play (the Club World Cup is a club competition)
const INTL = /^(world cup|world cup - qualification.*|.*world cup qualifiers|.*world cup qualification.*|uefa nations league.*|euro championship.*|european championship.*|copa america.*|africa cup of nations.*|asian cup.*|.*gold cup|concacaf nations league.*|olympics.*|u2[013] .*|.*u2[013]|.*u1[789])$/i;

const MONEY = /^[€$£]|^\d/;
const transferType = (t: string | null | undefined) => {
  const x = String(t || '').trim();
  if (!x || x === 'N/A' || MONEY.test(x)) return 'Transfer'; // fees are left out: the provider's figures are often not the reported ones
  if (/loan/i.test(x)) return /back|end/i.test(x) ? 'End of loan' : 'Loan';
  if (/free/i.test(x)) return 'Free transfer';
  return x;
};

function ageFrom(date?: string | null) {
  if (!date) return null;
  const b = new Date(date), now = new Date();
  if (isNaN(b.getTime())) return null;
  let a = now.getUTCFullYear() - b.getUTCFullYear();
  if (now.getUTCMonth() < b.getUTCMonth() || (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate())) a--;
  return a;
}

// Safety cap on new page builds (each costs API-Football calls): protects the daily budget from scripted scraping
// across many addresses. Stored pages are still served when the cap is hit.
const BUILD_CAP = parseInt(process.env.PLAYER_BUILDS_PER_HOUR || '1500', 10);
let builds = { hour: 0, n: 0 };
function buildAllowed() {
  const h = Math.floor(Date.now() / 3600000);
  if (builds.hour !== h) builds = { hour: h, n: 0 };
  return ++builds.n <= BUILD_CAP;
}

async function build(pid: number) {
  if (!afConfigured()) throw new Error('API-Football is not configured');
  if (!buildAllowed()) throw Object.assign(new Error('Busy right now, try again in a few minutes'), { response: { status: 503 } });
  if (afRemaining() < 200) throw new Error('Daily data budget reached, try again later');
  const S = seasonNow();
  // The whole career: every season the provider has. The three current provider seasons are fetched fresh
  // (S+1 catches this summer's tournaments and calendar-year leagues filed ahead); older ones come from our store
  // and are fetched only the first time.
  const years = new Set(await careerYears(pid));
  for (const y of [S - 1, S, S + 1]) years.add(y);
  const fresh = new Set([S - 1, S, S + 1]);
  const lowBudget = afRemaining() < 2000;
  const list = [...years].sort((a, b) => b - a);
  const raws = await pool(list, 4, async y => {
    const stored = !fresh.has(y) && lowBudget ? db.prepare(`SELECT json FROM player_season_raw WHERE player_id = ? AND season = ?`).get(pid, y) as any : undefined;
    if (lowBudget && !fresh.has(y)) return stored?.json ? { season: y, data: JSON.parse(stored.json) } : { season: y, data: null, missing: !stored };
    try { return { season: y, data: await rawSeason(pid, y, fresh.has(y)) }; } catch { return { season: y, data: null, missing: true }; }
  });
  const src = raws.filter(r => r.data);
  if (!src.length) throw Object.assign(new Error('Player not found'), { response: { status: 404 } });
  const careerPartial = raws.some((r: any) => r.missing);
  const [sideRes, trRes] = await Promise.all([
    afGet('/sidelined', { player: pid }).catch(() => null),
    afGet('/transfers', { player: pid }).catch(() => null)
  ]);
  // the newest season's profile (current club, photo, name)
  const p = (src.find(r => r.season === S) || src[0]).data.player;
  const nationality: string = p.nationality || '';
  const all: any[] = src.flatMap(r =>
    (r.data.statistics || [])
      .map((x: any) => ({ ...statRow(x), afSeason: r.season, friendly: /friendl/i.test(x.league?.name || '') }))
      .filter((x: any) => x.apps > 0 || x.minutes > 0)
  );
  const isNational = (r: any) =>
    (!!r.team && !!nationality && (r.team.name === nationality || r.team.name.startsWith(`${nationality} U`))) || /\bU-?\d{2}\b/.test(r.team?.name || '') || INTL.test(r.league.name || '');

  // When was each row played? The competition's dates; for one-off cups and competitions without usable dates,
  // the dates of this team's own games in it.
  await pool(all, 6, async (r: any) => {
    if (!r.league.id) return;
    const d = await leagueDates(r.league.id, r.afSeason);
    r.from = d?.start || null;
    r.to = d?.end || null;
    const span = d ? (new Date(d.end).getTime() - new Date(d.start).getTime()) / 86400000 : 0;
    const mid = d ? new Date((new Date(d.start).getTime() + new Date(d.end).getTime()) / 2).toISOString() : null;
    const suspicious = !d || span > 400 || span < 1 || (mid && clubSeasonOf(mid) > S) || (mid && mid > new Date().toISOString());
    if (suspicious && r.team?.id) {
      const t = await teamCompDates(r.league.id, r.afSeason, r.team.id - AF_OFFSET);
      if (t) { r.from = t.start.slice(0, 10); r.to = t.end.slice(0, 10); r.mid = t.mid; }
    }
  });

  // club rows (friendlies left out) → club season by when they were played
  const clubRows = all.filter(r => !isNational(r) && !r.friendly);
  const bySeason = new Map<number, any[]>();
  for (const r of clubRows) {
    let cs: number;
    if (r.mid) cs = clubSeasonOf(r.mid);
    else if (r.from && r.to) cs = clubSeasonOf(new Date((new Date(r.from).getTime() + new Date(r.to).getTime()) / 2).toISOString());
    else cs = r.afSeason;
    if (cs > S) cs = S; // nothing can belong to a season that hasn't started
    if (!bySeason.has(cs)) bySeason.set(cs, []);
    bySeason.get(cs)!.push(r);
  }
  const seasons = [...bySeason.keys()]
    .sort((a, b) => b - a)
    .map(y => {
      const rows = bySeason.get(y)!.sort((a, b) => b.minutes - a.minutes);
      return { season: y, label: `${y}-${String(y + 1).slice(2)}`, rows, totals: totalsOf(rows) };
    });
  const career = { ...totalsOf(clubRows), seasons: seasons.length, from: seasons.length ? seasons[seasons.length - 1].label : null };

  // national-team rows: the whole international career (friendlies included: they are caps), newest first
  const seen = new Set<string>();
  const international = all
    .filter(isNational)
    .filter(r => {
      const k = `${r.league.id}:${r.afSeason}:${r.team?.id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => String(b.to || b.afSeason).localeCompare(String(a.to || a.afSeason)));
  const intlByTeam = new Map<string, { team: any; apps: number; goals: number; assists: number }>();
  for (const r of international) {
    const k = r.team?.name || 'National team';
    const t = intlByTeam.get(k) || { team: r.team, apps: 0, goals: 0, assists: 0 };
    t.apps += r.apps; t.goals += r.goals; t.assists += r.assists;
    intlByTeam.set(k, t);
  }
  const internationalTotals = [...intlByTeam.values()].sort((a, b) => b.apps - a.apps);

  // his club (not the national team) for the header: the most recent club rows
  const main = seasons[0]?.rows[0] || seasons[1]?.rows[0] || null;
  // "E. Haaland" → "Erling Haaland"
  const display = /^[A-Z]\.\s/.test(p.name || '') && p.firstname && p.lastname ? `${String(p.firstname).split(' ')[0]} ${p.lastname}` : p.name;

  const today = new Date().toISOString().slice(0, 10);
  const recent = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const sidelined = ((sideRes as any)?.response || [])
    .map((x: any) => ({ type: x.type, start: x.start, end: x.end }))
    .filter((x: any) => x.start)
    .sort((a: any, b: any) => String(b.start).localeCompare(String(a.start)))
    .slice(0, 12);
  // out now = a spell that has started and not ended; an open-ended one only if it began in the last 4 months
  // (old entries often have no end date)
  const out = sidelined.find((x: any) => x.start <= today && (x.end ? x.end >= today : x.start >= recent)) || null;

  const transfers = (((trRes as any)?.response?.[0]?.transfers) || [])
    .map((t: any) => ({ date: t.date, type: transferType(t.type), from: siteTeam(t.teams?.out), to: siteTeam(t.teams?.in) }))
    .filter((t: any) => t.from && t.to && t.date && t.date <= today)
    .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 12);

  const birth = p.birth || null;
  return {
    player: {
      id: p.id, name: display, short: p.name, firstname: p.firstname, lastname: p.lastname, age: ageFrom(birth?.date) ?? p.age ?? null,
      birth, nationality: nationality || null,
      height: p.height ? (/^\d+$/.test(String(p.height)) ? `${p.height} cm` : p.height) : null,
      weight: p.weight ? (/^\d+$/.test(String(p.weight)) ? `${p.weight} kg` : p.weight) : null,
      photo: p.photo || `https://media.api-sports.io/football/players/${p.id}.png`
    },
    team: main?.team || null,
    position: main?.position || null,
    number: main?.number ?? null,
    status: out ? { out: true, type: out.type, since: out.start, until: out.end } : { out: false },
    seasons,
    career,
    careerPartial,
    international,
    internationalTotals,
    sidelined,
    transfers,
    v: PAGE_VERSION,
    builtAt: new Date().toISOString()
  };
}

/*
 * A page is rebuilt as soon as the player's club has finished a game since it was built (plus 2 hours for the
 * provider to update the player stats), instead of waiting for the 12-hour refresh. Only the current seasons are
 * fetched again; the rest of the career comes from our store.
 */
const playedCache = new Map<string, { at: number; v: boolean }>();
function playedSince(data: any): boolean {
  const teamId = data?.team?.id ? data.team.id - AF_OFFSET : null;
  if (!teamId || !data.builtAt) return false;
  const key = `${teamId}|${data.builtAt}`;
  const c = playedCache.get(key);
  if (c && Date.now() - c.at < 5 * 60 * 1000) return c.v;
  let v = false;
  try {
    const cutoff = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    v = !!db.prepare(`SELECT 1 FROM af_fixtures WHERE (home_id = ? OR away_id = ?) AND status IN ('FT','AET','PEN') AND kickoff > ? AND kickoff < ? LIMIT 1`).get(teamId, teamId, data.builtAt, cutoff);
  } catch { /* table missing */ }
  playedCache.set(key, { at: Date.now(), v });
  if (playedCache.size > 5000) playedCache.delete(playedCache.keys().next().value as string);
  return v;
}

async function pageData(pid: number) {
  const mem = cache.get(pid);
  if (mem && Date.now() - mem.at < PAGE_TTL && mem.data.v === PAGE_VERSION && !playedSince(mem.data)) return mem.data;
  const stored: any = db.prepare(`SELECT json, built_at FROM player_page_store WHERE player_id = ?`).get(pid);
  const storedData = stored ? JSON.parse(stored.json) : null;
  if (stored && storedData.v === PAGE_VERSION && Date.now() - new Date(stored.built_at).getTime() < PAGE_TTL && !playedSince(storedData)) {
    const data = storedData;
    cache.set(pid, { at: new Date(stored.built_at).getTime(), data });
    return data;
  }
  try {
    const data = await build(pid);
    cache.set(pid, { at: Date.now(), data });
    if (cache.size > 3000) cache.delete(cache.keys().next().value as number);
    db.prepare(`INSERT OR REPLACE INTO player_page_store (player_id, json, built_at) VALUES (?, ?, ?)`).run(pid, JSON.stringify(data), data.builtAt);
    return data;
  } catch (e: any) {
    if (stored) {
      logger.warn(`player page ${pid}: serving the copy from ${stored.built_at} (${e.message})`);
      return { ...JSON.parse(stored.json), stale: true };
    }
    throw e;
  }
}

export async function playerPage(rawId: number, full: boolean) {
  const pid = rawId >= AF_OFFSET ? rawId - AF_OFFSET : rawId;
  const data: any = await pageData(pid);
  if (full) return { ...data, premium: true };
  const lite = (r: any) => ({ league: r.league, team: r.team, position: r.position, apps: r.apps, goals: r.goals });
  return {
    ...data,
    premium: false,
    seasons: data.seasons.map((s: any) => ({ ...s, rows: s.rows.map(lite), totals: { apps: s.totals.apps, goals: s.totals.goals } })),
    international: (data.international || []).map((r: any) => ({ ...lite(r), from: r.from, to: r.to })),
    career: data.career ? { apps: data.career.apps, goals: data.career.goals, seasons: data.career.seasons, from: data.career.from } : null,
    internationalTotals: (data.internationalTotals || []).map((t: any) => ({ team: t.team, apps: t.apps, goals: t.goals })),
    sidelined: [],
    locked: ['Minutes, assists, rating, cards, shots, passes and duels for every competition', 'Injury history']
  };
}

/* ---------- Football-Data.org scorer → API-Football player ---------- */

const plain = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();

function sameName(a: string, b: string) {
  const x = plain(a).split(' '), y = plain(b).split(' ');
  if (!x.length || !y.length) return false;
  if (plain(a) === plain(b)) return true;
  const lx = x[x.length - 1], ly = y[y.length - 1];
  // one name only ("Zabiri", "Pedri"): the other's surname or first name
  if (x.length === 1 || y.length === 1) {
    const one = x.length === 1 ? x[0] : y[0], other = x.length === 1 ? y : x;
    return one.length >= 4 && (other[other.length - 1] === one || other[0] === one);
  }
  // "E. Haaland" vs "Erling Haaland"; "Vinícius Júnior" vs "Vinicius Junior"
  return lx === ly && x[0][0] === y[0][0];
}

const findCache = new Map<string, number | null>();
// Football-Data.org competition code → API-Football league id
export const FD_TO_AF: Record<string, number> = { PL: 39, ELC: 40, PD: 140, SA: 135, BL1: 78, FL1: 61, DED: 88, PPL: 94, BSA: 71, CL: 2, EC: 4, WC: 1 };

export async function findPlayer(name: string, teamId: number, code?: string, teamName?: string): Promise<number | null> {
  const key = `${name}|${teamId}|${code}`;
  if (findCache.has(key)) return findCache.get(key)!;
  const af = resolveAfTeamId(teamId, code, teamName);
  let hit: number | null = null;
  if (af) {
    const S = seasonNow();
    const rows = db.prepare(`SELECT DISTINCT player_id, name FROM af_player_season WHERE team_id = ? AND season IN (?, ?)`).all(af, S, S - 1) as any[];
    hit = rows.find(r => sameName(r.name, name))?.player_id ?? null;
    if (!hit && afRemaining() > 500) {
      const last = plain(name).split(' ').pop() || '';
      if (last.length >= 4) {
        try {
          const j: any = await afGet('/players', { team: af, season: S, search: last });
          hit = (j.response || []).find((it: any) => sameName(it.player?.name, name) || sameName(`${it.player?.firstname} ${it.player?.lastname}`, name))?.player?.id ?? null;
        } catch (e: any) {
          logger.warn(`player find ${name}: ${e.message}`);
        }
      }
    }
  }
  // promoted clubs the history mapping doesn't know yet: search the league instead of the team
  if (!hit && code && FD_TO_AF[code] && afRemaining() > 500) {
    const last = plain(name).split(' ').pop() || '';
    if (last.length >= 4) {
      try {
        const j: any = await afGet('/players', { league: FD_TO_AF[code], season: seasonNow(), search: last });
        hit = (j.response || []).find((it: any) => sameName(it.player?.name, name) || sameName(`${it.player?.firstname} ${it.player?.lastname}`, name))?.player?.id ?? null;
      } catch (e: any) {
        logger.warn(`player find (league) ${name}: ${e.message}`);
      }
    }
  }
  // last resort: the provider's profile search (all players, any club)
  if (!hit && afRemaining() > 500) {
    const last = plain(name).split(' ').pop() || '';
    if (last.length >= 4) {
      try {
        const j: any = await afGet('/players/profiles', { search: last });
        const cands = (j.response || []).filter((it: any) => sameName(it.player?.name, name) || sameName(`${it.player?.firstname} ${it.player?.lastname}`, name));
        if (cands.length === 1) hit = cands[0].player.id; // only when it is unambiguous
      } catch (e: any) {
        logger.warn(`player find (profiles) ${name}: ${e.message}`);
      }
    }
  }
  findCache.set(key, hit);
  return hit;
}
