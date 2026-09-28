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
const PAGE_VERSION = 4; // bump when the page shape changes: older stored copies are rebuilt
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

async function seasonStats(pid: number, season: number) {
  const j: any = await afGet('/players', { id: pid, season });
  const it = j.response?.[0];
  if (!it) return null;
  const rows = (it.statistics || []).map((x: any) => ({ ...statRow(x), afSeason: season }))
    .filter((r: any) => r.apps > 0 || r.minutes > 0)
    // friendlies add noise
    .filter((r: any) => !/friendl/i.test(r.league.name || ''));
  return { player: it.player, rows };
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
  // three provider seasons: S+1 catches this summer's tournaments and calendar-year leagues filed ahead
  const [nx, cur, prev] = await Promise.all([seasonStats(pid, S + 1), seasonStats(pid, S), seasonStats(pid, S - 1)]);
  const src = [cur, prev, nx].filter(Boolean) as NonNullable<Awaited<ReturnType<typeof seasonStats>>>[];
  if (!src.length) throw Object.assign(new Error('Player not found'), { response: { status: 404 } });
  const [sideRes, trRes] = await Promise.all([
    afGet('/sidelined', { player: pid }).catch(() => null),
    afGet('/transfers', { player: pid }).catch(() => null)
  ]);
  const p = src[0].player;
  const nationality: string = p.nationality || '';
  const all: any[] = src.flatMap(x => x.rows);
  const isNational = (r: any) =>
    (!!r.team && !!nationality && (r.team.name === nationality || r.team.name.startsWith(`${nationality} U`))) || /\bU-?\d{2}\b/.test(r.team?.name || '') || INTL.test(r.league.name || '');

  // dates of every competition-season involved
  await Promise.all(all.map(async r => {
    const d = r.league.id ? await leagueDates(r.league.id, r.afSeason) : null;
    r.from = d?.start || null;
    r.to = d?.end || null;
  }));

  // club rows → club season by the competition's midpoint (a normal league: August–May → that season;
  // the Club World Cup of June–July 2025 → 2024-25)
  const clubRows = all.filter(r => !isNational(r));
  const bySeason = new Map<number, any[]>();
  for (const r of clubRows) {
    let cs: number;
    if (r.from && r.to) {
      const mid = new Date((new Date(r.from).getTime() + new Date(r.to).getTime()) / 2).toISOString();
      cs = clubSeasonOf(mid);
    } else cs = r.afSeason;
    if (!bySeason.has(cs)) bySeason.set(cs, []);
    bySeason.get(cs)!.push(r);
  }
  const seasons = [S, S - 1]
    .filter(y => bySeason.has(y))
    .map(y => {
      const rows = bySeason.get(y)!.sort((a, b) => b.minutes - a.minutes);
      return { season: y, label: `${y}-${String(y + 1).slice(2)}`, rows, totals: totalsOf(rows) };
    });

  // national-team rows: shown on their own, with the competition's real dates (no guessing which club season)
  const seen = new Set<string>();
  const international = all
    .filter(isNational)
    .filter(r => {
      const k = `${r.league.id}:${r.afSeason}:${r.team?.id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    // only what was played in the last two club seasons
    .filter(r => !r.to || r.to >= `${S - 1}-07-01`)
    .sort((a, b) => String(b.to || '').localeCompare(String(a.to || '')));

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
    international,
    sidelined,
    transfers,
    v: PAGE_VERSION,
    builtAt: new Date().toISOString()
  };
}

async function pageData(pid: number) {
  const mem = cache.get(pid);
  if (mem && Date.now() - mem.at < PAGE_TTL && mem.data.v === PAGE_VERSION) return mem.data;
  const stored: any = db.prepare(`SELECT json, built_at FROM player_page_store WHERE player_id = ?`).get(pid);
  const storedData = stored ? JSON.parse(stored.json) : null;
  if (stored && storedData.v === PAGE_VERSION && Date.now() - new Date(stored.built_at).getTime() < PAGE_TTL) {
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
