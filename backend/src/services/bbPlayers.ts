/**
 * Basketball player pages and team squads (Oct 2026).
 * Every league: built from our API-Basketball box scores (bb_player_stats), keyed by API-Basketball player id.
 * NBA players also get balldontlie data (services/bdl.ts): bio, full box lines with plus-minus, advanced stats per game,
 * season averages with league ranks, injury status and contract.
 */
import { db } from '../db';
import { BB_LEAGUES } from './basketball';
import { isPreseason } from './bbModel';
import { nbaKey } from './bbInjuries';
import { bdlPlayerOf, bdlTeamOf, bdlSeasonNow, bdlContract, personKey } from './bdl';

const r1 = (x: number | null | undefined) => (x == null || !isFinite(x) ? null : Math.round(x * 10) / 10);
const pct = (m: number, a: number) => (a > 0 ? Math.round((1000 * m) / a) / 10 : null);
const leagueName = (code: string) => BB_LEAGUES.find(l => l.code === code)?.name || code;
const parse = (s: string | null) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

/** "James LeBron" (API-Basketball) → the name as people write it, when balldontlie knows the player. */
function displayName(name: string, bdl: any | null) {
  return bdl ? `${bdl.first} ${bdl.last}`.trim() : name;
}

function sums(rows: any[]) {
  const s = { gp: 0, min: 0, pts: 0, reb: 0, ast: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, starts: 0 };
  for (const r of rows) {
    if (!(r.minutes > 0)) continue;
    s.gp++; s.min += r.minutes; s.pts += r.pts || 0; s.reb += r.reb || 0; s.ast += r.ast || 0;
    s.fgm += r.fgm || 0; s.fga += r.fga || 0; s.tpm += r.tpm || 0; s.tpa += r.tpa || 0; s.ftm += r.ftm || 0; s.fta += r.fta || 0; s.starts += r.starter ? 1 : 0;
  }
  const per = (x: number) => (s.gp ? r1(x / s.gp) : null);
  return { gp: s.gp, starts: s.starts, min: per(s.min), pts: per(s.pts), reb: per(s.reb), ast: per(s.ast), fgPct: pct(s.fgm, s.fga), tpPct: pct(s.tpm, s.tpa), ftPct: pct(s.ftm, s.fta), tpm: per(s.tpm) };
}

/** Pick the advanced / traditional season numbers we show (with league ranks where balldontlie gives them). */
function seasonLine(base: any, adv: any) {
  if (!base && !adv) return null;
  const b = base || {}, a = adv || {};
  const rank = (o: any, k: string) => (o[`${k}_rank`] != null ? o[`${k}_rank`] : null);
  return {
    gp: b.gp ?? a.gp ?? null, min: b.min ?? a.min ?? null,
    pts: b.pts ?? null, reb: b.reb ?? null, ast: b.ast ?? null, stl: b.stl ?? null, blk: b.blk ?? null, tov: b.tov ?? null,
    fgPct: b.fg_pct != null ? r1(b.fg_pct * 100) : null, tpPct: b.fg3_pct != null ? r1(b.fg3_pct * 100) : null, ftPct: b.ft_pct != null ? r1(b.ft_pct * 100) : null,
    plusMinus: b.plus_minus ?? null,
    pie: a.pie != null ? r1(a.pie * 100) : null, usg: a.usg_pct != null ? r1(a.usg_pct * 100) : null, ts: a.ts_pct != null ? r1(a.ts_pct * 100) : null,
    ortg: a.off_rating ?? null, drtg: a.def_rating ?? null, net: a.net_rating ?? null, astPct: a.ast_pct != null ? r1(a.ast_pct * 100) : null, rebPct: a.reb_pct != null ? r1(a.reb_pct * 100) : null,
    ranks: { pts: rank(b, 'pts'), reb: rank(b, 'reb'), ast: rank(b, 'ast'), stl: rank(b, 'stl'), blk: rank(b, 'blk'), pie: rank(a, 'pie'), net: rank(a, 'net_rating'), ts: rank(a, 'ts_pct'), usg: rank(a, 'usg_pct') }
  };
}

function nbaSeason(bdlId: number, season: number) {
  const rows = db.prepare(`SELECT kind, stats FROM bdl_season WHERE player_id = ? AND season = ?`).all(bdlId, season) as any[];
  const base = parse(rows.find(r => r.kind === 'base')?.stats), adv = parse(rows.find(r => r.kind === 'advanced')?.stats);
  return seasonLine(base, adv);
}

/** Injury report line for a player (NBA). */
function injuryOf(teamName: string, name: string) {
  const list = db.prepare(`SELECT player, status, comment, reported FROM bb_injuries WHERE team = ?`).all(nbaKey(teamName)) as any[];
  const k = personKey(name);
  const x = list.find(i => personKey(i.player) === k);
  return x ? { status: x.status, comment: x.comment, reported: x.reported } : null;
}

export async function bbPlayer(id: number) {
  const rows = db.prepare(`
    SELECT ps.*, g.kickoff, g.code, g.season, g.status, g.home_id, g.away_id, g.home_name, g.away_name, g.home_logo, g.away_logo, g.hs, g.as_
    FROM bb_player_stats ps JOIN bb_games g ON g.game_id = ps.game_id
    WHERE ps.player_id = ? ORDER BY g.kickoff DESC`).all(id) as any[];
  if (!rows.length) return null;
  const last = rows[0];
  const teamOf = (r: any) => (r.team_id === r.home_id ? { id: r.home_id, name: r.home_name, logo: r.home_logo } : { id: r.away_id, name: r.away_name, logo: r.away_logo });
  const team = teamOf(last);
  const isNba = rows.some(r => r.code === 'NBA');
  const nbaTeamName = isNba ? teamOf(rows.find(r => r.code === 'NBA')).name : null;
  const bdl = isNba ? bdlPlayerOf(last.name, nbaTeamName) : null;

  // seasons per league (regular season: pre-season left out)
  const groups = new Map<string, any[]>();
  for (const r of rows) {
    if (isPreseason({ code: r.code, kickoff: r.kickoff })) continue;
    const k = `${r.code}|${r.season}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const seasons = [...groups.entries()].map(([k, list]) => {
    const [code, season] = k.split('|');
    return { code, league: leagueName(code), season, team: teamOf(list[0]), ...sums(list) };
  }).filter(s => s.gp > 0).sort((a, b) => b.season.localeCompare(a.season) || a.code.localeCompare(b.code));

  // game log: the last 15 games he played, with the balldontlie line (plus-minus, advanced) when we have it
  const played = rows.filter(r => r.minutes > 0).slice(0, 15);
  let extra = new Map<string, any>();
  if (bdl) {
    const lines = db.prepare(`
      SELECT g.date, b.min, b.pts, b.reb, b.ast, b.stl, b.blk, b.tov, b.pm, a.pie, a.usg, a.net, a.ts
      FROM bdl_box b JOIN bdl_games g ON g.id = b.game_id LEFT JOIN bdl_adv a ON a.game_id = b.game_id AND a.player_id = b.player_id
      WHERE b.player_id = ? ORDER BY g.date DESC LIMIT 60`).all(bdl.id) as any[];
    extra = new Map(lines.map(l => [String(l.date).slice(0, 10), l]));
  }
  const dayKeys = (iso: string) => { const t = Date.parse(iso); return [-1, 0, 1].map(d => new Date(t + d * 86400000).toISOString().slice(0, 10)); };
  const log = played.map(r => {
    const home = r.team_id === r.home_id;
    const f = home ? r.hs : r.as_, a = home ? r.as_ : r.hs;
    const x = r.code === 'NBA' ? dayKeys(r.kickoff).map(k => extra.get(k)).find(l => l && Math.abs((l.pts ?? -1) - (r.pts ?? -2)) <= 0) : null;
    return {
      gameId: r.game_id, kickoff: r.kickoff, league: r.code, home, opponent: home ? r.away_name : r.home_name, opponentId: home ? r.away_id : r.home_id, opponentLogo: home ? r.away_logo : r.home_logo,
      result: f != null && a != null ? { for: f, against: a, win: f > a } : null,
      starter: !!r.starter, min: r1(r.minutes), pts: r.pts, reb: r.reb, ast: r.ast, fgm: r.fgm, fga: r.fga, tpm: r.tpm, tpa: r.tpa, ftm: r.ftm, fta: r.fta,
      stl: x?.stl ?? null, blk: x?.blk ?? null, tov: x?.tov ?? null, plusMinus: x?.pm ?? null,
      pie: x?.pie != null ? r1(x.pie * 100) : null, usg: x?.usg != null ? r1(x.usg * 100) : null, net: x?.net ?? null, ts: x?.ts != null ? r1(x.ts * 100) : null
    };
  });

  // last 10 games' form: points and minutes, oldest first (for the chart)
  const form = played.slice(0, 10).reverse().map(r => ({ gameId: r.game_id, kickoff: r.kickoff, pts: r.pts ?? 0, min: r1(r.minutes) }));

  let nba: any = null;
  if (bdl) {
    const now = bdlSeasonNow();
    const cur = nbaSeason(bdl.id, now), prev = nbaSeason(bdl.id, now - 1);
    let contract: any = null;
    try { contract = await bdlContract(bdl.id); } catch { /* optional */ }
    nba = {
      bio: { position: bdl.position, height: bdl.height, weight: bdl.weight, jersey: bdl.jersey, college: bdl.college, country: bdl.country, draft: bdl.draft_year ? { year: bdl.draft_year, round: bdl.draft_round, pick: bdl.draft_number } : null },
      season: cur ? { label: `${now}-${String(now + 1).slice(2)}`, ...cur } : null,
      lastSeason: prev ? { label: `${now - 1}-${String(now).slice(2)}`, ...prev } : null,
      injury: nbaTeamName ? injuryOf(nbaTeamName, displayName(last.name, bdl)) : null,
      contract: Array.isArray(contract) ? contract.map((c: any) => ({ season: c.season, team: c.team, amount: c.amount, type: c.type, status: c.status })).slice(0, 8) : null
    };
  }

  return {
    player: { id, name: displayName(last.name, bdl), team, league: { code: last.code, name: leagueName(last.code) } },
    current: seasons[0] || null,
    seasons,
    form,
    log,
    nba
  };
}

/** A team's players from its last 15 games (who plays, how much, what they produce); NBA adds PIE / usage / net rating. */
export function bbSquad(teamId: number, teamName: string, code: string) {
  const games = db.prepare(`SELECT game_id FROM bb_games WHERE (home_id = ? OR away_id = ?) AND status IN ('FT','AOT') AND stats = 1 ORDER BY kickoff DESC LIMIT 15`).all(teamId, teamId) as any[];
  if (!games.length) return [];
  const ids = games.map(g => g.game_id);
  const rows = db.prepare(`SELECT * FROM bb_player_stats WHERE team_id = ? AND game_id IN (${ids.map(() => '?').join(',')})`).all(teamId, ...ids) as any[];
  const by = new Map<number, any[]>();
  for (const r of rows) { if (!by.has(r.player_id)) by.set(r.player_id, []); by.get(r.player_id)!.push(r); }
  const season = bdlSeasonNow();
  const injured = code === 'NBA' ? new Map((db.prepare(`SELECT player, status FROM bb_injuries WHERE team = ?`).all(nbaKey(teamName)) as any[]).map(x => [personKey(x.player), x.status])) : new Map();
  return [...by.entries()].map(([pid, list]) => {
    const s = sums(list);
    const bdl = code === 'NBA' ? bdlPlayerOf(list[0].name, teamName) : null;
    const line = bdl ? (nbaSeason(bdl.id, season) || nbaSeason(bdl.id, season - 1)) : null;
    const name = displayName(list[0].name, bdl);
    return {
      id: pid, name, position: bdl?.position || null, jersey: bdl?.jersey || null, injury: injured.get(personKey(name)) || null,
      gp: s.gp, starts: s.starts, min: s.min, pts: s.pts, reb: s.reb, ast: s.ast, fgPct: s.fgPct, tpPct: s.tpPct,
      pie: line?.pie ?? null, usg: line?.usg ?? null, net: line?.net ?? null
    };
  }).filter(p => p.gp > 0).sort((a, b) => (b.min || 0) - (a.min || 0));
}

/** NBA box score extras (steals, blocks, turnovers, plus-minus) for one of our games, matched by date, teams and name. */
export function nbaBoxExtras(kickoff: string, homeName: string, awayName: string) {
  const h = bdlTeamOf(homeName), a = bdlTeamOf(awayName);
  if (!h || !a) return null;
  const t = Date.parse(kickoff);
  const g = db.prepare(`SELECT id FROM bdl_games WHERE home_id = ? AND away_id = ? AND date BETWEEN ? AND ?`)
    .get(h, a, new Date(t - 18 * 3600000).toISOString(), new Date(t + 18 * 3600000).toISOString()) as any;
  if (!g) return null;
  const rows = db.prepare(`SELECT b.*, p.first, p.last FROM bdl_box b LEFT JOIN bdl_players p ON p.id = b.player_id WHERE b.game_id = ?`).all(g.id) as any[];
  if (!rows.length) return null;
  return new Map(rows.map(r => [personKey(`${r.first} ${r.last}`), { stl: r.stl, blk: r.blk, tov: r.tov, oreb: r.oreb, pf: r.pf, plusMinus: r.pm, name: `${r.first} ${r.last}`.trim() }]));
}

let idCache: { at: number; map: Map<string, number> } | null = null;
/** Our (API-Basketball) id of an NBA player, by name. */
function ourNbaId(name: string): number | null {
  if (!idCache || Date.now() - idCache.at > 3600000) {
    const rows = db.prepare(`SELECT ps.player_id, ps.name FROM bb_player_stats ps JOIN bb_games g ON g.game_id = ps.game_id WHERE g.code = 'NBA' AND g.kickoff > ? GROUP BY ps.player_id`)
      .all(new Date(Date.now() - 2 * 365 * 86400000).toISOString()) as any[];
    idCache = { at: Date.now(), map: new Map(rows.map(r => [personKey(r.name), r.player_id])) };
  }
  return idCache.map.get(personKey(name)) ?? null;
}

/** NBA league leaders (current season, or the last one before it starts). */
export function nbaLeaders() {
  const now = bdlSeasonNow();
  for (const season of [now, now - 1]) {
    const rows = db.prepare(`SELECT stat, data FROM bdl_leaders WHERE season = ?`).all(season) as any[];
    if (!rows.length) continue;
    return { season: `${season}-${String(season + 1).slice(2)}`, lists: rows.map(r => ({ stat: r.stat, top: (parse(r.data) || []).slice(0, 5).map((x: any) => ({ ...x, id: ourNbaId(x.name) })) })) };
  }
  return null;
}
