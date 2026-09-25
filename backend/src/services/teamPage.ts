/**
 * Team pages and site search.
 *
 * A team page is built from API-Football: team + venue, the current domestic league and its table, squad,
 * player season stats (goals, assists, apps, minutes, rating, cards), last 10 and next 5 fixtures.
 * Cached per team for 6 hours (about 7–9 API calls per team per 6 h).
 * Free users get the basics; premium users get every player stat. (AI analysis: placeholder until an AI
 * writer is connected.)
 *
 * Team ids on the site: API-Football-backed matches use 1e9 + AF team id; Football-Data.org teams are
 * resolved to their AF id through the history mapping (af_teams.fd_name), else by name.
 */
import { db } from '../db';
import logger from '../utils/logger';
import { afGet, afRemaining, afConfigured } from './apiFootball';
import { groupForCompetition, fdNameFor, normalizeName } from './history';
import { isKnownAfFixture } from './afMatches';

const AF_OFFSET = 1_000_000_000;
const TTL = 6 * 3600 * 1000;
const cache = new Map<string, { at: number; data: any }>();
const logo = (id: number) => `https://media.api-sports.io/football/teams/${id}.png`;

async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const c = cache.get(key);
  if (c && Date.now() - c.at < ttl) return c.data;
  const data = await load();
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 2000) cache.delete(cache.keys().next().value as string);
  return data;
}

/* ---------------- team index (search + name resolution) ---------------- */

type IndexTeam = { id: number; name: string; norm: string; national: boolean; n: number };
let index: { at: number; teams: IndexTeam[] } | null = null;

function teamIndex(): IndexTeam[] {
  if (index && Date.now() - index.at < TTL) return index.teams;
  const byId = new Map<number, IndexTeam>();
  const add = (id: number, name: string, national: boolean) => {
    if (!id || !name) return;
    const t = byId.get(id);
    if (t) { t.n++; t.name = name; t.norm = normalizeName(name); return; }
    byId.set(id, { id, name, norm: normalizeName(name), national, n: 1 });
  };
  const since = new Date(Date.now() - 3 * 365 * 86400000).toISOString().slice(0, 10);
  const q = (sql: string, national: boolean) => {
    try { for (const r of db.prepare(sql).all(since) as any[]) add(r.id, r.name, national); } catch { /* table missing */ }
  };
  q(`SELECT home_id AS id, home_name AS name FROM af_fixtures WHERE date >= ? UNION ALL SELECT away_id, away_name FROM af_fixtures WHERE date >= ?1`, false);
  q(`SELECT home_id AS id, home_name AS name FROM eur_matches WHERE date >= ? UNION ALL SELECT away_id, away_name FROM eur_matches WHERE date >= ?1`, false);
  q(`SELECT home_id AS id, home_name AS name FROM nat_matches WHERE date >= ? UNION ALL SELECT away_id, away_name FROM nat_matches WHERE date >= ?1`, true);
  index = { at: Date.now(), teams: [...byId.values()] };
  return index.teams;
}

export function searchTeams(q: string, limit = 8) {
  const needle = normalizeName(q);
  if (needle.length < 2) return [];
  const scored: { t: IndexTeam; s: number }[] = [];
  for (const t of teamIndex()) {
    let s = 0;
    if (t.norm === needle) s = 100;
    else if (t.norm.startsWith(needle)) s = 80;
    else if (t.norm.split(' ').some(w => w.startsWith(needle))) s = 60;
    else if (t.norm.includes(needle)) s = 40;
    if (s) scored.push({ t, s: s + Math.min(10, t.n / 10) });
  }
  return scored
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ t }) => ({ id: AF_OFFSET + t.id, name: t.name, logo: logo(t.id), national: t.national }));
}

/** Site team id (+ competition code / name for Football-Data.org teams) → API-Football team id. */
export function resolveAfTeamId(rawId: number, code?: string, name?: string): number | null {
  if (rawId >= AF_OFFSET) return rawId - AF_OFFSET;
  if (code) {
    const g = groupForCompetition(code);
    const fdName = g ? fdNameFor(g, rawId) : null;
    if (g && fdName) {
      const row: any = db.prepare(`SELECT team_id FROM af_teams WHERE grp = ? AND fd_name = ?`).get(g, fdName);
      if (row?.team_id) return row.team_id;
    }
  }
  if (name) {
    const hit = searchTeams(name, 1)[0];
    if (hit && normalizeName(hit.name) === normalizeName(name)) return hit.id - AF_OFFSET;
    const loose = searchTeams(name, 1)[0];
    if (loose) return loose.id - AF_OFFSET;
  }
  return null;
}

/* ---------------- team page ---------------- */

const simpleFixture = (f: any) => ({
  matchId: isKnownAfFixture(AF_OFFSET + f.fixture.id) ? AF_OFFSET + f.fixture.id : null,
  date: f.fixture.date,
  status: f.fixture.status?.short,
  comp: f.league?.name,
  home: { id: AF_OFFSET + f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo },
  away: { id: AF_OFFSET + f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo },
  hg: f.goals?.home ?? null,
  ag: f.goals?.away ?? null
});

async function build(afId: number) {
  if (!afConfigured()) throw new Error('API-Football is not configured');
  if (afRemaining() < 200) throw new Error('Daily data budget reached, try again later');
  const [teamRes, leaguesRes, squadRes, lastRes, nextRes] = await Promise.all([
    afGet('/teams', { id: afId }),
    afGet('/leagues', { team: afId, current: 'true' }),
    afGet('/players/squads', { team: afId }),
    afGet('/fixtures', { team: afId, last: 10 }),
    afGet('/fixtures', { team: afId, next: 5 })
  ]);
  const t = teamRes.response?.[0];
  if (!t) throw Object.assign(new Error('Team not found'), { response: { status: 404 } });
  const national = !!t.team?.national;
  // the domestic league (or, for national teams, the first competition with a table)
  const leagues: any[] = leaguesRes.response || [];
  const league = leagues.find(l => l.league?.type === 'League') || leagues[0] || null;
  const season: number | null = league?.seasons?.find((s: any) => s.current)?.year ?? league?.seasons?.[0]?.year ?? null;

  let standing: any = null;
  if (league && season && league.league?.type === 'League') {
    try {
      const st = await afGet('/standings', { league: league.league.id, season });
      const groups: any[][] = st.response?.[0]?.league?.standings || [];
      const table = groups.find(g => g.some((r: any) => r.team?.id === afId)) || null;
      if (table) {
        const me = table.find((r: any) => r.team?.id === afId);
        standing = {
          rank: me.rank, points: me.points, played: me.all?.played, won: me.all?.win, drawn: me.all?.draw, lost: me.all?.lose,
          gf: me.all?.goals?.for, ga: me.all?.goals?.against,
          rows: table.map((r: any) => ({ rank: r.rank, id: AF_OFFSET + r.team.id, name: r.team.name, logo: r.team.logo, played: r.all?.played, gd: r.goalsDiff, points: r.points, me: r.team.id === afId }))
        };
      }
    } catch (e: any) {
      logger.warn(`team page standings ${afId}: ${e.message}`);
    }
  }

  // player season stats (clubs): up to 3 pages
  const stats = new Map<number, any>();
  if (!national && season) {
    for (let page = 1; page <= 3; page++) {
      try {
        const pr = await afGet('/players', { team: afId, season, page });
        for (const it of pr.response || []) {
          const s = { apps: 0, minutes: 0, goals: 0, assists: 0, yellow: 0, red: 0, ratingSum: 0, ratingN: 0 };
          for (const st of it.statistics || []) {
            if (st.team?.id !== afId) continue;
            const apps = st.games?.appearences || 0;
            s.apps += apps;
            s.minutes += st.games?.minutes || 0;
            s.goals += st.goals?.total || 0;
            s.assists += st.goals?.assists || 0;
            s.yellow += st.cards?.yellow || 0;
            s.red += st.cards?.red || 0;
            const r = parseFloat(st.games?.rating);
            if (Number.isFinite(r) && apps) { s.ratingSum += r * apps; s.ratingN += apps; }
          }
          stats.set(it.player.id, { name: it.player.name, ...s, rating: s.ratingN ? Math.round((s.ratingSum / s.ratingN) * 10) / 10 : null });
        }
        if ((pr.paging?.current || page) >= (pr.paging?.total || 1)) break;
      } catch (e: any) {
        logger.warn(`team page players ${afId}: ${e.message}`);
        break;
      }
    }
  }

  const POS: Record<string, number> = { Goalkeeper: 0, Defender: 1, Midfielder: 2, Attacker: 3 };
  const squad = (squadRes.response?.[0]?.players || [])
    .map((p: any) => {
      const s = stats.get(p.id);
      return {
        id: p.id, name: p.name, number: p.number ?? null, pos: p.position, age: p.age ?? null, photo: p.photo || null,
        apps: s?.apps ?? null, minutes: s?.minutes ?? null, goals: s?.goals ?? null, assists: s?.assists ?? null,
        yellow: s?.yellow ?? null, red: s?.red ?? null, rating: s?.rating ?? null
      };
    })
    .sort((a: any, b: any) => (POS[a.pos] ?? 9) - (POS[b.pos] ?? 9) || (a.number ?? 99) - (b.number ?? 99));
  const leaders = (key: 'goals' | 'assists') =>
    [...stats.values()].filter(s => s[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, 8).map(s => ({ name: s.name, value: s[key] }));

  const last = (lastRes.response || []).map(simpleFixture).sort((a: any, b: any) => (a.date < b.date ? 1 : -1));
  const next = (nextRes.response || []).map(simpleFixture).sort((a: any, b: any) => (a.date < b.date ? -1 : 1));
  const form = last
    .filter((f: any) => f.hg !== null && ['FT', 'AET', 'PEN'].includes(f.status))
    .slice(0, 6)
    .map((f: any) => {
      const mine = f.home.id === AF_OFFSET + afId ? f.hg - f.ag : f.ag - f.hg;
      return mine > 0 ? 'W' : mine < 0 ? 'L' : 'D';
    });

  return {
    team: { id: AF_OFFSET + afId, afId, name: t.team.name, logo: t.team.logo, country: t.team.country, founded: t.team.founded, national },
    venue: t.venue?.name ? { name: t.venue.name, city: t.venue.city, capacity: t.venue.capacity } : null,
    league: league ? { id: league.league.id, name: league.league.name, logo: league.league.logo, country: league.country?.name, season } : null,
    standing, form, last, next, squad,
    scorers: leaders('goals'),
    assists: leaders('assists'),
    builtAt: new Date().toISOString()
  };
}

/** Full team page (premium) or the free cut. */
export async function teamPage(afId: number, full: boolean) {
  const data: any = await cached(`team:${afId}`, TTL, () => build(afId));
  if (full) return { ...data, premium: true };
  return {
    ...data,
    premium: false,
    squad: data.squad.map((p: any) => ({ id: p.id, name: p.name, number: p.number, pos: p.pos, age: p.age, photo: p.photo, goals: p.goals })),
    scorers: data.scorers.slice(0, 3),
    assists: [],
    locked: ['Assists, appearances, minutes, cards and ratings for every player', 'Full top-scorer and assist lists', 'AI analysis of the team']
  };
}
