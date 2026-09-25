/**
 * Squad market values (wishlist row #1 "lineup value") for model v3.
 *
 * Source: the open transfermarkt-datasets dump (dcaribou/transfermarkt-datasets), players.csv.gz —
 * one row per player with market_value_in_eur, current club and the club's domestic competition.
 * We aggregate per club: squad total and the sum of the 15 most valuable players (a proxy for
 * the value of the starting XI + first subs), then map club names to football-data.co.uk names
 * with the same matcher the history model uses.
 *
 * The dump is a snapshot (updates paused since July 2026), so values are treated as a slowly
 * moving quantity: refreshed weekly if the URL responds, kept otherwise. Missing values leave
 * the row neutral (5) — they neither help nor hurt.
 */
import { gunzipSync } from 'zlib';
import { db } from '../db';
import logger from '../utils/logger';
import { GROUPS, ALIASES, similarity } from './history';

const SOURCE_URL =
  process.env.SQUAD_VALUES_URL || 'https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/players.csv.gz';
const REFRESH_MS = 7 * 24 * 3600 * 1000;
const TOP_N = 15;

/** Transfermarkt competition codes → model group. */
const COMPETITION_GROUP: Record<string, string> = {
  GB1: 'E', GB2: 'E', ES1: 'SP', ES2: 'SP', IT1: 'I', IT2: 'I', L1: 'D', L2: 'D', FR1: 'F', FR2: 'F', NL1: 'N', PO1: 'P',
  BE1: 'B', TR1: 'T', SC1: 'SC', GR1: 'G'
};

/** Extra hints for club names as Transfermarkt writes them (lowercased fd name → hint). */
const TM_ALIASES: Record<string, string> = {
  'ath madrid': 'atletico de madrid',
  'ath bilbao': 'athletic bilbao',
  'espanol': 'rcd espanyol barcelona',
  'sociedad': 'real sociedad san sebastian',
  'betis': 'real betis balompie',
  'celta': 'celta de vigo',
  'inter': 'inter milan',
  'milan': 'ac milan',
  'verona': 'hellas verona',
  'bayern munich': 'bayern munich',
  'ein frankfurt': 'eintracht frankfurt',
  "m'gladbach": 'borussia monchengladbach',
  'fc koln': '1.fc koln',
  'hamburg': 'hamburger sv',
  'mainz': '1.fsv mainz 05',
  'st pauli': 'fc st. pauli',
  'leverkusen': 'bayer 04 leverkusen',
  'paris sg': 'paris saint-germain',
  'st etienne': 'as saint-etienne',
  'rennes': 'stade rennais fc',
  'brest': 'stade brestois 29',
  'lyon': 'olympique lyon',
  'marseille': 'olympique marseille',
  'sp lisbon': 'sporting cp',
  'sp braga': 'sc braga',
  'guimaraes': 'vitoria guimaraes sc',
  'psv eindhoven': 'psv eindhoven',
  'nijmegen': 'nec nijmegen',
  'zwolle': 'pec zwolle',
  'for sittard': 'fortuna sittard',
  'waalwijk': 'rkc waalwijk',
  'man united': 'manchester united',
  'man city': 'manchester city',
  "nott'm forest": 'nottingham forest',
  'wolves': 'wolverhampton wanderers',
  'sheffield united': 'sheffield united',
  'sheffield weds': 'sheffield wednesday',
  'qpr': 'queens park rangers',
  'west brom': 'west bromwich albion'
};

db.exec(`
  CREATE TABLE IF NOT EXISTS squad_values (
    grp         TEXT NOT NULL,
    fd_name     TEXT NOT NULL,
    club_name   TEXT NOT NULL,
    competition TEXT NOT NULL,
    total_eur   REAL NOT NULL,
    top_eur     REAL NOT NULL,
    players     INTEGER NOT NULL,
    score       REAL NOT NULL,
    fetched_at  TEXT NOT NULL,
    PRIMARY KEY (grp, fd_name)
  );
  CREATE TABLE IF NOT EXISTS nat_values (
    country TEXT PRIMARY KEY,   -- normalised country of citizenship
    name TEXT NOT NULL,
    top_eur REAL NOT NULL,      -- 23 most valuable players with that citizenship
    players INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS squad_players (
    pkey TEXT NOT NULL,        -- "<last name>|<first initial>" (normalised), for matching lineup names
    name TEXT NOT NULL,
    club TEXT,
    value_eur REAL NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_squad_players_key ON squad_players(pkey);
  CREATE TABLE IF NOT EXISTS squad_values_sync (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    fetched_at TEXT NOT NULL,
    clubs INTEGER NOT NULL,
    mapped INTEGER NOT NULL,
    source TEXT NOT NULL
  );
`);

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, newlines inside quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

interface ClubAgg { name: string; competition: string; values: number[] }

let cache = new Map<string, { total: number; top: number; club: string }>(); // key grp|fd_name
let lastFetchedAt: string | null = null;
let lastError: string | null = null;

/** "Lionel Messi" / "L. Messi" / "Messi" → "messi|l"; single names → "pedri|p". */
export function playerKey(name: string): string {
  const n = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z .'-]+/g, ' ')
    .replace(/[.'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = n.split(' ').filter(Boolean);
  if (!parts.length) return '';
  const last = parts[parts.length - 1];
  return `${last}|${parts[0][0]}`;
}

let players = new Map<string, { name: string; club: string | null; value: number }[]>();
function loadPlayers() {
  players = new Map();
  for (const r of db.prepare(`SELECT pkey, name, club, value_eur FROM squad_players`).all() as any[]) {
    const l = players.get(r.pkey) || players.set(r.pkey, []).get(r.pkey)!;
    l.push({ name: r.name, club: r.club, value: r.value_eur });
  }
}

/** Market value (EUR) of a player by name; club hint breaks ties between namesakes. */
export function playerValue(name: string, clubHint?: string | null): number | null {
  const list = players.get(playerKey(name));
  if (!list || !list.length) return null;
  if (list.length === 1) return list[0].value;
  if (clubHint) {
    let best: { v: number; s: number } | null = null;
    for (const p of list) {
      const s = p.club ? similarity(p.club, clubHint) : 0;
      if (!best || s > best.s) best = { v: p.value, s };
    }
    if (best && best.s >= 0.5) return best.v;
  }
  return null; // ambiguous namesakes, no club to decide
}
export const playerValuesLoaded = () => players.size;

/* ---------- national-team squad values (by citizenship) ---------- */

const normCountry = (s: string) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, 'and').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
/** API-Football country name (normalised) → Transfermarkt citizenship (normalised). */
const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'united states', turkiye: 'turkey', 'south korea': 'korea south', 'korea republic': 'korea south',
  'north korea': 'korea north', 'ivory coast': 'cote d ivoire', 'bosnia and herzegovina': 'bosnia herzegovina',
  'republic of ireland': 'ireland', 'congo dr': 'dr congo', 'cape verde islands': 'cape verde', 'czech republic': 'czech republic',
  czechia: 'czech republic', 'china pr': 'china', 'chinese taipei': 'chinese taipei', 'faroe islands': 'faroe islands',
  'trinidad and tobago': 'trinidad and tobago', 'st kitts and nevis': 'st kitts nevis', eswatini: 'eswatini', 'north macedonia': 'north macedonia'
};
let natValues = new Map<string, { name: string; top: number; players: number }>();
function loadNatValues() {
  natValues = new Map();
  for (const r of db.prepare(`SELECT country, name, top_eur, players FROM nat_values`).all() as any[])
    natValues.set(r.country, { name: r.name, top: r.top_eur, players: r.players });
}
/** Value (EUR) of a national team's 23 most valuable players, by the team's name as API-Football writes it. */
export function nationalValueFor(teamName: string): number | null {
  const n = normCountry(teamName);
  const hit = natValues.get(COUNTRY_ALIASES[n] || n) || natValues.get(n);
  return hit && hit.players >= 11 ? hit.top : null;
}
export const nationalValuesLoaded = () => natValues.size;

function loadCache() {
  loadPlayers();
  loadNatValues();
  cache = new Map();
  for (const r of db.prepare(`SELECT grp, fd_name, club_name, total_eur, top_eur FROM squad_values`).all() as any[])
    cache.set(`${r.grp}|${r.fd_name}`, { total: r.total_eur, top: r.top_eur, club: r.club_name });
  const s: any = db.prepare(`SELECT fetched_at FROM squad_values_sync WHERE id = 1`).get();
  lastFetchedAt = s?.fetched_at || null;
}
loadCache();

/** Squad value for a football-data.co.uk team name, in EUR (top-15 sum), or null. */
export function squadValueFor(group: string, fdName: string): { total: number; top: number; club: string } | null {
  return cache.get(`${group}|${fdName}`) || null;
}

/** Map aggregated clubs of one group onto the fd names seen in that group's history. */
function mapGroup(group: string, clubs: ClubAgg[], fetchedAt: string) {
  const divs = GROUPS[group]?.divisions || [];
  if (!divs.length) return 0;
  const placeholders = divs.map(() => '?').join(',');
  const fdNames: string[] = db
    .prepare(`SELECT DISTINCT home AS n FROM history_matches WHERE division IN (${placeholders})`)
    .all(...divs)
    .map((r: any) => r.n);

  const pairs: { club: ClubAgg; fd: string; score: number }[] = [];
  for (const club of clubs) {
    for (const fd of fdNames) {
      const key = fd.toLowerCase();
      const hints = [fd, ALIASES[key] || '', TM_ALIASES[key] || ''].filter(Boolean);
      let score = 0;
      for (const h of hints) score = Math.max(score, similarity(h, club.name));
      if (score >= 0.5) pairs.push({ club, fd, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  const usedClub = new Set<string>();
  const usedFd = new Set<string>();
  const upsert = db.prepare(
    `INSERT OR REPLACE INTO squad_values (grp, fd_name, club_name, competition, total_eur, top_eur, players, score, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  let mapped = 0;
  for (const p of pairs) {
    if (usedClub.has(p.club.name) || usedFd.has(p.fd)) continue;
    const vals = [...p.club.values].sort((a, b) => b - a);
    const total = vals.reduce((s, v) => s + v, 0);
    const top = vals.slice(0, TOP_N).reduce((s, v) => s + v, 0);
    upsert.run(group, p.fd, p.club.name, p.club.competition, total, top, vals.length, p.score, fetchedAt);
    usedClub.add(p.club.name);
    usedFd.add(p.fd);
    mapped++;
  }
  const unmatched = clubs.filter(c => !usedClub.has(c.name)).map(c => c.name);
  if (unmatched.length) logger.info(`Squad values ${group}: ${mapped} mapped, unmatched clubs: ${unmatched.join(', ')}`);
  return mapped;
}

/** Download the players dump and rebuild the per-club values. Safe to call repeatedly. */
export async function syncSquadValues(force = false): Promise<{ clubs: number; mapped: number } | null> {
  if (!force && lastFetchedAt && Date.now() - new Date(lastFetchedAt).getTime() < REFRESH_MS) return null;
  try {
    const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const text = (SOURCE_URL.endsWith('.gz') ? gunzipSync(buf) : buf).toString('utf8');
    const rows = parseCsv(text);
    const header = rows[0].map(h => h.trim());
    const col = (n: string) => header.indexOf(n);
    const iName = col('current_club_name'), iComp = col('current_club_domestic_competition_id'),
      iVal = col('market_value_in_eur'), iSeason = col('last_season'), iPlayer = col('name'),
      iCitizen = col('country_of_citizenship');
    const byCountry = new Map<string, { name: string; values: number[] }>();
    if (iName < 0 || iComp < 0 || iVal < 0) throw new Error(`Unexpected columns: ${header.slice(0, 12).join(',')}`);
    const seasonMin = new Date().getUTCFullYear() - 1; // only players active this or last season
    const clubs = new Map<string, ClubAgg>();
    const playerRows: [string, string, string | null, number][] = [];
    for (const r of rows.slice(1)) {
      // every recently active player with a value, any league (players change clubs; lineups need their value)
      if (iPlayer >= 0 && r[iPlayer]) {
        const pv = parseFloat(r[iVal]);
        const ls = iSeason >= 0 ? parseInt(r[iSeason], 10) : NaN;
        if (Number.isFinite(pv) && pv > 0 && (!Number.isFinite(ls) || ls >= new Date().getUTCFullYear() - 3))
          playerRows.push([playerKey(r[iPlayer]), r[iPlayer], r[iName] || null, pv]);
        if (iCitizen >= 0 && r[iCitizen] && Number.isFinite(pv) && pv > 0 && (!Number.isFinite(ls) || ls >= new Date().getUTCFullYear() - 2)) {
          const key = normCountry(r[iCitizen]);
          const c = byCountry.get(key) || byCountry.set(key, { name: r[iCitizen], values: [] }).get(key)!;
          c.values.push(pv);
        }
      }
      const comp = r[iComp];
      const group = COMPETITION_GROUP[comp];
      if (!group) continue;
      const v = parseFloat(r[iVal]);
      if (!Number.isFinite(v) || v <= 0) continue;
      if (iSeason >= 0 && parseInt(r[iSeason], 10) < seasonMin) continue;
      const name = r[iName];
      if (!name) continue;
      const key = `${group}|${name}`;
      const agg = clubs.get(key) || { name, competition: comp, values: [] };
      agg.values.push(v);
      clubs.set(key, agg);
    }
    const fetchedAt = new Date().toISOString();
    let mapped = 0;
    db.exec('BEGIN');
    try {
      db.prepare(`DELETE FROM squad_values`).run();
      db.prepare(`DELETE FROM squad_players`).run();
      db.prepare(`DELETE FROM nat_values`).run();
      const insN = db.prepare(`INSERT INTO nat_values (country, name, top_eur, players) VALUES (?, ?, ?, ?)`);
      byCountry.forEach((c, key) => {
        const top = c.values.sort((a, b) => b - a).slice(0, 23).reduce((a, b) => a + b, 0);
        insN.run(key, c.name, top, c.values.length);
      });
      const insP = db.prepare(`INSERT INTO squad_players (pkey, name, club, value_eur) VALUES (?, ?, ?, ?)`);
      for (const pr of playerRows) if (pr[0]) insP.run(...pr);
      for (const group of Object.keys(GROUPS)) {
        const list: ClubAgg[] = [];
        clubs.forEach((agg, key) => { if (key.startsWith(`${group}|`)) list.push(agg); });
        mapped += mapGroup(group, list, fetchedAt);
      }
      db.prepare(`INSERT OR REPLACE INTO squad_values_sync (id, fetched_at, clubs, mapped, source) VALUES (1, ?, ?, ?, ?)`)
        .run(fetchedAt, clubs.size, mapped, SOURCE_URL);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    loadCache();
    lastError = null;
    logger.info(`Squad values synced: ${clubs.size} clubs, ${mapped} mapped to history names`);
    return { clubs: clubs.size, mapped };
  } catch (err: any) {
    lastError = err.message;
    logger.warn(`Squad values sync failed: ${err.message}`);
    return null;
  }
}

export function squadValuesStatus() {
  const s: any = db.prepare(`SELECT * FROM squad_values_sync WHERE id = 1`).get();
  const byGroup: Record<string, { teams: number; top: { team: string; club: string; topEur: number }[] }> = {};
  for (const r of db.prepare(`SELECT grp, fd_name, club_name, top_eur FROM squad_values ORDER BY grp, top_eur DESC`).all() as any[]) {
    const g = (byGroup[r.grp] ||= { teams: 0, top: [] });
    g.teams++;
    if (g.top.length < 5) g.top.push({ team: r.fd_name, club: r.club_name, topEur: Math.round(r.top_eur) });
  }
  const nations = [...natValues.values()].sort((a, b) => b.top - a.top).slice(0, 12).map(v => ({ nation: v.name, top23Eur: Math.round(v.top) }));
  return { source: SOURCE_URL, sync: s || null, lastError, playerKeys: players.size, nationalTeams: natValues.size, topNations: nations, byGroup };
}

/** Weekly refresh; first attempt shortly after start so history names exist. */
export function startSquadValuesScheduler(onSynced?: () => void) {
  const tick = () => syncSquadValues().then(r => { if (r && onSynced) onSynced(); }).catch(() => undefined);
  setTimeout(tick, 90_000);
  setInterval(tick, 6 * 3600 * 1000);
}
