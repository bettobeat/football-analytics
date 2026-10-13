/**
 * League coverage scan (Oct 2026): every league API-Football has, sorted by how much data it gives us.
 * One request (/leagues returns every league with every season and its coverage flags), stored for a day.
 *
 * Tiers (current season):
 *   full  — events, lineups, match stats, player stats, players, standings  (what our big leagues have)
 *   good  — events + standings + lineups or match stats
 *   basic — scores / tables only
 * History = how many of the two seasons before the current one exist (the model wants 2).
 */
import { db } from '../db';
import { afGet } from './apiFootball';
import { AF_LEAGUES } from './apiFootball';
import { EXTRA_COMPETITIONS } from './afMatches';
import { groupForCompetition } from './history';
import { extraLeagueRows } from './leagueConfig';

db.exec(`CREATE TABLE IF NOT EXISTS af_league_scan (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL, at TEXT NOT NULL)`);

/** Youth, women's, reserve and amateur competitions — never predicted. */
const NOT_SENIOR = /women|femin|femen|frauen|dames|\bwomen'?s\b|\bU-?\d{2}\b|under[- ]?\d{2}|youth|junior|juvenil|reserve|primavera|amateur|development|premier league 2|regional|oberliga|futsal|beach|esports|friendl/i;

export type Tier = 'full' | 'good' | 'basic';
export interface ScanLeague {
  id: number; name: string; country: string; countryCode: string | null; flag: string | null; logo: string | null;
  season: number; start: string; end: string; calendar: boolean; active: boolean;
  tier: Tier; injuries: boolean; odds: boolean; history: number;
  status: 'predicted' | 'added' | 'shown' | 'new';
  recommended: boolean;
}

function tierOf(c: any): Tier {
  const f = c?.fixtures || {};
  if (f.events && f.lineups && f.statistics_fixtures && f.statistics_players && c.players && c.standings) return 'full';
  if (f.events && c.standings && (f.lineups || f.statistics_fixtures)) return 'good';
  return 'basic';
}

function statusOf(id: number): ScanLeague['status'] {
  const code = `AF${id}`;
  const g = groupForCompetition(code);
  const extra = extraLeagueRows().find(r => r.id === id && r.enabled);
  if (extra) return 'added';
  if (g || AF_LEAGUES.some(l => l.id === id)) return 'predicted';
  if (EXTRA_COMPETITIONS.some(c => c.id === id)) return 'shown';
  return 'new';
}

async function scan(): Promise<{ at: string; leagues: Omit<ScanLeague, 'status' | 'recommended'>[] }> {
  const j = await afGet('/leagues', {});
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
  const leagues: Omit<ScanLeague, 'status' | 'recommended'>[] = [];
  for (const r of (j.response || []) as any[]) {
    const lg = r.league || {}, ct = r.country || {};
    if (String(lg.type).toLowerCase() !== 'league') continue;
    if (!ct.name || ct.name === 'World') continue;
    if (NOT_SENIOR.test(String(lg.name || ''))) continue;
    const seasons: any[] = r.seasons || [];
    const cur = seasons.find(s => s.current) || seasons.sort((a, b) => b.year - a.year)[0];
    if (!cur) continue;
    const years = new Set(seasons.map(s => s.year));
    const history = [cur.year - 1, cur.year - 2].filter(y => years.has(y)).length;
    leagues.push({
      id: lg.id, name: lg.name, country: ct.name, countryCode: ct.code || null, flag: ct.flag || null, logo: lg.logo || null,
      season: cur.year, start: cur.start, end: cur.end,
      calendar: String(cur.start).slice(0, 4) === String(cur.end).slice(0, 4),
      active: String(cur.end) >= monthAgo && String(cur.start) <= today,
      tier: tierOf(cur.coverage), injuries: !!cur.coverage?.injuries, odds: !!cur.coverage?.odds, history
    });
  }
  const out = { at: new Date().toISOString(), leagues };
  db.prepare(`INSERT OR REPLACE INTO af_league_scan (id, json, at) VALUES (1, ?, ?)`).run(JSON.stringify(out), out.at);
  return out;
}

/** The scan with each league's status on our site; rescans when asked or when older than a day. */
export async function leagueCoverage(refresh = false) {
  const row: any = db.prepare(`SELECT json, at FROM af_league_scan WHERE id = 1`).get();
  let data = row ? JSON.parse(row.json) : null;
  if (!data || refresh || Date.now() - new Date(row.at).getTime() > 24 * 3600 * 1000) data = await scan();
  const leagues: ScanLeague[] = (data.leagues as any[]).map(l => {
    const status = statusOf(l.id);
    return { ...l, status, recommended: status !== 'predicted' && status !== 'added' && l.tier === 'full' && l.active && l.history >= 2 };
  });
  leagues.sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));
  const count = (f: (l: ScanLeague) => boolean) => leagues.filter(f).length;
  return {
    at: data.at,
    totals: {
      leagues: leagues.length,
      full: count(l => l.tier === 'full'),
      fullActive: count(l => l.tier === 'full' && l.active),
      good: count(l => l.tier === 'good'),
      basic: count(l => l.tier === 'basic'),
      predicted: count(l => l.status === 'predicted'),
      added: count(l => l.status === 'added'),
      recommended: count(l => l.recommended),
      recommendedWithInjuries: count(l => l.recommended && l.injuries)
    },
    leagues,
    extra: extraLeagueRows()
  };
}

/** Admin "add" — only leagues from the scan with at least good coverage and some history. */
export async function pickForAdding(ids: number[]) {
  const cov = await leagueCoverage(false);
  const byId = new Map(cov.leagues.map(l => [l.id, l]));
  const ok: ScanLeague[] = [], skipped: { id: number; reason: string }[] = [];
  for (const id of ids) {
    const l = byId.get(id);
    if (!l) skipped.push({ id, reason: 'not in the scan' });
    else if (l.status === 'predicted' || l.status === 'added') skipped.push({ id, reason: 'already predicted' });
    else if (l.tier === 'basic') skipped.push({ id, reason: 'basic coverage only' });
    else if (l.history < 1) skipped.push({ id, reason: 'no past season' });
    else ok.push(l);
  }
  return { ok, skipped };
}
