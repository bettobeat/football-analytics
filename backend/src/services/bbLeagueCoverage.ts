/**
 * Basketball league coverage scan (Oct 2026): every league API-Basketball has, by how much data it gives.
 * One request (/leagues, every league with its seasons and coverage flags), stored for a day.
 *
 * Tiers (current season): full = team + player box scores + standings (what the model and player pages use),
 * good = team box scores, basic = scores only. History = seasons before the current one (the model wants 2+).
 * Israel's leagues are never listed (no Israel references on the basketball site).
 */
import { db } from '../db';
import { bbGet, BB_LEAGUES } from './basketball';
import { bbExtraLeagueRows } from './bbLeagueConfig';

db.exec(`CREATE TABLE IF NOT EXISTS bb_league_scan (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL, at TEXT NOT NULL)`);

const NOT_SENIOR = /women|wnba|femin|femen|damen|dames|ladies|\bU-?\d{2}\b|under[- ]?\d{2}|youth|junior|juvenil|3x3|all[- ]?star|summer league|friendl|reserve|academy|ncaa\s*w/i;

export type BbTier = 'full' | 'good' | 'basic';
export interface BbScanLeague {
  id: number; name: string; country: string; countryCode: string | null; flag: string | null; logo: string | null;
  season: string; start: string; end: string; active: boolean;
  tier: BbTier; injuries: boolean; history: number;
  status: 'predicted' | 'added' | 'new'; recommended: boolean;
}

function tierOf(c: any): BbTier {
  const st = c?.games?.statistics || {};
  if (st.teams && st.players && c?.standings) return 'full';
  if (st.teams || st.players) return 'good';
  return 'basic';
}

async function scan() {
  const j = await bbGet('/leagues', {});
  const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const ago = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
  const leagues: Omit<BbScanLeague, 'status' | 'recommended'>[] = [];
  for (const r of (j.response || []) as any[]) {
    const ct = r.country || {};
    if (String(r.type || '').toLowerCase() !== 'league') continue;
    if (!ct.name || /^israel$/i.test(ct.name)) continue;
    if (NOT_SENIOR.test(String(r.name || ''))) continue;
    const seasons: any[] = [...(r.seasons || [])].filter(s => s.start && s.end).sort((a, b) => String(a.start).localeCompare(String(b.start)));
    if (!seasons.length) continue;
    // the season being played now (or about to start), else the latest
    const cur = [...seasons].reverse().find(s => String(s.start) <= soon && String(s.end) >= ago) || seasons[seasons.length - 1];
    const before = seasons.filter(s => String(s.end) < String(cur.start)).length;
    leagues.push({
      id: r.id, name: r.name, country: String(ct.name).replace(/-/g, ' '), countryCode: ct.code || null, flag: ct.flag || null, logo: r.logo || null,
      season: String(cur.season), start: String(cur.start), end: String(cur.end),
      active: String(cur.end) >= ago && String(cur.start) <= soon,
      tier: tierOf(cur.coverage), injuries: false, history: before
    });
  }
  const out = { at: new Date().toISOString(), leagues };
  db.prepare(`INSERT OR REPLACE INTO bb_league_scan (id, json, at) VALUES (1, ?, ?)`).run(JSON.stringify(out), out.at);
  return out;
}

export async function bbLeagueCoverage(refresh = false) {
  const row: any = db.prepare(`SELECT json, at FROM bb_league_scan WHERE id = 1`).get();
  let data = row ? JSON.parse(row.json) : null;
  if (!data || refresh || Date.now() - new Date(row.at).getTime() > 24 * 3600 * 1000) data = await scan();
  const extra = bbExtraLeagueRows();
  const leagues: BbScanLeague[] = (data.leagues as any[]).map(l => {
    const status: BbScanLeague['status'] = extra.some(x => x.id === l.id && x.enabled) ? 'added' : BB_LEAGUES.some(b => b.id === l.id) ? 'predicted' : 'new';
    return { ...l, status, recommended: status === 'new' && l.tier === 'full' && l.active && l.history >= 2 };
  });
  leagues.sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));
  const count = (f: (l: BbScanLeague) => boolean) => leagues.filter(f).length;
  return {
    at: data.at,
    totals: {
      leagues: leagues.length, full: count(l => l.tier === 'full'), fullActive: count(l => l.tier === 'full' && l.active),
      good: count(l => l.tier === 'good'), basic: count(l => l.tier === 'basic'),
      predicted: count(l => l.status === 'predicted'), added: count(l => l.status === 'added'),
      recommended: count(l => l.recommended), recommendedWithInjuries: 0
    },
    leagues,
    extra
  };
}

export async function bbPickForAdding(ids: number[]) {
  const cov = await bbLeagueCoverage(false);
  const byId = new Map(cov.leagues.map(l => [l.id, l]));
  const ok: BbScanLeague[] = [], skipped: { id: number; reason: string }[] = [];
  for (const id of ids) {
    const l = byId.get(id);
    if (!l) skipped.push({ id, reason: 'not in the scan' });
    else if (l.status !== 'new') skipped.push({ id, reason: 'already predicted' });
    else if (l.tier === 'basic') skipped.push({ id, reason: 'scores only — the model needs box scores' });
    else if (l.history < 1) skipped.push({ id, reason: 'no past season' });
    else ok.push(l);
  }
  return { ok, skipped };
}
