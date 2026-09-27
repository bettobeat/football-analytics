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
    apps: n(s.games?.appearences) || 0,
    starts: n(s.games?.lineups) || 0,
    minutes,
    rating: s.games?.rating ? Math.round(Number(s.games.rating) * 100) / 100 : null,
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
  const rows = (it.statistics || []).map(statRow).filter((r: any) => r.apps > 0 || r.minutes > 0)
    // friendlies add noise
    .filter((r: any) => !/friendl/i.test(r.league.name || ''));
  rows.sort((a: any, b: any) => b.minutes - a.minutes);
  return { player: it.player, rows, totals: totalsOf(rows) };
}

async function build(pid: number) {
  if (!afConfigured()) throw new Error('API-Football is not configured');
  if (afRemaining() < 200) throw new Error('Daily data budget reached, try again later');
  const S = seasonNow();
  let [cur, prev] = await Promise.all([seasonStats(pid, S), seasonStats(pid, S - 1)]);
  // calendar-year leagues early in the year: "this season" may not exist yet
  if (!cur && !prev) {
    cur = await seasonStats(pid, S + 1);
    if (!cur) throw Object.assign(new Error('Player not found'), { response: { status: 404 } });
  }
  const [sideRes, trRes] = await Promise.all([
    afGet('/sidelined', { player: pid }).catch(() => null),
    afGet('/transfers', { player: pid }).catch(() => null)
  ]);
  const p = (cur || prev)!.player;
  const main = (cur?.rows[0] || prev?.rows[0]) ?? null;

  const today = new Date().toISOString().slice(0, 10);
  const sidelined = ((sideRes as any)?.response || [])
    .map((x: any) => ({ type: x.type, start: x.start, end: x.end }))
    .sort((a: any, b: any) => String(b.start).localeCompare(String(a.start)))
    .slice(0, 12);
  const out = sidelined.find((x: any) => x.start <= today && (!x.end || x.end >= today)) || null;

  const transfers = (((trRes as any)?.response?.[0]?.transfers) || [])
    .map((t: any) => ({ date: t.date, type: t.type, from: siteTeam(t.teams?.out), to: siteTeam(t.teams?.in) }))
    .filter((t: any) => t.from && t.to)
    .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 12);

  return {
    player: {
      id: p.id, name: p.name, firstname: p.firstname, lastname: p.lastname, age: p.age ?? null,
      birth: p.birth || null, nationality: p.nationality || null, height: p.height || null, weight: p.weight || null,
      photo: p.photo || `https://media.api-sports.io/football/players/${p.id}.png`
    },
    team: main?.team || null,
    position: main?.position || null,
    number: cur?.rows.find((r: any) => r.number)?.number ?? null,
    status: out ? { out: true, type: out.type, since: out.start, until: out.end } : (cur?.player?.injured ? { out: true, type: 'Injured', since: null, until: null } : { out: false }),
    seasons: [cur && { season: S, label: `${S}-${String(S + 1).slice(2)}`, rows: cur.rows, totals: cur.totals }, prev && { season: S - 1, label: `${S - 1}-${String(S).slice(2)}`, rows: prev.rows, totals: prev.totals }].filter(Boolean),
    sidelined,
    transfers,
    builtAt: new Date().toISOString()
  };
}

async function pageData(pid: number) {
  const mem = cache.get(pid);
  if (mem && Date.now() - mem.at < PAGE_TTL) return mem.data;
  const stored: any = db.prepare(`SELECT json, built_at FROM player_page_store WHERE player_id = ?`).get(pid);
  if (stored && Date.now() - new Date(stored.built_at).getTime() < PAGE_TTL) {
    const data = JSON.parse(stored.json);
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
  // "E. Haaland" vs "Erling Haaland"; "Vinícius Júnior" vs "Vinicius Junior"
  return lx === ly && x[0][0] === y[0][0];
}

const findCache = new Map<string, number | null>();

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
  findCache.set(key, hit);
  return hit;
}
